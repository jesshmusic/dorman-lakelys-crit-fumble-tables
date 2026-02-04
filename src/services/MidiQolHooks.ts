/**
 * Midi-QOL Hooks Service
 * Responsible for integrating with Midi-QOL's attack workflow
 */

import { LOG_PREFIX } from '../constants';
import { MidiQolWorkflow, MIDI_QOL_HOOKS, getActionType } from '../types';
import { areCritsEnabled, areFumblesEnabled } from '../settings';
import { TableSelector } from './TableSelector';
import { EffectsManager } from './EffectsManager';

/** Sound effect paths for crit/fumble events */
const SOUNDS = {
  CRIT: 'sounds/combat/epic-start-3hit.ogg',
  FUMBLE: 'sounds/combat/epic-turn-2hit.ogg'
} as const;

/**
 * Service for managing Midi-QOL hook integration
 */
export class MidiQolHooks {
  private static hookId: number | null = null;

  /**
   * Register the Midi-QOL hooks
   */
  static register(): void {
    if (!game.modules.get('midi-qol')?.active) {
      console.error(`${LOG_PREFIX} Midi-QOL is required but not active`);
      ui.notifications.error(game.i18n.localize('DLCRITFUMBLE.Errors.MidiQolRequired'));
      return;
    }

    this.hookId = Hooks.on(
      MIDI_QOL_HOOKS.ATTACK_ROLL_COMPLETE,
      this.onAttackRollComplete.bind(this)
    );

    console.log(`${LOG_PREFIX} Midi-QOL hooks registered`);
  }

  /**
   * Unregister the Midi-QOL hooks
   */
  static unregister(): void {
    if (this.hookId !== null) {
      Hooks.off(MIDI_QOL_HOOKS.ATTACK_ROLL_COMPLETE, this.hookId);
      this.hookId = null;
      console.log(`${LOG_PREFIX} Midi-QOL hooks unregistered`);
    }
  }

  /**
   * Handle the attack roll complete event
   */
  private static async onAttackRollComplete(workflow: MidiQolWorkflow): Promise<void> {
    try {
      const d20Result = this.getD20Result(workflow);
      const isCrit = workflow.isCritical ?? d20Result === 20;
      const isFumble = workflow.isFumble ?? d20Result === 1;
      const attackType = getActionType(workflow.item) || 'unknown';
      const actorLevel = workflow.actor?.system?.details?.level;
      const actorCR = workflow.actor?.system?.details?.cr;
      const tierSource = actorLevel
        ? `Lvl ${actorLevel}`
        : actorCR !== undefined
          ? `CR ${actorCR}`
          : 'fixed';
      const outcome = isCrit ? 'CRIT' : isFumble ? 'FUMBLE' : 'normal';

      console.log(
        `${LOG_PREFIX} ${workflow.actor?.name} (${tierSource}) → ${workflow.item?.name} [${attackType}] d20=${d20Result} → ${outcome}`
      );

      if (isCrit && areCritsEnabled()) {
        await this.handleCriticalHit(workflow);
      }

      if (isFumble && areFumblesEnabled()) {
        await this.handleFumble(workflow);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error handling attack roll:`, error);
    }
  }

  /**
   * Extract the d20 result from a Midi-QOL workflow
   */
  private static getD20Result(workflow: MidiQolWorkflow): number | null {
    if (!workflow.attackRoll) {
      return null;
    }

    const d20Term = workflow.attackRoll.terms.find(
      term => term.faces === 20 && term.results && term.results.length > 0
    );

    if (!d20Term || !d20Term.results || d20Term.results.length === 0) {
      return null;
    }

    const activeResult = d20Term.results.find(r => r.active);
    return activeResult?.result ?? null;
  }

  /**
   * Handle a critical hit
   */
  private static async handleCriticalHit(workflow: MidiQolWorkflow): Promise<void> {
    foundry.audio.AudioHelper.play({ src: SOUNDS.CRIT, volume: 0.8 }, true);

    const attackType = TableSelector.getAttackType(workflow.item);
    const actorLevel = workflow.actor?.system?.details?.level;
    const actorCR = workflow.actor?.system?.details?.cr;

    const result = await TableSelector.rollCriticalHit(attackType, actorLevel, actorCR);
    if (!result) {
      console.warn(`${LOG_PREFIX} Crit table not found for ${attackType}`);
      return;
    }

    const targets = workflow.hitTargets || workflow.targets || new Set();
    const targetNames = targets.size > 0 ? [...targets].map(t => t.name).join(', ') : 'no target';

    console.log(`${LOG_PREFIX} Crit result: "${result.result.name}" → ${targetNames}`);

    if (targets.size === 0) {
      await EffectsManager.displayResult(result, workflow.actor?.name || 'Unknown', 'their target');
      return;
    }

    for (const targetToken of targets) {
      await EffectsManager.displayResult(
        result,
        workflow.actor?.name || 'Unknown',
        targetToken.name || 'Unknown'
      );
      await EffectsManager.applyResult(result, targetToken, workflow.actor, workflow.item);
    }
  }

  /**
   * Handle a fumble
   */
  private static async handleFumble(workflow: MidiQolWorkflow): Promise<void> {
    foundry.audio.AudioHelper.play({ src: SOUNDS.FUMBLE, volume: 0.8 }, true);

    const attackType = TableSelector.getAttackType(workflow.item);
    const actorLevel = workflow.actor?.system?.details?.level;
    const actorCR = workflow.actor?.system?.details?.cr;

    const result = await TableSelector.rollFumble(attackType, actorLevel, actorCR);
    if (!result) {
      console.warn(`${LOG_PREFIX} Fumble table not found for ${attackType}`);
      return;
    }

    const actorTokens = workflow.actor?.getActiveTokens();
    const actorToken = actorTokens?.[0];

    if (!actorToken) {
      console.warn(`${LOG_PREFIX} No token found for fumbling actor`);
      return;
    }

    // Get target tokens - needed for "grants" effects that should apply to targets
    const targetTokens = [...(workflow.targets || [])];

    console.log(`${LOG_PREFIX} Fumble result: "${result.result.name}" → ${workflow.actor?.name}`);

    await EffectsManager.displayResult(
      result,
      workflow.actor?.name || 'Unknown',
      workflow.actor?.name || 'themselves'
    );

    await EffectsManager.applyFumbleResult(
      result,
      actorToken,
      targetTokens,
      workflow.actor,
      workflow.item
    );
  }

  /**
   * Test method: Simulate a critical hit using the actual code path
   * @param attacker - The attacking actor
   * @param targetToken - The target token
   * @param attackType - Type of attack ('melee', 'ranged', 'spell')
   * @param weaponItem - Optional weapon item for disarm effects
   */
  static async testCriticalHit(
    attacker: Actor,
    targetToken: Token,
    attackType: 'melee' | 'ranged' | 'spell' = 'melee',
    weaponItem?: Item
  ): Promise<void> {
    const mockWorkflow: MidiQolWorkflow = {
      actor: attacker,
      item: weaponItem || this.findWeaponForAttackType(attacker, attackType),
      targets: new Set([targetToken]),
      hitTargets: new Set([targetToken]),
      attackRoll: {
        total: 20,
        formula: '1d20',
        terms: [{ faces: 20, results: [{ result: 20, active: true }] }]
      },
      isCritical: true,
      isFumble: false
    };

    console.log(
      `${LOG_PREFIX} [TEST] Simulating critical hit: ${attacker.name} → ${targetToken.name} [${attackType}]`
    );
    await this.handleCriticalHit(mockWorkflow);
  }

  /**
   * Test method: Simulate a fumble using the actual code path
   * @param actor - The fumbling actor
   * @param targetToken - Optional target token (for effects that apply to defender)
   * @param attackType - Type of attack ('melee', 'ranged', 'spell')
   * @param weaponItem - Optional weapon item for disarm effects
   */
  static async testFumble(
    actor: Actor,
    targetToken?: Token,
    attackType: 'melee' | 'ranged' | 'spell' = 'melee',
    weaponItem?: Item
  ): Promise<void> {
    const targets = targetToken ? new Set([targetToken]) : new Set<Token>();
    const mockWorkflow: MidiQolWorkflow = {
      actor: actor,
      item: weaponItem || this.findWeaponForAttackType(actor, attackType),
      targets: targets,
      hitTargets: new Set(),
      attackRoll: {
        total: 1,
        formula: '1d20',
        terms: [{ faces: 20, results: [{ result: 1, active: true }] }]
      },
      isCritical: false,
      isFumble: true
    };

    const targetName = targetToken?.name || 'no target';
    console.log(
      `${LOG_PREFIX} [TEST] Simulating fumble: ${actor.name} → ${targetName} [${attackType}]`
    );
    await this.handleFumble(mockWorkflow);
  }

  /**
   * Find a weapon on the actor matching the attack type
   */
  private static findWeaponForAttackType(actor: Actor, attackType: string): any {
    const items = [...(actor.items?.values() || [])] as any[];
    const weapons = items.filter((i: any) => i.type === 'weapon');

    for (const weapon of weapons) {
      const activities = weapon.system?.activities;
      if (activities) {
        for (const activity of Object.values(activities) as any[]) {
          if (activity.type === 'attack') {
            const atkType = activity.attack?.type?.value;
            if (attackType === 'melee' && atkType === 'melee') return weapon;
            if (attackType === 'ranged' && atkType === 'ranged') return weapon;
          }
        }
      }

      const actionType = weapon.system?.actionType;
      if (attackType === 'melee' && actionType === 'mwak') return weapon;
      if (attackType === 'ranged' && actionType === 'rwak') return weapon;
      if (attackType === 'spell' && (actionType === 'msak' || actionType === 'rsak')) return weapon;
    }

    return weapons[0] || null;
  }
}
