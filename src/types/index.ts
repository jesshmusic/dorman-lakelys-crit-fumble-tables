/**
 * Type exports for the module
 */

export * from './tables';
export type { AttackContext, AttackItem, RollLike, DiceTermLike, DnD5eActivity } from './attack';
export {
  DND5E_HOOKS,
  getActionType,
  isMeleeWeaponAttack,
  isRangedWeaponAttack,
  isMeleeSpellAttack,
  isRangedSpellAttack,
  isSpellAttack,
  isRangedAttack,
  isMeleeAttack
} from './attack';
