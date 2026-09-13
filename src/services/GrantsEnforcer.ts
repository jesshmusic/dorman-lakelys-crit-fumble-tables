/**
 * Grants Enforcer Service
 *
 * Applies TARGET-side advantage/disadvantage on attack rolls.
 *
 * WHY: dnd5e's own advantage sources (the `dnd5e.advantage` rule changes and
 * the per-ability roll-mode fields) only describe the ROLLER. A crit result such as "attacks against
 * this creature have advantage until end of its next turn" needs the flag to
 * live on the VICTIM and be consulted whenever anyone attacks it. Midi-QOL
 * had `flags.midi-qol.grants.*` for exactly this; dnd5e has no equivalent, so
 * EffectsManager writes the module's own flag onto the victim
 * (`flags.<MODULE_ID>.grants.<advantage|disadvantage>.attack.<all|actionType>`)
 * and this service reads it back on `dnd5e.preRollAttackV2`, which fires on
 * the rolling client before the roll dialog with the attacker's current
 * targets in `game.user.targets`.
 *
 * When both advantage and disadvantage are injected dnd5e cancels them to a
 * normal roll, which is correct 5e. The hook never cancels the roll.
 */

import { MODULE_ID, LOG_PREFIX } from '../constants';
import { DND5E_HOOKS, getActionType } from '../types';

export type GrantType = 'advantage' | 'disadvantage';

/**
 * Service that turns target-side "grants" flags into roll advantage/disadvantage
 */
export class GrantsEnforcer {
  private static hookId: number | null = null;

  /** Register the pre-roll hook. Safe to call more than once. */
  static register(): void {
    if (this.hookId !== null) {
      return;
    }
    this.hookId = Hooks.on(DND5E_HOOKS.PRE_ROLL_ATTACK, (config: any) => {
      this.onPreRollAttack(config);
    });
    console.log(`${LOG_PREFIX} GrantsEnforcer registered on ${DND5E_HOOKS.PRE_ROLL_ATTACK}`);
  }

  static unregister(): void {
    if (this.hookId === null) {
      return;
    }
    Hooks.off(DND5E_HOOKS.PRE_ROLL_ATTACK, this.hookId);
    this.hookId = null;
  }

  /**
   * `dnd5e.preRollAttackV2` handler. Mutates `config.rolls[0].options` in
   * place and deliberately returns nothing so the roll always proceeds.
   */
  static onPreRollAttack(config: any): void {
    const roll = config?.rolls?.[0];
    if (!roll) {
      return;
    }

    const targets = this.currentTargets();
    if (targets.length === 0) {
      return;
    }

    const actionType = this.resolveActionType(config, roll);
    roll.options ??= {};

    if (this.targetsGrant(targets, 'advantage', actionType)) {
      roll.options.advantage = true;
      console.log(`${LOG_PREFIX} Target grants advantage on this attack`);
    }
    if (this.targetsGrant(targets, 'disadvantage', actionType)) {
      roll.options.disadvantage = true;
      console.log(`${LOG_PREFIX} Target grants disadvantage on this attack`);
    }
  }

  /**
   * Does ANY target's actor carry an enabled grants flag for this roll?
   * Checks `grants.<type>.attack.all` and `grants.<type>.attack.<actionType>`.
   */
  static targetsGrant(
    targets: Iterable<Token> | null | undefined,
    type: GrantType,
    actionType?: string
  ): boolean {
    if (!targets) {
      return false;
    }
    for (const target of targets) {
      const attackGrants = (target as any)?.actor?.flags?.[MODULE_ID]?.grants?.[type]?.attack;
      if (!attackGrants || typeof attackGrants !== 'object') {
        continue;
      }
      if (this.isFlagEnabled(attackGrants.all)) {
        return true;
      }
      if (actionType && this.isFlagEnabled(attackGrants[actionType])) {
        return true;
      }
    }
    return false;
  }

  /** The attacker's current targets as an array (the hook gives us a Set). */
  private static currentTargets(): Token[] {
    const targets = (game as any).user?.targets;
    if (!targets) {
      return [];
    }
    return Array.from(targets as Iterable<Token>);
  }

  /**
   * The attack's action type (mwak/rwak/msak/rsak). dnd5e 6 derives it from
   * the activity and the chosen attack mode; 5.x exposes a getter; the item
   * helper is the last resort.
   */
  private static resolveActionType(config: any, roll: any): string | undefined {
    const subject = config?.subject;
    const attackMode = roll?.options?.attackMode;
    const fromActivity =
      subject?.getActionType?.(attackMode) ??
      subject?.actionType ??
      (subject?.item ? getActionType(subject.item) : undefined);
    return typeof fromActivity === 'string' && fromActivity ? fromActivity : undefined;
  }

  /**
   * Coerce a raw flag value to a boolean. Active Effects store change values
   * as strings, and Foundry parses `'1'` to the number 1 when it applies a
   * flag change, so booleans, numbers and numeric strings all show up here.
   * Mirrors CritSuppression.isFlagEnabled.
   */
  private static isFlagEnabled(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) && value !== 0;
    }

    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'false') {
      return false;
    }

    const numeric = Number(trimmed);
    return Number.isNaN(numeric) ? true : numeric !== 0;
  }
}
