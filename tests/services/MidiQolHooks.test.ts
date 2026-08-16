/**
 * MidiQolHooks Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks, createMockActor, createMockToken, createMockWorkflow } from '../mocks/foundry';

describe('MidiQolHooks', () => {
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
  });

  describe('register', () => {
    it('should register hooks when midi-qol is active', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      MidiQolHooks.register();

      expect(Hooks.on).toHaveBeenCalledWith('midi-qol.AttackRollComplete', expect.any(Function));
    });

    it('should show error when midi-qol is not active', async () => {
      (game.modules.get as jest.Mock).mockImplementation((id: string) => {
        if (id === 'midi-qol') return { active: false };
        return undefined;
      });

      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      MidiQolHooks.register();

      expect(ui.notifications.error).toHaveBeenCalled();
    });
  });

  describe('unregister', () => {
    it('should unregister hooks', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      MidiQolHooks.register();
      MidiQolHooks.unregister();

      expect(Hooks.off).toHaveBeenCalled();
    });

    it('should not throw when unregistering without registering first', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      // Should not throw
      MidiQolHooks.unregister();
    });
  });

  describe('getD20Result', () => {
    it('should extract d20 result from workflow', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const workflow = {
        attackRoll: {
          total: 25,
          formula: '1d20+5',
          terms: [{ faces: 20, results: [{ result: 20, active: true }] }]
        }
      };

      const result = (MidiQolHooks as any).getD20Result(workflow);
      expect(result).toBe(20);
    });

    it('should return null when no attack roll', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const workflow = { attackRoll: null };

      const result = (MidiQolHooks as any).getD20Result(workflow);
      expect(result).toBeNull();
    });

    it('should return null when no d20 term found', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const workflow = {
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

      const result = (MidiQolHooks as any).getD20Result(workflow);
      expect(result).toBeNull();
    });

    it('should return null when d20 has no results', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const workflow = {
        attackRoll: {
          total: 20,
          formula: '1d20',
          terms: [{ faces: 20, results: [] }]
        }
      };

      const result = (MidiQolHooks as any).getD20Result(workflow);
      expect(result).toBeNull();
    });

    it('should return null when no active result', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const workflow = {
        attackRoll: {
          total: 20,
          formula: '1d20',
          terms: [{ faces: 20, results: [{ result: 15, active: false }] }]
        }
      };

      const result = (MidiQolHooks as any).getD20Result(workflow);
      expect(result).toBeNull();
    });
  });

  describe('findWeaponForAttackType', () => {
    it('should find melee weapon', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const actor = createMockActor();
      const longsword = {
        type: 'weapon',
        name: 'Longsword',
        system: { actionType: 'mwak' }
      };
      (actor.items as any) = new Map([['item1', longsword]]);

      const result = (MidiQolHooks as any).findWeaponForAttackType(actor, 'melee');
      expect(result).toBe(longsword);
    });

    it('should find ranged weapon', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const actor = createMockActor();
      const shortbow = {
        type: 'weapon',
        name: 'Shortbow',
        system: { actionType: 'rwak' }
      };
      (actor.items as any) = new Map([['item1', shortbow]]);

      const result = (MidiQolHooks as any).findWeaponForAttackType(actor, 'ranged');
      expect(result).toBe(shortbow);
    });

    it('should find spell attack', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const actor = createMockActor();
      const fireBolt = {
        type: 'weapon',
        name: 'Fire Bolt',
        system: { actionType: 'rsak' }
      };
      (actor.items as any) = new Map([['item1', fireBolt]]);

      const result = (MidiQolHooks as any).findWeaponForAttackType(actor, 'spell');
      expect(result).toBe(fireBolt);
    });

    it('should find melee spell attack (msak)', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const actor = createMockActor();
      const shockingGrasp = {
        type: 'weapon',
        name: 'Shocking Grasp',
        system: { actionType: 'msak' }
      };
      (actor.items as any) = new Map([['item1', shockingGrasp]]);

      const result = (MidiQolHooks as any).findWeaponForAttackType(actor, 'spell');
      expect(result).toBe(shockingGrasp);
    });

    it('should return first weapon when no match found', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const actor = createMockActor();
      const dagger = {
        type: 'weapon',
        name: 'Dagger',
        system: { actionType: 'mwak' }
      };
      (actor.items as any) = new Map([['item1', dagger]]);

      const result = (MidiQolHooks as any).findWeaponForAttackType(actor, 'spell');
      expect(result).toBe(dagger);
    });

    it('should return null when no weapons', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const actor = createMockActor();
      (actor.items as any) = new Map();

      const result = (MidiQolHooks as any).findWeaponForAttackType(actor, 'melee');
      expect(result).toBeNull();
    });

    it('should handle D&D5e v4 activities structure for melee', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

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

      const result = (MidiQolHooks as any).findWeaponForAttackType(actor, 'melee');
      expect(result).toBe(weapon);
    });

    it('should handle D&D5e v4 activities structure for ranged', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

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

      const result = (MidiQolHooks as any).findWeaponForAttackType(actor, 'ranged');
      expect(result).toBe(weapon);
    });

    it('should skip non-weapon items', async () => {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

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

      const result = (MidiQolHooks as any).findWeaponForAttackType(actor, 'melee');
      expect(result).toBe(sword);
    });
  });

  describe('grants.noCritical handling', () => {
    /** Build a token whose actor carries the given `grants.noCritical` flags. */
    function createTargetWithNoCrit(name: string, noCritical?: Record<string, unknown>): any {
      const actor = createMockActor();
      (actor as any).flags = noCritical ? { 'midi-qol': { grants: { noCritical } } } : {};
      return createMockToken({ name, actor } as any);
    }

    /**
     * Import the hook service with its collaborators stubbed, so the assertions
     * are about the crit DECISION rather than table lookups or effect writes.
     */
    async function loadHooks() {
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');
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
      const displayResult = jest.fn<any>().mockResolvedValue(undefined);
      const applyResult = jest.fn<any>().mockResolvedValue(undefined);

      (TableSelector as any).rollCriticalHit = rollCriticalHit;
      (EffectsManager as any).displayResult = displayResult;
      (EffectsManager as any).applyResult = applyResult;

      return { MidiQolHooks, rollCriticalHit, displayResult, applyResult };
    }

    /** The crit sound is the earliest observable sign that a crit fired at all. */
    function critSoundPlays(): boolean {
      return (foundry.audio.AudioHelper.play as jest.Mock).mock.calls.length > 0;
    }

    it('should skip the whole crit when every hit target grants no-critical', async () => {
      const { MidiQolHooks, rollCriticalHit, displayResult, applyResult } = await loadHooks();

      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const workflow = createMockWorkflow({
        targets: new Set([paladin]),
        hitTargets: new Set([paladin])
      });

      await (MidiQolHooks as any).handleCriticalHit(workflow);

      expect(critSoundPlays()).toBe(false);
      expect(rollCriticalHit).not.toHaveBeenCalled();
      expect(displayResult).not.toHaveBeenCalled();
      expect(applyResult).not.toHaveBeenCalled();
    });

    it('should apply the crit only to unprotected targets in a mixed group', async () => {
      const { MidiQolHooks, applyResult } = await loadHooks();

      // Midi-QOL's own suppression is all-or-nothing, so it leaves isCritical
      // true here — this module has to spare the paladin itself.
      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const goblin = createTargetWithNoCrit('Goblin');
      const workflow = createMockWorkflow({
        targets: new Set([paladin, goblin]),
        hitTargets: new Set([paladin, goblin])
      });

      await (MidiQolHooks as any).handleCriticalHit(workflow);

      expect(critSoundPlays()).toBe(true);
      expect(applyResult).toHaveBeenCalledTimes(1);
      expect(applyResult).toHaveBeenCalledWith(
        expect.anything(),
        goblin,
        workflow.actor,
        workflow.item
      );
    });

    it('should behave exactly as before when no target grants no-critical', async () => {
      const { MidiQolHooks, rollCriticalHit, displayResult, applyResult } = await loadHooks();

      const goblin = createTargetWithNoCrit('Goblin');
      const workflow = createMockWorkflow({
        targets: new Set([goblin]),
        hitTargets: new Set([goblin])
      });

      await (MidiQolHooks as any).handleCriticalHit(workflow);

      expect(critSoundPlays()).toBe(true);
      expect(rollCriticalHit).toHaveBeenCalled();
      expect(displayResult).toHaveBeenCalled();
      expect(applyResult).toHaveBeenCalledTimes(1);
    });

    it('should still announce a targetless crit', async () => {
      const { MidiQolHooks, displayResult, applyResult } = await loadHooks();

      const workflow = createMockWorkflow({ targets: new Set(), hitTargets: new Set() });

      await (MidiQolHooks as any).handleCriticalHit(workflow);

      expect(critSoundPlays()).toBe(true);
      expect(displayResult).toHaveBeenCalled();
      expect(applyResult).not.toHaveBeenCalled();
    });

    it('should suppress even when auto hit checking is off and Midi-QOL never ran', async () => {
      const { MidiQolHooks, rollCriticalHit } = await loadHooks();

      // With autoCheckHit "none", Midi-QOL never calls processCriticalFlags, so
      // isCritical is simply the natural crit and carries no suppression.
      (globalThis as any).MidiQOL.configSettings = () => ({ autoCheckHit: 'none' });
      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const workflow = createMockWorkflow({
        isCritical: true,
        targets: new Set([paladin]),
        hitTargets: new Set([paladin])
      });

      await (MidiQolHooks as any).onAttackRollComplete(workflow);

      expect(critSoundPlays()).toBe(false);
      expect(rollCriticalHit).not.toHaveBeenCalled();
    });

    it('should not let the natural-20 fallback resurrect a suppressed crit', async () => {
      const { MidiQolHooks, rollCriticalHit } = await loadHooks();

      // No isCritical at all, so the module falls back to the raw d20 - which
      // knows nothing about grants.noCritical on its own.
      const paladin = createTargetWithNoCrit('Paladin', { all: '1' });
      const workflow = createMockWorkflow({
        isCritical: undefined,
        targets: new Set([paladin]),
        hitTargets: new Set([paladin])
      });

      await (MidiQolHooks as any).onAttackRollComplete(workflow);

      expect(critSoundPlays()).toBe(false);
      expect(rollCriticalHit).not.toHaveBeenCalled();
    });
  });
});
