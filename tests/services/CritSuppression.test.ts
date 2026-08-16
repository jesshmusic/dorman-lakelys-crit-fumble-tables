/**
 * CritSuppression Service Tests
 *
 * Covers the decision logic behind Midi-QOL's `flags.midi-qol.grants.noCritical.*`
 * target flag (Adamantine Armor and friends).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks, createMockToken, createMockActor, createMockWorkflow } from '../mocks/foundry';

/**
 * Build a token whose actor carries the given `grants.noCritical` flags.
 * @param name - token name, so log assertions can tell targets apart
 * @param noCritical - the raw flag block, e.g. `{ all: '1' }` or `{ mwak: '1' }`
 */
function createTargetWithNoCrit(name: string, noCritical?: Record<string, unknown>): any {
  const actor = createMockActor();
  (actor as any).flags = noCritical ? { 'midi-qol': { grants: { noCritical } } } : {};
  return createMockToken({ name, actor } as any);
}

/**
 * Stand-in for Midi-QOL's published `evalAllConditions`. The real one resolves
 * the flag from the actor and evaluates the stored value as a roll formula, so
 * the mock reads the dotted path and evaluates numerically.
 */
function installMidiEvaluator(): jest.Mock {
  const evalAllConditions = jest.fn((actor: any, flag: string, _data: any, errorReturn: any) => {
    const value = flag.split('.').reduce((obj: any, key: string) => obj?.[key], actor);
    if (value === undefined || value === null || value === '') return errorReturn;
    const numeric = Number(value);
    return Number.isNaN(numeric) ? Boolean(value) : numeric;
  }) as unknown as jest.Mock;

  (globalThis as any).MidiQOL.evalAllConditions = evalAllConditions;
  (globalThis as any).MidiQOL.createConditionData = jest.fn(() => ({ mock: 'conditionData' }));
  return evalAllConditions;
}

/** A melee (mwak) workflow with no targets of its own. */
function createMeleeWorkflow(overrides?: any): any {
  return createMockWorkflow({ targets: new Set(), hitTargets: new Set(), ...overrides });
}

describe('CritSuppression', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('grantsNoCritical', () => {
    it('should return false when the target carries no flag', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Goblin');

      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(false);
    });

    it('should return false when there is no target', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      expect(CritSuppression.grantsNoCritical(null, createMeleeWorkflow())).toBe(false);
    });

    it('should return false when the target has no actor', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createMockToken({ name: 'Empty', actor: null } as any);

      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(false);
    });

    it('should honour grants.noCritical.all stored as the string "1"', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { all: '1' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(true);
    });

    it('should treat the string "0" as off, despite being truthy in JS', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { all: '0' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(false);
    });

    it('should treat the string "0" as off when Midi-QOL evaluates the flag', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      installMidiEvaluator();
      const target = createTargetWithNoCrit('Paladin', { all: '0' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(false);
    });

    it('should accept boolean and numeric flag values', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const workflow = createMeleeWorkflow();

      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('A', { all: true }), workflow)
      ).toBe(true);
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('B', { all: false }), workflow)
      ).toBe(false);
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('C', { all: 1 }), workflow)
      ).toBe(true);
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('D', { all: 0 }), workflow)
      ).toBe(false);
    });

    it('should treat empty and "false" strings as off', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const workflow = createMeleeWorkflow();

      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('A', { all: '' }), workflow)
      ).toBe(false);
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('B', { all: 'false' }), workflow)
      ).toBe(false);
    });

    it('should match the per-action-type flag for the attack that was made', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { mwak: '1' });

      // createMockWorkflow's item is a mwak longsword.
      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(true);
    });

    it('should ignore a per-action-type flag for a different attack type', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { rwak: '1' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(false);
    });

    it('should prefer the activity action type over the item', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { rsak: '1' });
      // Item is a mwak longsword; the activity says this was a ranged spell.
      const workflow = createMeleeWorkflow({ activity: { actionType: 'rsak' } });

      expect(CritSuppression.grantsNoCritical(target, workflow)).toBe(true);
    });

    it("should use Midi-QOL's evaluator with the full flag path when available", async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const evalAllConditions = installMidiEvaluator();
      const target = createTargetWithNoCrit('Paladin', { all: '1' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(true);
      expect(evalAllConditions).toHaveBeenCalledWith(
        target.actor,
        'flags.midi-qol.grants.noCritical.all',
        { mock: 'conditionData' },
        false
      );
    });

    it('should fall back to local coercion when the evaluator throws', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      installMidiEvaluator();
      (globalThis as any).MidiQOL.evalAllConditions = jest.fn(() => {
        throw new Error('boom');
      });
      const target = createTargetWithNoCrit('Paladin', { all: '1' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(true);
    });

    it('should still evaluate when createConditionData throws', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      installMidiEvaluator();
      (globalThis as any).MidiQOL.createConditionData = jest.fn(() => {
        throw new Error('no workflow');
      });
      const target = createTargetWithNoCrit('Paladin', { all: '1' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeWorkflow())).toBe(true);
    });
  });

  describe('filterCritTargets', () => {
    it('should keep every target when none grants no-critical', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const goblin = createTargetWithNoCrit('Goblin');
      const orc = createTargetWithNoCrit('Orc');

      const result = CritSuppression.filterCritTargets(
        new Set([goblin, orc]),
        createMeleeWorkflow()
      );

      expect(result).toEqual([goblin, orc]);
    });

    it('should return an empty list when every target grants no-critical', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const fighter = createTargetWithNoCrit('Fighter', { all: '1' });

      const result = CritSuppression.filterCritTargets(
        new Set([paladin, fighter]),
        createMeleeWorkflow()
      );

      expect(result).toEqual([]);
    });

    it('should drop only the protected target in a mixed group', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      // Midi-QOL's own suppression is all-or-nothing and does NOT fire here, so
      // this filtering is the only thing sparing the armored target.
      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const goblin = createTargetWithNoCrit('Goblin');

      const result = CritSuppression.filterCritTargets(
        new Set([paladin, goblin]),
        createMeleeWorkflow()
      );

      expect(result).toEqual([goblin]);
    });

    it('should log each skipped target by name', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });

      CritSuppression.filterCritTargets(new Set([paladin]), createMeleeWorkflow());

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Paladin'));
      logSpy.mockRestore();
    });

    it('should accept an array of targets as well as a Set', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const goblin = createTargetWithNoCrit('Goblin');

      expect(CritSuppression.filterCritTargets([goblin], createMeleeWorkflow())).toEqual([goblin]);
    });
  });
});
