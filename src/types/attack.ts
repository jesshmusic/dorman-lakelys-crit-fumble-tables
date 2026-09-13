/**
 * Attack Type Declarations
 * Types for the dnd5e attack roll hook and the context the module builds from it
 */

/**
 * Everything the crit/fumble pipeline needs to know about one attack roll.
 *
 * Built by `AttackHooks` from dnd5e's `dnd5e.rollAttackV2` hook payload, and by
 * the test harness by hand. It deliberately carries only what the handlers
 * read, so a fixture is a handful of fields rather than a whole workflow.
 */
export interface AttackContext {
  /** The actor performing the action */
  actor: Actor;

  /** The item being used (weapon, spell, etc.) */
  item: AttackItem;

  /**
   * The activity driving the attack (D&D5e 4.0+). dnd5e keys its per-attack-type
   * roll modes off the activity's action type, so it is the most reliable
   * source of mwak/rwak/msak/rsak when present.
   */
  activity?: DnD5eActivity;

  /** Every token the rolling user had targeted when the attack was rolled */
  targets: Set<Token>;

  /** The subset of `targets` the roll actually hit (see AttackHooks.computeHitTargets) */
  hitTargets: Set<Token>;

  /** The attack roll result */
  attackRoll?: RollLike;

  /** Whether the attack was a critical hit */
  isCritical?: boolean;

  /** Whether the attack was a fumble */
  isFumble?: boolean;

  /** Resolved action type (mwak/rwak/msak/rsak) when the hook could determine one */
  actionType?: string;
}

/**
 * Activity data in D&D5e 3.0+
 */
export interface DnD5eActivity {
  /** Activity type (e.g., 'attack') */
  type?: string;

  /** Action type (mwak, rwak, msak, rsak, save, etc.) — a getter on dnd5e 5.x */
  actionType?: string;

  /** dnd5e 6.0: action type resolved for a specific attack mode */
  getActionType?(attackMode?: string): string | undefined;

  /** Attack information */
  attack?: {
    type?: {
      value?: string; // 'melee' or 'ranged'
      classification?: string; // 'weapon' or 'spell'
    };
  };
}

/**
 * Item data as seen from the attack context (D&D5e 3.0+)
 */
export interface AttackItem {
  /** Item ID */
  id: string;

  /** Item type (weapon, spell, feat, etc.) */
  type: string;

  /** Item name */
  name: string;

  /** Item system data */
  system: {
    /** Activities collection - D&D5e 3.0+ */
    activities?: Map<string, DnD5eActivity> | { [key: string]: DnD5eActivity };

    /** Attack bonus */
    attackBonus?: number;

    /** Damage configuration */
    damage?: {
      parts: Array<[string, string]>;
    };

    /** Spell level for spells */
    level?: number;

    /** Range information */
    range?: {
      value?: number;
      units?: string;
    };

    /** Whether item is equipped */
    equipped?: boolean;
  };

  /** Update method for modifying the item */
  update?(data: Record<string, any>): Promise<any>;
}

/**
 * The slice of a Foundry Roll (dnd5e D20Roll in practice) the module reads.
 * `isCritical`/`isFumble` are D20Roll getters that honour the crit threshold;
 * `terms` is the raw fallback for extracting the natural d20.
 */
export interface RollLike {
  /** Total result of the roll */
  total: number;

  /** Individual dice terms */
  terms: DiceTermLike[];

  /** The original formula */
  formula: string;

  /** D20Roll: natural crit, threshold-aware */
  isCritical?: boolean;

  /** D20Roll: natural fumble, threshold-aware */
  isFumble?: boolean;

  /** Roll options (dnd5e stores attackMode/advantageMode here) */
  options?: {
    attackMode?: string;
    advantageMode?: number;
    [key: string]: unknown;
  };
}

/**
 * A dice term within a roll
 */
export interface DiceTermLike {
  /** Number of dice */
  number?: number;

  /** Number of faces */
  faces?: number;

  /** Individual die results */
  results?: Array<{
    result: number;
    active: boolean;
  }>;
}

/**
 * dnd5e hook names the module listens to
 */
export const DND5E_HOOKS = {
  /** Fired on the rolling client after an attack roll's chat message is created */
  ROLL_ATTACK: 'dnd5e.rollAttackV2',

  /** Fired on the rolling client before the attack roll dialog */
  PRE_ROLL_ATTACK: 'dnd5e.preRollAttackV2'
} as const;

/**
 * Get the action type from an item (D&D5e 4.0+/5.x with activities system)
 * Returns: 'mwak' | 'rwak' | 'msak' | 'rsak' | undefined
 */
export function getActionType(item: AttackItem): string | undefined {
  if (item.system.activities) {
    const activities = item.system.activities;
    let activityList: DnD5eActivity[] = [];

    if (typeof activities.forEach === 'function') {
      activities.forEach((activity: DnD5eActivity) => {
        activityList.push(activity);
      });
    } else if (activities instanceof Map) {
      activityList = Array.from(activities.values());
    } else if (typeof activities === 'object') {
      activityList = Object.values(activities);
    }

    for (const activity of activityList) {
      if (activity.attack?.type) {
        const attackType = activity.attack.type;
        const isRanged = attackType.value === 'ranged';
        const isSpell = attackType.classification === 'spell';
        if (isSpell) {
          return isRanged ? 'rsak' : 'msak';
        } else {
          return isRanged ? 'rwak' : 'mwak';
        }
      }
    }
  }

  if (item.type === 'spell') {
    return 'rsak';
  }
  if (item.type === 'weapon') {
    return 'mwak';
  }

  return undefined;
}

/**
 * Check if an item is a melee weapon attack
 */
export function isMeleeWeaponAttack(item: AttackItem): boolean {
  return getActionType(item) === 'mwak';
}

/**
 * Check if an item is a ranged weapon attack
 */
export function isRangedWeaponAttack(item: AttackItem): boolean {
  return getActionType(item) === 'rwak';
}

/**
 * Check if an item is a melee spell attack
 */
export function isMeleeSpellAttack(item: AttackItem): boolean {
  return getActionType(item) === 'msak';
}

/**
 * Check if an item is a ranged spell attack
 */
export function isRangedSpellAttack(item: AttackItem): boolean {
  return getActionType(item) === 'rsak';
}

/**
 * Check if an item is any kind of spell attack
 */
export function isSpellAttack(item: AttackItem): boolean {
  const actionType = getActionType(item);
  return actionType === 'msak' || actionType === 'rsak';
}

/**
 * Check if an item is any kind of ranged attack (weapon or spell)
 */
export function isRangedAttack(item: AttackItem): boolean {
  const actionType = getActionType(item);
  return actionType === 'rwak' || actionType === 'rsak';
}

/**
 * Check if an item is any kind of melee attack (weapon or spell)
 */
export function isMeleeAttack(item: AttackItem): boolean {
  const actionType = getActionType(item);
  return actionType === 'mwak' || actionType === 'msak';
}
