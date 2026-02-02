/**
 * TableSelector Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks, createMockWorkflow, createMockTable } from '../mocks/foundry';

describe('TableSelector', () => {
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

  describe('getAttackType', () => {
    // Tests use D&D5e 5.x activities structure: attack.type.value and attack.type.classification

    it('should return melee for melee weapon attack', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const workflow = createMockWorkflow({
        item: {
          type: 'weapon',
          name: 'Longsword',
          system: {
            activities: new Map([
              [
                'attack1',
                {
                  type: 'attack',
                  attack: { type: { value: 'melee', classification: 'weapon' } }
                }
              ]
            ])
          }
        }
      });

      const result = TableSelector.getAttackType(workflow.item);
      expect(result).toBe('melee');
    });

    it('should return ranged for ranged weapon attack', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const workflow = createMockWorkflow({
        item: {
          type: 'weapon',
          name: 'Longbow',
          system: {
            activities: new Map([
              [
                'attack1',
                {
                  type: 'attack',
                  attack: { type: { value: 'ranged', classification: 'weapon' } }
                }
              ]
            ])
          }
        }
      });

      const result = TableSelector.getAttackType(workflow.item);
      expect(result).toBe('ranged');
    });

    it('should return spell for melee spell attack', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const workflow = createMockWorkflow({
        item: {
          type: 'spell',
          name: 'Shocking Grasp',
          system: {
            activities: new Map([
              [
                'attack1',
                {
                  type: 'attack',
                  attack: { type: { value: 'melee', classification: 'spell' } }
                }
              ]
            ])
          }
        }
      });

      const result = TableSelector.getAttackType(workflow.item);
      expect(result).toBe('spell');
    });

    it('should return spell for ranged spell attack', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const workflow = createMockWorkflow({
        item: {
          type: 'spell',
          name: 'Fire Bolt',
          system: {
            activities: new Map([
              [
                'attack1',
                {
                  type: 'attack',
                  attack: { type: { value: 'ranged', classification: 'spell' } }
                }
              ]
            ])
          }
        }
      });

      const result = TableSelector.getAttackType(workflow.item);
      expect(result).toBe('spell');
    });

    it('should fall back to melee for weapon without activities', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const workflow = createMockWorkflow({
        item: {
          type: 'weapon',
          name: 'Sword',
          system: {}
        }
      });

      const result = TableSelector.getAttackType(workflow.item);
      expect(result).toBe('melee');
    });

    it('should fall back to spell for spell without activities', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const workflow = createMockWorkflow({
        item: {
          type: 'spell',
          name: 'Magic Missile',
          system: {}
        }
      });

      const result = TableSelector.getAttackType(workflow.item);
      expect(result).toBe('spell');
    });
  });

  describe('getTier', () => {
    it('should return tier 1 for levels 1-4', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      expect(TableSelector.getTier(1)).toBe(1);
      expect(TableSelector.getTier(2)).toBe(1);
      expect(TableSelector.getTier(3)).toBe(1);
      expect(TableSelector.getTier(4)).toBe(1);
    });

    it('should return tier 2 for levels 5-8', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      expect(TableSelector.getTier(5)).toBe(2);
      expect(TableSelector.getTier(6)).toBe(2);
      expect(TableSelector.getTier(7)).toBe(2);
      expect(TableSelector.getTier(8)).toBe(2);
    });

    it('should return tier 3 for levels 9-12', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      expect(TableSelector.getTier(9)).toBe(3);
      expect(TableSelector.getTier(10)).toBe(3);
      expect(TableSelector.getTier(11)).toBe(3);
      expect(TableSelector.getTier(12)).toBe(3);
    });

    it('should return tier 4 for levels 13-20', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      expect(TableSelector.getTier(13)).toBe(4);
      expect(TableSelector.getTier(15)).toBe(4);
      expect(TableSelector.getTier(18)).toBe(4);
      expect(TableSelector.getTier(20)).toBe(4);
    });

    it('should use fixed tier when useActorLevel is false', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'useActorLevel') return false;
        if (key === 'fixedTier') return '3';
        return true;
      });

      const { TableSelector } = await import('../../src/services/TableSelector');

      // Even though we pass level 1, it should use fixed tier 3
      expect(TableSelector.getTier(1)).toBe(3);
    });

    it('should use CR for NPCs without level', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      // Pass undefined level but valid CR
      expect(TableSelector.getTier(undefined, 2)).toBe(1); // CR 2 = Tier 1
      expect(TableSelector.getTier(undefined, 5)).toBe(2); // CR 5 = Tier 2
      expect(TableSelector.getTier(undefined, 10)).toBe(3); // CR 10 = Tier 3
      expect(TableSelector.getTier(undefined, 15)).toBe(4); // CR 15 = Tier 4
      expect(TableSelector.getTier(undefined, 30)).toBe(4); // CR 30 = Tier 4
    });

    it('should prefer level over CR when both are provided', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      // Level 5 (Tier 2) should take precedence over CR 20 (would be Tier 4)
      expect(TableSelector.getTier(5, 20)).toBe(2);
    });

    it('should use CR when level is 0', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      // Level 0 means no level (NPC), should fall back to CR
      expect(TableSelector.getTier(0, 8)).toBe(2);
    });
  });

  describe('getTableNameForRoll', () => {
    it('should generate correct table name for tier 1 melee crit', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const name = TableSelector.getTableNameForRoll(1, 'melee', 'crit');
      expect(name).toBe('tier1-melee-crits');
    });

    it('should generate correct table name for tier 2 ranged fumble', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const name = TableSelector.getTableNameForRoll(2, 'ranged', 'fumble');
      expect(name).toBe('tier2-ranged-fumbles');
    });

    it('should generate correct table name for tier 4 spell crit', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const name = TableSelector.getTableNameForRoll(4, 'spell', 'crit');
      expect(name).toBe('tier4-spell-crits');
    });
  });

  describe('findTable', () => {
    it('should find a table by name', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const table = TableSelector.findTable('tier1-melee-crits');
      expect(table).toBeTruthy();
      expect(table?.name).toBe('tier1-melee-crits');
    });

    it('should return null for non-existent table', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const table = TableSelector.findTable('non-existent-table');
      expect(table).toBeNull();
    });
  });

  describe('rollOnTable', () => {
    it('should roll on a table and return a result', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const result = await TableSelector.rollOnTable(1, 'melee', 'crit');

      expect(result).toBeTruthy();
      expect(result?.type).toBe('crit');
      expect(result?.attackType).toBe('melee');
      expect(result?.tier).toBe(1);
      expect(result?.result.name).toBe('Test Result');
    });

    it('should return null if table not found', async () => {
      // Remove the table from the mock
      (game.tables as Map<string, any>).delete('tier1-melee-crits');
      (game.tables as any).getName = (name: string) => (game.tables as Map<string, any>).get(name);

      const { TableSelector } = await import('../../src/services/TableSelector');

      const result = await TableSelector.rollOnTable(1, 'melee', 'crit');
      expect(result).toBeNull();
    });
  });

  describe('rollCriticalHit', () => {
    it('should roll a critical hit using actor level for tier', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      const result = await TableSelector.rollCriticalHit('melee', 5);

      expect(result).toBeTruthy();
      expect(result?.type).toBe('crit');
      expect(result?.tier).toBe(2); // Level 5 = Tier 2
    });
  });

  describe('rollFumble', () => {
    it('should roll a fumble using actor level for tier', async () => {
      const { TableSelector } = await import('../../src/services/TableSelector');

      // Add the fumble table to mock
      (game.tables as Map<string, any>).set(
        'tier2-melee-fumbles',
        createMockTable('tier2-melee-fumbles')
      );

      const result = await TableSelector.rollFumble('melee', 7);

      expect(result).toBeTruthy();
      expect(result?.type).toBe('fumble');
      expect(result?.tier).toBe(2); // Level 7 = Tier 2
    });
  });
});
