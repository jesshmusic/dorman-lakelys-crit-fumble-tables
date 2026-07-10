/**
 * Test Harness Service
 *
 * Developer/QA tooling for smoke-testing crit & fumble results WITHOUT rolling
 * real attacks. Every method drives the SAME EffectsManager code path used in
 * production, so any bug (duration, advantage flags, damage application) will
 * reproduce here exactly.
 *
 * Exposed on the browser console as `window.DormanLakely` (aka `DormanLakely`).
 * Designed to be driven from Claude-in-Chrome for automated smoke tests:
 * every method returns structured JSON (not just console output).
 *
 * Semantics:
 *  - CRIT:   `source` is the attacker (drives tier + weapon die); the effect
 *            lands on the `target` token.
 *  - FUMBLE: `source` is the fumbler (drives tier + weapon die AND receives
 *            most effects); `target` only matters for "grants" effects.
 */

import { MODULE_ID, LOG_PREFIX, STANDARD_CONDITIONS } from '../constants';
import { AttackType, ResultType, RolledResult, TierNumber } from '../types';
import { EffectsManager } from './EffectsManager';
import { TableSelector } from './TableSelector';
import { MidiQolHooks } from './MidiQolHooks';

type TestType = 'crit' | 'fumble';

interface ResultInfo {
  index: number;
  roll: string;
  name: string;
  effectType: string;
  detail: string;
}

interface SweepOptions {
  /** Actor performing the crit (attacker) or fumble (fumbler) */
  source?: string;
  /** The other token (crit target, or fumble "grants" target) */
  target?: string;
  /** ms between results (default 1600) */
  delay?: number;
  /** Remove module effects from the receiving token before each result (default true) */
  clearBetween?: boolean;
  /** Only run results whose effectType matches (e.g. 'damage', 'advantage') */
  only?: string;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export class TestHarness {
  // ---- resolution helpers ------------------------------------------------

  private static getActor(name: string): any {
    return (game as any).actors?.getName(name) ?? null;
  }

  /** Token on the canvas whose actor matches `name` (falls back to controlled). */
  private static getTokenForActor(name: string): any {
    const byActor = canvas.tokens?.placeables.find((t: any) => t.actor?.name === name);
    if (byActor) return byActor;
    const byName = canvas.tokens?.placeables.find((t: any) => t.name === name);
    return byName ?? null;
  }

  private static getToken(name?: string, excludeActor?: string): any {
    if (name) {
      const t = canvas.tokens?.placeables.find(
        (tok: any) => tok.name === name || tok.actor?.name === name
      );
      if (t) return t;
    }
    // fall back to a controlled token, else any token that isn't the source
    const controlled = (canvas as any).tokens?.controlled?.[0];
    if (controlled && controlled.actor?.name !== excludeActor) return controlled;
    return canvas.tokens?.placeables.find((t: any) => t.actor?.name !== excludeActor) ?? null;
  }

  /** Read the pieces we need off a Foundry TableResult doc (v13/v14 tolerant). */
  private static readDoc(doc: any): {
    text: string;
    img: string;
    flags: any;
    range: [number, number];
  } {
    const text = doc.text ?? doc.description ?? doc.name ?? '';
    const img = doc.img ?? doc.icon ?? 'icons/svg/dice-target.svg';
    const flags = doc.flags ?? {};
    const range = (doc.range ?? [0, 0]) as [number, number];
    return { text, img, flags, range };
  }

  /** Locate the world RollTable for a given type/attackType and source actor. */
  private static resolveTable(
    type: TestType,
    attackType: AttackType,
    sourceActor: any
  ): { table: any; tier: TierNumber } | null {
    const level = sourceActor?.system?.details?.level;
    const cr = sourceActor?.system?.details?.cr;
    const tier = TableSelector.getTier(level, cr);
    const tableName = TableSelector.getTableName(type, attackType, level, cr);
    const table =
      (game as any).tables?.getName(tableName) ?? (game as any).tables?.get(tableName) ?? null;
    if (!table) {
      console.error(`${LOG_PREFIX} [TEST] Table "${tableName}" not found (import tables first).`);
      return null;
    }
    return { table, tier };
  }

  private static buildRolledResult(
    doc: any,
    tableName: string,
    type: TestType,
    attackType: AttackType,
    tier: TierNumber
  ): RolledResult {
    const { text, img, flags, range } = this.readDoc(doc);
    const dashIndex = text.indexOf(' - ');
    const name = dashIndex > 0 ? text.substring(0, dashIndex) : text || 'Unknown Result';
    const description = dashIndex > 0 ? text.substring(dashIndex + 3) : '';
    return {
      table: {
        name: tableName,
        description: '',
        tier,
        attackType,
        resultType: type as ResultType,
        results: [],
        formula: '1d100'
      },
      result: { name, description, weight: 1, range, img, flags },
      roll: range[0],
      type: type as ResultType,
      attackType,
      tier
    };
  }

  // ---- public API --------------------------------------------------------

  /**
   * List every result in a table with its roll range and configured effect.
   * @returns array of { index, roll, name, effectType, detail }
   */
  static listResults(
    type: TestType,
    attackType: AttackType = 'melee',
    sourceName = 'Daevon'
  ): ResultInfo[] {
    const source = this.getActor(sourceName);
    const resolved = this.resolveTable(type, attackType, source);
    if (!resolved) return [];

    const infos: ResultInfo[] = [...resolved.table.results.values()]
      .map((doc: any, index: number) => {
        const { text, flags, range } = this.readDoc(doc);
        const cfg = flags?.[MODULE_ID] ?? {};
        const name = text.split(' - ')[0] ?? text;
        const detailBits: string[] = [];
        if (cfg.effectCondition) detailBits.push(`cond=${cfg.effectCondition}`);
        if (cfg.damageFormula) detailBits.push(`dmg=${cfg.damageFormula} ${cfg.damageType ?? ''}`);
        if (cfg.advantageScope)
          detailBits.push(
            `scope=${Array.isArray(cfg.advantageScope) ? cfg.advantageScope.join('|') : cfg.advantageScope}`
          );
        if (cfg.advantageTarget) detailBits.push(`adv=${cfg.advantageTarget}`);
        if (cfg.duration !== undefined) detailBits.push(`dur=${cfg.duration}`);
        return {
          index,
          roll: range[0] === range[1] ? `${range[0]}` : `${range[0]}-${range[1]}`,
          name,
          effectType: cfg.effectType ?? 'none',
          detail: detailBits.join(', ')
        };
      })
      .sort((a, b) => a.index - b.index);

    console.log(`${LOG_PREFIX} [TEST] ${resolved.table.name}`);
    console.table(infos);
    return infos;
  }

  /**
   * Apply ONE result (by 1-based index, roll value, or name substring).
   * @param selector number = roll value; string = name substring
   */
  static async apply(
    type: TestType,
    attackType: AttackType,
    selector: number | string,
    sourceName = 'Daevon',
    targetName?: string
  ): Promise<{ ok: boolean; name?: string; effectType?: string; error?: string }> {
    const source = this.getActor(sourceName);
    if (!source) return { ok: false, error: `Actor "${sourceName}" not found` };

    const resolved = this.resolveTable(type, attackType, source);
    if (!resolved) return { ok: false, error: 'table not found' };
    const { table, tier } = resolved;

    // Find the matching result doc
    const docs = [...table.results.values()];
    let doc: any;
    if (typeof selector === 'number') {
      doc = docs.find((d: any) => {
        const [lo, hi] = this.readDoc(d).range;
        return selector >= lo && selector <= hi;
      });
    } else {
      const needle = selector.toLowerCase();
      doc = docs.find((d: any) => this.readDoc(d).text.toLowerCase().includes(needle));
    }
    if (!doc) return { ok: false, error: `No result matched "${selector}"` };

    const sourceToken = this.getTokenForActor(sourceName);
    const targetToken = this.getToken(targetName, sourceName);
    const item = MidiQolHooks.findWeaponForAttackType(source, attackType);
    const rr = this.buildRolledResult(doc, table.name, type, attackType, tier);
    const cfg = rr.result.flags?.[MODULE_ID] ?? {};

    console.log(
      `${LOG_PREFIX} [TEST] ${type.toUpperCase()} "${rr.result.name}" (${cfg.effectType}) ` +
        `source=${sourceName} target=${targetToken?.name ?? 'none'}`
    );

    if (type === 'crit') {
      if (!targetToken) return { ok: false, error: 'crit needs a target token on canvas' };
      await EffectsManager.displayResult(rr, sourceName, targetToken.name);
      await EffectsManager.applyResult(rr, targetToken, source, item);
    } else {
      if (!sourceToken) return { ok: false, error: `no token for fumbler "${sourceName}"` };
      await EffectsManager.displayResult(rr, sourceName, sourceName);
      await EffectsManager.applyFumbleResult(
        rr,
        sourceToken,
        targetToken ? [targetToken] : [],
        source,
        item
      );
    }
    return { ok: true, name: rr.result.name, effectType: cfg.effectType };
  }

  /**
   * Sweep EVERY result in a table, one at a time, through the real apply path.
   * Auto-clears the receiving token between results so effects don't stack.
   */
  static async sweep(
    type: TestType,
    attackType: AttackType = 'melee',
    opts: SweepOptions = {}
  ): Promise<
    Array<{ roll: string; name: string; effectType: string; ok: boolean; error?: string }>
  > {
    const sourceName = opts.source ?? 'Daevon';
    const delay = opts.delay ?? 1600;
    const clearBetween = opts.clearBetween ?? true;
    const source = this.getActor(sourceName);
    const resolved = this.resolveTable(type, attackType, source);
    if (!resolved) return [];

    // The token that RECEIVES effects: crit → target, fumble → fumbler(source)
    const receiverName =
      type === 'crit' ? (opts.target ?? this.getToken(undefined, sourceName)?.name) : sourceName;

    const docs = [...resolved.table.results.values()];
    const summary: Array<{
      roll: string;
      name: string;
      effectType: string;
      ok: boolean;
      error?: string;
    }> = [];

    console.log(
      `%c${LOG_PREFIX} [SWEEP] ${resolved.table.name} — ${docs.length} results, delay ${delay}ms`,
      'color:#ff9800;font-weight:bold'
    );

    for (const doc of docs) {
      const { flags, range } = this.readDoc(doc);
      const cfg = flags?.[MODULE_ID] ?? {};
      const rollLabel = range[0] === range[1] ? `${range[0]}` : `${range[0]}-${range[1]}`;
      if (opts.only && cfg.effectType !== opts.only) continue;

      if (clearBetween && receiverName) {
        await this.clearEffects(receiverName);
      }

      const res = await this.apply(type, attackType, range[0], sourceName, opts.target);
      summary.push({
        roll: rollLabel,
        name: res.name ?? '?',
        effectType: cfg.effectType ?? 'none',
        ok: res.ok,
        error: res.error
      });
      await sleep(delay);
    }

    console.log(`${LOG_PREFIX} [SWEEP] complete:`);
    console.table(summary);
    return summary;
  }

  /**
   * Remove module-applied effects from a token/actor so the next test is clean.
   * Deletes ActiveEffects flagged by this module and toggles off any standard
   * conditions it may have set.
   */
  static async clearEffects(
    nameOrToken: string | any
  ): Promise<{ removedEffects: number; clearedStatuses: string[] }> {
    const token =
      typeof nameOrToken === 'string' ? this.getTokenForActor(nameOrToken) : nameOrToken;
    const actor = token?.actor;
    if (!actor) return { removedEffects: 0, clearedStatuses: [] };

    const moduleEffects = [...actor.effects.values()].filter((e: any) => e.flags?.[MODULE_ID]);
    if (moduleEffects.length) {
      await actor.deleteEmbeddedDocuments(
        'ActiveEffect',
        moduleEffects.map((e: any) => e.id)
      );
    }

    const cleared: string[] = [];
    for (const status of STANDARD_CONDITIONS) {
      if (actor.statuses?.has(status)) {
        try {
          await actor.toggleStatusEffect(status, { active: false });
          cleared.push(status);
        } catch {
          /* ignore */
        }
      }
    }
    return { removedEffects: moduleEffects.length, clearedStatuses: cleared };
  }
}
