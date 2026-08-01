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
  PENALTY: 'penalty',
  ADVANTAGE: 'advantage',
  DISADVANTAGE: 'disadvantage',
  /** Fumble: the fumbler is forced to attack their nearest ally */
  ATTACK_ALLY: 'attackAlly'
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
 * Standard D&D 5e conditions that Foundry exposes as built-in status effects.
 * These are toggled via the status-effect system (and can carry durations);
 * anything NOT in this list is treated as a custom Active Effect.
 *
 * Single source of truth — imported by EffectsManager (application) and the
 * TestHarness (cleanup). Keep in sync with dnd5e's status effect ids.
 */
export const STANDARD_CONDITIONS = [
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
] as const;

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
  DAMAGE_CARD_MODE: 'damageCardMode',
  CRIT_SOUND: 'critSound',
  FUMBLE_SOUND: 'fumbleSound',
  TABLES_IMPORTED: 'tablesImported',
  TABLES_VERSION: 'tablesVersion'
} as const;

/**
 * How bonus crit/fumble damage is delivered to chat.
 *
 * ACTIVITY posts the damage through a transient dnd5e damage Activity, which
 * produces a `type: "usage"` message. Midi-QOL only attaches its player-usable
 * `<midi-damage-application>` tray to those, so PLAYERS get an Apply button.
 *
 * ROLL is the legacy path: a bare `Roll#toMessage` card. dnd5e attaches its own
 * `<damage-application>` tray to that, but GM-ONLY — players see a dead card.
 *
 * AUTO picks ACTIVITY when Midi-QOL is active and ROLL otherwise.
 */
export const DAMAGE_CARD_MODES = {
  AUTO: 'auto',
  ACTIVITY: 'activity',
  ROLL: 'roll'
} as const;

export type DamageCardMode = (typeof DAMAGE_CARD_MODES)[keyof typeof DAMAGE_CARD_MODES];

/**
 * Fixed id for the transient damage activity built by EffectsManager. dnd5e
 * requires activity ids to be exactly 16 characters.
 */
export const BONUS_DAMAGE_ACTIVITY_ID = 'dlcfbonusdamage0';

/**
 * The eight compass directions a disarmed weapon can fly, indexed by a 1d8 roll.
 *
 * `dy` is negative for north because canvas y grows downward. The vectors are
 * deliberately NOT normalised: on a square grid one diagonal step is one square,
 * matching how 5e counts diagonal movement.
 */
export const DISARM_DIRECTIONS = [
  { label: 'north', dx: 0, dy: -1 },
  { label: 'northeast', dx: 1, dy: -1 },
  { label: 'east', dx: 1, dy: 0 },
  { label: 'southeast', dx: 1, dy: 1 },
  { label: 'south', dx: 0, dy: 1 },
  { label: 'southwest', dx: -1, dy: 1 },
  { label: 'west', dx: -1, dy: 0 },
  { label: 'northwest', dx: -1, dy: -1 }
] as const;

export type DisarmDirection = (typeof DISARM_DIRECTIONS)[number];

/** Dice used to scatter a disarmed weapon. */
export const DISARM_DIRECTION_DIE = '1d8';
export const DISARM_DISTANCE_DIE = '1d10';

/**
 * Convert a {@link DISARM_DISTANCE_DIE} roll into a distance in GRID SQUARES.
 * 1-8 -> 1 square, 9 -> 2 squares, 10 -> 3 squares.
 */
export function disarmSquaresFromRoll(roll: number): number {
  if (roll >= 10) return 3;
  if (roll === 9) return 2;
  return 1;
}

/**
 * Default sound paths
 */
export const DEFAULT_SOUNDS = {
  CRIT: `modules/${MODULE_ID}/sounds/Stabs-Success.mp3`,
  FUMBLE: `modules/${MODULE_ID}/sounds/Stabs-Fail.mp3`
} as const;

/**
 * External URLs
 */
export const URLS = {
  PATREON: 'https://www.patreon.com/c/DormanLakely',
  DM_GURU: 'https://dungeonmaster.guru'
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
