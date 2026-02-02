/**
 * Constants Module Tests
 */

import { describe, it, expect } from '@jest/globals';
import {
  MODULE_ID,
  MODULE_NAME,
  TIER_LEVELS,
  ATTACK_TYPES,
  RESULT_TYPES,
  EFFECT_TYPES,
  getTableName,
  getTierFromLevel,
  getTierFromCR
} from '../src/constants';

describe('Constants', () => {
  describe('MODULE_ID', () => {
    it('should be the correct module ID', () => {
      expect(MODULE_ID).toBe('dorman-lakelys-crit-fumble-tables');
    });
  });

  describe('MODULE_NAME', () => {
    it('should be the correct module name', () => {
      expect(MODULE_NAME).toBe("Dorman Lakely's Critical Hit & Fumble Tables");
    });
  });

  describe('TIER_LEVELS', () => {
    it('should have 4 tiers', () => {
      expect(Object.keys(TIER_LEVELS).length).toBe(4);
    });

    it('should have correct tier 1 range (1-4)', () => {
      expect(TIER_LEVELS[1].min).toBe(1);
      expect(TIER_LEVELS[1].max).toBe(4);
    });

    it('should have correct tier 2 range (5-8)', () => {
      expect(TIER_LEVELS[2].min).toBe(5);
      expect(TIER_LEVELS[2].max).toBe(8);
    });

    it('should have correct tier 3 range (9-12)', () => {
      expect(TIER_LEVELS[3].min).toBe(9);
      expect(TIER_LEVELS[3].max).toBe(12);
    });

    it('should have correct tier 4 range (13-20)', () => {
      expect(TIER_LEVELS[4].min).toBe(13);
      expect(TIER_LEVELS[4].max).toBe(20);
    });
  });

  describe('ATTACK_TYPES', () => {
    it('should have melee attack type', () => {
      expect(ATTACK_TYPES.MELEE).toBe('melee');
    });

    it('should have ranged attack type', () => {
      expect(ATTACK_TYPES.RANGED).toBe('ranged');
    });

    it('should have spell attack type', () => {
      expect(ATTACK_TYPES.SPELL).toBe('spell');
    });
  });

  describe('RESULT_TYPES', () => {
    it('should have crit result type', () => {
      expect(RESULT_TYPES.CRIT).toBe('crit');
    });

    it('should have fumble result type', () => {
      expect(RESULT_TYPES.FUMBLE).toBe('fumble');
    });
  });

  describe('EFFECT_TYPES', () => {
    it('should have none effect type', () => {
      expect(EFFECT_TYPES.NONE).toBe('none');
    });

    it('should have condition effect type', () => {
      expect(EFFECT_TYPES.CONDITION).toBe('condition');
    });

    it('should have damage effect type', () => {
      expect(EFFECT_TYPES.DAMAGE).toBe('damage');
    });

    it('should have save effect type', () => {
      expect(EFFECT_TYPES.SAVE).toBe('save');
    });
  });
});

describe('getTableName', () => {
  it('should generate correct name for tier 1 melee crits', () => {
    expect(getTableName(1, 'melee', 'crit')).toBe('tier1-melee-crits');
  });

  it('should generate correct name for tier 2 ranged fumbles', () => {
    expect(getTableName(2, 'ranged', 'fumble')).toBe('tier2-ranged-fumbles');
  });

  it('should generate correct name for tier 3 spell crits', () => {
    expect(getTableName(3, 'spell', 'crit')).toBe('tier3-spell-crits');
  });

  it('should generate correct name for tier 4 melee fumbles', () => {
    expect(getTableName(4, 'melee', 'fumble')).toBe('tier4-melee-fumbles');
  });
});

describe('getTierFromLevel', () => {
  it('should return tier 1 for level 1', () => {
    expect(getTierFromLevel(1)).toBe(1);
  });

  it('should return tier 1 for level 4', () => {
    expect(getTierFromLevel(4)).toBe(1);
  });

  it('should return tier 2 for level 5', () => {
    expect(getTierFromLevel(5)).toBe(2);
  });

  it('should return tier 2 for level 8', () => {
    expect(getTierFromLevel(8)).toBe(2);
  });

  it('should return tier 3 for level 9', () => {
    expect(getTierFromLevel(9)).toBe(3);
  });

  it('should return tier 3 for level 12', () => {
    expect(getTierFromLevel(12)).toBe(3);
  });

  it('should return tier 4 for level 13', () => {
    expect(getTierFromLevel(13)).toBe(4);
  });

  it('should return tier 4 for level 20', () => {
    expect(getTierFromLevel(20)).toBe(4);
  });

  it('should return tier 4 for levels above 20', () => {
    expect(getTierFromLevel(25)).toBe(4);
  });
});

describe('getTierFromCR', () => {
  it('should return tier 1 for CR 0', () => {
    expect(getTierFromCR(0)).toBe(1);
  });

  it('should return tier 1 for CR 1/4 (0.25)', () => {
    expect(getTierFromCR(0.25)).toBe(1);
  });

  it('should return tier 1 for CR 4', () => {
    expect(getTierFromCR(4)).toBe(1);
  });

  it('should return tier 2 for CR 5', () => {
    expect(getTierFromCR(5)).toBe(2);
  });

  it('should return tier 2 for CR 8', () => {
    expect(getTierFromCR(8)).toBe(2);
  });

  it('should return tier 3 for CR 9', () => {
    expect(getTierFromCR(9)).toBe(3);
  });

  it('should return tier 3 for CR 12', () => {
    expect(getTierFromCR(12)).toBe(3);
  });

  it('should return tier 4 for CR 13', () => {
    expect(getTierFromCR(13)).toBe(4);
  });

  it('should return tier 4 for CR 20', () => {
    expect(getTierFromCR(20)).toBe(4);
  });

  it('should return tier 4 for CR 30 (max CR)', () => {
    expect(getTierFromCR(30)).toBe(4);
  });
});
