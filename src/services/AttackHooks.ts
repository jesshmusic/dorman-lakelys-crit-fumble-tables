/**
 * Attack Hooks Service
 * Responsible for integrating with dnd5e's native attack roll hook
 */

import { LOG_PREFIX } from '../constants';
import { AttackContext, DnD5eActivity, DND5E_HOOKS, RollLike, getActionType } from '../types';
import { areCritsEnabled, areFumblesEnabled, getCritSound, getFumbleSound } from '../settings';
import { TableSelector } from './TableSelector';
import { EffectsManager } from './EffectsManager';
import { CritSuppression } from './CritSuppression';

/**
 * Service for managing the dnd5e attack roll hook integration
 */
export class AttackHooks {
  private static hookId: number | null = null;

  /**
   * Re-entrancy guard. Set true immediately before the module solicits an
   * attack on the fumbler's behalf (the "attack nearest ally" fumble). The next
   * attack roll is then skipped so that forced attack cannot itself roll a
   * crit/fumble and recurse.
   */
  static suppressNextWorkflow = false;

  /**
   * Register the dnd5e attack roll hook.
   *
   * `dnd5e.rollAttackV2` fires on the ROLLING client only, after the attack's
   * chat message exists. That is the same client Midi-QOL's workflow used to
   * fire on, so effect application keeps its existing owner/GM routing.
   */
  static register(): void {
    this.hookId = Hooks.on(DND5E_HOOKS.ROLL_ATTACK, this.onRollAttack.bind(this));

    console.log(`${LOG_PREFIX} dnd5e attack hooks registered`);
  }

  /**
   * Unregister the dnd5e attack roll hook
   */
  static unregister(): void {
    if (this.hookId !== null) {
      Hooks.off(DND5E_HOOKS.ROLL_ATTACK, this.hookId);
      this.hookId = null;
      console.log(`${LOG_PREFIX} dnd5e attack hooks unregistered`);
    }
  }

  /**
   * Handle `dnd5e.rollAttackV2`.
   * @param rolls - The D20Rolls produced by the attack (one per attack in practice)
   * @param data - `subject` is the AttackActivity that rolled
   */
  private static async onRollAttack(
    rolls: RollLike[] | undefined,
    data?: { subject?: (DnD5eActivity & { actor?: Actor; item?: any }) | null }
  ): Promise<void> {
    try {
      // Skip crit/fumble handling for an attack the module itself solicited
      // (e.g. the "attack nearest ally" fumble), preventing recursion.
      if (this.suppressNextWorkflow) {
        this.suppressNextWorkflow = false;
        console.log(`${LOG_PREFIX} Skipping crit/fumble for module-solicited attack`);
        return;
      }

      const ctx = this.buildContext(rolls, data?.subject);
      if (!ctx) {
        return;
      }

      const d20Result = this.getD20Result(ctx);
      const attackType = ctx.actionType || 'unknown';
      const actorLevel = ctx.actor?.system?.details?.level;
      const actorCR = ctx.actor?.system?.details?.cr;
      const tierSource = actorLevel
        ? `Lvl ${actorLevel}`
        : actorCR !== undefined
          ? `CR ${actorCR}`
          : 'fixed';
      const outcome = ctx.isCritical ? 'CRIT' : ctx.isFumble ? 'FUMBLE' : 'normal';

      console.log(
        `${LOG_PREFIX} ${ctx.actor?.name} (${tierSource}) → ${ctx.item?.name} [${attackType}] d20=${d20Result} → ${outcome}`
      );

      if (ctx.isCritical && areCritsEnabled()) {
        await this.handleCriticalHit(ctx);
      }

      if (ctx.isFumble && areFumblesEnabled()) {
        await this.handleFumble(ctx);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error handling attack roll:`, error);
    }
  }

  /**
   * Turn the raw hook payload into an `AttackContext`.
   * Returns null when the payload cannot be attributed to an actor and item —
   * there is nothing to roll a table for without them.
   */
  private static buildContext(
    rolls: RollLike[] | undefined,
    subject: (DnD5eActivity & { actor?: Actor; item?: any }) | null | undefined
  ): AttackContext | null {
    const actor = subject?.actor;
    const item = subject?.item;
    if (!subject || !actor || !item) {
      console.log(`${LOG_PREFIX} Attack roll has no activity/actor/item — skipping`);
      return null;
    }

    const attackRoll = Array.isArray(rolls) && rolls.length > 0 ? rolls[0] : undefined;
    const d20Result = this.getD20Result({ attackRoll });

    // D20Roll's `isCritical`/`isFumble` honour the crit threshold, so the raw
    // natural 20/1 is only a fallback for rolls that carry neither getter. `??`
    // keeps an explicit `false`, and `handleCriticalHit` re-checks
    // `noCritical` per target either way, so a protected target is spared even
    // when this fallback fired.
    const isCritical = attackRoll?.isCritical ?? d20Result === 20;
    const isFumble = attackRoll?.isFumble ?? d20Result === 1;

    // dnd5e 6.0 resolves the action type per attack mode (thrown weapons flip
    // mwak → rwak); 5.x exposes a plain getter; the item helper is the last
    // resort for anything older or hand-built.
    const attackMode = attackRoll?.options?.attackMode;
    const actionType =
      subject.getActionType?.(attackMode) ?? subject.actionType ?? getActionType(item);

    const targets = new Set<Token>(game.user?.targets ?? []);
    const hitTargets = this.computeHitTargets(targets, attackRoll, isCritical, isFumble);

    return {
      actor,
      item,
      activity: subject,
      targets,
      hitTargets,
      attackRoll,
      isCritical,
      isFumble,
      actionType
    };
  }

  /**
   * Which of the user's targets did the roll hit?
   *
   * dnd5e has no hit-target set of its own; its attack card evaluates each
   * target on render (`AttackMessageData#evaluatedTargets`). This mirrors that
   * logic so the module agrees with what the card shows: total cover is always
   * a miss, a crit hits everything else, a fumble hits nothing, and otherwise
   * the total is compared against AC. A target with no AC at all (a loot actor,
   * say) is a miss, exactly as on the card.
   */
  private static computeHitTargets(
    targets: Set<Token>,
    attackRoll: RollLike | undefined,
    isCritical: boolean,
    isFumble: boolean
  ): Set<Token> {
    const hits = new Set<Token>();
    if (!attackRoll) {
      return hits;
    }

    for (const token of targets) {
      const actor = token?.actor as any;
      if (!actor) {
        continue;
      }
      const ac: number | null = actor.statuses?.has?.('coverTotal')
        ? null
        : (actor.system?.attributes?.ac?.value ?? null);
      const isMiss = ac === null || (!isCritical && (attackRoll.total < ac || isFumble));
      if (!isMiss) {
        hits.add(token);
      }
    }

    return hits;
  }

  /**
   * Extract the natural d20 result from an attack context.
   * Works on a real D20Roll (`roll.terms` holds a D20Die with `faces: 20`) and
   * on the plain fixture shape the test harness builds.
   */
  private static getD20Result(ctx: Pick<AttackContext, 'attackRoll'>): number | null {
    if (!ctx.attackRoll) {
      return null;
    }

    const terms = ctx.attackRoll.terms;
    if (!Array.isArray(terms)) {
      return null;
    }

    const d20Term = terms.find(
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
  private static async handleCriticalHit(ctx: AttackContext): Promise<void> {
    const hitTargets = ctx.hitTargets || ctx.targets || new Set<Token>();

    // Re-check each target so one adamantine-armored creature is spared even
    // when the rest of the group is not. Done before the sound so a fully
    // suppressed crit is silent: no roll, no sound, no card.
    const targets = CritSuppression.filterCritTargets(hitTargets, ctx);

    if (hitTargets.size > 0 && targets.length === 0) {
      console.log(`${LOG_PREFIX} Crit cancelled — every hit target grants no critical`);
      return;
    }

    const critSound = getCritSound();
    if (critSound) {
      foundry.audio.AudioHelper.play({ src: critSound, volume: 0.8 }, true);
    }

    const attackType = TableSelector.getAttackType(ctx.item);
    const actorLevel = ctx.actor?.system?.details?.level;
    const actorCR = ctx.actor?.system?.details?.cr;

    const result = await TableSelector.rollCriticalHit(attackType, actorLevel, actorCR);
    if (!result) {
      console.warn(`${LOG_PREFIX} Crit table not found for ${attackType}`);
      return;
    }

    const targetNames = targets.length > 0 ? targets.map(t => t.name).join(', ') : 'no target';

    console.log(`${LOG_PREFIX} Crit result: "${result.result.name}" → ${targetNames}`);

    if (targets.length === 0) {
      await EffectsManager.displayResult(result, ctx.actor?.name || 'Unknown', 'their target');
      return;
    }

    for (const targetToken of targets) {
      await EffectsManager.displayResult(
        result,
        ctx.actor?.name || 'Unknown',
        targetToken.name || 'Unknown'
      );
      await EffectsManager.applyResult(result, targetToken, ctx.actor, ctx.item);
    }
  }

  /**
   * Handle a fumble
   */
  private static async handleFumble(ctx: AttackContext): Promise<void> {
    const fumbleSound = getFumbleSound();
    if (fumbleSound) {
      foundry.audio.AudioHelper.play({ src: fumbleSound, volume: 0.8 }, true);
    }

    const attackType = TableSelector.getAttackType(ctx.item);
    const actorLevel = ctx.actor?.system?.details?.level;
    const actorCR = ctx.actor?.system?.details?.cr;

    const result = await TableSelector.rollFumble(attackType, actorLevel, actorCR);
    if (!result) {
      console.warn(`${LOG_PREFIX} Fumble table not found for ${attackType}`);
      return;
    }

    const actorTokens = ctx.actor?.getActiveTokens();
    const actorToken = actorTokens?.[0];

    if (!actorToken) {
      console.warn(`${LOG_PREFIX} No token found for fumbling actor`);
      return;
    }

    // Get target tokens - needed for "grants" effects that should apply to targets
    const targetTokens = [...(ctx.targets || [])];

    console.log(`${LOG_PREFIX} Fumble result: "${result.result.name}" → ${ctx.actor?.name}`);

    await EffectsManager.displayResult(
      result,
      ctx.actor?.name || 'Unknown',
      ctx.actor?.name || 'themselves'
    );

    await EffectsManager.applyFumbleResult(result, actorToken, targetTokens, ctx.actor, ctx.item);
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
    const mockContext: AttackContext = {
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
    await this.handleCriticalHit(mockContext);
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
    const mockContext: AttackContext = {
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
    await this.handleFumble(mockContext);
  }

  /**
   * Find a weapon on the actor matching the attack type
   * Public so the test harness can resolve a source item for damage effects.
   */
  static findWeaponForAttackType(actor: Actor, attackType: string): any {
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
