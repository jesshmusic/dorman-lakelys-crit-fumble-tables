/**
 * CritSuppression Service Tests
 *
 * Covers the decision logic behind the target-side `noCritical.*` flags
 * (Adamantine Armor and friends), read from both the Midi-QOL/DAE convention
 * (`flags.midi-qol.grants.noCritical.*`) and the module's own
 * `flags.<MODULE_ID>.noCritical.*` — with no Midi-QOL evaluator involved.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks, createMockToken, createMockActor } from '../mocks/foundry';

const MODULE_ID = 'dorman-lakelys-crit-fumble-tables';

/**
 * Build a token whose actor carries the given `noCritical` flags.
 * @param name - token name, so log assertions can tell targets apart
 * @param noCritical - the raw flag block, e.g. `{ all: '1' }` or `{ mwak: '1' }`
 * @param source - which flag namespace to write it under
 */
function createTargetWithNoCrit(
  name: string,
  noCritical?: Record<string, unknown>,
  source: 'midi' | 'module' = 'midi'
): any {
  const actor = createMockActor();
  if (!noCritical) {
    (actor as any).flags = {};
  } else if (source === 'midi') {
    (actor as any).flags = { 'midi-qol': { grants: { noCritical } } };
  } else {
    (actor as any).flags = { [MODULE_ID]: { noCritical } };
  }
  return createMockToken({ name, actor } as any);
}

/** A melee (mwak) attack context with no targets of its own. */
function createMeleeContext(overrides?: any): any {
  return {
    actor: createMockActor(),
    item: {
      type: 'weapon',
      name: 'Longsword',
      system: { actionType: 'mwak' }
    },
    targets: new Set(),
    hitTargets: new Set(),
    attackRoll: {
      total: 25,
      formula: '1d20+5',
      terms: [{ faces: 20, results: [{ result: 20, active: true }] }]
    },
    isCritical: true,
    isFumble: false,
    ...overrides
  };
}

describe('CritSuppression', () => {
  beforeEach(() => {
    resetMocks();
    // Nothing here may lean on Midi-QOL.
    delete (globalThis as any).MidiQOL;
  });

  describe('grantsNoCritical', () => {
    it('should return false when the target carries no flag', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Goblin');

      expect(CritSuppression.grantsNoCritical(target, createMeleeContext())).toBe(false);
    });

    it('should return false when the actor has no flags object at all', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createMockToken({ name: 'Bare' } as any);
      delete (target.actor as any).flags;

      expect(CritSuppression.grantsNoCritical(target, createMeleeContext())).toBe(false);
    });

    it('should return false when there is no target', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      expect(CritSuppression.grantsNoCritical(null, createMeleeContext())).toBe(false);
      expect(CritSuppression.grantsNoCritical(undefined, createMeleeContext())).toBe(false);
    });

    it('should return false when the target has no actor', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createMockToken({ name: 'Empty', actor: null } as any);

      expect(CritSuppression.grantsNoCritical(target, createMeleeContext())).toBe(false);
    });

    it('should honour flags.midi-qol.grants.noCritical.all stored as the string "1"', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { all: '1' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeContext())).toBe(true);
    });

    it("should honour the module's own flags.<MODULE_ID>.noCritical.all", async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { all: '1' }, 'module');

      expect(CritSuppression.grantsNoCritical(target, createMeleeContext())).toBe(true);
    });

    it('should not read the module flag from under the midi-qol grants path', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      // Wrong nesting for the module key: `grants` is Midi's vocabulary only.
      const actor = createMockActor();
      (actor as any).flags = { [MODULE_ID]: { grants: { noCritical: { all: '1' } } } };
      const target = createMockToken({ name: 'Mis-keyed', actor } as any);

      expect(CritSuppression.grantsNoCritical(target, createMeleeContext())).toBe(false);
    });

    it('should treat the string "0" as off, despite being truthy in JS', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      expect(
        CritSuppression.grantsNoCritical(
          createTargetWithNoCrit('Paladin', { all: '0' }),
          createMeleeContext()
        )
      ).toBe(false);
      expect(
        CritSuppression.grantsNoCritical(
          createTargetWithNoCrit('Paladin', { all: '0' }, 'module'),
          createMeleeContext()
        )
      ).toBe(false);
    });

    it('should coerce numeric strings on both flag sources', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const ctx = createMeleeContext();

      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('A', { all: ' 2 ' }), ctx)
      ).toBe(true);
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('B', { all: '0.0' }), ctx)
      ).toBe(false);
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('C', { all: '1' }, 'module'), ctx)
      ).toBe(true);
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('D', { all: '-1' }, 'module'), ctx)
      ).toBe(true);
    });

    it('should accept boolean and numeric flag values', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const ctx = createMeleeContext();

      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('A', { all: true }), ctx)
      ).toBe(true);
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('B', { all: false }), ctx)
      ).toBe(false);
      expect(CritSuppression.grantsNoCritical(createTargetWithNoCrit('C', { all: 1 }), ctx)).toBe(
        true
      );
      expect(CritSuppression.grantsNoCritical(createTargetWithNoCrit('D', { all: 0 }), ctx)).toBe(
        false
      );
      expect(CritSuppression.grantsNoCritical(createTargetWithNoCrit('E', { all: NaN }), ctx)).toBe(
        false
      );
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('F', { all: true }, 'module'), ctx)
      ).toBe(true);
    });

    it('should treat empty and "false" strings as off', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const ctx = createMeleeContext();

      expect(CritSuppression.grantsNoCritical(createTargetWithNoCrit('A', { all: '' }), ctx)).toBe(
        false
      );
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('B', { all: 'false' }), ctx)
      ).toBe(false);
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('C', { all: 'FALSE' }), ctx)
      ).toBe(false);
    });

    it('should treat an unevaluable formula string as set, sparing the target', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { all: '@abilities.con.mod > 0' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeContext())).toBe(true);
    });

    it('should ignore non-primitive flag values', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const ctx = createMeleeContext();

      expect(CritSuppression.grantsNoCritical(createTargetWithNoCrit('A', { all: {} }), ctx)).toBe(
        false
      );
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('B', { all: null }), ctx)
      ).toBe(false);
    });

    it('should match the per-action-type flag for the attack that was made', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      // createMeleeContext's item is a mwak longsword.
      expect(
        CritSuppression.grantsNoCritical(
          createTargetWithNoCrit('Paladin', { mwak: '1' }),
          createMeleeContext()
        )
      ).toBe(true);
      expect(
        CritSuppression.grantsNoCritical(
          createTargetWithNoCrit('Paladin', { mwak: '1' }, 'module'),
          createMeleeContext()
        )
      ).toBe(true);
    });

    it('should ignore a per-action-type flag for a different attack type', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { rwak: '1' });

      expect(CritSuppression.grantsNoCritical(target, createMeleeContext())).toBe(false);
    });

    it('should prefer the resolved ctx.actionType over the activity and item', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { rwak: '1' });
      // Item is a mwak longsword and the activity's getter agrees, but the hook
      // already resolved this attack (thrown) to rwak.
      const ctx = createMeleeContext({ actionType: 'rwak', activity: { actionType: 'mwak' } });

      expect(CritSuppression.grantsNoCritical(target, ctx)).toBe(true);
    });

    it('should prefer the activity getActionType(attackMode) over its actionType', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { rwak: '1' });
      const getActionType = jest.fn<(mode?: string) => string>(() => 'rwak');
      const ctx = createMeleeContext({
        activity: { getActionType, actionType: 'mwak' },
        attackRoll: { total: 20, formula: '1d20', terms: [], options: { attackMode: 'thrown' } }
      });

      expect(CritSuppression.grantsNoCritical(target, ctx)).toBe(true);
      expect(getActionType).toHaveBeenCalledWith('thrown');
    });

    it('should prefer the activity action type over the item', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const target = createTargetWithNoCrit('Paladin', { rsak: '1' });
      // Item is a mwak longsword; the activity says this was a ranged spell.
      const ctx = createMeleeContext({ activity: { actionType: 'rsak' } });

      expect(CritSuppression.grantsNoCritical(target, ctx)).toBe(true);
    });

    it('should fall back to noCritical.all alone when no action type can be resolved', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const ctx = createMeleeContext({ item: undefined, activity: undefined });

      expect(CritSuppression.grantsNoCritical(createTargetWithNoCrit('A', { all: '1' }), ctx)).toBe(
        true
      );
      expect(
        CritSuppression.grantsNoCritical(createTargetWithNoCrit('B', { mwak: '1' }), ctx)
      ).toBe(false);
    });

    it('should never consult a MidiQOL global even if one is present', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const evalAllConditions = jest.fn(() => true);
      (globalThis as any).MidiQOL = { evalAllConditions, createConditionData: jest.fn() };
      const target = createTargetWithNoCrit('Goblin');

      expect(CritSuppression.grantsNoCritical(target, createMeleeContext())).toBe(false);
      expect(evalAllConditions).not.toHaveBeenCalled();
      delete (globalThis as any).MidiQOL;
    });
  });

  describe('filterCritTargets', () => {
    it('should keep every target when none grants no-critical', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const goblin = createTargetWithNoCrit('Goblin');
      const orc = createTargetWithNoCrit('Orc');

      const result = CritSuppression.filterCritTargets(
        new Set([goblin, orc]),
        createMeleeContext()
      );

      expect(result).toEqual([goblin, orc]);
    });

    it('should return an empty list when every target grants no-critical', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const fighter = createTargetWithNoCrit('Fighter', { all: '1' }, 'module');

      const result = CritSuppression.filterCritTargets(
        new Set([paladin, fighter]),
        createMeleeContext()
      );

      expect(result).toEqual([]);
    });

    it('should drop only the protected target in a mixed group', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      // dnd5e's isCritical is attacker-only, so this filtering is the only
      // thing sparing the armored target.
      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const goblin = createTargetWithNoCrit('Goblin');

      const result = CritSuppression.filterCritTargets(
        new Set([paladin, goblin]),
        createMeleeContext()
      );

      expect(result).toEqual([goblin]);
    });

    it('should log each skipped target by name', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });

      CritSuppression.filterCritTargets(new Set([paladin]), createMeleeContext());

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Paladin'));
      logSpy.mockRestore();
    });

    it('should accept an array of targets as well as a Set', async () => {
      const { CritSuppression } = await import('../../src/services/CritSuppression');

      const goblin = createTargetWithNoCrit('Goblin');

      expect(CritSuppression.filterCritTargets([goblin], createMeleeContext())).toEqual([goblin]);
    });
  });
});
