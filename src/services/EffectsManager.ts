/**
 * Effects Manager Service
 * Responsible for applying conditions, damage, and other effects from table results
 */

import { MODULE_ID, EFFECT_TYPES, LOG_PREFIX } from '../constants';
import { RolledResult, TableEffectConfig, AdvantageScope, AdvantageTarget } from '../types';
import { shouldApplyEffects, shouldShowChatMessages } from '../settings';

/**
 * Service for managing and applying crit/fumble effects
 */
export class EffectsManager {
  /**
   * Apply the effects from a rolled result
   * @param result - The rolled result from the table
   * @param targetToken - Primary token to apply effect to (target for crits, fumbler for fumbles)
   * @param sourceActor - The actor that triggered the effect
   * @param sourceItem - The item (weapon/spell) used
   */
  static async applyResult(
    result: RolledResult,
    targetToken: Token,
    sourceActor?: Actor,
    sourceItem?: Item
  ): Promise<void> {
    // Check if we should apply effects
    if (!shouldApplyEffects()) {
      return;
    }

    const effectConfig = result.result.flags?.[MODULE_ID] as TableEffectConfig | undefined;

    if (!effectConfig || effectConfig.effectType === EFFECT_TYPES.NONE) {
      return;
    }

    // Use the result's icon if available
    const resultIcon = result.result.img;

    switch (effectConfig.effectType) {
      case EFFECT_TYPES.CONDITION:
        await this.applyCondition(targetToken, effectConfig, resultIcon);
        break;

      case EFFECT_TYPES.DAMAGE:
        await this.applyDamage(targetToken, effectConfig, sourceItem);
        break;

      case EFFECT_TYPES.SAVE:
        await this.handleSaveEffect(targetToken, effectConfig, sourceActor, resultIcon);
        break;

      case EFFECT_TYPES.DISARM:
        await this.applyDisarm(sourceActor, sourceItem);
        break;

      case EFFECT_TYPES.PENALTY:
        await this.applyPenalty(targetToken, effectConfig, resultIcon);
        break;

      case EFFECT_TYPES.ADVANTAGE:
        await this.applyAdvantageDisadvantage(targetToken, effectConfig, 'advantage', resultIcon);
        break;

      case EFFECT_TYPES.DISADVANTAGE:
        await this.applyAdvantageDisadvantage(
          targetToken,
          effectConfig,
          'disadvantage',
          resultIcon
        );
        break;
    }
  }

  /**
   * Apply effects from a fumble result
   * For "grants" advantage effects, applies regular advantage to the targets instead of the fumbler
   * @param result - The rolled result from the table
   * @param fumblerToken - The token that fumbled
   * @param targetTokens - The original targets of the fumbled attack
   * @param sourceActor - The actor that fumbled
   * @param sourceItem - The item (weapon/spell) used
   */
  static async applyFumbleResult(
    result: RolledResult,
    fumblerToken: Token,
    targetTokens: Token[],
    sourceActor?: Actor,
    sourceItem?: Item
  ): Promise<void> {
    if (!shouldApplyEffects()) {
      return;
    }

    const effectConfig = result.result.flags?.[MODULE_ID] as TableEffectConfig | undefined;

    if (!effectConfig || effectConfig.effectType === EFFECT_TYPES.NONE) {
      return;
    }

    const resultIcon = result.result.img;

    // For advantage/disadvantage effects with "grants" target, apply to the targets instead of fumbler
    if (
      (effectConfig.effectType === EFFECT_TYPES.ADVANTAGE ||
        effectConfig.effectType === EFFECT_TYPES.DISADVANTAGE) &&
      effectConfig.advantageTarget === 'grants' &&
      targetTokens.length > 0
    ) {
      // Remove the "grants" flag - apply regular advantage/disadvantage to targets
      const targetConfig: TableEffectConfig = {
        ...effectConfig,
        advantageTarget: undefined
      };
      const mode =
        effectConfig.effectType === EFFECT_TYPES.ADVANTAGE ? 'advantage' : 'disadvantage';
      for (const target of targetTokens) {
        await this.applyAdvantageDisadvantage(target, targetConfig, mode, resultIcon);
      }
      return;
    }

    // For all other effects, apply to the fumbler as normal
    await this.applyResult(result, fumblerToken, sourceActor, sourceItem);
  }

  /**
   * Apply a condition to a token
   * For standard D&D 5e conditions, toggles the built-in status effect
   * For custom conditions, creates an Active Effect with Times Up integration
   */
  static async applyCondition(
    token: Token,
    config: TableEffectConfig,
    resultIcon?: string
  ): Promise<void> {
    if (!config.effectCondition || !token.actor) {
      return;
    }

    const conditionName = config.effectCondition;
    const duration = config.duration ?? 1;

    // For standard D&D 5e conditions, use the built-in status effect system
    if (this.isStandardCondition(conditionName)) {
      await this.applyStandardCondition(token, conditionName, duration);
      return;
    }

    // For custom conditions, create an Active Effect
    const durationData: Record<string, any> = {};

    if (duration === -1) {
      durationData.seconds = null;
      durationData.rounds = null;
    } else if (duration === 0) {
      durationData.turns = 1;
      durationData.startTurn = game.combat?.turn ?? 0;
      durationData.startRound = game.combat?.round ?? 0;
    } else {
      durationData.rounds = duration;
      durationData.startRound = game.combat?.round ?? 0;
      durationData.startTurn = game.combat?.turn ?? 0;
    }

    const icon = resultIcon || this.getConditionIcon(conditionName);

    const effectData: Record<string, any> = {
      name: this.formatConditionName(conditionName),
      icon,
      origin: token.actor.uuid,
      duration: durationData,
      flags: {
        [MODULE_ID]: {
          source: 'crit-fumble-result',
          condition: conditionName
        },
        'times-up': {
          isPassive: false
        }
      }
    };

    try {
      await token.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
      const durationText =
        duration === -1 ? 'permanent' : duration === 0 ? 'until end of turn' : `${duration} rounds`;
      console.log(`${LOG_PREFIX} Applied "${conditionName}" to ${token.name} (${durationText})`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to apply condition:`, error);
    }
  }

  /**
   * Apply a standard D&D 5e condition using Foundry's built-in status effects.
   * This properly integrates with the token HUD and condition automation.
   *
   * IMPORTANT: Duration tracking for standard conditions requires the "Times-Up" module.
   * Without Times-Up installed, conditions will persist indefinitely until manually removed.
   * Custom (non-standard) conditions use Active Effects with built-in duration tracking.
   *
   * @see https://foundryvtt.com/packages/times-up for Times-Up module
   */
  private static async applyStandardCondition(
    token: Token,
    conditionName: string,
    duration: number
  ): Promise<void> {
    const statusId = conditionName.toLowerCase();

    try {
      // Check if the condition is already active
      const hasCondition = token.actor?.statuses?.has(statusId);

      if (!hasCondition) {
        // Toggle the status effect on (this uses Foundry's built-in system)
        await token.actor.toggleStatusEffect(statusId, { active: true });
      }

      const durationText =
        duration === -1 ? 'permanent' : duration === 0 ? 'until end of turn' : `${duration} rounds`;
      console.log(`${LOG_PREFIX} Applied "${conditionName}" to ${token.name} (${durationText})`);

      // Note: Duration tracking for standard conditions requires Times-Up or similar module
      // The status will remain until manually removed or cleared by such a module
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to apply standard condition:`, error);
    }
  }

  /**
   * Check if a condition is a standard D&D5e condition
   */
  private static isStandardCondition(condition: string): boolean {
    const standardConditions = [
      'blinded',
      'charmed',
      'deafened',
      'frightened',
      'grappled',
      'incapacitated',
      'invisible',
      'paralyzed',
      'petrified',
      'poisoned',
      'prone',
      'restrained',
      'stunned',
      'unconscious',
      'exhaustion'
    ];
    return standardConditions.includes(condition.toLowerCase());
  }

  /**
   * Apply damage to a token using MidiQOL's damage application
   * Respects MidiQOL workflow settings for damage cards
   *
   * Supports special formula syntax:
   * - "1W", "2W", "3W" = 1, 2, or 3 extra weapon dice (e.g., "2W" with longsword = 2d8)
   * - Standard formulas like "2d6" work as normal
   *
   * If damageType is "weapon", extracts the damage type from the source item
   */
  static async applyDamage(
    token: Token,
    config: TableEffectConfig,
    sourceItem?: Item
  ): Promise<void> {
    if (!config.damageFormula || !token.actor) {
      return;
    }

    try {
      // Resolve the damage formula - check for weapon dice syntax (e.g., "1W", "2W")
      const resolvedFormula = this.resolveWeaponDiceFormula(config.damageFormula, sourceItem);

      const roll = new Roll(resolvedFormula);
      await roll.evaluate({ async: true });

      // Resolve damage type - use item's damage type if "weapon" or "spell" is specified
      let damageType = config.damageType || 'bludgeoning';
      if ((damageType === 'weapon' || damageType === 'spell') && sourceItem) {
        damageType = this.getWeaponDamageType(sourceItem);
      } else if (damageType === 'weapon') {
        // Fallback if no source item available
        damageType = 'bludgeoning';
      } else if (damageType === 'spell') {
        // Fallback if no source item available for spells
        damageType = 'force';
      }

      const damageDetail = [{ damage: roll.total, type: damageType }];

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ token }),
        flavor: `Crit/Fumble Bonus Damage (${damageType})`
      });

      await MidiQOL.applyTokenDamage(damageDetail, roll.total, new Set([token]), null, null, {});

      console.log(
        `${LOG_PREFIX} Applied ${roll.total} ${damageType} damage to ${token.name} (${resolvedFormula})`
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to apply damage:`, error);
    }
  }

  /**
   * Resolve weapon/spell dice formula syntax
   *
   * "XW" syntax: X dice of the weapon's damage die SIZE (not X times full weapon damage)
   *   - Example: "2W" with a longsword (1d8) -> "2d8" (two d8s, not 2×1d8)
   *   - Example: "3W" with a greatsword (2d6) -> "3d6" (three d6s, extracts die size only)
   *
   * "XS" syntax: X dice of the spell's damage die SIZE
   *   - Example: "2S" with fire bolt (1d10) -> "2d10"
   *   - Example: "3S" with magic missile (1d4+1) -> "3d4" (extracts die size only)
   *
   * If no source item is available, defaults to d6 for weapons and d8 for spells.
   */
  private static resolveWeaponDiceFormula(formula: string, sourceItem?: Item): string {
    // Check for weapon dice syntax: "1W", "2W", "3W", etc.
    const weaponDiceMatch = formula.match(/^(\d+)W$/i);
    if (weaponDiceMatch) {
      const numDice = parseInt(weaponDiceMatch[1], 10);
      const weaponDie = this.getWeaponDamageDie(sourceItem);
      return `${numDice}${weaponDie}`;
    }

    // Check for spell dice syntax: "1S", "2S", "3S", etc.
    const spellDiceMatch = formula.match(/^(\d+)S$/i);
    if (spellDiceMatch) {
      const numDice = parseInt(spellDiceMatch[1], 10);
      const spellDie = this.getSpellDamageDie(sourceItem);
      return `${numDice}${spellDie}`;
    }

    // Not special dice syntax, return formula as-is
    return formula;
  }

  /**
   * Extract the damage die from a spell item (e.g., "d10" from fire bolt)
   */
  private static getSpellDamageDie(item?: Item): string {
    if (!item) {
      return 'd8'; // Fallback for spells
    }

    // D&D 5e stores damage parts as [[formula, type], [formula, type], ...]
    const damageParts = item.system?.damage?.parts;
    if (damageParts && damageParts.length > 0) {
      const damageFormula = damageParts[0]?.[0];
      if (damageFormula) {
        // Extract the die from the formula (e.g., "1d10" -> "d10", "2d6" -> "d6")
        const dieMatch = damageFormula.match(/d(\d+)/i);
        if (dieMatch) {
          return `d${dieMatch[1]}`;
        }
      }
    }
    // Fallback to d8 if no damage die found (common spell damage die)
    return 'd8';
  }

  /**
   * Extract the damage die from a weapon/spell item (e.g., "d8" from longsword)
   */
  private static getWeaponDamageDie(item?: Item): string {
    if (!item) {
      return 'd6'; // Fallback
    }

    // D&D 5e stores damage parts as [[formula, type], [formula, type], ...]
    const damageParts = item.system?.damage?.parts;
    if (damageParts && damageParts.length > 0) {
      const damageFormula = damageParts[0]?.[0];
      if (damageFormula) {
        // Extract the die from the formula (e.g., "1d8+3" -> "d8", "2d6" -> "d6")
        const dieMatch = damageFormula.match(/d(\d+)/i);
        if (dieMatch) {
          return `d${dieMatch[1]}`;
        }
      }
    }
    // Fallback to d6 if no damage die found
    return 'd6';
  }

  /**
   * Extract the primary damage type from a weapon/spell item
   */
  private static getWeaponDamageType(item: Item): string {
    // D&D 5e stores damage parts as [[formula, type], [formula, type], ...]
    const damageParts = item.system?.damage?.parts;
    if (damageParts && damageParts.length > 0) {
      // Return the damage type from the first damage entry
      const firstDamageType = damageParts[0]?.[1];
      if (firstDamageType) {
        return firstDamageType;
      }
    }
    // Fallback to bludgeoning if no damage type found
    return 'bludgeoning';
  }

  /**
   * Handle an effect that requires a saving throw
   */
  static async handleSaveEffect(
    token: Token,
    config: TableEffectConfig,
    _sourceActor?: Actor,
    resultIcon?: string
  ): Promise<void> {
    if (!config.saveDC || !config.saveAbility || !token.actor) {
      return;
    }

    console.log(`${LOG_PREFIX} Save effect triggered - DC ${config.saveDC} ${config.saveAbility}`);

    if (config.effectCondition) {
      await this.applyCondition(token, config, resultIcon);
    }
    if (config.damageFormula) {
      await this.applyDamage(token, config);
    }
  }

  /**
   * Apply a disarm effect - unequips the source actor's weapon
   */
  static async applyDisarm(sourceActor?: Actor, sourceItem?: Item): Promise<void> {
    if (!sourceActor || !sourceItem) {
      console.warn(`${LOG_PREFIX} Cannot apply disarm - missing actor or item`);
      return;
    }

    try {
      const itemDoc = sourceActor.items.get(sourceItem.id);
      if (!itemDoc) {
        console.warn(`${LOG_PREFIX} Cannot find item ${sourceItem.id} on actor`);
        return;
      }

      if (itemDoc.type === 'weapon') {
        await itemDoc.update({ 'system.equipped': false });
        console.log(`${LOG_PREFIX} Disarmed ${sourceActor.name}'s ${itemDoc.name}`);
      } else {
        console.log(`${LOG_PREFIX} Cannot disarm non-weapon item: ${itemDoc.name}`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to apply disarm:`, error);
    }
  }

  /**
   * Apply a penalty effect as an Active Effect (for weapon/armor damage)
   */
  static async applyPenalty(
    token: Token,
    config: TableEffectConfig,
    resultIcon?: string
  ): Promise<void> {
    if (!token.actor || !config.penaltyType || config.penaltyValue === undefined) {
      console.warn(`${LOG_PREFIX} Cannot apply penalty - missing required config`);
      return;
    }

    let changeKey: string;
    let effectName: string;

    if (config.penaltyType === 'ac') {
      changeKey = 'system.attributes.ac.bonus';
      effectName = 'Armor Damaged';
    } else {
      // Attack penalty applies to all attack types
      changeKey = 'system.bonuses.All.attack';
      effectName = 'Weapon Damaged';
    }

    const durationData: Record<string, any> = {};
    const duration = config.duration ?? -1;

    if (duration === -1) {
      durationData.seconds = null;
      durationData.rounds = null;
    } else {
      durationData.rounds = duration;
      durationData.startRound = game.combat?.round ?? 0;
      durationData.startTurn = game.combat?.turn ?? 0;
    }

    const effectData = {
      name: effectName,
      icon: resultIcon || 'icons/svg/downgrade.svg',
      origin: token.actor.uuid,
      changes: [
        {
          key: changeKey,
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: config.penaltyValue.toString()
        }
      ],
      duration: durationData,
      flags: {
        [MODULE_ID]: {
          source: 'crit-fumble-result',
          penaltyType: config.penaltyType,
          penaltyValue: config.penaltyValue
        }
      }
    };

    try {
      await token.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
      console.log(`${LOG_PREFIX} Applied ${effectName} (${config.penaltyValue}) to ${token.name}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to apply penalty:`, error);
    }
  }

  /**
   * Apply an advantage or disadvantage effect using Midi-QOL flags
   */
  static async applyAdvantageDisadvantage(
    token: Token,
    config: TableEffectConfig,
    type: 'advantage' | 'disadvantage',
    resultIcon?: string
  ): Promise<void> {
    if (!token.actor || !config.advantageScope) {
      console.warn(`${LOG_PREFIX} Cannot apply ${type} - missing actor or scope`);
      return;
    }

    const scopes = Array.isArray(config.advantageScope)
      ? config.advantageScope
      : [config.advantageScope];
    const target = config.advantageTarget ?? 'self';

    const changes = this.buildAdvantageChanges(scopes, type, target);

    if (changes.length === 0) {
      console.warn(`${LOG_PREFIX} No valid changes generated for ${type} effect`);
      return;
    }

    const effectName = config.effectName ?? this.generateAdvantageEffectName(type, scopes, target);

    const durationData: Record<string, any> = {};
    const duration = config.duration ?? 1;

    if (duration === -1) {
      durationData.seconds = null;
      durationData.rounds = null;
    } else if (duration === 0) {
      durationData.turns = 1;
      durationData.startTurn = game.combat?.turn ?? 0;
      durationData.startRound = game.combat?.round ?? 0;
    } else {
      durationData.rounds = duration;
      durationData.startRound = game.combat?.round ?? 0;
      durationData.startTurn = game.combat?.turn ?? 0;
    }

    const effectData = {
      name: effectName,
      icon: resultIcon || this.getAdvantageIcon(type),
      origin: token.actor.uuid,
      changes,
      duration: durationData,
      flags: {
        [MODULE_ID]: {
          source: 'crit-fumble-result',
          effectType: type,
          advantageScope: scopes,
          advantageTarget: target
        },
        'times-up': {
          isPassive: false
        }
      }
    };

    try {
      await token.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
      const durationText =
        duration === -1 ? 'permanent' : duration === 0 ? 'until end of turn' : `${duration} rounds`;
      console.log(`${LOG_PREFIX} Applied "${effectName}" to ${token.name} (${durationText})`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to apply ${type}:`, error);
    }
  }

  /**
   * Build Midi-QOL flag changes for advantage/disadvantage effects
   */
  private static buildAdvantageChanges(
    scopes: AdvantageScope[],
    type: 'advantage' | 'disadvantage',
    target: AdvantageTarget
  ): Array<{ key: string; mode: number; value: string }> {
    const changes: Array<{ key: string; mode: number; value: string }> = [];

    for (const scope of scopes) {
      const flagKeys = this.scopeToMidiFlags(scope, type, target);
      for (const key of flagKeys) {
        changes.push({
          key,
          mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
          value: '1'
        });
      }
    }

    return changes;
  }

  /**
   * Convert a scope to Midi-QOL flag keys
   */
  private static scopeToMidiFlags(
    scope: AdvantageScope,
    type: 'advantage' | 'disadvantage',
    target: AdvantageTarget
  ): string[] {
    const prefix = target === 'grants' ? `flags.midi-qol.grants.${type}` : `flags.midi-qol.${type}`;
    const keys: string[] = [];

    switch (scope) {
      case 'all':
        keys.push(`${prefix}.all`);
        break;
      case 'attack.all':
        keys.push(`${prefix}.attack.all`);
        break;
      case 'attack.mwak':
        keys.push(`${prefix}.attack.mwak`);
        break;
      case 'attack.rwak':
        keys.push(`${prefix}.attack.rwak`);
        break;
      case 'attack.msak':
        keys.push(`${prefix}.attack.msak`);
        break;
      case 'attack.rsak':
        keys.push(`${prefix}.attack.rsak`);
        break;
      case 'ability.all':
        keys.push(`${prefix}.ability.check.all`);
        break;
      case 'ability.str':
        keys.push(`${prefix}.ability.check.str`);
        break;
      case 'ability.dex':
        keys.push(`${prefix}.ability.check.dex`);
        break;
      case 'ability.con':
        keys.push(`${prefix}.ability.check.con`);
        break;
      case 'ability.int':
        keys.push(`${prefix}.ability.check.int`);
        break;
      case 'ability.wis':
        keys.push(`${prefix}.ability.check.wis`);
        break;
      case 'ability.cha':
        keys.push(`${prefix}.ability.check.cha`);
        break;
      case 'save.all':
        keys.push(`${prefix}.ability.save.all`);
        break;
      case 'save.str':
        keys.push(`${prefix}.ability.save.str`);
        break;
      case 'save.dex':
        keys.push(`${prefix}.ability.save.dex`);
        break;
      case 'save.con':
        keys.push(`${prefix}.ability.save.con`);
        break;
      case 'save.int':
        keys.push(`${prefix}.ability.save.int`);
        break;
      case 'save.wis':
        keys.push(`${prefix}.ability.save.wis`);
        break;
      case 'save.cha':
        keys.push(`${prefix}.ability.save.cha`);
        break;
      case 'concentration':
        keys.push(`${prefix}.concentration`);
        break;
    }

    return keys;
  }

  /**
   * Generate a human-readable effect name for advantage/disadvantage
   */
  private static generateAdvantageEffectName(
    type: 'advantage' | 'disadvantage',
    scopes: AdvantageScope[],
    target: AdvantageTarget
  ): string {
    const typeLabel = type === 'advantage' ? 'Advantage' : 'Disadvantage';
    const targetLabel = target === 'grants' ? 'Grants ' : '';

    if (scopes.length === 1) {
      const scopeLabel = this.scopeToLabel(scopes[0]);
      return `${targetLabel}${typeLabel} (${scopeLabel})`;
    }

    return `${targetLabel}${typeLabel} (Multiple)`;
  }

  /**
   * Convert scope to human-readable label
   */
  private static scopeToLabel(scope: AdvantageScope): string {
    const labels: Record<AdvantageScope, string> = {
      all: 'All Rolls',
      'attack.all': 'All Attacks',
      'attack.mwak': 'Melee Attacks',
      'attack.rwak': 'Ranged Attacks',
      'attack.msak': 'Melee Spell Attacks',
      'attack.rsak': 'Ranged Spell Attacks',
      'ability.all': 'All Ability Checks',
      'ability.str': 'STR Checks',
      'ability.dex': 'DEX Checks',
      'ability.con': 'CON Checks',
      'ability.int': 'INT Checks',
      'ability.wis': 'WIS Checks',
      'ability.cha': 'CHA Checks',
      'save.all': 'All Saves',
      'save.str': 'STR Saves',
      'save.dex': 'DEX Saves',
      'save.con': 'CON Saves',
      'save.int': 'INT Saves',
      'save.wis': 'WIS Saves',
      'save.cha': 'CHA Saves',
      concentration: 'Concentration'
    };
    return labels[scope] ?? scope;
  }

  /**
   * Get icon for advantage/disadvantage effects
   */
  private static getAdvantageIcon(type: 'advantage' | 'disadvantage'): string {
    return type === 'advantage' ? 'icons/svg/upgrade.svg' : 'icons/svg/downgrade.svg';
  }

  /**
   * Display the result in chat
   */
  static async displayResult(
    result: RolledResult,
    attackerName: string,
    targetName: string
  ): Promise<void> {
    if (!shouldShowChatMessages()) {
      return;
    }

    const isCrit = result.type === 'crit';
    const typeClass = isCrit ? 'critical' : 'fumble';
    const typeLabel = isCrit
      ? game.i18n.localize('DLCRITFUMBLE.Chat.CriticalHit')
      : game.i18n.localize('DLCRITFUMBLE.Chat.Fumble');
    const typeIcon = isCrit ? 'fa-solid fa-burst' : 'fa-solid fa-skull';

    const effectConfig = result.result.flags?.[MODULE_ID] as TableEffectConfig | undefined;

    let effectDetails = '';
    if (effectConfig && effectConfig.effectType !== EFFECT_TYPES.NONE) {
      effectDetails = this.formatEffectDetails(effectConfig);
    }

    const content = `
      <div class="crit-fumble-result ${typeClass}">
        <div class="result-header">
          <i class="${typeIcon} result-icon"></i>
          <h3>${typeLabel}</h3>
        </div>
        <div class="combatants">
          <strong>${attackerName}</strong> vs <strong>${targetName}</strong>
        </div>
        <div class="result-name">${result.result.name}</div>
        <div class="result-description">${result.result.description}</div>
        ${effectDetails}
      </div>
    `;

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker(),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      flags: {
        [MODULE_ID]: {
          resultType: result.type,
          attackType: result.attackType,
          tier: result.tier
        }
      }
    });
  }

  /**
   * Format effect details for chat display
   */
  private static formatEffectDetails(config: TableEffectConfig): string {
    const details: string[] = [];

    if (config.effectCondition) {
      details.push(`
        <div class="effect-item">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span class="condition-badge">${this.formatConditionName(config.effectCondition)}</span>
        </div>
      `);
    }

    if (config.damageFormula) {
      details.push(`
        <div class="effect-item">
          <i class="fa-solid fa-heart-crack"></i>
          <span class="damage-roll">${config.damageFormula}</span>
          ${config.damageType ? `<span>${config.damageType}</span>` : ''}
        </div>
      `);
    }

    if (config.penaltyType && config.penaltyValue !== undefined) {
      const penaltyLabel = config.penaltyType === 'ac' ? 'Armor Damaged' : 'Weapon Damaged';
      details.push(`
        <div class="effect-item">
          <i class="fa-solid fa-shield-halved"></i>
          <span class="penalty-badge">${penaltyLabel} (${config.penaltyValue})</span>
        </div>
      `);
    }

    if (config.effectType === EFFECT_TYPES.DISARM) {
      details.push(`
        <div class="effect-item">
          <i class="fa-solid fa-hand"></i>
          <span class="disarm-badge">Disarmed</span>
        </div>
      `);
    }

    if (
      config.effectType === EFFECT_TYPES.ADVANTAGE ||
      config.effectType === EFFECT_TYPES.DISADVANTAGE
    ) {
      const advType = config.effectType === EFFECT_TYPES.ADVANTAGE ? 'Advantage' : 'Disadvantage';
      const advIcon =
        config.effectType === EFFECT_TYPES.ADVANTAGE
          ? 'fa-solid fa-arrow-up'
          : 'fa-solid fa-arrow-down';
      const scopes = Array.isArray(config.advantageScope)
        ? config.advantageScope
        : [config.advantageScope];
      const scopeLabels = scopes
        .filter((s): s is AdvantageScope => Boolean(s))
        .map(s => this.scopeToLabel(s))
        .join(', ');
      const targetLabel = config.advantageTarget === 'grants' ? ' (grants to attackers)' : '';
      details.push(`
        <div class="effect-item">
          <i class="${advIcon}"></i>
          <span class="advantage-badge">${advType}${targetLabel}: ${scopeLabels}</span>
        </div>
      `);
    }

    if (config.duration && config.duration > 0) {
      details.push(`
        <div class="effect-item duration">
          <i class="fa-solid fa-clock"></i>
          <span>${config.duration} round${config.duration > 1 ? 's' : ''}</span>
        </div>
      `);
    }

    if (config.saveDC && config.saveAbility) {
      details.push(`
        <div class="save-info">
          <span class="save-type">${config.saveAbility.toUpperCase()}</span> Save
          <span class="save-dc">DC ${config.saveDC}</span>
        </div>
      `);
    }

    if (details.length === 0) {
      return '';
    }

    return `<div class="effect-details">${details.join('')}</div>`;
  }

  /**
   * Format a condition name for display
   */
  private static formatConditionName(condition: string): string {
    return condition.charAt(0).toUpperCase() + condition.slice(1).toLowerCase();
  }

  /**
   * Get the icon path for a condition
   */
  private static getConditionIcon(condition: string): string {
    const iconMap: Record<string, string> = {
      prone: 'icons/svg/falling.svg',
      stunned: 'icons/svg/daze.svg',
      blinded: 'icons/svg/blind.svg',
      deafened: 'icons/svg/deaf.svg',
      frightened: 'icons/svg/terror.svg',
      grappled: 'icons/svg/net.svg',
      incapacitated: 'icons/svg/paralysis.svg',
      paralyzed: 'icons/svg/paralysis.svg',
      poisoned: 'icons/svg/poison.svg',
      restrained: 'icons/svg/net.svg',
      unconscious: 'icons/svg/unconscious.svg',
      exhaustion: 'icons/svg/downgrade.svg',
      fatigued: 'icons/svg/downgrade.svg'
    };

    return iconMap[condition.toLowerCase()] || 'icons/svg/status.svg';
  }
}
