/**
 * AttackHooks Service Tests
 *
 * Covers the dnd5e `dnd5e.rollAttackV2` integration: registration, crit/fumble
 * detection from the D20Roll, hit-vs-AC computation and the crit-suppression
 * hand-off. No Midi-QOL module or global is present in any of these tests.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks, createMockActor, createMockToken } from '../mocks/foundry';

/**
 * Build the minimal `AttackContext` the handlers read. Kept local so the test
 * does not depend on the shared mock file's fixture shape.
 */
function createAttackContext(overrides?: any): any {
  return {
    actor: createMockActor(),
    item: {
      type: 'weapon',
      name: 'Longsword',
      system: {
        actionType: 'mwak',
        attackBonus: 5,
        damage: {
          parts: [['1d8+3', 'slashing']]
        }
      }
    },
    targets: new Set([createMockToken()]),
    hitTargets: new Set([createMockToken()]),
    attackRoll: {
      total: 25,
      formula: '1d20+5',
      terms: [
        {
          faces: 20,
          results: [{ result: 20, active: true }]
        }
      ]
    },
    isCritical: true,
    isFumble: false,
    ...overrides
  };
}

/** A D20Roll-shaped roll as dnd5e hands it to `dnd5e.rollAttackV2`. */
function createD20Roll(overrides?: any): any {
  return {
    total: 15,
    formula: '1d20 + 5',
    terms: [{ faces: 20, results: [{ result: 10, active: true }] }],
    isCritical: false,
    isFumble: false,
    options: { attackMode: 'oneHanded' },
    ...overrides
  };
}

/** An AttackActivity-shaped `subject` carrying its actor and item. */
function createAttackActivity(overrides?: any): any {
  const actor = createMockActor();
  (actor.getActiveTokens as jest.Mock).mockReturnValue([createMockToken({ name: 'Attacker' })]);
  return {
    id: 'activity-id',
    type: 'attack',
    actor,
    item: {
      id: 'item-id',
      type: 'weapon',
      name: 'Longsword',
      system: { actionType: 'mwak' }
    },
    actionType: 'mwak',
    ...overrides
  };
}

/** A target token whose actor has the given AC and optional statuses. */
function createTargetWithAC(name: string, ac: number | undefined, statuses: string[] = []): any {
  const actor = createMockActor();
  (actor as any).flags = {};
  actor.system.attributes = { ...(actor.system.attributes ?? {}), ac: { value: ac } } as any;
  actor.statuses = new Set(statuses);
  return createMockToken({ name, actor } as any);
}

/** Point `game.user.targets` at the given tokens. */
function setUserTargets(...tokens: any[]): void {
  (game as any).user.targets = new Set(tokens);
}

/**
 * Import the hook service with its collaborators stubbed, so the assertions
 * are about the crit/fumble DECISION rather than table lookups or effect writes.
 */
async function loadHooks() {
  const { AttackHooks } = await import('../../src/services/AttackHooks');
  const { TableSelector } = await import('../../src/services/TableSelector');
  const { EffectsManager } = await import('../../src/services/EffectsManager');

  const rollCriticalHit = jest.fn<any>().mockResolvedValue({
    table: { name: 'tier1-melee-crits' },
    result: { name: 'Test Crit', effectType: 'none' },
    roll: 50,
    type: 'crit',
    attackType: 'melee',
    tier: 1
  });
  const rollFumble = jest.fn<any>().mockResolvedValue({
    table: { name: 'tier1-melee-fumbles' },
    result: { name: 'Test Fumble', effectType: 'none' },
    roll: 50,
    type: 'fumble',
    attackType: 'melee',
    tier: 1
  });
  const displayResult = jest.fn<any>().mockResolvedValue(undefined);
  const applyResult = jest.fn<any>().mockResolvedValue(undefined);
  const applyFumbleResult = jest.fn<any>().mockResolvedValue(undefined);

  (TableSelector as any).rollCriticalHit = rollCriticalHit;
  (TableSelector as any).rollFumble = rollFumble;
  (EffectsManager as any).displayResult = displayResult;
  (EffectsManager as any).applyResult = applyResult;
  (EffectsManager as any).applyFumbleResult = applyFumbleResult;

  return {
    AttackHooks,
    rollCriticalHit,
    rollFumble,
    displayResult,
    applyResult,
    applyFumbleResult
  };
}

/** The crit/fumble sound is the earliest observable sign that a result fired at all. */
function soundPlays(): boolean {
  return (foundry.audio.AudioHelper.play as jest.Mock).mock.calls.length > 0;
}

describe('AttackHooks', () => {
  beforeEach(() => {
    resetMocks();
    // Set up default settings
    (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
      const defaults: Record<string, any> = {
        enabled: true,
        enableCrits: true,
        enableFumbles: true,
        applyEffects: true,
        useActorLevel: true,
        fixedTier: '1',
        showChatMessages: true,
        critSound: 'sounds/combat/epic-start-3hit.ogg',
        fumbleSound: 'sounds/combat/epic-turn-2hit.ogg'
      };
      return defaults[key];
    });
    // No Midi-QOL anywhere: the module entry is absent and there is no global.
    (game.modules.get as jest.Mock).mockImplementation((id: string) => {
      if (id === 'dorman-lakelys-crit-fumble-tables') return { active: true, version: '2.0.0' };
      return undefined;
    });
    delete (globalThis as any).MidiQOL;
  });

  describe('register', () => {
    it('should hook dnd5e.rollAttackV2', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      AttackHooks.register();

      expect(Hooks.on).toHaveBeenCalledWith('dnd5e.rollAttackV2', expect.any(Function));
    });

    it('should register without Midi-QOL installed', async () => {
      expect(game.modules.get('midi-qol')).toBeUndefined();
      expect((globalThis as any).MidiQOL).toBeUndefined();
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      AttackHooks.register();

      expect(Hooks.on).toHaveBeenCalledTimes(1);
      expect(ui.notifications.error).not.toHaveBeenCalled();
    });

    it('should never touch a midi-qol hook', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      AttackHooks.register();

      const hookNames = (Hooks.on as jest.Mock).mock.calls.map(call => call[0]);
      expect(hookNames.some(name => String(name).startsWith('midi-qol'))).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should unregister the dnd5e hook', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      AttackHooks.register();
      AttackHooks.unregister();

      expect(Hooks.off).toHaveBeenCalledWith('dnd5e.rollAttackV2', 1);
    });

    it('should not throw when unregistering without registering first', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      // Should not throw
      AttackHooks.unregister();
      expect(Hooks.off).not.toHaveBeenCalled();
    });
  });

  describe('getD20Result', () => {
    it('should extract d20 result from a context', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const ctx = {
        attackRoll: {
          total: 25,
          formula: '1d20+5',
          terms: [{ faces: 20, results: [{ result: 20, active: true }] }]
        }
      };

      const result = (AttackHooks as any).getD20Result(ctx);
      expect(result).toBe(20);
    });

    it('should extract the active die from an advantage roll', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const ctx = {
        attackRoll: {
          total: 22,
          formula: '2d20kh + 5',
          terms: [
            {
              faces: 20,
              number: 2,
              results: [
                { result: 3, active: false, discarded: true },
                { result: 17, active: true }
              ]
            }
          ]
        }
      };

      expect((AttackHooks as any).getD20Result(ctx)).toBe(17);
    });

    it('should return null when no attack roll', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      expect((AttackHooks as any).getD20Result({ attackRoll: null })).toBeNull();
      expect((AttackHooks as any).getD20Result({ attackRoll: undefined })).toBeNull();
    });

    it('should return null when the roll has no terms array', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      expect((AttackHooks as any).getD20Result({ attackRoll: { total: 12 } })).toBeNull();
    });

    it('should return null when no d20 term found', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const ctx = {
        attackRoll: {
          total: 10,
          formula: '2d6',
          terms: [
            {
              faces: 6,
              results: [
                { result: 3, active: true },
                { result: 4, active: true }
              ]
            }
          ]
        }
      };

      expect((AttackHooks as any).getD20Result(ctx)).toBeNull();
    });

    it('should return null when d20 has no results', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const ctx = {
        attackRoll: {
          total: 20,
          formula: '1d20',
          terms: [{ faces: 20, results: [] }]
        }
      };

      expect((AttackHooks as any).getD20Result(ctx)).toBeNull();
    });

    it('should return null when no active result', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const ctx = {
        attackRoll: {
          total: 20,
          formula: '1d20',
          terms: [{ faces: 20, results: [{ result: 15, active: false }] }]
        }
      };

      expect((AttackHooks as any).getD20Result(ctx)).toBeNull();
    });
  });

  describe('onRollAttack — crit/fumble detection', () => {
    it('should fire the crit path when rolls[0].isCritical is true', async () => {
      const { AttackHooks, rollCriticalHit, rollFumble } = await loadHooks();

      const goblin = createTargetWithAC('Goblin', 15);
      setUserTargets(goblin);
      const roll = createD20Roll({ total: 24, isCritical: true });
      const subject = createAttackActivity();

      await (AttackHooks as any).onRollAttack([roll], { subject });

      expect(rollCriticalHit).toHaveBeenCalledTimes(1);
      expect(rollFumble).not.toHaveBeenCalled();
    });

    it('should fire the fumble path when rolls[0].isFumble is true', async () => {
      const { AttackHooks, rollCriticalHit, rollFumble, applyFumbleResult } = await loadHooks();

      const goblin = createTargetWithAC('Goblin', 15);
      setUserTargets(goblin);
      const roll = createD20Roll({ total: 6, isFumble: true });
      const subject = createAttackActivity();

      await (AttackHooks as any).onRollAttack([roll], { subject });

      expect(rollFumble).toHaveBeenCalledTimes(1);
      expect(rollCriticalHit).not.toHaveBeenCalled();
      // Fumble "grants" effects need every targeted token, hit or not.
      expect(applyFumbleResult).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'Attacker' }),
        [goblin],
        subject.actor,
        subject.item
      );
    });

    it('should do nothing on an ordinary hit', async () => {
      const { AttackHooks, rollCriticalHit, rollFumble } = await loadHooks();

      setUserTargets(createTargetWithAC('Goblin', 15));
      const subject = createAttackActivity();

      await (AttackHooks as any).onRollAttack([createD20Roll()], { subject });

      expect(rollCriticalHit).not.toHaveBeenCalled();
      expect(rollFumble).not.toHaveBeenCalled();
      expect(soundPlays()).toBe(false);
    });

    it('should honour the crit threshold via isCritical rather than the raw die', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();

      // A Champion crits on 19: the die shows 19 but D20Roll says critical.
      setUserTargets(createTargetWithAC('Goblin', 15));
      const roll = createD20Roll({
        total: 24,
        isCritical: true,
        terms: [{ faces: 20, results: [{ result: 19, active: true }] }]
      });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      expect(rollCriticalHit).toHaveBeenCalledTimes(1);
    });

    it('should fall back to the natural 20 when the roll carries no isCritical', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();

      setUserTargets(createTargetWithAC('Goblin', 15));
      const roll = createD20Roll({
        total: 25,
        isCritical: undefined,
        isFumble: undefined,
        terms: [{ faces: 20, results: [{ result: 20, active: true }] }]
      });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      expect(rollCriticalHit).toHaveBeenCalledTimes(1);
    });

    it('should fall back to the natural 1 when the roll carries no isFumble', async () => {
      const { AttackHooks, rollFumble } = await loadHooks();

      setUserTargets(createTargetWithAC('Goblin', 15));
      const roll = createD20Roll({
        total: 6,
        isCritical: undefined,
        isFumble: undefined,
        terms: [{ faces: 20, results: [{ result: 1, active: true }] }]
      });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      expect(rollFumble).toHaveBeenCalledTimes(1);
    });

    it('should not let the natural 20 override an explicit isCritical=false', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();

      setUserTargets(createTargetWithAC('Goblin', 15));
      const roll = createD20Roll({
        total: 25,
        isCritical: false,
        terms: [{ faces: 20, results: [{ result: 20, active: true }] }]
      });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      expect(rollCriticalHit).not.toHaveBeenCalled();
    });

    it('should respect the enableCrits setting', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) =>
        key === 'enableCrits' ? false : true
      );

      setUserTargets(createTargetWithAC('Goblin', 15));
      const roll = createD20Roll({ total: 24, isCritical: true });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      expect(rollCriticalHit).not.toHaveBeenCalled();
    });

    it('should respect the enableFumbles setting', async () => {
      const { AttackHooks, rollFumble } = await loadHooks();
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) =>
        key === 'enableFumbles' ? false : true
      );

      setUserTargets(createTargetWithAC('Goblin', 15));
      const roll = createD20Roll({ total: 6, isFumble: true });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      expect(rollFumble).not.toHaveBeenCalled();
    });
  });

  describe('onRollAttack — defensive payload handling', () => {
    it('should ignore an empty rolls array', async () => {
      const { AttackHooks, rollCriticalHit, rollFumble } = await loadHooks();

      await (AttackHooks as any).onRollAttack([], { subject: createAttackActivity() });

      expect(rollCriticalHit).not.toHaveBeenCalled();
      expect(rollFumble).not.toHaveBeenCalled();
    });

    it('should ignore undefined rolls', async () => {
      const { AttackHooks, rollCriticalHit, rollFumble } = await loadHooks();

      await (AttackHooks as any).onRollAttack(undefined, { subject: createAttackActivity() });

      expect(rollCriticalHit).not.toHaveBeenCalled();
      expect(rollFumble).not.toHaveBeenCalled();
    });

    it('should ignore a null subject', async () => {
      const { AttackHooks, rollCriticalHit, rollFumble } = await loadHooks();

      const roll = createD20Roll({ total: 24, isCritical: true });
      await (AttackHooks as any).onRollAttack([roll], { subject: null });
      await (AttackHooks as any).onRollAttack([roll], undefined);

      expect(rollCriticalHit).not.toHaveBeenCalled();
      expect(rollFumble).not.toHaveBeenCalled();
    });

    it('should ignore a subject with no actor', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();

      const roll = createD20Roll({ total: 24, isCritical: true });
      await (AttackHooks as any).onRollAttack([roll], {
        subject: createAttackActivity({ actor: null })
      });

      expect(rollCriticalHit).not.toHaveBeenCalled();
    });

    it('should tolerate game.user.targets being undefined', async () => {
      const { AttackHooks, rollCriticalHit, displayResult, applyResult } = await loadHooks();

      delete (game as any).user.targets;
      const roll = createD20Roll({ total: 24, isCritical: true });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      // Targetless crit: rolled and announced, nothing to apply it to.
      expect(rollCriticalHit).toHaveBeenCalledTimes(1);
      expect(displayResult).toHaveBeenCalledWith(expect.anything(), 'Test Actor', 'their target');
      expect(applyResult).not.toHaveBeenCalled();
    });

    it('should swallow and log handler errors', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();
      rollCriticalHit.mockRejectedValue(new Error('boom'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      setUserTargets(createTargetWithAC('Goblin', 15));
      const roll = createD20Roll({ total: 24, isCritical: true });

      await expect(
        (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() })
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('buildContext — action type resolution', () => {
    it('should prefer the 6.0 getActionType(attackMode) over the actionType getter', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const getActionType = jest.fn<(mode?: string) => string>(() => 'rwak');
      const subject = createAttackActivity({ getActionType, actionType: 'mwak' });
      const roll = createD20Roll({ options: { attackMode: 'thrown' } });

      const ctx = (AttackHooks as any).buildContext([roll], subject);

      expect(getActionType).toHaveBeenCalledWith('thrown');
      expect(ctx.actionType).toBe('rwak');
    });

    it('should fall back to the 5.x actionType getter', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const subject = createAttackActivity({ actionType: 'rsak' });

      const ctx = (AttackHooks as any).buildContext([createD20Roll()], subject);

      expect(ctx.actionType).toBe('rsak');
    });

    it('should fall back to the item helper when the activity has neither', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const subject = createAttackActivity({
        actionType: undefined,
        item: { id: 'i', type: 'spell', name: 'Fire Bolt', system: {} }
      });

      const ctx = (AttackHooks as any).buildContext([createD20Roll()], subject);

      expect(ctx.actionType).toBe('rsak');
    });

    it('should carry the activity, roll and every user target', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const goblin = createTargetWithAC('Goblin', 15);
      const orc = createTargetWithAC('Orc', 30);
      setUserTargets(goblin, orc);
      const subject = createAttackActivity();
      const roll = createD20Roll({ total: 18 });

      const ctx = (AttackHooks as any).buildContext([roll], subject);

      expect(ctx.activity).toBe(subject);
      expect(ctx.attackRoll).toBe(roll);
      expect(ctx.actor).toBe(subject.actor);
      expect(ctx.item).toBe(subject.item);
      expect([...ctx.targets]).toEqual([goblin, orc]);
      expect([...ctx.hitTargets]).toEqual([goblin]);
    });
  });

  describe('computeHitTargets — hit vs AC', () => {
    async function hits(roll: any, isCritical: boolean, isFumble: boolean, ...targets: any[]) {
      const { AttackHooks } = await import('../../src/services/AttackHooks');
      return [
        ...(AttackHooks as any).computeHitTargets(new Set(targets), roll, isCritical, isFumble)
      ];
    }

    it('should hit when total meets or beats AC', async () => {
      const goblin = createTargetWithAC('Goblin', 15);
      const orc = createTargetWithAC('Orc', 16);

      expect(await hits(createD20Roll({ total: 15 }), false, false, goblin, orc)).toEqual([goblin]);
    });

    it('should miss when total is below AC', async () => {
      const knight = createTargetWithAC('Knight', 20);

      expect(await hits(createD20Roll({ total: 19 }), false, false, knight)).toEqual([]);
    });

    it('should hit every target on a crit regardless of AC', async () => {
      const knight = createTargetWithAC('Knight', 30);
      const goblin = createTargetWithAC('Goblin', 10);

      expect(await hits(createD20Roll({ total: 8 }), true, false, knight, goblin)).toEqual([
        knight,
        goblin
      ]);
    });

    it('should miss every target on a fumble even when total beats AC', async () => {
      const goblin = createTargetWithAC('Goblin', 5);

      expect(await hits(createD20Roll({ total: 25 }), false, true, goblin)).toEqual([]);
    });

    it('should treat total cover as a miss, even on a crit', async () => {
      const hidden = createTargetWithAC('Hidden', 10, ['coverTotal']);
      const open = createTargetWithAC('Open', 10);

      expect(await hits(createD20Roll({ total: 30 }), true, false, hidden, open)).toEqual([open]);
    });

    it('should treat a target with no AC as a miss, as the dnd5e card does', async () => {
      const loot = createTargetWithAC('Chest', undefined);

      expect(await hits(createD20Roll({ total: 30 }), true, false, loot)).toEqual([]);
    });

    it('should skip targets with no actor and return no hits without a roll', async () => {
      const empty = createMockToken({ name: 'Empty', actor: null } as any);
      const goblin = createTargetWithAC('Goblin', 5);

      expect(await hits(createD20Roll({ total: 30 }), false, false, empty, goblin)).toEqual([
        goblin
      ]);
      expect(await hits(undefined, true, false, goblin)).toEqual([]);
    });
  });

  describe('suppressNextWorkflow', () => {
    it('should skip exactly one attack after being armed', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();

      setUserTargets(createTargetWithAC('Goblin', 15));
      const roll = createD20Roll({ total: 24, isCritical: true });
      const subject = createAttackActivity();

      AttackHooks.suppressNextWorkflow = true;
      await (AttackHooks as any).onRollAttack([roll], { subject });

      expect(rollCriticalHit).not.toHaveBeenCalled();
      expect(AttackHooks.suppressNextWorkflow).toBe(false);

      await (AttackHooks as any).onRollAttack([roll], { subject });

      expect(rollCriticalHit).toHaveBeenCalledTimes(1);
    });
  });

  describe('findWeaponForAttackType', () => {
    it('should find melee weapon', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const actor = createMockActor();
      const longsword = {
        type: 'weapon',
        name: 'Longsword',
        system: { actionType: 'mwak' }
      };
      (actor.items as any) = new Map([['item1', longsword]]);

      const result = (AttackHooks as any).findWeaponForAttackType(actor, 'melee');
      expect(result).toBe(longsword);
    });

    it('should find ranged weapon', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const actor = createMockActor();
      const shortbow = {
        type: 'weapon',
        name: 'Shortbow',
        system: { actionType: 'rwak' }
      };
      (actor.items as any) = new Map([['item1', shortbow]]);

      const result = (AttackHooks as any).findWeaponForAttackType(actor, 'ranged');
      expect(result).toBe(shortbow);
    });

    it('should find spell attack', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const actor = createMockActor();
      const fireBolt = {
        type: 'weapon',
        name: 'Fire Bolt',
        system: { actionType: 'rsak' }
      };
      (actor.items as any) = new Map([['item1', fireBolt]]);

      const result = (AttackHooks as any).findWeaponForAttackType(actor, 'spell');
      expect(result).toBe(fireBolt);
    });

    it('should find melee spell attack (msak)', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const actor = createMockActor();
      const shockingGrasp = {
        type: 'weapon',
        name: 'Shocking Grasp',
        system: { actionType: 'msak' }
      };
      (actor.items as any) = new Map([['item1', shockingGrasp]]);

      const result = (AttackHooks as any).findWeaponForAttackType(actor, 'spell');
      expect(result).toBe(shockingGrasp);
    });

    it('should return first weapon when no match found', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const actor = createMockActor();
      const dagger = {
        type: 'weapon',
        name: 'Dagger',
        system: { actionType: 'mwak' }
      };
      (actor.items as any) = new Map([['item1', dagger]]);

      const result = (AttackHooks as any).findWeaponForAttackType(actor, 'spell');
      expect(result).toBe(dagger);
    });

    it('should return null when no weapons', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const actor = createMockActor();
      (actor.items as any) = new Map();

      const result = (AttackHooks as any).findWeaponForAttackType(actor, 'melee');
      expect(result).toBeNull();
    });

    it('should handle D&D5e v4 activities structure for melee', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const actor = createMockActor();
      const weapon = {
        type: 'weapon',
        name: 'Longsword',
        system: {
          activities: {
            attack1: {
              type: 'attack',
              attack: { type: { value: 'melee' } }
            }
          }
        }
      };
      (actor.items as any) = new Map([['item1', weapon]]);

      const result = (AttackHooks as any).findWeaponForAttackType(actor, 'melee');
      expect(result).toBe(weapon);
    });

    it('should handle D&D5e v4 activities structure for ranged', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const actor = createMockActor();
      const weapon = {
        type: 'weapon',
        name: 'Longbow',
        system: {
          activities: {
            attack1: {
              type: 'attack',
              attack: { type: { value: 'ranged' } }
            }
          }
        }
      };
      (actor.items as any) = new Map([['item1', weapon]]);

      const result = (AttackHooks as any).findWeaponForAttackType(actor, 'ranged');
      expect(result).toBe(weapon);
    });

    it('should skip non-weapon items', async () => {
      const { AttackHooks } = await import('../../src/services/AttackHooks');

      const actor = createMockActor();
      const armor = {
        type: 'equipment',
        name: 'Plate Armor',
        system: {}
      };
      const sword = {
        type: 'weapon',
        name: 'Sword',
        system: { actionType: 'mwak' }
      };
      (actor.items as any) = new Map([
        ['armor', armor],
        ['sword', sword]
      ]);

      const result = (AttackHooks as any).findWeaponForAttackType(actor, 'melee');
      expect(result).toBe(sword);
    });
  });

  describe('test harness entry points', () => {
    it('testCriticalHit should run the real crit path against the given target', async () => {
      const { AttackHooks, rollCriticalHit, applyResult } = await loadHooks();

      const attacker = createMockActor();
      const sword = { type: 'weapon', name: 'Sword', system: { actionType: 'mwak' } };
      (attacker.items as any) = new Map([['sword', sword]]);
      const target = createTargetWithAC('Goblin', 15);

      await AttackHooks.testCriticalHit(attacker, target, 'melee');

      expect(rollCriticalHit).toHaveBeenCalledWith('melee', 5, undefined);
      expect(applyResult).toHaveBeenCalledWith(expect.anything(), target, attacker, sword);
    });

    it('testFumble should run the real fumble path with the optional target', async () => {
      const { AttackHooks, rollFumble, applyFumbleResult } = await loadHooks();

      const actor = createMockActor();
      const bow = {
        type: 'weapon',
        name: 'Bow',
        system: {
          activities: { a1: { type: 'attack', attack: { type: { value: 'ranged' } } } }
        }
      };
      (actor.items as any) = new Map([['bow', bow]]);
      const token = createMockToken({ name: 'Fumbler' });
      (actor.getActiveTokens as jest.Mock).mockReturnValue([token]);
      const target = createTargetWithAC('Goblin', 15);

      await AttackHooks.testFumble(actor, target, 'ranged');

      expect(rollFumble).toHaveBeenCalledWith('ranged', 5, undefined);
      expect(applyFumbleResult).toHaveBeenCalledWith(
        expect.anything(),
        token,
        [target],
        actor,
        bow
      );
    });
  });

  describe('noCritical handling', () => {
    /** Build a token whose actor carries the given `noCritical` flags. */
    function createTargetWithNoCrit(name: string, noCritical?: Record<string, unknown>): any {
      const token = createTargetWithAC(name, 10);
      token.actor.flags = noCritical ? { 'midi-qol': { grants: { noCritical } } } : {};
      return token;
    }

    it('should skip the whole crit when every hit target grants no-critical', async () => {
      const { AttackHooks, rollCriticalHit, displayResult, applyResult } = await loadHooks();

      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const ctx = createAttackContext({
        targets: new Set([paladin]),
        hitTargets: new Set([paladin])
      });

      await (AttackHooks as any).handleCriticalHit(ctx);

      expect(soundPlays()).toBe(false);
      expect(rollCriticalHit).not.toHaveBeenCalled();
      expect(displayResult).not.toHaveBeenCalled();
      expect(applyResult).not.toHaveBeenCalled();
    });

    it('should apply the crit only to unprotected targets in a mixed group', async () => {
      const { AttackHooks, applyResult } = await loadHooks();

      // D20Roll#isCritical knows nothing about the defender, so this module
      // has to spare the paladin itself.
      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const goblin = createTargetWithNoCrit('Goblin');
      const ctx = createAttackContext({
        targets: new Set([paladin, goblin]),
        hitTargets: new Set([paladin, goblin])
      });

      await (AttackHooks as any).handleCriticalHit(ctx);

      expect(soundPlays()).toBe(true);
      expect(applyResult).toHaveBeenCalledTimes(1);
      expect(applyResult).toHaveBeenCalledWith(expect.anything(), goblin, ctx.actor, ctx.item);
    });

    it('should behave exactly as before when no target grants no-critical', async () => {
      const { AttackHooks, rollCriticalHit, displayResult, applyResult } = await loadHooks();

      const goblin = createTargetWithNoCrit('Goblin');
      const ctx = createAttackContext({
        targets: new Set([goblin]),
        hitTargets: new Set([goblin])
      });

      await (AttackHooks as any).handleCriticalHit(ctx);

      expect(soundPlays()).toBe(true);
      expect(rollCriticalHit).toHaveBeenCalled();
      expect(displayResult).toHaveBeenCalled();
      expect(applyResult).toHaveBeenCalledTimes(1);
    });

    it('should still announce a targetless crit', async () => {
      const { AttackHooks, displayResult, applyResult } = await loadHooks();

      const ctx = createAttackContext({ targets: new Set(), hitTargets: new Set() });

      await (AttackHooks as any).handleCriticalHit(ctx);

      expect(soundPlays()).toBe(true);
      expect(displayResult).toHaveBeenCalled();
      expect(applyResult).not.toHaveBeenCalled();
    });

    it('should only apply the crit to targets the roll actually hit', async () => {
      const { AttackHooks, applyResult } = await loadHooks();

      // Ordinary hit path: a crit hits everyone except total cover.
      const covered = createTargetWithAC('Covered', 10, ['coverTotal']);
      const goblin = createTargetWithAC('Goblin', 10);
      setUserTargets(covered, goblin);
      const roll = createD20Roll({ total: 24, isCritical: true });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      expect(applyResult).toHaveBeenCalledTimes(1);
      expect(applyResult).toHaveBeenCalledWith(
        expect.anything(),
        goblin,
        expect.anything(),
        expect.anything()
      );
    });

    it('should suppress a real dnd5e crit against a protected target end to end', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();

      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      setUserTargets(paladin);
      const roll = createD20Roll({ total: 24, isCritical: true });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      expect(soundPlays()).toBe(false);
      expect(rollCriticalHit).not.toHaveBeenCalled();
    });

    it('should not let the natural-20 fallback resurrect a suppressed crit', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();

      // No isCritical at all, so the module falls back to the raw d20 - which
      // knows nothing about noCritical on its own.
      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      setUserTargets(paladin);
      const roll = createD20Roll({
        total: 25,
        isCritical: undefined,
        isFumble: undefined,
        terms: [{ faces: 20, results: [{ result: 20, active: true }] }]
      });

      await (AttackHooks as any).onRollAttack([roll], { subject: createAttackActivity() });

      expect(soundPlays()).toBe(false);
      expect(rollCriticalHit).not.toHaveBeenCalled();
    });

    it('should key the per-action-type flag off the resolved action type', async () => {
      const { AttackHooks, rollCriticalHit } = await loadHooks();

      // Thrown dagger: activity resolves rwak for the attack mode, item says mwak.
      const archerBane = createTargetWithNoCrit('Archer Bane', { rwak: '1' });
      setUserTargets(archerBane);
      const subject = createAttackActivity({ getActionType: () => 'rwak' });
      const roll = createD20Roll({
        total: 24,
        isCritical: true,
        options: { attackMode: 'thrown' }
      });

      await (AttackHooks as any).onRollAttack([roll], { subject });

      expect(rollCriticalHit).not.toHaveBeenCalled();
    });
  });
});
