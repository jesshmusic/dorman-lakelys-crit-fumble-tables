/**
 * Effects Manager Service
 * Responsible for applying conditions, damage, and other effects from table results
 */

import { MODULE_ID, EFFECT_TYPES, LOG_PREFIX, STANDARD_CONDITIONS } from '../constants';
import { RolledResult, TableEffectConfig, AdvantageScope, AdvantageTarget } from '../types';
import { shouldApplyEffects, shouldShowChatMessages } from '../settings';
import { SaveManager } from './SaveManager';

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
        await this.handleSaveEffect(targetToken, effectConfig, sourceActor, resultIcon, sourceItem);
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

      case EFFECT_TYPES.ATTACK_ALLY:
        // Fumble: the fumbler (passed here as targetToken) is forced to attack
        // their nearest ally. Solicits a real attack roll from the fumbler.
        await this.applyAttackAlly(targetToken, sourceActor, sourceItem);
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
   * Build Active Effect `duration` data that behaves correctly in combat with
   * DAE 14 + Times-Up 13 on Foundry v14 / dnd5e 5.3.
   *
   * Uses the DAE value/units/expiry schema (verified correct for this stack).
   * The old `specialDuration`/`rounds` path silently mis-expires self-effects
   * because Times-Up reads legacy fields absent in v14/dnd5e-5.3. `expiry`
   * `targetEnd` fires at the end of the turn of the actor the effect is ON (the
   * crit target, or the fumbler for self-debuffs) — so it survives the
   * attacker's turn ending and lasts through the holder's next turn.
   *
   * @param duration -1 = permanent, 0 = until end of the affected creature's
   *                  next turn, N = N rounds
   */
  private static buildDuration(duration: number): Record<string, any> {
    if (duration === -1) return {}; // permanent
    if (duration === 0) return { value: 1, units: 'turns', expiry: 'targetEnd' }; // end of holder's NEXT turn (crit target OR fumbler)
    return { value: duration, units: 'rounds', expiry: 'targetEnd' }; // N rounds
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
    const durationData = this.buildDuration(duration);

    const icon = resultIcon || this.getConditionIcon(conditionName);

    const effectData: Record<string, any> = {
      name: this.formatConditionName(conditionName),
      icon,
      origin: token.actor.uuid,
      disabled: false,
      transfer: false,
      duration: durationData,
      flags: {
        [MODULE_ID]: {
          source: 'crit-fumble-result',
          condition: conditionName
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
    return (STANDARD_CONDITIONS as readonly string[]).includes(condition.toLowerCase());
  }

  /**
   * Roll bonus crit/fumble damage and post Foundry's NATIVE dnd5e damage card
   * so the GM clicks "Apply / ½ / 2×" (no silent auto-apply).
   *
   * How the card works (dnd5e 5.3): a chat message whose rolls include a
   * `CONFIG.Dice.DamageRoll` gets the Apply-Damage tray for the GM. Setting
   * `flags.dnd5e.targets` pre-fills the tray's "Targeted" tab with this token,
   * and `flags.dnd5e.roll.type = "damage"` gives it the damage header. Apply
   * runs `Actor5e.applyDamage`, which honors resistances/vulnerabilities.
   *
   * Supports special formula syntax:
   * - "1W"/"2W"/"3W" = N dice of the weapon's damage die (e.g. "2W" + longsword = 2d8)
   * - "1S"/"2S"/"3S" = N dice of the spell's damage die
   * - Standard formulas like "2d6" work as-is
   *
   * Damage type is resolved so it is logical for the event: an explicit type
   * (fire, force, …) is used as authored; "weapon"/"spell" resolve to the
   * source item's actual damage type.
   */
  static async applyDamage(
    token: Token,
    config: TableEffectConfig,
    sourceItem?: Item,
    options: { half?: boolean } = {}
  ): Promise<void> {
    const actor = (token as any)?.actor;
    if (!config.damageFormula || !actor) {
      return;
    }

    try {
      // Resolve "XW"/"XS" weapon/spell dice syntax against the 5.3 damage schema
      const resolvedFormula = this.resolveWeaponDiceFormula(config.damageFormula, sourceItem);
      const damageType = this.resolveDamageType(config.damageType, sourceItem);

      // Use the dnd5e DamageRoll so the chat card exposes Apply-Damage buttons
      const DamageRollClass = (globalThis as any).CONFIG?.Dice?.DamageRoll ?? Roll;
      const rollData = (sourceItem as any)?.getRollData?.() ?? {};
      const roll = new DamageRollClass(resolvedFormula, rollData, { type: damageType });
      await roll.evaluate();

      // On a successful save the target takes HALF damage. We do NOT auto-halve
      // the roll total — the native dnd5e damage card's ½ button handles it — so
      // we just flag the card's flavor to tell the GM to click ½.
      const halfSuffix = options.half ? ' — save succeeded, apply HALF' : '';

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ token: (token as any).document ?? token }),
        flavor: `Crit/Fumble Bonus Damage (${damageType})${halfSuffix}`,
        flags: {
          dnd5e: {
            roll: { type: 'damage' },
            targets: [
              {
                uuid: actor.uuid,
                name: token.name,
                img: actor.img,
                ac: actor.system?.attributes?.ac?.value ?? null
              }
            ]
          }
        }
      });

      console.log(
        `${LOG_PREFIX} Posted ${roll.total} ${damageType} damage card for ${token.name} (${resolvedFormula}) — GM applies`
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to roll bonus damage:`, error);
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
    // "XWB"/"XSB" = X full copies of the weapon's/spell's BASE damage dice
    // (number AND die size). Use this for "triple/quadruple damage" results:
    // a crit already rolls 2x the base dice on the attack card, so the bonus
    // card adds "1WB" for triple, "2WB" for quadruple. Unlike "XW" (which is X
    // dice of the die size only), "XWB" respects multi-die weapons (greatsword
    // 2d6 -> "1WB" = 2d6, not 1d6).
    const weaponBaseMatch = formula.match(/^(\d+)WB$/i);
    if (weaponBaseMatch) {
      return this.getFullBaseDice(sourceItem, parseInt(weaponBaseMatch[1], 10), 'weapon');
    }
    const spellBaseMatch = formula.match(/^(\d+)SB$/i);
    if (spellBaseMatch) {
      return this.getFullBaseDice(sourceItem, parseInt(spellBaseMatch[1], 10), 'spell');
    }

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
   * Get the primary DamageData for an item in dnd5e 5.x.
   *
   * dnd5e 5.x REMOVED the old `system.damage.parts` tuple array. Weapons/
   * consumables now carry `system.damage.base` (a DamageData with
   * `{ number, denomination, types:Set, formula }`); spells and other
   * activity-based items carry damage on their damage ACTIVITY
   * (`activity.damage.parts[0]`, also a DamageData).
   */
  private static getPrimaryDamageData(item?: any): any | null {
    if (!item) {
      return null;
    }

    // Weapons / consumables: system.damage.base
    const base = item.system?.damage?.base;
    if (base && (base.denomination || base.types)) {
      return base;
    }

    // Spells / activity-based items: first damage part of the first damage activity.
    // `activities` may be a dnd5e Collection (.contents/.values()) or, in some
    // contexts, a plain object — handle all three (matches findWeaponForAttackType).
    const activities = item.system?.activities;
    if (activities) {
      const list: any[] = Array.isArray(activities.contents)
        ? activities.contents
        : typeof activities.values === 'function'
          ? [...activities.values()]
          : Object.values(activities);
      for (const activity of list) {
        const parts = activity?.damage?.parts;
        if (parts && parts.length > 0) {
          return parts[0];
        }
      }
    }

    return null;
  }

  /**
   * Build N full copies of an item's BASE damage dice (number × die size).
   * e.g. greatsword base 2d6, copies=1 -> "2d6"; longsword 1d8, copies=2 -> "2d8".
   * Falls back to d6 (weapon) / d8 (spell), single die, when unresolved.
   */
  private static getFullBaseDice(
    item: Item | undefined,
    copies: number,
    kind: 'weapon' | 'spell'
  ): string {
    const data = this.getPrimaryDamageData(item);
    // Use `||` (not `??`) so a 0 number/denomination falls back rather than
    // producing an invalid "0dN"/"Nd0" formula that would throw on evaluate.
    const number = data?.number || 1;
    const denomination = data?.denomination || (kind === 'spell' ? 8 : 6);
    return `${number * copies}d${denomination}`;
  }

  /**
   * Extract the damage die string (e.g. "d10") from a spell/activity item.
   */
  private static getSpellDamageDie(item?: Item): string {
    const den = this.getPrimaryDamageData(item)?.denomination;
    return den ? `d${den}` : 'd8'; // common spell die fallback
  }

  /**
   * Extract the damage die string (e.g. "d8") from a weapon item.
   */
  private static getWeaponDamageDie(item?: Item): string {
    const den = this.getPrimaryDamageData(item)?.denomination;
    return den ? `d${den}` : 'd6';
  }

  /**
   * Extract the primary damage type (e.g. "slashing") from a weapon/spell item.
   * `types` is a Set in 5.x. Returns '' when none is found so the caller can
   * choose an appropriate fallback.
   */
  private static getWeaponDamageType(item?: Item): string {
    const types = this.getPrimaryDamageData(item)?.types;
    if (!types) {
      return '';
    }
    const arr = types instanceof Set ? [...types] : Array.isArray(types) ? types : [];
    return arr[0] ?? '';
  }

  /**
   * Resolve a configured damage type to a concrete D&D5e type so the damage is
   * logical for the event that caused it:
   * - an explicit type (fire, force, slashing, …) is used as authored
   * - "weapon" -> the source weapon's actual damage type
   * - "spell"  -> the source spell's actual damage type
   */
  private static resolveDamageType(configured: string | undefined, sourceItem?: Item): string {
    const type = configured || 'weapon';
    if (type === 'weapon' || type === 'spell') {
      const resolved = this.getWeaponDamageType(sourceItem);
      if (resolved) {
        return resolved;
      }
      return type === 'spell' ? 'force' : 'bludgeoning';
    }
    return type;
  }

  /**
   * Handle an effect that requires a saving throw.
   *
   * Rolls a real saving throw (player-rolled via Monk's TokenBar when available,
   * else GM-rolled). On FAILURE the condition is applied and full damage is
   * posted. On SUCCESS the condition is negated and damage is posted with the
   * HALF flag (the GM clicks the card's ½ button).
   */
  static async handleSaveEffect(
    token: Token,
    config: TableEffectConfig,
    _sourceActor?: Actor,
    resultIcon?: string,
    sourceItem?: Item
  ): Promise<void> {
    if (!config.saveDC || !config.saveAbility || !token.actor) {
      return;
    }

    const success = await SaveManager.requestSave(token, config.saveAbility, config.saveDC);

    if (!success) {
      if (config.effectCondition) {
        await this.applyCondition(token, config, resultIcon);
      }
      if (config.damageFormula) {
        // Pass the source item so weapon/spell dice syntax and "weapon"/"spell"
        // damage types resolve against the real item (not the d6/bludgeoning fallback).
        await this.applyDamage(token, config, sourceItem); // full
      }
    } else {
      // condition negated on success; damage halved
      if (config.damageFormula) {
        await this.applyDamage(token, config, sourceItem, { half: true });
      }
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
   * Fumble effect: the fumbler is forced to attack their nearest ally.
   * Targets the nearest same-disposition token and solicits a real attack roll
   * from the fumbler using their own weapon (on a hit, the weapon's normal
   * damage card resolves against the ally).
   *
   * @param fumblerToken - the token that fumbled
   * @param sourceActor - the fumbling actor
   * @param sourceItem - the weapon used in the fumbled attack
   */
  static async applyAttackAlly(
    fumblerToken: Token,
    sourceActor?: Actor,
    sourceItem?: Item
  ): Promise<void> {
    const fToken = fumblerToken as any;
    const actor = (sourceActor as any) ?? fToken?.actor;
    if (!fToken?.actor || !actor) {
      return;
    }

    const ally = this.findNearestAlly(fToken);
    if (!ally) {
      ui.notifications?.info(`${actor.name} has no nearby ally to strike.`);
      console.log(`${LOG_PREFIX} attackAlly: no ally found near ${fToken.name}`);
      return;
    }

    // Resolve the weapon to swing (prefer the fumbled weapon, else any weapon)
    let weapon: any =
      sourceItem && actor.items?.get
        ? (actor.items.get((sourceItem as any).id) ?? sourceItem)
        : null;
    if (!weapon) {
      weapon = [...(actor.items?.values?.() ?? [])].find((i: any) => i.type === 'weapon');
    }
    if (!weapon?.use) {
      ui.notifications?.warn(`${actor.name} has no usable weapon to strike ${ally.name}.`);
      return;
    }

    // Target the ally so the solicited attack resolves against it
    try {
      (game as any).user?.updateTokenTargets?.([ally.id]);
      ally.setTarget?.(true, { releaseOthers: true });
    } catch {
      /* targeting is best-effort */
    }

    ui.notifications?.warn(
      `${actor.name} fumbled and lashes out at ${ally.name}! Roll the attack.`
    );
    console.log(`${LOG_PREFIX} attackAlly: ${actor.name} → ${ally.name} with ${weapon.name}`);

    // Guard so this solicited attack does not re-trigger crit/fumble handling.
    // The next AttackRollComplete consumes the flag. A timeout auto-clears it so
    // it can never leak into an unrelated later attack if this solicited attack
    // produces no workflow (e.g. the player cancels the use dialog, or the
    // weapon has no attack roll).
    const { MidiQolHooks } = await import('./MidiQolHooks');
    MidiQolHooks.suppressNextWorkflow = true;
    const guardTimer = setTimeout(() => {
      MidiQolHooks.suppressNextWorkflow = false;
    }, 8000);
    try {
      await weapon.use();
    } catch (error) {
      MidiQolHooks.suppressNextWorkflow = false;
      clearTimeout(guardTimer);
      console.error(`${LOG_PREFIX} attackAlly: failed to use weapon:`, error);
    }
  }

  /**
   * Find the nearest living ally (same token disposition) to the given token,
   * excluding the token itself. Uses center-to-center canvas distance.
   */
  private static findNearestAlly(fumblerToken: any): any | null {
    const placeables: any[] = (canvas as any)?.tokens?.placeables ?? [];
    const myDisposition = fumblerToken.document?.disposition ?? fumblerToken.disposition;
    const originX = fumblerToken.center?.x ?? fumblerToken.x;
    const originY = fumblerToken.center?.y ?? fumblerToken.y;

    let nearest: any = null;
    let bestDistance = Infinity;

    for (const token of placeables) {
      if (token.id === fumblerToken.id || !token.actor) {
        continue;
      }
      const disposition = token.document?.disposition ?? token.disposition;
      if (disposition !== myDisposition) {
        continue; // allies share disposition (friendly/neutral/hostile)
      }
      const hp = token.actor.system?.attributes?.hp?.value;
      if (hp !== undefined && hp !== null && hp <= 0) {
        continue; // skip downed/dead allies
      }
      const tx = token.center?.x ?? token.x;
      const ty = token.center?.y ?? token.y;
      const distance = Math.hypot(tx - originX, ty - originY);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = token;
      }
    }

    return nearest;
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

    const duration = config.duration ?? -1;
    const durationData = this.buildDuration(duration);

    const effectData = {
      name: effectName,
      icon: resultIcon || 'icons/svg/downgrade.svg',
      origin: token.actor.uuid,
      disabled: false,
      transfer: false,
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

    const duration = config.duration ?? 1;
    const durationData = this.buildDuration(duration);

    const effectData = {
      name: effectName,
      icon: resultIcon || this.getAdvantageIcon(type),
      origin: token.actor.uuid,
      disabled: false,
      transfer: false,
      changes,
      duration: durationData,
      flags: {
        [MODULE_ID]: {
          source: 'crit-fumble-result',
          effectType: type,
          advantageScope: scopes,
          advantageTarget: target
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
  ): Array<{ key: string; mode: number; value: string; priority: number }> {
    const changes: Array<{ key: string; mode: number; value: string; priority: number }> = [];

    for (const scope of scopes) {
      const flagKeys = this.scopeToMidiFlags(scope, type, target);
      for (const key of flagKeys) {
        // Midi-QOL reads the raw change value as a truthy condition and ignores
        // the mode; OVERRIDE also writes the flag into actor data, so midi's
        // getProperty fallback works too. value '1' evaluates truthy.
        changes.push({
          key,
          mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
          value: '1',
          priority: 20
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
      // Ability CHECK flags. Midi-QOL 14 path is `<type>.check.<abl>` — there is
      // NO `.ability.` segment (that was the bug: the effect wrote a key midi
      // never reads). `ability.all` maps to all ability checks.
      case 'ability.all':
        keys.push(`${prefix}.check.all`);
        break;
      case 'ability.str':
        keys.push(`${prefix}.check.str`);
        break;
      case 'ability.dex':
        keys.push(`${prefix}.check.dex`);
        break;
      case 'ability.con':
        keys.push(`${prefix}.check.con`);
        break;
      case 'ability.int':
        keys.push(`${prefix}.check.int`);
        break;
      case 'ability.wis':
        keys.push(`${prefix}.check.wis`);
        break;
      case 'ability.cha':
        keys.push(`${prefix}.check.cha`);
        break;
      // Saving THROW flags. Midi-QOL 14 path is `<type>.save.<abl>` (again, no
      // `.ability.` segment).
      case 'save.all':
        keys.push(`${prefix}.save.all`);
        break;
      case 'save.str':
        keys.push(`${prefix}.save.str`);
        break;
      case 'save.dex':
        keys.push(`${prefix}.save.dex`);
        break;
      case 'save.con':
        keys.push(`${prefix}.save.con`);
        break;
      case 'save.int':
        keys.push(`${prefix}.save.int`);
        break;
      case 'save.wis':
        keys.push(`${prefix}.save.wis`);
        break;
      case 'save.cha':
        keys.push(`${prefix}.save.cha`);
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
