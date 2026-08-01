/**
 * Wild Magic Roller Service
 *
 * Draws a wild magic surge for fumble results flagged `wildMagic`.
 *
 * The draw happens BEHIND THE SCENES: the player is never asked to roll, and
 * the table posts no card of its own. The surge text is returned so it can be
 * folded into the module's own fumble card before that card is displayed.
 */

import { LOG_PREFIX } from '../constants';
import { getWildMagicTable } from '../settings';

export interface WildMagicSurge {
  /** The surge description, as HTML from the table result. */
  text: string;
  /** Name of the table drawn from, for attribution on the card. */
  tableName: string;
  /** The die total that produced this result, if available. */
  roll: number | null;
}

export class WildMagicRoller {
  /**
   * Roll a surge on the configured table.
   * @returns the surge, or null when no table is configured/found or the draw
   *          fails — a missing table simply means no surge, never an error.
   */
  static async roll(): Promise<WildMagicSurge | null> {
    const reference = getWildMagicTable();
    if (!reference) {
      return null;
    }

    const table = await this.resolveTable(reference);
    if (!table) {
      console.warn(`${LOG_PREFIX} Wild magic table "${reference}" not found — skipping surge.`);
      return null;
    }

    try {
      // `roll()` evaluates without posting a chat card, unlike `draw()`.
      const drawn: any = await (table as any).roll();
      const result = drawn?.results?.[0];
      const text = this.readResultText(result);

      if (!text) {
        console.warn(`${LOG_PREFIX} Wild magic table "${table.name}" produced no text.`);
        return null;
      }

      const total = Number(drawn?.roll?.total);
      return {
        text,
        tableName: (table as any).name ?? reference,
        roll: Number.isFinite(total) ? total : null
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to roll a wild magic surge:`, error);
      return null;
    }
  }

  /**
   * Resolve the configured reference to a RollTable.
   *
   * Accepts a UUID (the default points at the PHB 2024 table) or a plain table
   * name, so a GM without that premium module can name Tasha's, the SRD, or a
   * homebrew world table instead. World tables win over compendium ones.
   */
  private static async resolveTable(reference: string): Promise<any | null> {
    // A UUID like "Compendium.pack.RollTable.id" or "RollTable.id"
    if (reference.includes('.')) {
      try {
        const byUuid = await (globalThis as any).fromUuid(reference);
        if (byUuid) {
          return byUuid;
        }
      } catch {
        /* not a usable uuid — fall through to a name search */
      }
    }

    const world = (game as any).tables?.getName?.(reference);
    if (world) {
      return world;
    }

    const packs = (game as any).packs?.filter?.((p: any) => p.documentName === 'RollTable') ?? [];
    for (const pack of packs) {
      try {
        const index = await pack.getIndex();
        const entry = index.find((e: any) => e.name === reference);
        if (entry) {
          return await pack.getDocument(entry._id);
        }
      } catch {
        /* skip unreadable packs */
      }
    }

    return null;
  }

  /**
   * Read the text off a table result across Foundry versions. v13+ migrated
   * TableResult#text to #description; older data may still carry `text`.
   */
  private static readResultText(result: any): string {
    if (!result) {
      return '';
    }
    const raw = result.description ?? result._source?.text ?? result.text ?? result.name ?? '';
    return String(raw).trim();
  }
}
