/**
 * Type definitions for crit/fumble tables and effects
 */

import { ATTACK_TYPES, EFFECT_TYPES, RESULT_TYPES } from '../constants';

/**
 * Attack type union
 */
export type AttackType = (typeof ATTACK_TYPES)[keyof typeof ATTACK_TYPES];

/**
 * Result type union (crit or fumble)
 */
export type ResultType = (typeof RESULT_TYPES)[keyof typeof RESULT_TYPES];

/**
 * Effect type union
 */
export type EffectType = (typeof EFFECT_TYPES)[keyof typeof EFFECT_TYPES];

/**
 * Tier number (1-4)
 */
export type TierNumber = 1 | 2 | 3 | 4;

/**
 * Penalty type for weapon/armor damage effects
 */
export type PenaltyType = 'ac' | 'attack';

/**
 * Configuration for a table effect
 */
export interface TableEffectConfig {
  /** Type of effect to apply */
  effectType: EffectType;
  /** Condition name if effectType is 'condition' */
  effectCondition?: string;
  /** Damage formula if effectType is 'damage' (e.g., "2d6") */
  damageFormula?: string;
  /** Damage type if effectType is 'damage' */
  damageType?: string;
  /** Duration in rounds for conditions */
  duration?: number;
  /** Save DC if a save is required */
  saveDC?: number;
  /** Save ability (str, dex, con, int, wis, cha) */
  saveAbility?: string;
  /** Description of what happens on failed save */
  failEffect?: string;
  /** Penalty type if effectType is 'penalty' */
  penaltyType?: PenaltyType;
  /** Penalty value (e.g., -2) if effectType is 'penalty' */
  penaltyValue?: number;
}

/**
 * A single result from a crit/fumble table
 */
export interface TableResult {
  /** Display name of the result */
  name: string;
  /** Description text shown to players */
  description: string;
  /** Weight for random selection (1-100 range style) */
  weight: number;
  /** Range for d100 roll [min, max] */
  range: [number, number];
  /** Icon path for display */
  img?: string;
  /** Effect configuration */
  flags?: {
    'dorman-lakelys-crit-fumble-tables'?: TableEffectConfig;
  };
}

/**
 * Complete table definition
 */
export interface CritFumbleTable {
  /** Table name */
  name: string;
  /** Table description */
  description: string;
  /** Tier this table is for */
  tier: TierNumber;
  /** Attack type (melee, ranged, spell) */
  attackType: AttackType;
  /** Result type (crit or fumble) */
  resultType: ResultType;
  /** Array of possible results */
  results: TableResult[];
  /** d100 formula */
  formula: string;
}

/**
 * Rolled result from a table
 */
export interface RolledResult {
  /** The table that was rolled on */
  table: CritFumbleTable;
  /** The specific result that was rolled */
  result: TableResult;
  /** The d100 roll value */
  roll: number;
  /** Whether this was a crit or fumble */
  type: ResultType;
  /** The attack type that triggered this */
  attackType: AttackType;
  /** The tier used */
  tier: TierNumber;
}

/**
 * Options for applying effects
 */
export interface ApplyEffectOptions {
  /** Token to apply effect to */
  token: any;
  /** The rolled result */
  result: RolledResult;
  /** Whether to show chat messages */
  showChat: boolean;
  /** Actor that caused the effect (for tracking) */
  sourceActor?: any;
  /** Item that caused the effect (for disarm effects) */
  sourceItem?: any;
}

/**
 * Source table JSON format (before conversion to Foundry format)
 */
export interface SourceTableJSON {
  name: string;
  description: string;
  img?: string;
  results: Array<{
    type: number;
    text: string;
    weight: number;
    range: [number, number];
    img?: string;
    flags?: {
      'dorman-lakelys-crit-fumble-tables'?: TableEffectConfig;
    };
  }>;
}
