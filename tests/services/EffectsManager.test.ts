/**
 * EffectsManager Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks, createMockToken, createMockActor, createMockItem } from '../mocks/foundry';
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
      expect(token.toggleStatusEffect).toHaveBeenCalledWith('prone', { active: true });
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

      // Damage is applied via MidiQOL.applyTokenDamage
      expect(MidiQOL.applyTokenDamage).toHaveBeenCalled();
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
      expect(token.toggleStatusEffect).toHaveBeenCalledWith('stunned', { active: true });
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
    it('should roll damage and apply via MidiQOL', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await (EffectsManager as any).applyDamage(token, {
        damageFormula: '1d8',
        damageType: 'piercing'
      });

      // Damage is applied via MidiQOL.applyTokenDamage
      expect(MidiQOL.applyTokenDamage).toHaveBeenCalled();
    });

    it('should handle missing damage formula gracefully', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      // Should not throw when damageFormula is missing
      await (EffectsManager as any).applyDamage(token, {});

      expect(MidiQOL.applyTokenDamage).not.toHaveBeenCalled();
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
                key: 'flags.midi-qol.disadvantage.ability.save.dex',
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

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            duration: expect.objectContaining({
              turns: 1
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

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            duration: expect.objectContaining({
              seconds: null,
              rounds: null
            })
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
                key: 'flags.midi-qol.disadvantage.ability.check.str',
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

  describe('weapon dice formula support', () => {
    describe('resolveWeaponDiceFormula', () => {
      it('should convert 1W to weapon die (1d8 for longsword)', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          name: 'Longsword',
          system: { damage: { parts: [['1d8', 'slashing']] } }
        });

        const result = (EffectsManager as any).resolveWeaponDiceFormula('1W', item);
        expect(result).toBe('1d8');
      });

      it('should convert 2W to 2 weapon dice', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          name: 'Longsword',
          system: { damage: { parts: [['1d8', 'slashing']] } }
        });

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2W', item);
        expect(result).toBe('2d8');
      });

      it('should convert 3W to 3 weapon dice', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          name: 'Greataxe',
          system: { damage: { parts: [['1d12', 'slashing']] } }
        });

        const result = (EffectsManager as any).resolveWeaponDiceFormula('3W', item);
        expect(result).toBe('3d12');
      });

      it('should handle lowercase w', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          system: { damage: { parts: [['1d6', 'piercing']] } }
        });

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

      it('should default to d6 when item has no damage parts', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          system: { damage: { parts: [] } }
        });

        const result = (EffectsManager as any).resolveWeaponDiceFormula('2W', item);
        expect(result).toBe('2d6');
      });
    });

    describe('getWeaponDamageDie', () => {
      it('should extract d8 from longsword', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          system: { damage: { parts: [['1d8+3', 'slashing']] } }
        });

        const result = (EffectsManager as any).getWeaponDamageDie(item);
        expect(result).toBe('d8');
      });

      it('should extract d10 from fire bolt spell', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          name: 'Fire Bolt',
          type: 'spell',
          system: {
            actionType: 'rsak',
            damage: { parts: [['1d10', 'fire']] }
          }
        });

        const result = (EffectsManager as any).getWeaponDamageDie(item);
        expect(result).toBe('d10');
      });

      it('should extract d12 from greataxe', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          name: 'Greataxe',
          system: { damage: { parts: [['1d12+4', 'slashing']] } }
        });

        const result = (EffectsManager as any).getWeaponDamageDie(item);
        expect(result).toBe('d12');
      });

      it('should extract die from formula with multiple dice', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          name: 'Greatsword',
          system: { damage: { parts: [['2d6+3', 'slashing']] } }
        });

        const result = (EffectsManager as any).getWeaponDamageDie(item);
        expect(result).toBe('d6');
      });

      it('should return d6 when item has no damage', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          system: { damage: { parts: [] } }
        });

        const result = (EffectsManager as any).getWeaponDamageDie(item);
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

        const item = createMockItem({
          system: { damage: { parts: [['1d8', 'slashing']] } }
        });

        const result = (EffectsManager as any).getWeaponDamageType(item);
        expect(result).toBe('slashing');
      });

      it('should get fire from fire bolt', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          name: 'Fire Bolt',
          type: 'spell',
          system: {
            actionType: 'rsak',
            damage: { parts: [['1d10', 'fire']] }
          }
        });

        const result = (EffectsManager as any).getWeaponDamageType(item);
        expect(result).toBe('fire');
      });

      it('should get piercing from shortbow', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          name: 'Shortbow',
          system: {
            actionType: 'rwak',
            damage: { parts: [['1d6', 'piercing']] }
          }
        });

        const result = (EffectsManager as any).getWeaponDamageType(item);
        expect(result).toBe('piercing');
      });

      it('should return bludgeoning as default when no damage parts', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const item = createMockItem({
          system: { damage: { parts: [] } }
        });

        const result = (EffectsManager as any).getWeaponDamageType(item);
        expect(result).toBe('bludgeoning');
      });
    });

    describe('applyDamage with weapon dice', () => {
      it('should resolve weapon dice formula when applying damage', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const token = createMockToken();
        const item = createMockItem({
          name: 'Longsword',
          system: { damage: { parts: [['1d8', 'slashing']] } }
        });

        await (EffectsManager as any).applyDamage(
          token,
          {
            damageFormula: '2W',
            damageType: 'weapon'
          },
          item
        );

        // Damage should be applied via MidiQOL
        expect(MidiQOL.applyTokenDamage).toHaveBeenCalled();
      });

      it('should use weapon damage type when damageType is weapon', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const token = createMockToken();
        const item = createMockItem({
          name: 'Fire Bolt',
          type: 'spell',
          system: {
            actionType: 'rsak',
            damage: { parts: [['1d10', 'fire']] }
          }
        });

        await (EffectsManager as any).applyDamage(
          token,
          {
            damageFormula: '2W',
            damageType: 'weapon'
          },
          item
        );

        expect(MidiQOL.applyTokenDamage).toHaveBeenCalled();
        // The call args should include the fire damage type
        const callArgs = (MidiQOL.applyTokenDamage as jest.Mock).mock.calls[0];
        expect(callArgs[0][0].type).toBe('fire');
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

        expect(MidiQOL.applyTokenDamage).toHaveBeenCalled();
        const callArgs = (MidiQOL.applyTokenDamage as jest.Mock).mock.calls[0];
        expect(callArgs[0][0].type).toBe('bludgeoning');
      });
    });
  });
});
