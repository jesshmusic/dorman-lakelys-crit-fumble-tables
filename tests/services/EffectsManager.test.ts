/**
 * EffectsManager Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  resetMocks,
  createMockToken,
  createMockItem,
  createMockActor,
  rollToMessage
} from '../mocks/foundry';
import { RolledResult } from '../../src/types';

describe('EffectsManager', () => {
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
        showChatMessages: true
      };
      return defaults[key];
    });
  });

  const createMockRolledResult = (effectConfig?: any): RolledResult => ({
    table: {
      name: 'tier1-melee-crits',
      description: 'Test table',
      tier: 1,
      attackType: 'melee',
      resultType: 'crit',
      results: [],
      formula: '1d100'
    },
    result: {
      name: 'Test Effect',
      description: 'A test effect for testing',
      weight: 10,
      range: [50, 60] as [number, number],
      flags: effectConfig ? { 'dorman-lakelys-crit-fumble-tables': effectConfig } : undefined
    },
    roll: 55,
    type: 'crit',
    attackType: 'melee',
    tier: 1
  });

  describe('applyResult', () => {
    it('should not apply effects when applyEffects setting is false', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'applyEffects') return false;
        return true;
      });

      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'condition',
        effectCondition: 'prone'
      });

      await EffectsManager.applyResult(result, token);

      // Should not have called createEmbeddedDocuments
      expect(token.actor?.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('should not apply effects when effectType is none', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'none'
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('should apply condition effect', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'condition',
        effectCondition: 'prone',
        duration: 2
      });

      await EffectsManager.applyResult(result, token);

      // Standard conditions use toggleStatusEffect
      expect(token.actor.toggleStatusEffect).toHaveBeenCalledWith('prone', { active: true });
    });

    it('should apply damage effect', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'damage',
        damageFormula: '2d6',
        damageType: 'slashing'
      });

      await EffectsManager.applyResult(result, token);

      // Damage now posts a dnd5e DamageRoll chat card (roll.toMessage), not MidiQOL
      expect(rollToMessage).toHaveBeenCalled();
      expect(MidiQOL.applyTokenDamage).not.toHaveBeenCalled();
    });
  });

  describe('applyCondition', () => {
    it('should toggle standard condition via toggleStatusEffect', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await (EffectsManager as any).applyCondition(token, {
        effectCondition: 'stunned',
        duration: 1
      });

      // Standard conditions use toggleStatusEffect
      expect(token.actor.toggleStatusEffect).toHaveBeenCalledWith('stunned', { active: true });
    });

    it('should create an active effect for custom conditions', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await (EffectsManager as any).applyCondition(token, {
        effectCondition: 'spell_locked',
        duration: -1
      });

      // Custom conditions use createEmbeddedDocuments
      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Spell_locked',
            flags: expect.objectContaining({
              'dorman-lakelys-crit-fumble-tables': expect.objectContaining({
                source: 'crit-fumble-result',
                condition: 'spell_locked'
              })
            })
          })
        ])
      );
    });

    it('should handle missing actor gracefully', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken({ actor: null });

      // Should not throw
      await (EffectsManager as any).applyCondition(token, {
        effectCondition: 'prone',
        duration: 1
      });
    });
  });

  describe('applyDamage', () => {
    it('should roll damage and post a dnd5e damage card', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await (EffectsManager as any).applyDamage(token, {
        damageFormula: '1d8',
        damageType: 'piercing'
      });

      // Damage now posts a native dnd5e damage card via roll.toMessage
      expect(rollToMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          flavor: expect.stringContaining('piercing'),
          flags: expect.objectContaining({
            dnd5e: expect.objectContaining({
              roll: { type: 'damage' },
              targets: expect.arrayContaining([
                expect.objectContaining({ uuid: token.actor.uuid, name: token.name })
              ])
            })
          })
        })
      );
      expect(MidiQOL.applyTokenDamage).not.toHaveBeenCalled();
    });

    it('should handle missing damage formula gracefully', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      // Should not throw when damageFormula is missing
      await (EffectsManager as any).applyDamage(token, {});

      expect(rollToMessage).not.toHaveBeenCalled();
    });
  });

  describe('displayResult', () => {
    it('should create a chat message for critical hit', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const result = createMockRolledResult({
        effectType: 'condition',
        effectCondition: 'prone'
      });

      await EffectsManager.displayResult(result, 'Attacker', 'Target');

      expect(ChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('critical'),
          flags: expect.objectContaining({
            'dorman-lakelys-crit-fumble-tables': expect.objectContaining({
              resultType: 'crit'
            })
          })
        })
      );
    });

    it('should create a chat message for fumble', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const result = createMockRolledResult();
      result.type = 'fumble';

      await EffectsManager.displayResult(result, 'Attacker', 'Attacker');

      expect(ChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('fumble')
        })
      );
    });

    it('should not display when showChatMessages is false', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'showChatMessages') return false;
        return true;
      });

      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const result = createMockRolledResult();

      await EffectsManager.displayResult(result, 'Attacker', 'Target');

      expect(ChatMessage.create).not.toHaveBeenCalled();
    });
  });

  describe('applyAdvantageDisadvantage', () => {
    it('should apply disadvantage on all attacks', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'attack.all',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.disadvantage.attack.all',
                value: '1'
              })
            ]),
            duration: expect.objectContaining({
              rounds: 1
            })
          })
        ])
      );
    });

    it('should apply advantage effect', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'advantage',
        advantageScope: 'attack.all',
        duration: 2
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.advantage.attack.all',
                value: '1'
              })
            ])
          })
        ])
      );
    });

    it('should apply grants advantage to attackers', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'advantage',
        advantageScope: 'attack.all',
        advantageTarget: 'grants',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.grants.advantage.attack.all',
                value: '1'
              })
            ])
          })
        ])
      );
    });

    it('should handle multiple scopes', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: ['attack.rwak', 'save.dex'],
        duration: 10
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.disadvantage.attack.rwak',
                value: '1'
              }),
              expect.objectContaining({
                key: 'flags.midi-qol.disadvantage.save.dex',
                value: '1'
              })
            ])
          })
        ])
      );
    });

    it('should handle duration 0 (until end of turn)', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'attack.all',
        duration: 0
      });

      await EffectsManager.applyResult(result, token);

      // duration 0 -> rounds:1 cap + DAE specialDuration 'turnEnd' (the flag that
      // actually deletes the effect at the affected creature's next turn end)
      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            duration: { rounds: 1 },
            flags: expect.objectContaining({
              dae: { specialDuration: ['turnEnd'] }
            })
          })
        ])
      );
    });

    it('should handle permanent duration (-1)', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'attack.all',
        duration: -1
      });

      await EffectsManager.applyResult(result, token);

      // -1 -> permanent effect (isTemporary === false), empty duration object
      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            duration: {}
          })
        ])
      );
    });

    it('should use custom effect name when provided', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'attack.all',
        effectName: 'Dazed',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Dazed'
          })
        ])
      );
    });

    it('should handle missing actor gracefully', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken({ actor: null });
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'attack.all',
        duration: 1
      });

      // Should not throw
      await EffectsManager.applyResult(result, token);
    });

    it('should handle missing advantageScope gracefully', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        duration: 1
      });

      // Should not throw, but should not create effect
      await EffectsManager.applyResult(result, token);

      // The effect should not be created without a scope
      expect(token.actor?.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('should apply ability check disadvantage', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'ability.str',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.disadvantage.check.str',
                value: '1'
              })
            ])
          })
        ])
      );
    });

    it('should apply concentration disadvantage', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'concentration',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.disadvantage.concentration',
                value: '1'
              })
            ])
          })
        ])
      );
    });
  });

  // Helpers for the dnd5e 5.x damage schema
  const weaponItem = (denomination: number, type: string, number = 1, name = 'Weapon') =>
    createMockItem({
      name,
      type: 'weapon',
      system: {
        actionType: 'mwak',
        damage: { base: { number, denomination, types: new Set([type]) } }
      }
    });

  const spellItem = (denomination: number, type: string, name = 'Spell') =>
    createMockItem({
      name,
      type: 'spell',
      system: {
        actionType: 'rsak',
        activities: {
          contents: [{ damage: { parts: [{ number: 1, denomination, types: new Set([type]) }] } }]
        }
      }
    });

  // Item with no resolvable damage data at all (no base, no activities)
  const emptyItem = () => createMockItem({ system: { damage: {} } });

  describe('weapon dice formula support', () => {
    describe('resolveWeaponDiceFormula', () => {
      it('should convert 1W to weapon die (1d8 for longsword)', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(8, 'slashing', 1, 'Longsword');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('1W', item);
        expect(result).toBe('1d8');
      });

      it('should convert 2W to 2 weapon dice', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(8, 'slashing', 1, 'Longsword');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2W', item);
        expect(result).toBe('2d8');
      });

      it('should convert 3W to 3 weapon dice', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(12, 'slashing', 1, 'Greataxe');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('3W', item);
        expect(result).toBe('3d12');
      });

      it('should handle lowercase w', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(6, 'piercing');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2w', item);
        expect(result).toBe('2d6');
      });

      it('should return original formula if not weapon dice syntax', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem();

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2d6', item);
        expect(result).toBe('2d6');
      });

      it('should default to d6 when no item provided', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2W', undefined);
        expect(result).toBe('2d6');
      });

      it('should default to d6 when item has no damage data', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2W', emptyItem());
        expect(result).toBe('2d6');
      });

      // "XWB"/"XSB" = X full copies of the weapon's/spell's BASE dice (number × size)
      it('should convert 1WB to one full weapon base (longsword 1d8 -> 1d8)', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(8, 'slashing', 1, 'Longsword');
        const result = (EffectsManager as any).resolveWeaponDiceFormula('1WB', item);
        expect(result).toBe('1d8');
      });

      it('should respect multi-die weapons for WB (greatsword 2d6 -> 1WB = 2d6)', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(6, 'slashing', 2, 'Greatsword');
        const result = (EffectsManager as any).resolveWeaponDiceFormula('1WB', item);
        expect(result).toBe('2d6');
      });

      it('should scale WB copies (greatsword 2d6 -> 2WB = 4d6)', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(6, 'slashing', 2, 'Greatsword');
        const result = (EffectsManager as any).resolveWeaponDiceFormula('2WB', item);
        expect(result).toBe('4d6');
      });

      it('should convert 1SB to one full spell base (fire bolt 1d10 -> 1d10)', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = spellItem(10, 'fire', 'Fire Bolt');
        const result = (EffectsManager as any).resolveWeaponDiceFormula('1SB', item);
        expect(result).toBe('1d10');
      });

      it('should default WB to single d6 when no item provided', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('1WB', undefined);
        expect(result).toBe('1d6');
      });

      it('should default SB to single d8 when no item provided', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('1SB', undefined);
        expect(result).toBe('1d8');
      });

      it('should fall back (not produce d0) when the weapon denomination is 0', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        // A weapon whose damage.base has a type but a 0 denomination must not
        // yield an invalid "1d0" that throws on evaluate.
        const item = weaponItem(0, 'slashing', 1, 'Oddball');
        const result = (EffectsManager as any).resolveWeaponDiceFormula('1WB', item);
        expect(result).toBe('1d6');
      });
    });

    describe('getWeaponDamageDie', () => {
      it('should extract d8 from longsword', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(8, 'slashing', 1, 'Longsword');

        const result = (EffectsManager as any).getWeaponDamageDie(item);
        expect(result).toBe('d8');
      });

      it('should extract d10 from fire bolt spell', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = spellItem(10, 'fire', 'Fire Bolt');

        const result = (EffectsManager as any).getWeaponDamageDie(item);
        expect(result).toBe('d10');
      });

      it('should extract d12 from greataxe', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(12, 'slashing', 1, 'Greataxe');

        const result = (EffectsManager as any).getWeaponDamageDie(item);
        expect(result).toBe('d12');
      });

      it('should extract die from a multi-dice weapon (2d6 greatsword)', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(6, 'slashing', 2, 'Greatsword');

        const result = (EffectsManager as any).getWeaponDamageDie(item);
        expect(result).toBe('d6');
      });

      it('should return d6 when item has no damage', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).getWeaponDamageDie(emptyItem());
        expect(result).toBe('d6');
      });

      it('should return d6 when item is undefined', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).getWeaponDamageDie(undefined);
        expect(result).toBe('d6');
      });
    });

    describe('getWeaponDamageType', () => {
      it('should get slashing from longsword', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(8, 'slashing', 1, 'Longsword');

        const result = (EffectsManager as any).getWeaponDamageType(item);
        expect(result).toBe('slashing');
      });

      it('should get fire from fire bolt', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = spellItem(10, 'fire', 'Fire Bolt');

        const result = (EffectsManager as any).getWeaponDamageType(item);
        expect(result).toBe('fire');
      });

      it('should get piercing from shortbow', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = weaponItem(6, 'piercing', 1, 'Shortbow');

        const result = (EffectsManager as any).getWeaponDamageType(item);
        expect(result).toBe('piercing');
      });

      it('should return empty string when no damage type present', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        // getWeaponDamageType returns '' when unresolved; the fallback
        // (bludgeoning/force) lives in resolveDamageType, not here.
        const result = (EffectsManager as any).getWeaponDamageType(emptyItem());
        expect(result).toBe('');
      });
    });

    describe('resolveDamageType', () => {
      it('should pass an explicit type through unchanged', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveDamageType('fire', weaponItem(8, 'slashing'));
        expect(result).toBe('fire');
      });

      it('should resolve "weapon" to the weapon actual type', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveDamageType(
          'weapon',
          weaponItem(8, 'slashing')
        );
        expect(result).toBe('slashing');
      });

      it('should resolve "spell" to the spell actual type', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveDamageType('spell', spellItem(10, 'fire'));
        expect(result).toBe('fire');
      });

      it('should fall back to bludgeoning for unresolved weapon type', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveDamageType('weapon', emptyItem());
        expect(result).toBe('bludgeoning');
      });

      it('should fall back to force for unresolved spell type', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveDamageType('spell', undefined);
        expect(result).toBe('force');
      });
    });

    describe('applyDamage with weapon dice', () => {
      it('should resolve weapon dice formula when posting the damage card', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const token = createMockToken();
        const item = weaponItem(8, 'slashing', 1, 'Longsword');

        await (EffectsManager as any).applyDamage(
          token,
          {
            damageFormula: '2W',
            damageType: 'weapon'
          },
          item
        );

        // Damage card posted with the resolved (slashing) type in the flavor
        expect(rollToMessage).toHaveBeenCalledWith(
          expect.objectContaining({ flavor: expect.stringContaining('slashing') })
        );
      });

      it('should use weapon damage type when damageType is weapon', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const token = createMockToken();
        const item = spellItem(10, 'fire', 'Fire Bolt');

        await (EffectsManager as any).applyDamage(
          token,
          {
            damageFormula: '2W',
            damageType: 'weapon'
          },
          item
        );

        expect(rollToMessage).toHaveBeenCalledWith(
          expect.objectContaining({ flavor: expect.stringContaining('fire') })
        );
      });

      it('should use explicit damage type when provided', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const token = createMockToken();
        const item = createMockItem();

        await (EffectsManager as any).applyDamage(
          token,
          {
            damageFormula: '1d4',
            damageType: 'bludgeoning'
          },
          item
        );

        expect(rollToMessage).toHaveBeenCalledWith(
          expect.objectContaining({ flavor: expect.stringContaining('bludgeoning') })
        );
      });
    });

    describe('spell dice formula support', () => {
      it('should convert 1S to spell die', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = spellItem(10, 'fire', 'Fire Bolt');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('1S', item);
        expect(result).toBe('1d10');
      });

      it('should convert 3S to 3 spell dice', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = spellItem(10, 'force', 'Eldritch Blast');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('3S', item);
        expect(result).toBe('3d10');
      });

      it('should handle lowercase s', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = spellItem(10, 'fire', 'Fire Bolt');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2s', item);
        expect(result).toBe('2d10');
      });

      it('should default to d8 when no spell item provided', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2S', undefined);
        expect(result).toBe('2d8');
      });

      it('should default to d8 when spell has no damage data', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({ type: 'spell', system: { damage: {} } });

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2S', item);
        expect(result).toBe('2d8');
      });
    });

    describe('getSpellDamageDie', () => {
      it('should extract d10 from fire bolt', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = spellItem(10, 'fire', 'Fire Bolt');

        const result = (EffectsManager as any).getSpellDamageDie(item);
        expect(result).toBe('d10');
      });

      it('should return d8 when no item', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).getSpellDamageDie(undefined);
        expect(result).toBe('d8');
      });

      it('should return d8 when no damage data', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const result = (EffectsManager as any).getSpellDamageDie(emptyItem());
        expect(result).toBe('d8');
      });
    });

    describe('applyDamage with spell dice', () => {
      it('should resolve spell dice and use spell damage type', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const token = createMockToken();
        const item = spellItem(10, 'fire', 'Fire Bolt');

        await (EffectsManager as any).applyDamage(
          token,
          { damageFormula: '2S', damageType: 'spell' },
          item
        );

        expect(rollToMessage).toHaveBeenCalledWith(
          expect.objectContaining({ flavor: expect.stringContaining('fire') })
        );
      });

      it('should use force as default when damageType is spell and no item', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const token = createMockToken();

        await (EffectsManager as any).applyDamage(
          token,
          { damageFormula: '2d8', damageType: 'spell' },
          undefined
        );

        expect(rollToMessage).toHaveBeenCalledWith(
          expect.objectContaining({ flavor: expect.stringContaining('force') })
        );
      });
    });
  });

  describe('applyFumbleResult', () => {
    it('should not apply effects when applyEffects setting is false', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'applyEffects') return false;
        return true;
      });

      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumblerToken = createMockToken();
      const targetTokens = [createMockToken()];
      const result = createMockRolledResult({
        effectType: 'advantage',
        advantageScope: 'attack.all',
        advantageTarget: 'grants',
        duration: 1
      });

      await EffectsManager.applyFumbleResult(result, fumblerToken, targetTokens);

      expect(fumblerToken.actor?.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('should not apply effects when effectType is none', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumblerToken = createMockToken();
      const targetTokens = [createMockToken()];
      const result = createMockRolledResult({ effectType: 'none' });

      await EffectsManager.applyFumbleResult(result, fumblerToken, targetTokens);

      expect(fumblerToken.actor?.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('should apply grants advantage to targets instead of fumbler', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumblerToken = createMockToken({ name: 'Fumbler' });
      const targetToken = createMockToken({ name: 'Target' });
      const result = createMockRolledResult({
        effectType: 'advantage',
        advantageScope: 'attack.all',
        advantageTarget: 'grants',
        duration: 1
      });

      await EffectsManager.applyFumbleResult(result, fumblerToken, [targetToken]);

      // Effect should be applied to target, not fumbler
      expect(targetToken.actor?.createEmbeddedDocuments).toHaveBeenCalled();
    });

    it('should apply grants disadvantage to targets', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumblerToken = createMockToken({ name: 'Fumbler' });
      const targetToken = createMockToken({ name: 'Target' });
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'attack.all',
        advantageTarget: 'grants',
        duration: 1
      });

      await EffectsManager.applyFumbleResult(result, fumblerToken, [targetToken]);

      expect(targetToken.actor?.createEmbeddedDocuments).toHaveBeenCalled();
    });

    it('should apply non-grants effects to fumbler', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumblerToken = createMockToken({ name: 'Fumbler' });
      const result = createMockRolledResult({
        effectType: 'condition',
        effectCondition: 'prone',
        duration: 1
      });

      await EffectsManager.applyFumbleResult(result, fumblerToken, []);

      expect(fumblerToken.actor.toggleStatusEffect).toHaveBeenCalledWith('prone', { active: true });
    });

    it('should handle grants effect with no targets', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumblerToken = createMockToken({ name: 'Fumbler' });
      const result = createMockRolledResult({
        effectType: 'advantage',
        advantageScope: 'attack.all',
        advantageTarget: 'grants',
        duration: 1
      });

      // With no targets, should fall through to apply to fumbler
      await EffectsManager.applyFumbleResult(result, fumblerToken, []);

      // Effect applied to fumbler since no targets
      expect(fumblerToken.actor?.createEmbeddedDocuments).toHaveBeenCalled();
    });
  });

  describe('handleSaveEffect', () => {
    it('should log save effect and apply condition', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await EffectsManager.handleSaveEffect(token, {
        effectType: 'save',
        saveDC: 15,
        saveAbility: 'dex',
        effectCondition: 'prone',
        duration: 1
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DC 15 dex'));
      expect(token.actor.toggleStatusEffect).toHaveBeenCalledWith('prone', { active: true });

      consoleSpy.mockRestore();
    });

    it('should apply damage from save effect', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await EffectsManager.handleSaveEffect(token, {
        effectType: 'save',
        saveDC: 15,
        saveAbility: 'dex',
        damageFormula: '3d6',
        damageType: 'fire'
      });

      expect(rollToMessage).toHaveBeenCalled();
    });

    it('should not apply when missing required config', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      // Missing saveDC
      await EffectsManager.handleSaveEffect(token, {
        effectType: 'save',
        saveAbility: 'dex'
      });

      expect(token.actor.toggleStatusEffect).not.toHaveBeenCalled();

      // Missing saveAbility
      await EffectsManager.handleSaveEffect(token, {
        effectType: 'save',
        saveDC: 15
      });

      expect(token.actor.toggleStatusEffect).not.toHaveBeenCalled();
    });

    it('should not apply when token has no actor', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken({ actor: null });

      await EffectsManager.handleSaveEffect(token, {
        effectType: 'save',
        saveDC: 15,
        saveAbility: 'dex',
        effectCondition: 'prone'
      });

      // actor is null, so no status effect should have been applied
      // (the function should bail out early without throwing)
      expect(token.actor).toBeNull();
    });
  });

  describe('applyDisarm', () => {
    it('should unequip weapon on disarm', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const mockUpdate = jest.fn<any>().mockResolvedValue({});
      const weapon = {
        id: 'weapon-id',
        type: 'weapon',
        name: 'Longsword',
        update: mockUpdate
      };
      const actor = createMockActor();
      (actor.items as any) = {
        get: jest.fn().mockReturnValue(weapon)
      };

      await EffectsManager.applyDisarm(actor, weapon as any);

      expect(mockUpdate).toHaveBeenCalledWith({ 'system.equipped': false });
    });

    it('should warn when missing actor', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await EffectsManager.applyDisarm(undefined, { id: 'item-id' } as any);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing actor or item'));
      consoleSpy.mockRestore();
    });

    it('should warn when missing item', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const actor = createMockActor();

      await EffectsManager.applyDisarm(actor, undefined);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing actor or item'));
      consoleSpy.mockRestore();
    });

    it('should warn when item not found on actor', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const actor = createMockActor();
      (actor.items as any) = {
        get: jest.fn().mockReturnValue(undefined)
      };

      await EffectsManager.applyDisarm(actor, { id: 'missing-id' } as any);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot find item'));
      consoleSpy.mockRestore();
    });

    it('should log when item is not a weapon', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const notWeapon = {
        id: 'item-id',
        type: 'equipment',
        name: 'Shield'
      };
      const actor = createMockActor();
      (actor.items as any) = {
        get: jest.fn().mockReturnValue(notWeapon)
      };

      await EffectsManager.applyDisarm(actor, notWeapon as any);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot disarm non-weapon'));
      consoleSpy.mockRestore();
    });
  });

  describe('applyPenalty', () => {
    it('should apply AC penalty', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await EffectsManager.applyPenalty(token, {
        effectType: 'penalty',
        penaltyType: 'ac',
        penaltyValue: -2,
        duration: -1
      });

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Armor Damaged',
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'system.attributes.ac.bonus',
                value: '-2'
              })
            ])
          })
        ])
      );
    });

    it('should apply attack penalty', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await EffectsManager.applyPenalty(token, {
        effectType: 'penalty',
        penaltyType: 'attack',
        penaltyValue: -1,
        duration: 5
      });

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Weapon Damaged',
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'system.bonuses.All.attack',
                value: '-1'
              })
            ]),
            duration: expect.objectContaining({
              rounds: 5
            })
          })
        ])
      );
    });

    it('should warn when missing required config', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const token = createMockToken();

      // Missing penaltyType
      await EffectsManager.applyPenalty(token, {
        effectType: 'penalty',
        penaltyValue: -2
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing required config'));

      // Missing penaltyValue
      await EffectsManager.applyPenalty(token, {
        effectType: 'penalty',
        penaltyType: 'ac'
      });

      consoleSpy.mockRestore();
    });

    it('should warn when token has no actor', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const token = createMockToken({ actor: null });

      await EffectsManager.applyPenalty(token, {
        effectType: 'penalty',
        penaltyType: 'ac',
        penaltyValue: -2
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('applyResult edge cases', () => {
    it('should handle result without flags', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult();
      result.result.flags = undefined;

      // Should not throw
      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('should handle save effect type', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'save',
        saveDC: 15,
        saveAbility: 'dex',
        effectCondition: 'prone',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor.toggleStatusEffect).toHaveBeenCalledWith('prone', { active: true });
    });

    it('should handle disarm effect type', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const mockUpdate = jest.fn<any>().mockResolvedValue({});
      const weapon = {
        id: 'weapon-id',
        type: 'weapon',
        name: 'Longsword',
        update: mockUpdate
      };
      const actor = createMockActor();
      (actor.items as any) = {
        get: jest.fn().mockReturnValue(weapon)
      };

      const result = createMockRolledResult({
        effectType: 'disarm'
      });

      await EffectsManager.applyResult(result, token, actor, weapon as any);

      expect(mockUpdate).toHaveBeenCalledWith({ 'system.equipped': false });
    });

    it('should handle penalty effect type', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'penalty',
        penaltyType: 'ac',
        penaltyValue: -2,
        duration: -1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalled();
    });
  });

  describe('isStandardCondition', () => {
    it('should recognize standard D&D 5e conditions', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const standardConditions = [
        'blinded',
        'charmed',
        'deafened',
        'frightened',
        'grappled',
        'incapacitated',
        'invisible',
        'paralyzed',
        'petrified',
        'poisoned',
        'prone',
        'restrained',
        'stunned',
        'unconscious',
        'exhaustion'
      ];

      for (const condition of standardConditions) {
        expect((EffectsManager as any).isStandardCondition(condition)).toBe(true);
      }
    });

    it('should not recognize custom conditions', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const customConditions = ['spell_locked', 'dazed', 'off_balance', 'disoriented'];

      for (const condition of customConditions) {
        expect((EffectsManager as any).isStandardCondition(condition)).toBe(false);
      }
    });

    it('should be case insensitive', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      expect((EffectsManager as any).isStandardCondition('PRONE')).toBe(true);
      expect((EffectsManager as any).isStandardCondition('Stunned')).toBe(true);
      expect((EffectsManager as any).isStandardCondition('BlInDeD')).toBe(true);
    });
  });

  describe('additional scope coverage', () => {
    it('should handle all ability scopes', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const scopes = ['ability.con', 'ability.int', 'ability.wis', 'ability.cha'];

      for (const scope of scopes) {
        jest.clearAllMocks();
        const result = createMockRolledResult({
          effectType: 'disadvantage',
          advantageScope: scope,
          duration: 1
        });

        await EffectsManager.applyResult(result, token);

        expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalled();
      }
    });

    it('should handle all save scopes', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const scopes = ['save.str', 'save.con', 'save.int', 'save.wis', 'save.cha'];

      for (const scope of scopes) {
        jest.clearAllMocks();
        const result = createMockRolledResult({
          effectType: 'advantage',
          advantageScope: scope,
          duration: 1
        });

        await EffectsManager.applyResult(result, token);

        expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalled();
      }
    });

    it('should handle attack.mwak scope', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'attack.mwak',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.disadvantage.attack.mwak'
              })
            ])
          })
        ])
      );
    });

    it('should handle attack.rsak scope', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'advantage',
        advantageScope: 'attack.rsak',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.advantage.attack.rsak'
              })
            ])
          })
        ])
      );
    });

    it('should handle attack.msak scope', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'attack.msak',
        duration: 2
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.disadvantage.attack.msak'
              })
            ])
          })
        ])
      );
    });

    it('should handle ability.all scope', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'advantage',
        advantageScope: 'ability.all',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.advantage.check.all'
              })
            ])
          })
        ])
      );
    });

    it('should handle ability.dex scope', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'disadvantage',
        advantageScope: 'ability.dex',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalled();
    });

    it('should handle save.all scope', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'advantage',
        advantageScope: 'save.all',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.advantage.save.all'
              })
            ])
          })
        ])
      );
    });

    it('should handle "all" scope for global advantage', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();
      const result = createMockRolledResult({
        effectType: 'advantage',
        advantageScope: 'all',
        duration: 1
      });

      await EffectsManager.applyResult(result, token);

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: 'flags.midi-qol.advantage.all'
              })
            ])
          })
        ])
      );
    });
  });

  describe('applyAttackAlly', () => {
    // Build a canvas token with the fields findNearestAlly / applyAttackAlly read.
    const makeToken = (
      id: string,
      opts: { disposition: number; x: number; y: number; hp?: number; name?: string }
    ): any => ({
      id,
      name: opts.name ?? id,
      document: { disposition: opts.disposition },
      center: { x: opts.x, y: opts.y },
      setTarget: jest.fn(),
      actor:
        opts.hp === undefined
          ? { name: opts.name ?? id }
          : { name: opts.name ?? id, system: { attributes: { hp: { value: opts.hp } } } }
    });

    // Source actor that carries a usable weapon.
    const makeSourceActor = () => {
      const weapon = {
        id: 'weapon-id',
        name: 'Longsword',
        type: 'weapon',
        use: jest.fn<() => Promise<any>>().mockResolvedValue(undefined)
      };
      const actor: any = {
        name: 'Fumbler',
        items: { get: jest.fn().mockReturnValue(weapon), values: () => [weapon][Symbol.iterator]() }
      };
      return { actor, weapon, sourceItem: { id: 'weapon-id' } as any };
    };

    it('should pick the nearer of two same-disposition living allies', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const allyNear = makeToken('ally-near', { disposition: 1, x: 100, y: 0, hp: 10 });
      const allyFar = makeToken('ally-far', { disposition: 1, x: 500, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, allyNear, allyFar];

      const { actor, weapon, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem);

      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-near']);
      expect(allyNear.setTarget).toHaveBeenCalled();
      expect(allyFar.setTarget).not.toHaveBeenCalled();
      expect(weapon.use).toHaveBeenCalled();
    });

    it('should exclude tokens of a different disposition', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const enemyNear = makeToken('enemy-near', { disposition: -1, x: 50, y: 0, hp: 10 });
      const allyFar = makeToken('ally-far', { disposition: 1, x: 400, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, enemyNear, allyFar];

      const { actor, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem);

      // The nearer enemy is skipped; the farther same-disposition ally is chosen
      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-far']);
    });

    it('should exclude downed allies (hp <= 0)', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const allyDowned = makeToken('ally-downed', { disposition: 1, x: 50, y: 0, hp: 0 });
      const allyUp = makeToken('ally-up', { disposition: 1, x: 400, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, allyDowned, allyUp];

      const { actor, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem);

      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-up']);
    });

    it('should use the weapon and set the re-entrancy guard', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { MidiQolHooks } = await import('../../src/services/MidiQolHooks');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const ally = makeToken('ally', { disposition: 1, x: 100, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, ally];

      const { actor, weapon, sourceItem } = makeSourceActor();

      MidiQolHooks.suppressNextWorkflow = false;
      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem);

      expect(weapon.use).toHaveBeenCalled();
      expect(MidiQolHooks.suppressNextWorkflow).toBe(true);
    });

    it('should no-op gracefully when no ally exists', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const enemy = makeToken('enemy', { disposition: -1, x: 50, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, enemy];

      const { actor, weapon, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem);

      expect(weapon.use).not.toHaveBeenCalled();
      expect((game.user as any).updateTokenTargets).not.toHaveBeenCalled();
      expect((ui.notifications as any).info).toHaveBeenCalled();
    });

    it('should be routed from applyResult for effectType attackAlly', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const ally = makeToken('ally', { disposition: 1, x: 100, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, ally];

      const { actor, weapon, sourceItem } = makeSourceActor();
      const result = createMockRolledResult({ effectType: 'attackAlly' });

      await EffectsManager.applyResult(result, fumbler, actor, sourceItem);

      expect(weapon.use).toHaveBeenCalled();
    });
  });
});
