/**
 * MidiQolHooks Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks, createMockActor } from '../mocks/foundry';

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
});
