/**
 * Crit Suppression Service
 *
 * Answers one question: may a critical hit land on this target?
 *
 * Midi-QOL exposes a target-side flag, `flags.midi-qol.grants.noCritical.*`,
 * for effects that turn incoming criticals into ordinary hits — D&D's
 * Adamantine Armor ("any critical hit against you becomes a normal hit") is the
 * canonical case. Midi-QOL honours it in `Workflow#processCriticalFlags`, so it
 * is fair to ask why this module has to check it again. Three reasons:
 *
 * 1. Midi-QOL's suppression is ALL-OR-NOTHING. It only clears the workflow's
 *    critical when EVERY hit target grants no-critical. One adamantine-armored
 *    PC hit alongside an unarmored NPC leaves `isCritical` true — and this
 *    module walks the hit targets applying its table result to each one, so the
 *    armored target would eat the crit effect anyway.
 * 2. `processCriticalFlags` runs from `checkHits()`, which Midi-QOL only calls
 *    when its auto hit checking is not set to "none". With that setting off,
 *    suppression never runs at all and `isCritical` is just the raw crit.
 * 3. This module's own natural-20 fallback (used when a workflow carries no
 *    `isCritical` at all) knows nothing about suppression.
 *
 * Filtering per target here covers all three: the check is cheap, it runs
 * regardless of how Midi-QOL is configured, and it is the only place that can
 * express "the crit lands on the goblin but not on the paladin".
 *
 * Fumbles are deliberately untouched — `grants.noCritical` is about incoming
 * criticals only.
 */

import { LOG_PREFIX } from '../constants';
import { MidiQolWorkflow, getActionType } from '../types';

/** Root of Midi-QOL's flag: `flags.midi-qol.grants.noCritical.<all|actionType>`. */
const NO_CRITICAL_FLAG_ROOT = 'flags.midi-qol.grants.noCritical';

/**
 * Service for deciding which targets a critical hit is allowed to affect
 */
export class CritSuppression {
  /**
   * Does this target's actor turn incoming criticals into normal hits?
   * Checks both `grants.noCritical.all` and `grants.noCritical.<actionType>`,
   * exactly as Midi-QOL does.
   */
  static grantsNoCritical(target: Token | null | undefined, workflow: MidiQolWorkflow): boolean {
    const actor = (target as any)?.actor;
    if (!actor) {
      return false;
    }

    const actionType = this.getAttackActionType(workflow);
    const keys = actionType ? ['all', actionType] : ['all'];
    const conditionData = this.createConditionData(target, workflow);

    return keys.some(key => this.evaluateFlag(actor, key, conditionData));
  }

  /**
   * Drop every target that turns criticals into normal hits.
   * Each skipped target is logged so a GM can see why the crit did not fire.
   */
  static filterCritTargets(targets: Set<Token> | Token[], workflow: MidiQolWorkflow): Token[] {
    const eligible: Token[] = [];

    for (const target of targets) {
      if (this.grantsNoCritical(target, workflow)) {
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
   * flag. Midi-QOL reads it off the activity; the item helper is the fallback
   * for workflows (the module's own test harness included) that carry none.
   */
  private static getAttackActionType(workflow: MidiQolWorkflow): string | undefined {
    const fromActivity = (workflow as any)?.activity?.actionType;
    if (fromActivity) {
      return fromActivity;
    }

    return workflow?.item ? getActionType(workflow.item) : undefined;
  }

  /**
   * Evaluate one `grants.noCritical.<key>` flag on an actor.
   *
   * Midi-QOL's own evaluator is preferred: it resolves the flag from applied
   * active effects as well as the actor's flags, and evaluates the stored value
   * as a roll formula — which is what the value actually is. Note that only the
   * SYNCHRONOUS `evalAllConditions` is published on the MidiQOL global; the
   * async variant Midi-QOL uses internally is not exported, so a condition that
   * needs async evaluation falls through to Midi-QOL's own error return.
   */
  private static evaluateFlag(actor: any, key: string, conditionData: any): boolean {
    const flagPath = `${NO_CRITICAL_FLAG_ROOT}.${key}`;
    const midi = (globalThis as any).MidiQOL;

    if (typeof midi?.evalAllConditions === 'function') {
      try {
        return Boolean(midi.evalAllConditions(actor, flagPath, conditionData, false));
      } catch (error) {
        console.warn(`${LOG_PREFIX} Midi-QOL could not evaluate ${flagPath}:`, error);
      }
    }

    return this.isFlagEnabled(actor?.flags?.['midi-qol']?.grants?.noCritical?.[key]);
  }

  /**
   * Build the roll data Midi-QOL's evaluator expects. An empty object is a safe
   * substitute: the flag values these effects carry are constants like "1",
   * which need no roll data to resolve.
   */
  private static createConditionData(target: Token | null | undefined, workflow: MidiQolWorkflow) {
    const midi = (globalThis as any).MidiQOL;

    try {
      return midi?.createConditionData?.({ workflow, target, actor: workflow?.actor }) ?? {};
    } catch (error) {
      console.warn(`${LOG_PREFIX} Midi-QOL could not build crit condition data:`, error);
      return {};
    }
  }

  /**
   * Coerce a raw `grants.noCritical.*` value to a boolean, for when Midi-QOL's
   * evaluator is unavailable.
   *
   * These flags are applied through Midi-QOL's CUSTOM active-effect handler and
   * sit on its `deferredEvaluation` list, so the STORED value is normally a
   * STRING FORMULA — "1" for the Adamantine Armor effect, not `true`. A plain
   * truthy test is therefore wrong: the string "0" is truthy in JavaScript but
   * means "off". Numeric strings are compared numerically and the literal
   * "false" is honoured; any other non-empty string is a formula this fallback
   * cannot evaluate, and is treated as set (erring toward sparing the target).
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
