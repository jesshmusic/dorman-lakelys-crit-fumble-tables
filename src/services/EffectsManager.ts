/**
 * Effects Manager Service
 * Responsible for applying conditions, damage, and other effects from table results
 */

import { MODULE_ID, EFFECT_TYPES, LOG_PREFIX } from '../constants';
import { RolledResult, TableEffectConfig } from '../types';
import { shouldApplyEffects, shouldShowChatMessages } from '../settings';

/**
 * Service for managing and applying crit/fumble effects
 */
export class EffectsManager {
  /**
   * Apply the effects from a rolled result
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
        await this.applyDamage(targetToken, effectConfig);
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
    }
  }

  /**
   * Apply a condition to a token
   * Integrates with Times Up module for automatic effect expiration
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
      statuses: this.isStandardCondition(conditionName) ? [conditionName.toLowerCase()] : [],
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
   */
  static async applyDamage(token: Token, config: TableEffectConfig): Promise<void> {
    if (!config.damageFormula || !token.actor) {
      return;
    }

    try {
      const roll = new Roll(config.damageFormula);
      await roll.evaluate({ async: true });

      const damageType = config.damageType || 'none';
      const damageDetail = [{ damage: roll.total, type: damageType }];

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ token }),
        flavor: `Crit/Fumble Bonus Damage (${damageType})`
      });

      await MidiQOL.applyTokenDamage(damageDetail, roll.total, new Set([token]), null, null, {});

      console.log(`${LOG_PREFIX} Applied ${roll.total} ${damageType} damage to ${token.name}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to apply damage:`, error);
    }
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
