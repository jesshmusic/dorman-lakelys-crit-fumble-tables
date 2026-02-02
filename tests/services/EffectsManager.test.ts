/**
 * EffectsManager Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks, createMockToken, createMockActor } from '../mocks/foundry';
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

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Prone',
            duration: expect.objectContaining({
              rounds: 2
            })
          })
        ])
      );
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
    it('should create an active effect with correct data', async () => {
      const { EffectsManager } = await import('../../src/services/EffectsManager');

      const token = createMockToken();

      await (EffectsManager as any).applyCondition(token, {
        effectCondition: 'stunned',
        duration: 1
      });

      expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalledWith(
        'ActiveEffect',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Stunned',
            flags: expect.objectContaining({
              'dorman-lakelys-crit-fumble-tables': expect.objectContaining({
                source: 'crit-fumble-result',
                condition: 'stunned'
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
});
