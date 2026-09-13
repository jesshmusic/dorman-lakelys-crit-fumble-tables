/**
 * Crit Suppression Service
 *
 * Answers one question: may a critical hit land on this target?
 *
 * D&D has effects that turn incoming criticals into ordinary hits — Adamantine
 * Armor ("any critical hit against you becomes a normal hit") is the canonical
 * case. dnd5e itself does not automate it: `D20Roll#isCritical` is purely the
 * attacker's die versus their crit threshold, and the attack card knows nothing
 * about the defender's armor. So without this check the module would roll a
 * crit-table effect onto an adamantine-armored target every time.
 *
 * Two flag sources are honoured, per target, keyed by `all` or the attack's
 * action type (mwak/rwak/msak/rsak):
 *
 * 1. `flags.midi-qol.grants.noCritical.<key>` — the de-facto community
 *    convention. Compendium items authored for Midi-QOL/DAE (including the SRD
 *    Adamantine Armor most worlds already have) carry an effect writing this
 *    flag. Foundry applies unknown flag keys to `actor.flags` regardless of
 *    whether Midi-QOL is installed, so the value is there to read either way.
 * 2. `flags.<MODULE_ID>.noCritical.<key>` — the module's own key, for tables and
 *    homebrew items that want the same behaviour without any Midi vocabulary.
 *
 * Reading the raw flag value (rather than any Midi-QOL evaluator) is enough:
 * these effects carry constants like "1", not formulas that need roll data.
 *
 * Filtering per target here is also what lets one adamantine-armored PC hit
 * alongside an unarmored NPC be spared while the NPC still eats the crit —
 * "the crit lands on the goblin but not on the paladin".
 *
 * Fumbles are deliberately untouched — `noCritical` is about incoming
 * criticals only.
 */

import { LOG_PREFIX, MODULE_ID } from '../constants';
import { AttackContext, getActionType } from '../types';

/**
 * Service for deciding which targets a critical hit is allowed to affect
 */
export class CritSuppression {
  /**
   * Does this target's actor turn incoming criticals into normal hits?
   * Checks both `noCritical.all` and `noCritical.<actionType>` on each flag
   * source.
   */
  static grantsNoCritical(target: Token | null | undefined, ctx: AttackContext): boolean {
    const actor = (target as any)?.actor;
    if (!actor) {
      return false;
    }

    const actionType = this.getAttackActionType(ctx);
    const keys = actionType ? ['all', actionType] : ['all'];

    return keys.some(key => this.evaluateFlag(actor, key));
  }

  /**
   * Drop every target that turns criticals into normal hits.
   * Each skipped target is logged so a GM can see why the crit did not fire.
   */
  static filterCritTargets(targets: Set<Token> | Token[], ctx: AttackContext): Token[] {
    const eligible: Token[] = [];

    for (const target of targets) {
      if (this.grantsNoCritical(target, ctx)) {
        console.log(
          `${LOG_PREFIX} Crit suppressed for ${target?.name || 'Unknown'} — target grants no critical`
        );
        continue;
      }
      eligible.push(target);
    }

    return eligible;
  }

  /**
   * The attack's action type (mwak/rwak/msak/rsak), which keys the per-type
   * flag. The hook resolves it up front (`ctx.actionType`); otherwise it is read
   * off the activity — dnd5e 6.0 resolves it per attack mode, 5.x exposes a
   * getter — and the item helper is the fallback for contexts (the module's own
   * test harness included) that carry none.
   */
  private static getAttackActionType(ctx: AttackContext): string | undefined {
    if (ctx?.actionType) {
      return ctx.actionType;
    }

    const activity = ctx?.activity;
    const attackMode = ctx?.attackRoll?.options?.attackMode;
    const fromActivity = activity?.getActionType?.(attackMode) ?? activity?.actionType;
    if (fromActivity) {
      return fromActivity;
    }

    return ctx?.item ? getActionType(ctx.item) : undefined;
  }

  /**
   * Evaluate one `noCritical.<key>` flag on an actor, on either flag source.
   */
  private static evaluateFlag(actor: any, key: string): boolean {
    const flags = actor?.flags;
    return (
      this.isFlagEnabled(flags?.['midi-qol']?.grants?.noCritical?.[key]) ||
      this.isFlagEnabled(flags?.[MODULE_ID]?.noCritical?.[key])
    );
  }

  /**
   * Coerce a raw `noCritical.*` value to a boolean.
   *
   * Midi-authored flags are applied through a CUSTOM active-effect change, so
   * the STORED value is normally a STRING FORMULA — "1" for the Adamantine
   * Armor effect, not `true`. A plain truthy test is therefore wrong: the
   * string "0" is truthy in JavaScript but means "off". Numeric strings are
   * compared numerically and the literal "false" is honoured; any other
   * non-empty string is a formula this module cannot evaluate, and is treated
   * as set (erring toward sparing the target).
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
