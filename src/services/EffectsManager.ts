/**
 * Effects Manager Service
 * Responsible for applying conditions, damage, and other effects from table results
 */

import {
  MODULE_ID,
  EFFECT_TYPES,
  LOG_PREFIX,
  STANDARD_CONDITIONS,
  DAMAGE_CARD_MODES,
  BONUS_DAMAGE_ACTIVITY_ID,
  DISARM_DIRECTIONS,
  DISARM_DIRECTION_DIE,
  DISARM_DISTANCE_DIE,
  DEFAULT_MELEE_REACH_FEET,
  DEFAULT_RANGED_RANGE_FEET,
  DisarmDirection,
  disarmSquaresFromRoll
} from '../constants';
import { RolledResult, TableEffectConfig, AdvantageScope, AdvantageTarget } from '../types';
import { shouldApplyEffects, shouldShowChatMessages, getDamageCardMode } from '../settings';
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
        await this.applyDamage(targetToken, effectConfig, sourceItem, {
          label: result.result.name,
          img: resultIcon
        });
        break;

      case EFFECT_TYPES.SAVE:
        await this.handleSaveEffect(
          targetToken,
          effectConfig,
          sourceActor,
          resultIcon,
          sourceItem,
          result.result.name
        );
        break;

      case EFFECT_TYPES.DISARM:
        // For fumbles `targetToken` is the fumbler, which is who drops the weapon.
        await this.applyDisarm(sourceActor, sourceItem, targetToken);
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
        // Fumble: the fumbler (passed here as targetToken) accidentally catches
        // a random ally in range. Solicits a real attack roll from the fumbler.
        // attackType comes from the rolled result: a thrown weapon is classified
        // melee by dnd5e even when hurled, so the item cannot say which band applies.
        await this.applyAttackAlly(targetToken, sourceActor, sourceItem, result.attackType);
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
   * Post bonus crit/fumble damage to chat as a card that can be applied.
   *
   * Supports special formula syntax:
   * - "1W"/"2W"/"3W" = N dice of the weapon's damage die (e.g. "2W" + longsword = 2d8)
   * - "1S"/"2S"/"3S" = N dice of the spell's damage die
   * - Standard formulas like "2d6" work as-is
   *
   * Damage type is resolved so it is logical for the event: an explicit type
   * (fire, force, …) is used as authored; "weapon"/"spell" resolve to the
   * source item's actual damage type.
   *
   * Delivery is chosen by {@link getDamageCardMode}. See
   * {@link postDamageActivityCard} for why the Activity route exists.
   */
  static async applyDamage(
    token: Token,
    config: TableEffectConfig,
    sourceItem?: Item,
    options: { half?: boolean; label?: string; img?: string } = {}
  ): Promise<void> {
    const actor = (token as any)?.actor;
    if (!config.damageFormula || !actor) {
      return;
    }

    try {
      // Resolve "XW"/"XS" weapon/spell dice syntax against the 5.3 damage schema
      const resolvedFormula = this.resolveWeaponDiceFormula(config.damageFormula, sourceItem);
      const damageType = this.resolveDamageType(config.damageType, sourceItem);

      if (this.shouldUseDamageActivity()) {
        const posted = await this.postDamageActivityCard(
          token,
          resolvedFormula,
          damageType,
          sourceItem,
          options
        );
        if (posted) {
          return;
        }
        // The Activity route is unavailable (older dnd5e, no document class,
        // malformed item). Fall through so damage is never silently dropped.
        console.warn(`${LOG_PREFIX} Damage activity unavailable — posting legacy roll card`);
      }

      await this.postDamageRollCard(token, resolvedFormula, damageType, sourceItem, options);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to roll bonus damage:`, error);
    }
  }

  /**
   * Decide how the bonus damage card should be posted.
   *
   * The Activity route only pays off when Midi-QOL is present, because Midi is
   * what attaches the player-usable tray. Without Midi, dnd5e's own tray is
   * GM-only either way, so the cheaper legacy roll card is equivalent.
   */
  private static shouldUseDamageActivity(): boolean {
    const mode = getDamageCardMode();
    if (mode === DAMAGE_CARD_MODES.ROLL) {
      return false;
    }
    if (mode === DAMAGE_CARD_MODES.ACTIVITY) {
      return true;
    }
    return (game as any).modules?.get('midi-qol')?.active === true;
  }

  /**
   * Post the bonus damage through a transient dnd5e damage Activity.
   *
   * WHY: a bare `Roll#toMessage` produces a `type: "base"` message. dnd5e
   * attaches its `<damage-application>` tray to those for GMs ONLY, so players
   * get a damage card with no buttons at all. Midi-QOL's own tray
   * (`<midi-damage-application>`) has no GM check — it only checks `isOwner` —
   * but Midi attaches it exclusively to `type: "usage"` messages carrying
   * `flags.dnd5e.activity`. Using an Activity is what produces such a message,
   * which is why this path exists.
   *
   * The item is constructed in memory and never saved to the actor.
   *
   * Targeting is passed EXPLICITLY via `flags.dnd5e.targets` rather than by
   * changing the user's targets. That keeps the tray pointed at the correct
   * token (the fumbler for fumbles, the victim for crits) without disturbing
   * whatever the player currently has targeted mid-combat.
   *
   * @returns true when the card was posted, false when this route is unusable.
   */
  private static async postDamageActivityCard(
    token: Token,
    formula: string,
    damageType: string,
    sourceItem?: Item,
    options: { half?: boolean; label?: string; img?: string } = {}
  ): Promise<boolean> {
    const ItemClass = (globalThis as any).CONFIG?.Item?.documentClass;
    if (typeof ItemClass !== 'function') {
      return false;
    }

    const actor = (token as any).actor;
    // The card is spoken by whoever produced the result (attacker or fumbler),
    // falling back to the damaged actor when there is no source item.
    const owner = (sourceItem as any)?.parent ?? actor;
    if (!owner) {
      return false;
    }

    const label = options.label || 'Crit/Fumble Bonus Damage';
    const name = options.half ? `${label} (save succeeded — half)` : label;

    const itemData = {
      name,
      type: 'feat',
      img: options.img || 'icons/svg/explosion.svg',
      system: {
        activities: {
          [BONUS_DAMAGE_ACTIVITY_ID]: {
            _id: BONUS_DAMAGE_ACTIVITY_ID,
            type: 'damage',
            name: label,
            damage: {
              parts: [{ custom: { enabled: true, formula }, types: [damageType] }]
            }
          }
        }
      }
    };

    let activity: any;
    try {
      const tempItem = new ItemClass(itemData, { parent: owner });
      const activities = (tempItem as any).system?.activities;
      activity = activities ? [...activities][0] : null;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Could not build damage activity:`, error);
      return false;
    }

    if (typeof activity?.use !== 'function') {
      return false;
    }

    // Midi-QOL wraps `use` with its own workflow (flanking cleanup, Convenient
    // Effects sockets, …), any part of which can throw for reasons unrelated to
    // our damage — e.g. no GM connected. Handle that here so the caller can
    // fall back instead of dropping the damage entirely.
    const messagesBefore = (game as any).messages?.size ?? 0;
    try {
      await activity.use(
        {},
        { configure: false },
        { data: { flags: { dnd5e: { targets: [this.buildTargetDescriptor(token)] } } } }
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} Damage activity failed:`, error);
      // Report success anyway if a card already reached chat, so the caller's
      // fallback cannot post a duplicate damage card.
      return ((game as any).messages?.size ?? 0) > messagesBefore;
    }

    console.log(
      `${LOG_PREFIX} Posted ${formula} ${damageType} damage activity for ${token.name}` +
        `${options.half ? ' (half — save succeeded)' : ''}`
    );
    return true;
  }

  /**
   * Legacy delivery: a bare dnd5e DamageRoll chat card.
   *
   * Used when Midi-QOL is absent or the GM has forced "roll" mode. The
   * Apply/½/2× tray on this card is GM-only in dnd5e 5.x.
   */
  private static async postDamageRollCard(
    token: Token,
    formula: string,
    damageType: string,
    sourceItem?: Item,
    options: { half?: boolean } = {}
  ): Promise<void> {
    const DamageRollClass = (globalThis as any).CONFIG?.Dice?.DamageRoll ?? Roll;
    const rollData = (sourceItem as any)?.getRollData?.() ?? {};
    const roll = new DamageRollClass(formula, rollData, { type: damageType });
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
          targets: [this.buildTargetDescriptor(token)]
        }
      }
    });

    console.log(
      `${LOG_PREFIX} Posted ${roll.total} ${damageType} damage card for ${token.name} (${formula}) — GM applies`
    );
  }

  /**
   * Build the `flags.dnd5e.targets` entry that points a damage tray at a token.
   */
  private static buildTargetDescriptor(token: Token): {
    uuid: string;
    name: string;
    img: string;
    ac: number | null;
  } {
    const actor = (token as any).actor;
    return {
      uuid: actor.uuid,
      name: token.name,
      img: actor.img,
      ac: actor.system?.attributes?.ac?.value ?? null
    };
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
    sourceItem?: Item,
    label?: string
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
        await this.applyDamage(token, config, sourceItem, { label, img: resultIcon }); // full
      }
    } else {
      // condition negated on success; damage halved
      if (config.damageFormula) {
        await this.applyDamage(token, config, sourceItem, { half: true, label, img: resultIcon });
      }
    }
  }

  /**
   * Apply a disarm effect: the weapon flies off in a random direction.
   *
   * Direction is 1d8 (compass points) and distance is 1d10 read as grid squares
   * (see {@link disarmSquaresFromRoll}). The flight stops at the first wall it
   * would cross and is clamped to the scene, so weapons never end up inside
   * stone or off the map.
   *
   * A confirmation dialog runs first, because there is no reliable way to tell
   * a greatsword from a claw in every case — the GM makes the call. The dialog
   * pre-selects "keep it" for natural weapons (`system.type.value === 'natural'`)
   * so monster fumbles are one click.
   *
   * With Item Piles installed the weapon genuinely leaves the actor's inventory
   * and lands as a pile that has to be picked up; without it the weapon is
   * merely unequipped, as before.
   */
  static async applyDisarm(
    sourceActor?: Actor,
    sourceItem?: Item,
    fumblerToken?: Token
  ): Promise<void> {
    if (!sourceActor || !sourceItem) {
      console.warn(`${LOG_PREFIX} Cannot apply disarm - missing actor or item`);
      await this.postDisarmNotice('No weapon could be identified, so nothing was dropped.');
      return;
    }

    try {
      const itemDoc: any = (sourceActor as any).items?.get((sourceItem as any).id);
      if (!itemDoc) {
        console.warn(`${LOG_PREFIX} Cannot find item ${(sourceItem as any).id} on actor`);
        await this.postDisarmNotice('The weapon could not be found, so nothing was dropped.');
        return;
      }

      if (itemDoc.type !== 'weapon') {
        console.log(`${LOG_PREFIX} Cannot disarm non-weapon item: ${itemDoc.name}`);
        await this.postDisarmNotice(
          `<strong>${itemDoc.name}</strong> is not a weapon, so nothing was dropped.`
        );
        return;
      }

      const scatter = await this.rollDisarmScatter();

      const confirmed = await this.confirmDisarm(itemDoc, scatter);
      if (!confirmed) {
        console.log(`${LOG_PREFIX} Disarm declined for ${itemDoc.name}`);
        await this.postDisarmNotice(
          `<strong>${itemDoc.name}</strong> cannot be dropped — it stays with its owner.`
        );
        return;
      }

      await itemDoc.update({ 'system.equipped': false });

      const landing = this.computeDisarmLanding(fumblerToken, scatter);
      const dropped = landing ? await this.dropWeaponIntoPile(itemDoc, landing) : false;

      console.log(
        `${LOG_PREFIX} Disarmed ${sourceActor.name}'s ${itemDoc.name} — ` +
          `${scatter.squares} square(s) ${scatter.direction.label}` +
          `${scatter.blocked ? ' (blocked by a wall)' : ''}${dropped ? ', dropped as an item pile' : ''}`
      );

      await this.postDisarmResult(itemDoc, scatter, dropped);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to apply disarm:`, error);
    }
  }

  /**
   * Roll where a disarmed weapon lands: 1d8 for direction, 1d10 for distance.
   */
  private static async rollDisarmScatter(): Promise<{
    direction: DisarmDirection;
    directionRoll: number;
    distanceRoll: number;
    squares: number;
    feet: number;
    blocked: boolean;
  }> {
    const directionRoll = await this.rollDie(DISARM_DIRECTION_DIE, DISARM_DIRECTIONS.length);
    const distanceRoll = await this.rollDie(DISARM_DISTANCE_DIE, 10);
    const squares = disarmSquaresFromRoll(distanceRoll);
    const gridDistance = (canvas as any)?.grid?.distance ?? 5;

    return {
      direction: DISARM_DIRECTIONS[directionRoll - 1] ?? DISARM_DIRECTIONS[0],
      directionRoll,
      distanceRoll,
      squares,
      feet: squares * gridDistance,
      blocked: false
    };
  }

  /**
   * Evaluate a die, clamped into range so a missing/odd Roll implementation can
   * never index outside the direction table.
   */
  private static async rollDie(formula: string, faces: number): Promise<number> {
    try {
      const roll: any = new Roll(formula);
      await roll.evaluate();
      const total = Number(roll.total);
      if (!Number.isFinite(total)) return 1;
      return Math.min(Math.max(Math.round(total), 1), faces);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Could not roll ${formula}:`, error);
      return 1;
    }
  }

  /**
   * Ask whether this weapon can actually be thrown clear. Natural weapons
   * (claws, bites) default to "no"; anything else defaults to "yes".
   */
  private static async confirmDisarm(itemDoc: any, scatter: { squares: number }): Promise<boolean> {
    const DialogV2 = (foundry as any)?.applications?.api?.DialogV2;
    if (!DialogV2?.confirm) {
      // No dialog available (headless/test): fall back to the safe default.
      return itemDoc.system?.type?.value !== 'natural';
    }

    const isNatural = itemDoc.system?.type?.value === 'natural';
    const naturalWarning = isNatural
      ? `<p><em>This looks like a natural weapon — it probably cannot be dropped.</em></p>`
      : '';

    try {
      const result = await DialogV2.confirm({
        window: { title: game.i18n.localize('DLCRITFUMBLE.Disarm.ConfirmTitle') },
        content:
          `<p><strong>${itemDoc.name}</strong> is knocked loose and would fly ` +
          `<strong>${scatter.squares} ${scatter.squares === 1 ? 'square' : 'squares'}</strong> ` +
          `away.</p>${naturalWarning}<p>Drop it?</p>`,
        yes: { label: game.i18n.localize('DLCRITFUMBLE.Disarm.Drop'), default: !isNatural },
        no: { label: game.i18n.localize('DLCRITFUMBLE.Disarm.Keep'), default: isNatural },
        rejectClose: false
      });
      // Dismissing the dialog returns null — treat that as "leave it alone".
      return result === true;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Disarm dialog failed:`, error);
      return false;
    }
  }

  /**
   * Where the weapon comes to rest, in canvas pixels. Stops at the first wall
   * crossed and stays inside the scene rectangle. Returns null when there is no
   * canvas position to work from (then the weapon is only unequipped).
   */
  private static computeDisarmLanding(
    token: Token | undefined,
    scatter: { direction: DisarmDirection; squares: number; blocked: boolean }
  ): { x: number; y: number } | null {
    const grid = (canvas as any)?.grid;
    const origin = (token as any)?.center;
    if (!grid?.size || !origin || !Number.isFinite(origin.x)) {
      return null;
    }

    const reach = scatter.squares * grid.size;
    let destination = {
      x: origin.x + scatter.direction.dx * reach,
      y: origin.y + scatter.direction.dy * reach
    };

    // Stop at the first wall the weapon would pass through.
    try {
      const backend = (globalThis as any).CONFIG?.Canvas?.polygonBackends?.move;
      const hit = backend?.testCollision?.(origin, destination, { type: 'move', mode: 'closest' });
      if (hit && Number.isFinite(hit.x)) {
        // Pull back a little so the pile does not sit inside the wall itself.
        const dx = hit.x - origin.x;
        const dy = hit.y - origin.y;
        const length = Math.hypot(dx, dy) || 1;
        const pullback = Math.min(grid.size / 4, length / 2);
        destination = {
          x: hit.x - (dx / length) * pullback,
          y: hit.y - (dy / length) * pullback
        };
        scatter.blocked = true;
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Wall check failed for disarm:`, error);
    }

    const rect = (canvas as any)?.dimensions?.sceneRect;
    if (rect) {
      destination.x = Math.min(Math.max(destination.x, rect.x), rect.x + rect.width);
      destination.y = Math.min(Math.max(destination.y, rect.y), rect.y + rect.height);
    }

    return destination;
  }

  /**
   * Convert a landing point into the TOP-LEFT corner of the grid square that
   * contains it, which is what token placement expects.
   *
   * Item Piles positions a token by its top-left corner, so passing the landing
   * point straight through would centre the pile on a grid intersection —
   * straddling four squares. Snapping also matters after a wall stops the
   * throw, since the pull-back point is arbitrary rather than grid-aligned.
   * Every dropped weapon therefore sits squarely in one square.
   */
  private static snapToSquare(point: { x: number; y: number }): { x: number; y: number } {
    const grid = (canvas as any)?.grid;

    const snapped = grid?.getTopLeftPoint?.(point);
    if (snapped && Number.isFinite(snapped.x)) {
      return { x: snapped.x, y: snapped.y };
    }

    // Older/absent grid API: floor to the nearest square manually.
    const size = grid?.size;
    if (!size) {
      return point;
    }
    return { x: Math.floor(point.x / size) * size, y: Math.floor(point.y / size) * size };
  }

  /**
   * Move one copy of the weapon out of the actor and onto the ground as an Item
   * Pile. No-op (returning false) when Item Piles is not installed, in which
   * case the weapon is simply left unequipped.
   *
   * The pile is created BEFORE the item is removed: if the second step fails a
   * duplicate is visible and easy to delete, whereas the reverse order could
   * destroy the only copy of a magic weapon.
   */
  private static async dropWeaponIntoPile(
    itemDoc: any,
    position: { x: number; y: number }
  ): Promise<boolean> {
    const active = (game as any).modules?.get('item-piles')?.active === true;
    const api = (game as any).itempiles?.API;
    if (!active || typeof api?.createItemPile !== 'function') {
      return false;
    }

    try {
      const itemData = itemDoc.toObject();
      // Drop a single copy; any remaining stack (e.g. javelins) stays carried.
      if (itemData.system?.quantity !== undefined) {
        itemData.system.quantity = 1;
      }

      await api.createItemPile({ position: this.snapToSquare(position), items: [itemData] });

      try {
        await api.removeItems(itemDoc.parent, [{ _id: itemDoc.id, quantity: 1 }]);
      } catch (removeError) {
        console.error(
          `${LOG_PREFIX} Dropped ${itemDoc.name} as a pile but could not remove it from ` +
            `${itemDoc.parent?.name} — the weapon now exists twice, delete one:`,
          removeError
        );
      }

      return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not drop ${itemDoc.name} into an item pile:`, error);
      return false;
    }
  }

  /**
   * Announce where the weapon landed.
   */
  private static async postDisarmResult(
    itemDoc: any,
    scatter: { direction: DisarmDirection; squares: number; feet: number; blocked: boolean },
    dropped: boolean
  ): Promise<void> {
    const squareLabel = scatter.squares === 1 ? 'square' : 'squares';
    const blocked = scatter.blocked ? ' It clatters off a wall and stops short.' : '';
    const fate = dropped
      ? ' It lies on the ground and must be picked up.'
      : ' It is no longer equipped.';

    await this.postDisarmNotice(
      `<strong>${itemDoc.name}</strong> spins away — ` +
        `<strong>${scatter.squares} ${squareLabel}</strong> (${scatter.feet} ft) ` +
        `<strong>${scatter.direction.label}</strong>.${blocked}${fate}`
    );
  }

  /**
   * Post a small disarm notice to chat, honouring the chat-messages setting.
   */
  private static async postDisarmNotice(html: string): Promise<void> {
    if (!shouldShowChatMessages()) {
      return;
    }

    try {
      await ChatMessage.create({
        content: `<div class="crit-fumble-result fumble"><div class="result-description">${html}</div></div>`,
        speaker: ChatMessage.getSpeaker(),
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [MODULE_ID]: { disarm: true } }
      });
    } catch (error) {
      console.warn(`${LOG_PREFIX} Could not post disarm notice:`, error);
    }
  }

  /**
   * Fumble effect: the fumbler is forced to attack one of their own allies.
   *
   * A RANDOM eligible ally is chosen rather than the nearest, so the same
   * fumble does not always hit the same unlucky friend. Eligibility is limited
   * by how far the fumbled attack could actually reach: a melee fumble can only
   * catch allies within the weapon's reach, while a ranged fumble can catch any
   * ally inside its normal range band.
   *
   * `attackType` comes from the table the result was rolled on, not from the
   * weapon: a thrown weapon like a javelin is classified `melee` by dnd5e even
   * when hurled, so the item alone cannot say which band applies.
   *
   * The fumbler is then prompted to roll a real attack against that ally; on a
   * hit the weapon's normal damage card resolves against them.
   *
   * @param fumblerToken - the token that fumbled
   * @param sourceActor - the fumbling actor
   * @param sourceItem - the weapon used in the fumbled attack
   * @param attackType - 'melee' or 'ranged', from the rolled result
   */
  static async applyAttackAlly(
    fumblerToken: Token,
    sourceActor?: Actor,
    sourceItem?: Item,
    attackType?: string
  ): Promise<void> {
    const fToken = fumblerToken as any;
    const actor = (sourceActor as any) ?? fToken?.actor;
    if (!fToken?.actor || !actor) {
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

    const reachFeet = this.getAttackReachFeet(weapon, attackType);
    const candidates = this.findAlliesInRange(fToken, reachFeet);

    if (candidates.length === 0) {
      const how = attackType === 'ranged' ? 'in range' : 'within reach';
      ui.notifications?.info(`${actor.name} has no ally ${how} to strike.`);
      console.log(`${LOG_PREFIX} attackAlly: no ally ${how} of ${fToken.name} (${reachFeet} ft)`);
      return;
    }

    const ally = await this.pickRandom(candidates);

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

    // Wording matters: this is an accident, not an intentional attack on a
    // friend. The fumbler's swing goes wide / their shot goes astray.
    const mishap = attackType === 'ranged' ? 'shot goes wide' : 'swing goes wide';
    ui.notifications?.warn(`${actor.name}'s ${mishap} and catches ${ally.name}! Roll the attack.`);
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
      // The module is COMPELLING this swing as a fumble consequence, so it must
      // not be gated by — or consume — the player's reaction economy. Without
      // this, a fumble on someone else's turn (e.g. an opportunity attack)
      // prompts "You have used your reaction this round" and can be blocked.
      await weapon.use({ midiOptions: { workflowOptions: { notReaction: true } } });
    } catch (error) {
      MidiQolHooks.suppressNextWorkflow = false;
      clearTimeout(guardTimer);
      console.error(`${LOG_PREFIX} attackAlly: failed to use weapon:`, error);
    }
  }

  /**
   * How far the fumbled attack could reach, in feet.
   *
   * Melee uses the weapon's reach. Ranged AND spell attacks use the item's
   * NORMAL range band rather than the long band, since a long range (a heavy
   * crossbow's 400 ft) covers most maps entirely and would make the filter
   * meaningless. Spells are included here because a fumbled Fire Bolt should be
   * able to catch an ally at the spell's range, not merely within 5 ft — and a
   * touch spell's own range value already reports as 5.
   */
  private static getAttackReachFeet(weapon: any, attackType?: string): number {
    const range = weapon?.system?.range ?? {};

    if (attackType === 'melee') {
      const reach = Number(range.reach);
      return Number.isFinite(reach) && reach > 0 ? reach : DEFAULT_MELEE_REACH_FEET;
    }

    const normal = Number(range.value);
    if (Number.isFinite(normal) && normal > 0) {
      return normal;
    }
    // No usable range band: fall back to reach for a melee-ish item, else the
    // generic ranged default.
    const reach = Number(range.reach);
    return Number.isFinite(reach) && reach > 0 ? reach : DEFAULT_RANGED_RANGE_FEET;
  }

  /**
   * Every living ally (same token disposition) within `maxFeet` of the fumbler,
   * excluding the fumbler itself.
   */
  private static findAlliesInRange(fumblerToken: any, maxFeet: number): any[] {
    const placeables: any[] = (canvas as any)?.tokens?.placeables ?? [];
    const myDisposition = fumblerToken.document?.disposition ?? fumblerToken.disposition;

    return placeables.filter(token => {
      if (token.id === fumblerToken.id || !token.actor) {
        return false;
      }
      const disposition = token.document?.disposition ?? token.disposition;
      if (disposition !== myDisposition) {
        return false; // allies share disposition (friendly/neutral/hostile)
      }
      // Item Piles (including weapons dropped by our own disarm effect) sit on
      // the canvas as friendly tokens. They are loot, not allies.
      if (token.document?.flags?.['item-piles']) {
        return false;
      }
      const hp = token.actor.system?.attributes?.hp?.value;
      if (hp !== undefined && hp !== null && hp <= 0) {
        return false; // skip downed/dead allies
      }
      return this.tokenDistanceFeet(fumblerToken, token) <= maxFeet;
    });
  }

  /**
   * Distance between two tokens in feet.
   *
   * Prefers Foundry's own measurement so the scene's diagonal rule applies.
   * The fallback is Chebyshev (5e's 5-5-5 diagonals) and deliberately NOT
   * euclidean: a diagonally adjacent ally is 5 ft away, and measuring 7.07 ft
   * would wrongly put them outside a 5 ft reach.
   */
  private static tokenDistanceFeet(from: any, to: any): number {
    const grid = (canvas as any)?.grid;
    const a = { x: from.center?.x ?? from.x, y: from.center?.y ?? from.y };
    const b = { x: to.center?.x ?? to.x, y: to.center?.y ?? to.y };

    const measured = grid?.measurePath?.([a, b]);
    if (Number.isFinite(measured?.distance)) {
      return measured.distance;
    }

    const size = grid?.size || 100;
    const perSquare = grid?.distance ?? 5;
    const squares = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / size;
    return squares * perSquare;
  }

  /**
   * Pick one entry at random, using a real die roll so the choice is visible
   * (and deterministic under test).
   */
  private static async pickRandom<T>(items: T[]): Promise<T> {
    if (items.length <= 1) {
      return items[0];
    }
    const roll = await this.rollDie(`1d${items.length}`, items.length);
    return items[roll - 1] ?? items[0];
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
