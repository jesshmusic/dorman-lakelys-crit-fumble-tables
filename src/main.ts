/**
 * Dorman Lakely's Critical Hit & Fumble Tables
 * Entry point for the FoundryVTT module
 */

import { MODULE_ID, LOG_PREFIX } from './constants';
import { registerSettings, injectSoundPreviewButtons, getFumbleSound } from './settings';
import { MidiQolHooks, TableImporter, TestHarness } from './services';
import buildInfo from '../build-info.json';

const buildNumber = buildInfo.buildNumber;
const MODULE_TITLE = "Dorman Lakely's Crit/Fumble Tables";

/**
 * Get the module version from the game API
 */
function getModuleVersion(): string {
  return game.modules.get(MODULE_ID)?.version ?? 'unknown';
}

/**
 * Log styled module message to console
 */
function logModuleHeader(): void {
  const version = getModuleVersion();
  console.log(
    '%c⚔️ ' + MODULE_TITLE + ' %cv' + version + ' %c(build ' + buildNumber + ')',
    'color: #d32f2f; font-weight: bold; font-size: 16px;',
    'color: #ff9800; font-weight: bold; font-size: 14px;',
    'color: #ffeb3b; font-weight: normal; font-size: 12px;'
  );
}

/**
 * Log ready message to console
 */
function logModuleReady(): void {
  console.log(
    '%c⚔️ ' + MODULE_TITLE + ' %c✓ Ready!',
    'color: #d32f2f; font-weight: bold; font-size: 16px;',
    'color: #4caf50; font-weight: bold; font-size: 14px;'
  );
}

/**
 * Compare an installed dependency's declared Foundry compatibility against
 * the running Foundry core version and surface a user-visible notification
 * if the dep declares itself incompatible. Only fires for deps that ARE
 * installed and active — the existing "midi-qol not active" error path
 * above handles the not-installed case.
 *
 * This exists because upstream modules can lag behind Foundry major
 * releases (declaring themselves v13-only in their manifest) but still be
 * installed and active on a v14 world. The warning tells the user which
 * specific dep is stale, not just "something is broken."
 */
function warnIfDepOutdated(depId: string, displayName: string): void {
  const mod = (game as any).modules?.get(depId);
  if (!mod || !mod.active) {
    // Existing "not installed" / "not active" paths already handle these.
    return;
  }

  const coreMajor =
    (game as any).release?.generation ?? parseInt(String((game as any).version ?? '0'), 10);
  if (!coreMajor || Number.isNaN(coreMajor)) return;

  const parseMajor = (v: unknown): number | null => {
    if (v == null) return null;
    const m = String(v).match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  };

  const compat = mod.compatibility ?? {};
  const depMax = parseMajor(compat.maximum);
  const depVerified = parseMajor(compat.verified);

  // Hard cap below current Foundry major → permanent warning
  if (depMax != null && depMax < coreMajor) {
    ui.notifications?.warn(
      `${MODULE_TITLE}: ${displayName} v${mod.version} declares Foundry v${compat.maximum} as its maximum, ` +
        `but you are running Foundry v${(game as any).version}. Expect bugs until ${displayName} ships an update.`,
      { permanent: true }
    );
    return;
  }

  // No hard cap but verified is behind → transient warning
  if (depVerified != null && depVerified < coreMajor) {
    ui.notifications?.warn(
      `${MODULE_TITLE}: ${displayName} v${mod.version} is only verified for Foundry v${compat.verified}. ` +
        `You're running v${(game as any).version} — some features may not work until ${displayName} ships a v${coreMajor}-verified release.`,
      { permanent: false }
    );
  }
}

/**
 * Initialize the module
 */
Hooks.once('init', function () {
  logModuleHeader();
  registerSettings();
});

/**
 * Module ready - set up hooks and verify dependencies
 */
Hooks.once('ready', async function () {
  if (!game.modules.get('midi-qol')?.active) {
    console.error(`${LOG_PREFIX} ERROR: Midi-QOL is required but not active`);
    ui.notifications.error(game.i18n.localize('DLCRITFUMBLE.Errors.MidiQolRequired'));
    return;
  }

  // Midi-QOL is installed and active — warn loudly if its manifest
  // declares itself incompatible with the running Foundry version.
  warnIfDepOutdated('midi-qol', 'Midi QoL');

  await TableImporter.importTables();
  await TableImporter.checkForUpdates();
  MidiQolHooks.register();
  logModuleReady();
});

/**
 * Handle module settings changes
 */
Hooks.on('updateSetting', (setting: { key: string }) => {
  if (setting.key.startsWith(MODULE_ID)) {
    console.log(`${LOG_PREFIX} Setting changed: ${setting.key}`);
  }
});

/**
 * Inject sound preview buttons when settings panel renders.
 * Foundry v14 SettingsConfig is ApplicationV2 and the renderSettingsConfig
 * hook now passes a single HTMLElement (no jQuery wrapper).
 */
Hooks.on('renderSettingsConfig', (_app: unknown, html: HTMLElement) => {
  injectSoundPreviewButtons(html);
});

export { TableSelector, EffectsManager, MidiQolHooks, TableImporter } from './services';

if (typeof globalThis !== 'undefined') {
  (globalThis as any).DormanLakely = {
    /**
     * Simulate a critical hit using the ACTUAL MidiQolHooks code path
     * @param attackerName - Name of actor making the attack (e.g., "Daevon")
     * @param targetName - Name of token to target (optional, uses first on canvas)
     * @param attackType - Type of attack: 'melee', 'ranged', or 'spell'
     */
    async simulateCrit(
      attackerName: string = 'Daevon',
      targetName?: string,
      attackType: 'melee' | 'ranged' | 'spell' = 'melee'
    ) {
      const { MidiQolHooks } = await import('./services/MidiQolHooks');

      const attacker = (game as any).actors?.getName(attackerName);
      if (!attacker) {
        console.error(
          `${LOG_PREFIX} Actor "${attackerName}" not found. Use DormanLakely.listActors() to see available actors.`
        );
        return null;
      }

      let targetToken: any = null;
      if (targetName) {
        targetToken = canvas.tokens.placeables.find((t: any) => t.name === targetName);
      }
      if (!targetToken) {
        targetToken = (canvas as any).tokens?.controlled?.[0];
      }
      if (!targetToken) {
        targetToken = canvas.tokens.placeables.find((t: any) => t.actor?.name !== attackerName);
      }
      if (!targetToken) {
        console.error(`${LOG_PREFIX} No target token found. Place tokens on the canvas first.`);
        return null;
      }

      await MidiQolHooks.testCriticalHit(attacker, targetToken, attackType);
    },

    /**
     * Simulate a fumble using the ACTUAL MidiQolHooks code path
     * @param actorName - Name of actor fumbling (e.g., "Nimrod")
     * @param targetName - Name of target token (optional, needed for "grants" effects)
     * @param attackType - Type of attack: 'melee', 'ranged', or 'spell'
     */
    async simulateFumble(
      actorName: string = 'Nimrod',
      targetName?: string,
      attackType: 'melee' | 'ranged' | 'spell' = 'melee'
    ) {
      const { MidiQolHooks } = await import('./services/MidiQolHooks');

      const actor = (game as any).actors?.getName(actorName);
      if (!actor) {
        console.error(
          `${LOG_PREFIX} Actor "${actorName}" not found. Use DormanLakely.listActors() to see available actors.`
        );
        return null;
      }

      let targetToken: any = null;
      if (targetName) {
        targetToken = canvas.tokens.placeables.find((t: any) => t.name === targetName);
        if (!targetToken) {
          console.warn(`${LOG_PREFIX} Target "${targetName}" not found on canvas.`);
        }
      }

      await MidiQolHooks.testFumble(actor, targetToken, attackType);
    },

    /**
     * List available actors for testing
     */
    listActors() {
      const actors = [...((game as any).actors?.values() || [])];
      console.log(`${LOG_PREFIX} Available actors:`);
      actors.forEach((a: any) => {
        const cr = a.system?.details?.cr;
        const level = a.system?.details?.level;
        const tierInfo = cr !== undefined ? `CR ${cr}` : level ? `Lvl ${level}` : 'unknown';
        console.log(`  - ${a.name} (${a.type}, ${tierInfo})`);
      });
      return actors.map((a: any) => a.name);
    },

    /**
     * List tokens on the current scene
     */
    listTokens() {
      const tokens = canvas.tokens.placeables;
      console.log(`${LOG_PREFIX} Tokens on canvas:`);
      tokens.forEach((t: any) => {
        console.log(`  - ${t.name} (${t.actor?.name || 'no actor'})`);
      });
      return tokens.map((t: any) => t.name);
    },

    /**
     * Test a specific fumble result by name (bypasses random roll)
     * @param fumblerName - Name of actor fumbling
     * @param targetName - Name of target token (for "grants" effects)
     * @param resultName - Partial name of the result to test (e.g., "Massive Opening")
     * @param attackType - Type of attack: 'melee', 'ranged', or 'spell'
     */
    async testSpecificFumble(
      fumblerName: string,
      targetName: string,
      resultName: string,
      attackType: 'melee' | 'ranged' | 'spell' = 'melee'
    ) {
      const { EffectsManager, TableSelector } = await import('./services');

      const actor = (game as any).actors?.getName(fumblerName);
      if (!actor) {
        console.error(`${LOG_PREFIX} Actor "${fumblerName}" not found.`);
        return null;
      }

      const fumblerToken = canvas.tokens.placeables.find((t: any) => t.actor?.name === fumblerName);
      if (!fumblerToken) {
        console.error(`${LOG_PREFIX} No token found for "${fumblerName}" on canvas.`);
        return null;
      }

      const targetToken = canvas.tokens.placeables.find((t: any) => t.name === targetName);
      if (!targetToken) {
        console.error(`${LOG_PREFIX} Target "${targetName}" not found on canvas.`);
        return null;
      }

      // Get tier from actor
      const actorLevel = actor.system?.details?.level;
      const actorCR = actor.system?.details?.cr;

      // Find the fumble table
      const tableName = TableSelector.getTableName('fumble', attackType, actorLevel, actorCR);
      const table = (game as any).tables?.getName(tableName);
      if (!table) {
        console.error(`${LOG_PREFIX} Table "${tableName}" not found.`);
        return null;
      }

      // Find the specific result by name
      const result = table.results.find((r: any) =>
        r.text?.toLowerCase().includes(resultName.toLowerCase())
      );
      if (!result) {
        console.error(`${LOG_PREFIX} Result containing "${resultName}" not found in table.`);
        console.log(`${LOG_PREFIX} Available results:`);
        table.results.forEach((r: any) => {
          const name = r.text?.split(' - ')[0] || r.text?.substring(0, 30);
          console.log(`  - ${name}`);
        });
        return null;
      }

      const rolledResult = {
        result: result,
        table: table
      };

      console.log(
        `${LOG_PREFIX} [TEST] Applying fumble "${result.text?.split(' - ')[0]}" to ${fumblerName}, target: ${targetName}`
      );

      const fumbleSound = getFumbleSound();
      if (fumbleSound) {
        foundry.audio.AudioHelper.play({ src: fumbleSound, volume: 0.8 }, true);
      }

      await EffectsManager.displayResult(rolledResult, fumblerName, fumblerName);
      await EffectsManager.applyFumbleResult(
        rolledResult,
        fumblerToken,
        [targetToken],
        actor,
        null
      );
    },

    // ---- Smoke-test harness (see TestHarness service) --------------------

    /**
     * List every result in a table with roll range + configured effect.
     * @param type 'crit' | 'fumble'
     * @param attackType 'melee' | 'ranged' | 'spell'
     * @param source actor name used to pick the tier (default 'Daevon')
     */
    listResults(
      type: 'crit' | 'fumble' = 'crit',
      attackType: 'melee' | 'ranged' | 'spell' = 'melee',
      source = 'Daevon'
    ) {
      return TestHarness.listResults(type, attackType, source);
    },

    /**
     * Apply ONE result through the real effect path.
     * @param selector roll number (e.g. 62) OR name substring (e.g. 'Bleeding')
     */
    test(
      type: 'crit' | 'fumble',
      attackType: 'melee' | 'ranged' | 'spell',
      selector: number | string,
      source = 'Daevon',
      target?: string
    ) {
      return TestHarness.apply(type, attackType, selector, source, target);
    },

    /**
     * Sweep an entire table — apply every result one at a time with a delay,
     * auto-clearing effects between each. Returns a structured summary.
     * @param opts { source, target, delay, clearBetween, only }
     */
    sweep(
      type: 'crit' | 'fumble' = 'crit',
      attackType: 'melee' | 'ranged' | 'spell' = 'melee',
      opts: {
        source?: string;
        target?: string;
        delay?: number;
        clearBetween?: boolean;
        only?: string;
      } = {}
    ) {
      return TestHarness.sweep(type, attackType, opts);
    },

    /** Remove all module-applied effects/conditions from a token by name. */
    clearEffects(name: string) {
      return TestHarness.clearEffects(name);
    }
  };

  console.log(`${LOG_PREFIX} Debug + smoke-test functions available on DormanLakely:`);
  console.log(`  listResults('crit'|'fumble','melee'|'ranged'|'spell','SourceActor')`);
  console.log(`  test('crit','melee', 62 | 'Bleeding', 'Attacker', 'Target')`);
  console.log(`  sweep('crit','melee', { source:'Attacker', target:'Target', delay:1600 })`);
  console.log(`  clearEffects('TokenName')`);
  console.log(`  simulateCrit / simulateFumble / testSpecificFumble / listActors / listTokens`);
}
export * from './types';
export * from './constants';
