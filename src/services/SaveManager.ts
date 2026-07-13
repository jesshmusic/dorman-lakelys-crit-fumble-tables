/**
 * Save Manager Service
 * Requests real saving throws for crit/fumble save effects.
 *
 * Player-owned tokens are prompted through Monk's TokenBar when it is active so
 * the owning PLAYER rolls their own save; otherwise (NPCs, or no TokenBar) the
 * GM rolls via the native dnd5e `actor.rollSavingThrow`.
 */

import { LOG_PREFIX } from '../constants';

/**
 * Service that resolves a saving throw to a success/failure boolean.
 */
export class SaveManager {
  /**
   * Request a saving throw for the given token.
   * @returns true when the save SUCCEEDS (the effect should be negated/halved),
   *          false when it FAILS (the effect applies in full).
   */
  static async requestSave(token: Token, ability: string, dc: number): Promise<boolean> {
    const hasMonks =
      (game as any).modules.get('monks-tokenbar')?.active === true &&
      typeof (game as any).MonksTokenBar?.requestRoll === 'function';

    if (hasMonks && (token.actor as any)?.hasPlayerOwner) {
      // Prompt the owning player via Monk's TokenBar, resolving on its callback.
      return await new Promise<boolean>(resolve => {
        let done = false;
        const finish = (v: boolean): void => {
          if (!done) {
            done = true;
            resolve(v);
          }
        };
        (game as any).MonksTokenBar.requestRoll([token], {
          request: { type: 'save', key: ability }, // object form, key = ability id (e.g. 'dex')
          dc,
          showdc: true,
          silent: true,
          callback: (result: any) => {
            const tr =
              result?.tokenresults?.find((t: any) => t.id === token.id) ??
              result?.tokenresults?.[0];
            finish(tr?.passed === true);
          }
        });
        // Fallback: if the player never rolls, the GM auto-rolls after 30s.
        setTimeout(async () => {
          if (!done) finish(await SaveManager.gmRoll(token, ability, dc));
        }, 30000);
      });
    }

    // No Monk's TokenBar, or an NPC / token with no player owner: GM rolls.
    return await SaveManager.gmRoll(token, ability, dc);
  }

  /**
   * Roll the saving throw as the GM using the native dnd5e roller.
   * dnd5e 5.3 `actor.rollSavingThrow({ ability, target: dc }, { configure: false })`
   * returns a D20Roll[] and posts its own chat card; `roll.isSuccess` is
   * `total >= target`.
   * @returns true on success; false when cancelled/no roll (effect applies).
   */
  private static async gmRoll(token: Token, ability: string, dc: number): Promise<boolean> {
    try {
      const rolls = await (token.actor as any).rollSavingThrow(
        { ability, target: dc },
        { configure: false }
      );
      const roll = Array.isArray(rolls) ? rolls[0] : rolls;
      if (!roll) return false; // cancelled/no roll => treat as failed (effect applies)
      return roll.isSuccess ?? roll.total >= dc;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to roll saving throw:`, error);
      return false;
    }
  }
}
