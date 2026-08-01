/**
 * EffectsManager Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  resetMocks,
  createMockToken,
  createMockItem,
  createMockActor,
  rollToMessage,
  activityUse,
  itemConstructorCalls,
  enableItemPiles,
  itemPilesCreatePile,
  itemPilesRemoveItems,
  testCollision,
  midiExecuteAsGM
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

  /**
   * Read the damage part off the transient activity that applyDamage built.
   * Bonus damage now ships as a dnd5e damage Activity, so resolved formula and
   * damage type land here instead of in the roll card's flavor.
   */
  const postedDamagePart = (): any => {
    const activity = Object.values(itemConstructorCalls[0].data.system.activities)[0] as any;
    return activity.damage.parts[0];
  };

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

      // Damage now posts a dnd5e damage Activity card, not MidiQOL.applyTokenDamage
      expect(activityUse).toHaveBeenCalled();
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
    /** Point the settings mock at a specific damage card mode. */
    const setDamageCardMode = (mode?: string): void => {
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        const defaults: Record<string, any> = {
          enabled: true,
          applyEffects: true,
          showChatMessages: true,
          damageCardMode: mode
        };
        return defaults[key];
      });
    };

    it('should post damage through a dnd5e damage Activity when Midi-QOL is active', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await (EffectsManager as any).applyDamage(token, {
        damageFormula: '1d8',
        damageType: 'piercing'
      });

      // The Activity route is what produces a `type: "usage"` message, the only
      // kind Midi-QOL attaches its player-usable Apply tray to.
      expect(activityUse).toHaveBeenCalledTimes(1);
      expect(rollToMessage).not.toHaveBeenCalled();

      const activityData = itemConstructorCalls[0].data;
      const activity = Object.values(activityData.system.activities)[0] as any;
      expect(activity.type).toBe('damage');
      expect(activity.damage.parts[0]).toEqual({
        custom: { enabled: true, formula: '1d8' },
        types: ['piercing']
      });
    });

    it('should target the damaged token explicitly rather than the user selection', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await (EffectsManager as any).applyDamage(token, {
        damageFormula: '2d6',
        damageType: 'slashing'
      });

      // Explicit flags keep the tray pointed at the right actor without
      // hijacking whatever the player currently has targeted.
      const [, , message] = activityUse.mock.calls[0] as any[];
      expect(message.data.flags.dnd5e.targets).toEqual([
        expect.objectContaining({ uuid: token.actor.uuid, name: token.name })
      ]);
    });

    it('should never save the transient damage item to the actor', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const item = createMockItem();
      const token = createMockToken();

      await (EffectsManager as any).applyDamage(
        token,
        { damageFormula: '2d6', damageType: 'slashing' },
        item
      );

      expect(itemConstructorCalls[0].data.type).toBe('feat');
      // Built in memory only — nothing is written to the actor's item list.
      expect(token.actor.createEmbeddedDocuments).not.toHaveBeenCalled();
      expect(item).toBeDefined();
    });

    it('should name the card after the result', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      await (EffectsManager as any).applyDamage(
        createMockToken(),
        { damageFormula: '2d6', damageType: 'slashing' },
        undefined,
        { label: 'Deep Self-Wound' }
      );

      expect(itemConstructorCalls[0].data.name).toBe('Deep Self-Wound');
    });

    it('should mark the card when a successful save halves the damage', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      await (EffectsManager as any).applyDamage(
        createMockToken(),
        { damageFormula: '2d6', damageType: 'slashing' },
        undefined,
        { half: true, label: 'Devastating Rebound' }
      );

      expect(itemConstructorCalls[0].data.name).toContain('half');
    });

    it('should use the legacy roll card when the GM forces roll mode', async () => {
      setDamageCardMode('roll');
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await (EffectsManager as any).applyDamage(token, {
        damageFormula: '1d8',
        damageType: 'piercing'
      });

      expect(activityUse).not.toHaveBeenCalled();
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

    it('should use the legacy roll card when Midi-QOL is inactive', async () => {
      (game.modules.get as jest.Mock).mockImplementation((id: string) =>
        id === 'midi-qol' ? { active: false } : undefined
      );
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      await (EffectsManager as any).applyDamage(createMockToken(), {
        damageFormula: '1d8',
        damageType: 'piercing'
      });

      expect(activityUse).not.toHaveBeenCalled();
      expect(rollToMessage).toHaveBeenCalled();
    });

    it('should still use the Activity when forced, even without Midi-QOL', async () => {
      setDamageCardMode('activity');
      (game.modules.get as jest.Mock).mockImplementation((id: string) =>
        id === 'midi-qol' ? { active: false } : undefined
      );
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      await (EffectsManager as any).applyDamage(createMockToken(), {
        damageFormula: '1d8',
        damageType: 'piercing'
      });

      expect(activityUse).toHaveBeenCalledTimes(1);
      expect(rollToMessage).not.toHaveBeenCalled();
    });

    it('should fall back to the roll card rather than drop damage when no Item class exists', async () => {
      (globalThis as any).CONFIG.Item.documentClass = undefined;
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      await (EffectsManager as any).applyDamage(createMockToken(), {
        damageFormula: '1d8',
        damageType: 'piercing'
      });

      expect(activityUse).not.toHaveBeenCalled();
      expect(rollToMessage).toHaveBeenCalled();
    });

    it('should fall back to the roll card when the damage activity throws', async () => {
      // Midi wraps `use` with flanking/Convenient-Effects work that can throw
      // for unrelated reasons (e.g. no GM connected). Damage must still land.
      activityUse.mockRejectedValueOnce(new Error('no GM connected'));
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      await (EffectsManager as any).applyDamage(createMockToken(), {
        damageFormula: '1d8',
        damageType: 'piercing'
      });

      expect(activityUse).toHaveBeenCalledTimes(1);
      expect(rollToMessage).toHaveBeenCalled();
    });

    it('should not post a duplicate card when the activity throws after posting', async () => {
      activityUse.mockImplementationOnce(async () => {
        (game as any).messages.size += 1;
        throw new Error('failed after the card was created');
      });
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      await (EffectsManager as any).applyDamage(createMockToken(), {
        damageFormula: '1d8',
        damageType: 'piercing'
      });

      expect(rollToMessage).not.toHaveBeenCalled();
    });

    it('should handle missing damage formula gracefully', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      // Should not throw when damageFormula is missing
      await (EffectsManager as any).applyDamage(token, {});

      expect(rollToMessage).not.toHaveBeenCalled();
      expect(activityUse).not.toHaveBeenCalled();
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
            duration: { value: 1, units: 'rounds', expiry: 'targetEnd' }
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

      // duration 0 -> DAE value/units/expiry schema: end of the holder's next
      // turn (no flags.dae.specialDuration — expiry lives in the duration now)
      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            duration: { value: 1, units: 'turns', expiry: 'targetEnd' }
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

        // "2W" against a longsword (d8) resolves to 2d8 slashing
        expect(postedDamagePart()).toEqual({
          custom: { enabled: true, formula: '2d8' },
          types: ['slashing']
        });
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

        expect(postedDamagePart().types).toEqual(['fire']);
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

        expect(postedDamagePart().types).toEqual(['bludgeoning']);
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

        expect(postedDamagePart()).toEqual({
          custom: { enabled: true, formula: '2d10' },
          types: ['fire']
        });
      });

      it('should use force as default when damageType is spell and no item', async () => {
        const { EffectsManager } = await import('../../src/services/EffectsManager');

        const token = createMockToken();

        await (EffectsManager as any).applyDamage(
          token,
          { damageFormula: '2d8', damageType: 'spell' },
          undefined
        );

        expect(postedDamagePart().types).toEqual(['force']);
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
    it('should apply the condition on a FAILED save', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { SaveManager } = await import('../../src/services/SaveManager');

      jest.spyOn(SaveManager, 'requestSave').mockResolvedValue(false);

      const token = createMockToken();

      await EffectsManager.handleSaveEffect(token, {
        effectType: 'save',
        saveDC: 15,
        saveAbility: 'dex',
        effectCondition: 'prone',
        duration: 1
      });

      // Failed save: the (standard) condition is applied via toggleStatusEffect
      expect(token.actor.toggleStatusEffect).toHaveBeenCalledWith('prone', { active: true });
    });

    it('should apply FULL damage on a FAILED save', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { SaveManager } = await import('../../src/services/SaveManager');

      jest.spyOn(SaveManager, 'requestSave').mockResolvedValue(false);

      const token = createMockToken();

      await EffectsManager.handleSaveEffect(token, {
        effectType: 'save',
        saveDC: 15,
        saveAbility: 'dex',
        damageFormula: '3d6',
        damageType: 'fire'
      });

      // Full damage card posted, and it is NOT marked as halved
      expect(activityUse).toHaveBeenCalledTimes(1);
      expect(itemConstructorCalls[0].data.name).not.toContain('half');
    });

    it('should NOT apply the condition on a SUCCESSFUL save', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { SaveManager } = await import('../../src/services/SaveManager');

      jest.spyOn(SaveManager, 'requestSave').mockResolvedValue(true);

      const token = createMockToken();

      await EffectsManager.handleSaveEffect(token, {
        effectType: 'save',
        saveDC: 15,
        saveAbility: 'dex',
        effectCondition: 'prone',
        duration: 1
      });

      // Successful save negates the condition
      expect(token.actor.toggleStatusEffect).not.toHaveBeenCalled();
    });

    it('should post HALF damage on a SUCCESSFUL save', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { SaveManager } = await import('../../src/services/SaveManager');

      jest.spyOn(SaveManager, 'requestSave').mockResolvedValue(true);

      const token = createMockToken();

      await EffectsManager.handleSaveEffect(token, {
        effectType: 'save',
        saveDC: 15,
        saveAbility: 'dex',
        damageFormula: '3d6',
        damageType: 'fire'
      });

      // Damage is still posted, but the card is marked as halved
      expect(activityUse).toHaveBeenCalledTimes(1);
      expect(itemConstructorCalls[0].data.name).toContain('half');
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

  describe('applying effects to actors the user does not own', () => {
    /** A token whose actor the current user does NOT own — e.g. an NPC a player crit. */
    const unownedToken = (): any => {
      const token = createMockToken();
      (token.actor as any).isOwner = false;
      return token;
    };

    it('should route custom conditions through the GM when the actor is not owned', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const token = unownedToken();

      await EffectsManager.applyCondition(token, {
        effectType: 'condition',
        effectCondition: 'spell_locked',
        duration: 1
      });

      // Foundry rejects a direct write, so it must go through Midi's GM socket.
      expect(token.actor.createEmbeddedDocuments).not.toHaveBeenCalled();
      expect(midiExecuteAsGM).toHaveBeenCalledWith(
        'createEffects',
        expect.objectContaining({
          actorUuid: token.actor.uuid,
          effects: expect.arrayContaining([expect.objectContaining({ name: 'Spell_locked' })])
        })
      );
    });

    it('should route standard conditions through the GM when the actor is not owned', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const token = unownedToken();

      await EffectsManager.applyCondition(token, {
        effectType: 'condition',
        effectCondition: 'prone',
        duration: 0
      });

      expect(token.actor.toggleStatusEffect).not.toHaveBeenCalled();
      expect(midiExecuteAsGM).toHaveBeenCalledWith(
        'toggleStatusEffect',
        expect.objectContaining({ actorUuid: token.actor.uuid, statusId: 'prone' })
      );
    });

    it('should route penalties through the GM when the actor is not owned', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const token = unownedToken();

      await EffectsManager.applyPenalty(token, {
        effectType: 'penalty',
        penaltyType: 'ac',
        penaltyValue: -2,
        duration: -1
      });

      expect(midiExecuteAsGM).toHaveBeenCalledWith('createEffects', expect.anything());
    });

    it('should route advantage/disadvantage through the GM when the actor is not owned', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const token = unownedToken();

      await EffectsManager.applyAdvantageDisadvantage(
        token,
        { effectType: 'disadvantage', advantageScope: 'attack.all', duration: 1 },
        'disadvantage'
      );

      expect(midiExecuteAsGM).toHaveBeenCalledWith('createEffects', expect.anything());
    });

    it('should write directly when the user DOES own the actor', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const token = createMockToken();

      await EffectsManager.applyCondition(token, {
        effectType: 'condition',
        effectCondition: 'spell_locked',
        duration: 1
      });

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalled();
      expect(midiExecuteAsGM).not.toHaveBeenCalled();
    });

    it('should warn rather than throw when unowned and no GM socket exists', async () => {
      (globalThis as any).MidiQOL = { applyTokenDamage: jest.fn() };
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const token = unownedToken();

      await EffectsManager.applyCondition(token, {
        effectType: 'condition',
        effectCondition: 'spell_locked',
        duration: 1
      });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no GM socket'));
      warn.mockRestore();
    });
  });

  describe('wild magic surge on the fumble card', () => {
    const surgeResult = (): any => ({
      table: {
        name: 'tier1-spell-fumbles',
        tier: 1,
        attackType: 'spell',
        resultType: 'fumble',
        results: []
      },
      result: {
        name: 'Wild Magic Surge',
        description: 'Your miscast tears a hole in the weave.',
        img: 'icons/test.svg',
        range: [99, 100],
        flags: {
          'dorman-lakelys-crit-fumble-tables': {
            effectType: 'damage',
            damageFormula: '1d6',
            damageType: 'force',
            wildMagic: true
          }
        }
      },
      type: 'fumble',
      attackType: 'spell',
      tier: 1,
      roll: 99
    });

    it('should roll the surge and embed it in the fumble card', async () => {
      const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');
      jest.spyOn(WildMagicRoller, 'roll').mockResolvedValue({
        text: 'You turn into a potted plant.',
        tableName: 'Wild Magic Surge',
        roll: 66
      });
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      await EffectsManager.displayResult(surgeResult(), 'Caster', 'Caster');

      const call = (ChatMessage.create as jest.Mock).mock.calls[0][0] as any;
      // Surge text is part of the fumble card itself, not a second message.
      expect(ChatMessage.create).toHaveBeenCalledTimes(1);
      expect(call.content).toContain('You turn into a potted plant.');
      expect(call.content).toContain('wild-magic-surge');
      expect(call.content).toContain('Wild Magic Surge');
      expect(call.flags['dorman-lakelys-crit-fumble-tables'].wildMagic).toEqual({
        table: 'Wild Magic Surge',
        roll: 66
      });
    });

    it('should still show the card when no surge could be rolled', async () => {
      const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');
      jest.spyOn(WildMagicRoller, 'roll').mockResolvedValue(null);
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      await EffectsManager.displayResult(surgeResult(), 'Caster', 'Caster');

      const call = (ChatMessage.create as jest.Mock).mock.calls[0][0] as any;
      expect(call.content).toContain('Your miscast tears a hole in the weave.');
      expect(call.content).not.toContain('wild-magic-surge');
      expect(call.flags['dorman-lakelys-crit-fumble-tables'].wildMagic).toBeUndefined();
    });

    it('should not roll a surge for results that are not flagged', async () => {
      const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');
      const spy = jest.spyOn(WildMagicRoller, 'roll');
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const plain = surgeResult();
      delete plain.result.flags['dorman-lakelys-crit-fumble-tables'].wildMagic;

      await EffectsManager.displayResult(plain, 'Caster', 'Caster');

      expect(spy).not.toHaveBeenCalled();
    });

    it('should still apply the result own effects alongside the surge', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      // wildMagic is a flag, not an effectType, so the jolt damage still lands.
      await EffectsManager.applyResult(surgeResult(), createMockToken());

      expect(activityUse).toHaveBeenCalled();
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

    /** A weapon on an actor, with an optional dnd5e weapon type. */
    const disarmWeapon = (weaponType?: string) => {
      const weapon: any = {
        id: 'weapon-id',
        type: 'weapon',
        name: 'Longsword',
        parent: null,
        system: { quantity: 1, type: { value: weaponType ?? 'martialM' } },
        update: jest.fn<any>().mockResolvedValue({}),
        toObject: () => ({ name: 'Longsword', type: 'weapon', system: { quantity: 1 } })
      };
      const actor = createMockActor();
      (actor.items as any) = { get: jest.fn().mockReturnValue(weapon) };
      weapon.parent = actor;
      return { weapon, actor };
    };

    /** A token positioned so landing maths are easy to assert. */
    const disarmToken = (x = 1000, y = 1000): any => ({ center: { x, y }, name: 'Fumbler' });

    it('should scatter the weapon by rolled direction and distance', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { weapon, actor } = disarmWeapon();

      await EffectsManager.applyDisarm(actor, weapon, disarmToken());

      // Mock Roll is deterministic: 1d8 -> 4 (southeast), 1d10 -> 5 (1 square).
      expect(weapon.update).toHaveBeenCalledWith({ 'system.equipped': false });
      expect(ChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('southeast') })
      );
    });

    it('should leave the weapon equipped when the disarm is declined', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      (foundry as any).applications.api.DialogV2.confirm.mockResolvedValueOnce(false);
      const { weapon, actor } = disarmWeapon();

      await EffectsManager.applyDisarm(actor, weapon, disarmToken());

      expect(weapon.update).not.toHaveBeenCalled();
      expect(itemPilesCreatePile).not.toHaveBeenCalled();
    });

    it('should treat a dismissed dialog as "keep it"', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      (foundry as any).applications.api.DialogV2.confirm.mockResolvedValueOnce(null);
      const { weapon, actor } = disarmWeapon();

      await EffectsManager.applyDisarm(actor, weapon, disarmToken());

      expect(weapon.update).not.toHaveBeenCalled();
    });

    it('should default natural weapons to "keep it"', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { weapon, actor } = disarmWeapon('natural');

      await EffectsManager.applyDisarm(actor, weapon, disarmToken());

      const config = (foundry as any).applications.api.DialogV2.confirm.mock.calls[0][0];
      expect(config.no.default).toBe(true);
      expect(config.yes.default).toBe(false);
      expect(config.content).toContain('natural weapon');
    });

    it('should default ordinary weapons to "drop it"', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { weapon, actor } = disarmWeapon();

      await EffectsManager.applyDisarm(actor, weapon, disarmToken());

      const config = (foundry as any).applications.api.DialogV2.confirm.mock.calls[0][0];
      expect(config.yes.default).toBe(true);
      expect(config.no.default).toBe(false);
    });

    it('should drop the weapon into an item pile when Item Piles is active', async () => {
      enableItemPiles();
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { weapon, actor } = disarmWeapon();

      await EffectsManager.applyDisarm(actor, weapon, disarmToken(1000, 1000));

      expect(itemPilesCreatePile).toHaveBeenCalledTimes(1);
      const call = itemPilesCreatePile.mock.calls[0][0] as any;
      // 1d8 -> 4 = southeast (+1,+1), 1 square of 100px from (1000,1000) lands
      // at 1100,1100; position is the token's TOP-LEFT, snapped to that square.
      expect(call.position).toEqual({ x: 1100, y: 1100 });
      expect(call.items).toHaveLength(1);
      // The weapon really leaves the sheet.
      expect(itemPilesRemoveItems).toHaveBeenCalledWith(actor, [{ _id: 'weapon-id', quantity: 1 }]);
    });

    it('should only unequip when Item Piles is not installed', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { weapon, actor } = disarmWeapon();

      await EffectsManager.applyDisarm(actor, weapon, disarmToken());

      expect(weapon.update).toHaveBeenCalledWith({ 'system.equipped': false });
      expect(itemPilesCreatePile).not.toHaveBeenCalled();
    });

    it('should stop the weapon at a wall instead of throwing it through', async () => {
      enableItemPiles();
      testCollision.mockReturnValue({ x: 1050, y: 1050 });
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { weapon, actor } = disarmWeapon();

      await EffectsManager.applyDisarm(actor, weapon, disarmToken(1000, 1000));

      const call = itemPilesCreatePile.mock.calls[0][0] as any;
      // Lands short of the unobstructed 1100,1100, pulled back off the wall...
      expect(call.position.x).toBeLessThan(1100);
      expect(call.position.y).toBeLessThan(1100);
      // ...and still sits squarely in a grid square, not on an intersection.
      expect(call.position.x % 100).toBe(0);
      expect(call.position.y % 100).toBe(0);
      expect(ChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('wall') })
      );
    });

    it('should clamp the landing spot to the scene bounds', async () => {
      enableItemPiles();
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { weapon, actor } = disarmWeapon();

      // Standing at the far corner, thrown south-east — would land off-map.
      await EffectsManager.applyDisarm(actor, weapon, disarmToken(3980, 3980));

      const call = itemPilesCreatePile.mock.calls[0][0] as any;
      expect(call.position.x).toBeLessThanOrEqual(4000);
      expect(call.position.y).toBeLessThanOrEqual(4000);
      expect(call.position.x % 100).toBe(0);
      expect(call.position.y % 100).toBe(0);
    });

    it('should still unequip when there is no token to scatter from', async () => {
      enableItemPiles();
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { weapon, actor } = disarmWeapon();

      await EffectsManager.applyDisarm(actor, weapon, undefined);

      expect(weapon.update).toHaveBeenCalledWith({ 'system.equipped': false });
      expect(itemPilesCreatePile).not.toHaveBeenCalled();
    });

    it('should keep the weapon on the sheet if the pile is created but removal fails', async () => {
      enableItemPiles();
      itemPilesRemoveItems.mockRejectedValueOnce(new Error('permission denied'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const { weapon, actor } = disarmWeapon();

      await EffectsManager.applyDisarm(actor, weapon, disarmToken());

      // Loud about the duplicate rather than silently destroying the weapon.
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('exists twice'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should announce in chat when the item is not a weapon', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');
      const notWeapon = { id: 'item-id', type: 'equipment', name: 'Shield' };
      const actor = createMockActor();
      (actor.items as any) = { get: jest.fn().mockReturnValue(notWeapon) };

      await EffectsManager.applyDisarm(actor, notWeapon as any);

      expect(ChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('not a weapon') })
      );
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
            duration: { value: 5, units: 'rounds', expiry: 'targetEnd' }
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
        use: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined)
      };
      const actor: any = {
        name: 'Fumbler',
        items: { get: jest.fn().mockReturnValue(weapon), values: () => [weapon][Symbol.iterator]() }
      };
      return { actor, weapon, sourceItem: { id: 'weapon-id' } as any };
    };

    /** A weapon with explicit reach / normal range bands, in feet. */
    const rangedActor = (reach: number, normal: number) => {
      const weapon = {
        id: 'weapon-id',
        name: 'Javelin',
        type: 'weapon',
        system: { range: { reach, value: normal, long: normal * 4 } },
        use: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined)
      };
      const actor: any = {
        name: 'Fumbler',
        items: { get: jest.fn().mockReturnValue(weapon), values: () => [weapon][Symbol.iterator]() }
      };
      return { actor, weapon, sourceItem: { id: 'weapon-id' } as any };
    };

    it('should only consider allies within reach on a melee fumble', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      // 100px = 1 square = 5ft. In reach; 500px = 25ft, well outside it.
      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const allyNear = makeToken('ally-near', { disposition: 1, x: 100, y: 0, hp: 10 });
      const allyFar = makeToken('ally-far', { disposition: 1, x: 500, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, allyNear, allyFar];

      const { actor, weapon, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'melee');

      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-near']);
      expect(allyFar.setTarget).not.toHaveBeenCalled();
      expect(weapon.use).toHaveBeenCalled();
    });

    it('should reach much further on a ranged fumble than a melee one', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      // Reach 5ft, normal ranged band 30ft. Ally sits at 500px = 25ft:
      // outside reach, inside the ranged band.
      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const ally = makeToken('ally-far', { disposition: 1, x: 500, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, ally];

      const { actor, sourceItem } = rangedActor(5, 30);

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'ranged');

      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-far']);
    });

    it('should not reach that ally on a melee fumble with the same weapon', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const ally = makeToken('ally-far', { disposition: 1, x: 500, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, ally];

      const { actor, weapon, sourceItem } = rangedActor(5, 30);

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'melee');

      expect((game.user as any).updateTokenTargets).not.toHaveBeenCalled();
      expect(weapon.use).not.toHaveBeenCalled();
    });

    it('should use the normal range band, not the long one', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      // normal 30ft, long 120ft. Ally at 1000px = 50ft: beyond normal only.
      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const ally = makeToken('ally-way-out', { disposition: 1, x: 1000, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, ally];

      const { actor, sourceItem } = rangedActor(5, 30);

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'ranged');

      expect((game.user as any).updateTokenTargets).not.toHaveBeenCalled();
    });

    it('should count a diagonal neighbour as being within 5ft reach', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      // Diagonally adjacent: euclidean would be 7.07ft and wrongly excluded.
      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const ally = makeToken('ally-diag', { disposition: 1, x: 100, y: 100, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, ally];

      const { actor, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'melee');

      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-diag']);
    });

    it('should choose randomly among eligible allies, not always the nearest', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      // Three allies all inside a 30ft band; the mock d3 returns 2 -> index 1,
      // which is NOT the nearest, proving selection is not distance-based.
      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const a1 = makeToken('ally-1', { disposition: 1, x: 100, y: 0, hp: 10 });
      const a2 = makeToken('ally-2', { disposition: 1, x: 200, y: 0, hp: 10 });
      const a3 = makeToken('ally-3', { disposition: 1, x: 300, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, a1, a2, a3];

      const { actor, sourceItem } = rangedActor(5, 30);

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'ranged');

      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-2']);
    });

    it('should prefer Foundry grid measurement when it is available', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      // Report everything as 1ft away, so even a distant ally is in reach.
      (canvas as any).grid.measurePath = jest.fn().mockReturnValue({ distance: 1 });
      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const ally = makeToken('ally-far', { disposition: 1, x: 5000, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, ally];

      const { actor, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'melee');

      expect((canvas as any).grid.measurePath).toHaveBeenCalled();
      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-far']);
    });

    it('should exclude tokens of a different disposition', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const enemyNear = makeToken('enemy-near', { disposition: -1, x: 50, y: 0, hp: 10 });
      const allyNear = makeToken('ally-near', { disposition: 1, x: 100, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, enemyNear, allyNear];

      const { actor, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'melee');

      // The nearer enemy is skipped even though it is closer.
      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-near']);
      expect(enemyNear.setTarget).not.toHaveBeenCalled();
    });

    it('should use the spell range band for a fumbled spell, not melee reach', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      // A fumbled Fire Bolt should be able to catch an ally at spell range,
      // not merely one standing within 5ft.
      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const ally = makeToken('ally-far', { disposition: 1, x: 500, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, ally];

      const { actor, sourceItem } = rangedActor(5, 120);

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'spell');

      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-far']);
    });

    it('should not let a forced swing be blocked by the reaction economy', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const ally = makeToken('ally-near', { disposition: 1, x: 100, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, ally];

      const { actor, weapon, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'melee');

      // The module compels this attack, so it must not consume or be gated by
      // the player's reaction.
      expect(weapon.use).toHaveBeenCalledWith(
        expect.objectContaining({
          midiOptions: { workflowOptions: { notReaction: true } }
        })
      );
    });

    it('should not treat an item pile as an ally to attack', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      // Our own disarm effect drops weapons as friendly-disposition pile tokens.
      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const pile = makeToken('dropped-sword', { disposition: 1, x: 50, y: 0 });
      (pile as any).document.flags = { 'item-piles': { data: { enabled: true } } };
      const ally = makeToken('ally-real', { disposition: 1, x: 100, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, pile, ally];

      const { actor, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'melee');

      expect((game.user as any).updateTokenTargets).toHaveBeenCalledWith(['ally-real']);
    });

    it('should exclude downed allies (hp <= 0)', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const fumbler = makeToken('fumbler', { disposition: 1, x: 0, y: 0, hp: 20 });
      const allyDowned = makeToken('ally-downed', { disposition: 1, x: 50, y: 0, hp: 0 });
      const allyUp = makeToken('ally-up', { disposition: 1, x: 100, y: 0, hp: 10 });
      (canvas as any).tokens.placeables = [fumbler, allyDowned, allyUp];

      const { actor, sourceItem } = makeSourceActor();

      await EffectsManager.applyAttackAlly(fumbler, actor, sourceItem, 'melee');

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
