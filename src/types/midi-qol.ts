/**
 * Midi-QOL Type Declarations
 * Types for the Midi-QOL module's workflow and hooks
 */

/**
 * Midi-QOL Workflow object passed to hooks
 */
export interface MidiQolWorkflow {
  /** The actor performing the action */
  actor: Actor;

  /** The item being used (weapon, spell, etc.) */
  item: MidiQolItem;

  /** Set of targeted tokens */
  targets: Set<Token>;

  /** The attack roll result */
  attackRoll?: MidiQolRoll;

  /** Whether the attack was a critical hit */
  isCritical?: boolean;

  /** Whether the attack was a fumble */
  isFumble?: boolean;

  /** The damage rolls */
  damageRolls?: MidiQolRoll[];

  /** Total damage dealt */
  damageTotal?: number;

  /** Tokens that were hit */
  hitTargets?: Set<Token>;

  /** Tokens that failed saves */
  failedSaves?: Set<Token>;

  /** Advantage/disadvantage state */
  advantage?: boolean;
  disadvantage?: boolean;

  /** The speaker data for chat messages */
  speaker?: any;
}

/**
 * Activity data in D&D5e 3.0+
 */
export interface DnD5eActivity {
  /** Activity type (e.g., 'attack') */
  type?: string;

  /** Action type (mwak, rwak, msak, rsak, save, etc.) */
  actionType?: string;

  /** Attack information */
  attack?: {
    type?: {
      value?: string; // 'melee' or 'ranged'
      classification?: string; // 'weapon' or 'spell'
    };
  };
}

/**
 * Item data in Midi-QOL context (D&D5e 3.0+)
 */
export interface MidiQolItem {
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
 * Roll result in Midi-QOL context
 */
export interface MidiQolRoll {
  /** Total result of the roll */
  total: number;

  /** Individual dice terms */
  terms: MidiQolDiceTerm[];

  /** The original formula */
  formula: string;
}

/**
 * A dice term within a roll
 */
export interface MidiQolDiceTerm {
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
 * Midi-QOL hook names
 */
export const MIDI_QOL_HOOKS = {
  /** Fired when an attack roll is complete */
  ATTACK_ROLL_COMPLETE: 'midi-qol.AttackRollComplete',

  /** Fired when damage is rolled */
  DAMAGE_ROLL_COMPLETE: 'midi-qol.DamageRollComplete',

  /** Fired when the entire roll workflow completes */
  ROLL_COMPLETE: 'midi-qol.RollComplete',

  /** Fired before damage is applied */
  PRE_DAMAGE_ROLL: 'midi-qol.preDamageRoll',

  /** Fired after damage is applied */
  POST_DAMAGE_ROLL: 'midi-qol.postDamageRoll'
} as const;

/**
 * Get the action type from an item (D&D5e 4.0+/5.x with activities system)
 * Returns: 'mwak' | 'rwak' | 'msak' | 'rsak' | undefined
 */
export function getActionType(item: MidiQolItem): string | undefined {
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
export function isMeleeWeaponAttack(item: MidiQolItem): boolean {
  return getActionType(item) === 'mwak';
}

/**
 * Check if an item is a ranged weapon attack
 */
export function isRangedWeaponAttack(item: MidiQolItem): boolean {
  return getActionType(item) === 'rwak';
}

/**
 * Check if an item is a melee spell attack
 */
export function isMeleeSpellAttack(item: MidiQolItem): boolean {
  return getActionType(item) === 'msak';
}

/**
 * Check if an item is a ranged spell attack
 */
export function isRangedSpellAttack(item: MidiQolItem): boolean {
  return getActionType(item) === 'rsak';
}

/**
 * Check if an item is any kind of spell attack
 */
export function isSpellAttack(item: MidiQolItem): boolean {
  const actionType = getActionType(item);
  return actionType === 'msak' || actionType === 'rsak';
}

/**
 * Check if an item is any kind of ranged attack (weapon or spell)
 */
export function isRangedAttack(item: MidiQolItem): boolean {
  const actionType = getActionType(item);
  return actionType === 'rwak' || actionType === 'rsak';
}

/**
 * Check if an item is any kind of melee attack (weapon or spell)
 */
export function isMeleeAttack(item: MidiQolItem): boolean {
  const actionType = getActionType(item);
  return actionType === 'mwak' || actionType === 'msak';
}
