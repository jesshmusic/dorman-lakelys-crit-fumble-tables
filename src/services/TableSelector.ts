/**
 * Table Selector Service
 * Responsible for selecting the correct table based on tier, attack type, and result type
 */

import {
  ATTACK_TYPES,
  RESULT_TYPES,
  LOG_PREFIX,
  getTableName,
  getTierFromLevel,
  getTierFromCR
} from '../constants';
import { AttackType, ResultType, TierNumber, RolledResult } from '../types';
import { MidiQolItem, isSpellAttack, isRangedAttack } from '../types/midi-qol';
import { useActorLevel, getConfiguredTier } from '../settings';

/**
 * Service for selecting and rolling on crit/fumble tables
 */
export class TableSelector {
  /**
   * Determine the attack type from a Midi-QOL item
   */
  static getAttackType(item: MidiQolItem): AttackType {
    if (isSpellAttack(item)) {
      return ATTACK_TYPES.SPELL;
    }
    if (isRangedAttack(item)) {
      return ATTACK_TYPES.RANGED;
    }
    return ATTACK_TYPES.MELEE;
  }

  /**
   * Determine the tier to use based on settings and actor level/CR
   * For PCs, uses level. For NPCs/monsters, uses Challenge Rating (CR).
   */
  static getTier(actorLevel?: number, actorCR?: number): TierNumber {
    if (useActorLevel()) {
      if (actorLevel !== undefined && actorLevel > 0) {
        return getTierFromLevel(actorLevel) as TierNumber;
      }
      if (actorCR !== undefined && actorCR >= 0) {
        return getTierFromCR(actorCR) as TierNumber;
      }
    }
    return getConfiguredTier() as TierNumber;
  }

  /**
   * Get the table name for a specific configuration
   */
  static getTableNameForRoll(
    tier: TierNumber,
    attackType: AttackType,
    resultType: ResultType
  ): string {
    return getTableName(tier, attackType, resultType);
  }

  /**
   * Find a table by name in the game's tables collection
   */
  static findTable(tableName: string): RollTable | null {
    if (!game.tables) {
      console.error(`${LOG_PREFIX} Game tables not available`);
      return null;
    }

    const worldTable = game.tables.get(tableName) || game.tables.getName(tableName);
    if (worldTable) {
      return worldTable;
    }

    console.warn(`${LOG_PREFIX} Table "${tableName}" not found`);
    return null;
  }

  /**
   * Roll on a specific table and return the result
   */
  static async rollOnTable(
    tier: TierNumber,
    attackType: AttackType,
    resultType: ResultType
  ): Promise<RolledResult | null> {
    const tableName = this.getTableNameForRoll(tier, attackType, resultType);
    const table = this.findTable(tableName);

    if (!table) {
      ui.notifications.error(game.i18n.format('DLCRITFUMBLE.Errors.TableNotFound', { tableName }));
      return null;
    }

    try {
      const draw = await table.draw({ displayChat: false });
      const result = draw.results[0];

      if (!result) {
        console.error(`${LOG_PREFIX} No result from table draw`);
        return null;
      }

      const d100Roll = Math.floor(Math.random() * 100) + 1;

      // Parse name and description from result.text (format: "Name - Description")
      const resultText = result.text || '';
      const dashIndex = resultText.indexOf(' - ');
      const name =
        dashIndex > 0 ? resultText.substring(0, dashIndex) : resultText || 'Unknown Result';
      const description = dashIndex > 0 ? resultText.substring(dashIndex + 3) : '';

      return {
        table: {
          name: table.name,
          description: '',
          tier,
          attackType,
          resultType,
          results: [],
          formula: '1d100'
        },
        result: {
          name,
          description,
          weight: 1,
          range: [d100Roll, d100Roll],
          img: result.img,
          flags: result.flags
        },
        roll: d100Roll,
        type: resultType,
        attackType,
        tier
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Error rolling on table:`, error);
      return null;
    }
  }

  /**
   * Roll a critical hit table
   */
  static async rollCriticalHit(
    attackType: AttackType,
    actorLevel?: number,
    actorCR?: number
  ): Promise<RolledResult | null> {
    const tier = this.getTier(actorLevel, actorCR);
    return this.rollOnTable(tier, attackType, RESULT_TYPES.CRIT);
  }

  /**
   * Roll a fumble table
   */
  static async rollFumble(
    attackType: AttackType,
    actorLevel?: number,
    actorCR?: number
  ): Promise<RolledResult | null> {
    const tier = this.getTier(actorLevel, actorCR);
    return this.rollOnTable(tier, attackType, RESULT_TYPES.FUMBLE);
  }

  /**
   * Get the table name for a given result type, attack type, and actor level/CR
   * Used for testing specific results
   */
  static getTableName(
    resultType: 'crit' | 'fumble',
    attackType: AttackType,
    actorLevel?: number,
    actorCR?: number
  ): string {
    const tier = this.getTier(actorLevel, actorCR);
    return getTableName(tier, attackType, resultType as ResultType);
  }
}
