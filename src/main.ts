/**
 * Dorman Lakely's Critical Hit & Fumble Tables
 * Entry point for the FoundryVTT module
 */

import { MODULE_ID, LOG_PREFIX } from './constants';
import { registerSettings } from './settings';
import { MidiQolHooks, TableImporter } from './services';
import buildInfo from '../build-info.json';

const buildNumber = buildInfo.buildNumber;
const MODULE_TITLE = "Dorman Lakely's Crit/Fumble Tables";
const MODULE_VERSION = '1.0.0';

/**
 * Log styled module message to console
 */
function logModuleHeader(): void {
  console.log(
    '%c⚔️ ' + MODULE_TITLE + ' %cv' + MODULE_VERSION + ' %c(build ' + buildNumber + ')',
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

  await TableImporter.importTables();
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
     * @param attackType - Type of attack: 'melee', 'ranged', or 'spell'
     */
    async simulateFumble(
      actorName: string = 'Nimrod',
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

      await MidiQolHooks.testFumble(actor, attackType);
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
    }
  };

  console.log(`${LOG_PREFIX} Debug functions available:`);
  console.log(`  DormanLakely.simulateCrit('Daevon', 'Nimrod', 'melee')`);
  console.log(`  DormanLakely.simulateFumble('Nimrod', 'melee')`);
  console.log(`  DormanLakely.listActors()`);
  console.log(`  DormanLakely.listTokens()`);
}
export * from './types';
export * from './constants';
