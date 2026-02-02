/**
 * Module constants and configuration
 */

export const MODULE_ID = 'dorman-lakelys-crit-fumble-tables';
export const MODULE_NAME = "Dorman Lakely's Critical Hit & Fumble Tables";
export const LOG_PREFIX = 'Dorman Lakely -';

/**
 * Tier level ranges - maps character level to tier number
 */
export const TIER_LEVELS = {
  1: { min: 1, max: 4, name: 'Novice' },
  2: { min: 5, max: 8, name: 'Competent' },
  3: { min: 9, max: 12, name: 'Experienced' },
  4: { min: 13, max: 20, name: 'Legendary' }
} as const;

/**
 * Attack types supported by the tables
 */
export const ATTACK_TYPES = {
  MELEE: 'melee',
  RANGED: 'ranged',
  SPELL: 'spell'
} as const;

/**
 * Result types
 */
export const RESULT_TYPES = {
  CRIT: 'crit',
  FUMBLE: 'fumble'
} as const;

/**
 * Effect types that can be applied from table results
 */
export const EFFECT_TYPES = {
  NONE: 'none',
  CONDITION: 'condition',
  DAMAGE: 'damage',
  SAVE: 'save',
  DISARM: 'disarm',
  PENALTY: 'penalty'
} as const;

/**
 * Supported conditions that can be applied
 */
export const CONDITIONS = {
  PRONE: 'prone',
  STUNNED: 'stunned',
  BLINDED: 'blinded',
  DEAFENED: 'deafened',
  FRIGHTENED: 'frightened',
  GRAPPLED: 'grappled',
  INCAPACITATED: 'incapacitated',
  PARALYZED: 'paralyzed',
  POISONED: 'poisoned',
  RESTRAINED: 'restrained',
  UNCONSCIOUS: 'unconscious',
  EXHAUSTION: 'exhaustion',
  FATIGUED: 'fatigued'
} as const;

/**
 * Damage types for D&D 5e
 */
export const DAMAGE_TYPES = {
  BLUDGEONING: 'bludgeoning',
  PIERCING: 'piercing',
  SLASHING: 'slashing',
  FIRE: 'fire',
  COLD: 'cold',
  LIGHTNING: 'lightning',
  THUNDER: 'thunder',
  POISON: 'poison',
  ACID: 'acid',
  NECROTIC: 'necrotic',
  RADIANT: 'radiant',
  FORCE: 'force',
  PSYCHIC: 'psychic'
} as const;

/**
 * Settings keys
 */
export const SETTINGS = {
  ENABLED: 'enabled',
  ENABLE_CRITS: 'enableCrits',
  ENABLE_FUMBLES: 'enableFumbles',
  APPLY_EFFECTS: 'applyEffects',
  USE_ACTOR_LEVEL: 'useActorLevel',
  FIXED_TIER: 'fixedTier',
  SHOW_CHAT_MESSAGES: 'showChatMessages',
  TABLES_IMPORTED: 'tablesImported'
} as const;

/**
 * Table name pattern - used to find tables in compendiums
 */
export function getTableName(tier: number, attackType: string, resultType: string): string {
  const suffix = resultType === RESULT_TYPES.CRIT ? 'crits' : 'fumbles';
  return `tier${tier}-${attackType}-${suffix}`;
}

/**
 * Determine tier from actor level
 */
export function getTierFromLevel(level: number): number {
  if (level <= 4) return 1;
  if (level <= 8) return 2;
  if (level <= 12) return 3;
  return 4;
}

/**
 * Determine tier from Challenge Rating (for NPCs/monsters)
 * CR 0-4 → Tier 1, CR 5-8 → Tier 2, CR 9-12 → Tier 3, CR 13-30 → Tier 4
 */
export function getTierFromCR(cr: number): number {
  if (cr <= 4) return 1;
  if (cr <= 8) return 2;
  if (cr <= 12) return 3;
  return 4;
}
