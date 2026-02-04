/**
 * Module Settings Registration
 */

import { MODULE_ID, LOG_PREFIX, SETTINGS } from '../constants';
import { TableImporter } from '../services/TableImporter';

/**
 * Dialog for re-importing tables with confirmation
 */
class ReimportTablesDialog extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'dlcritfumble-reimport-tables',
      title: game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.DialogTitle'),
      template: `modules/${MODULE_ID}/templates/reimport-dialog.html`,
      width: 400
    });
  }

  getData() {
    return {
      message: game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.DialogMessage')
    };
  }

  async _updateObject(_event: Event, _formData: object): Promise<void> {
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.ConfirmTitle'),
      content: `<p>${game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.ConfirmMessage')}</p>
                <p style="color: #ff6400;"><strong>${game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.Warning')}</strong></p>`,
      defaultYes: false
    });

    if (confirmed) {
      console.log(`${LOG_PREFIX} Re-importing tables...`);
      await TableImporter.reimportTables();
      ui.notifications.info(game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.Success'));
    }
  }
}

/**
 * Register all module settings
 */
export function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.ENABLED, {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.Enabled.Name'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.Enabled.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.ENABLE_CRITS, {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.EnableCrits.Name'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.EnableCrits.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.ENABLE_FUMBLES, {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.EnableFumbles.Name'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.EnableFumbles.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.APPLY_EFFECTS, {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.ApplyEffects.Name'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.ApplyEffects.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.USE_ACTOR_LEVEL, {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.UseActorLevel.Name'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.UseActorLevel.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.FIXED_TIER, {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.FixedTier.Name'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.FixedTier.Hint'),
    scope: 'world',
    config: true,
    type: String,
    choices: {
      '1': game.i18n.localize('DLCRITFUMBLE.Tiers.Tier1'),
      '2': game.i18n.localize('DLCRITFUMBLE.Tiers.Tier2'),
      '3': game.i18n.localize('DLCRITFUMBLE.Tiers.Tier3'),
      '4': game.i18n.localize('DLCRITFUMBLE.Tiers.Tier4')
    },
    default: '1'
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_CHAT_MESSAGES, {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.ShowChatMessages.Name'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.ShowChatMessages.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.TABLES_IMPORTED, {
    name: 'Tables Imported',
    hint: 'Internal flag tracking if tables have been imported to this world',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.TABLES_VERSION, {
    name: 'Tables Version',
    hint: 'Internal tracking of which module version the tables were imported from',
    scope: 'world',
    config: false,
    type: String,
    default: ''
  });

  game.settings.registerMenu(MODULE_ID, 'reimportTables', {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.Name'),
    label: game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.Label'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.Hint'),
    icon: 'fas fa-sync',
    type: ReimportTablesDialog,
    restricted: true
  });
}

/**
 * Get a setting value with type safety
 */
export function getSetting<T>(key: string): T {
  return game.settings.get(MODULE_ID, key) as T;
}

/**
 * Set a setting value
 */
export async function setSetting<T>(key: string, value: T): Promise<T> {
  return (await game.settings.set(MODULE_ID, key, value)) as T;
}

/**
 * Check if the module is enabled
 */
export function isModuleEnabled(): boolean {
  return getSetting<boolean>(SETTINGS.ENABLED);
}

/**
 * Check if critical hit tables are enabled
 */
export function areCritsEnabled(): boolean {
  return isModuleEnabled() && getSetting<boolean>(SETTINGS.ENABLE_CRITS);
}

/**
 * Check if fumble tables are enabled
 */
export function areFumblesEnabled(): boolean {
  return isModuleEnabled() && getSetting<boolean>(SETTINGS.ENABLE_FUMBLES);
}

/**
 * Check if effects should be auto-applied
 */
export function shouldApplyEffects(): boolean {
  return getSetting<boolean>(SETTINGS.APPLY_EFFECTS);
}

/**
 * Check if chat messages should be shown
 */
export function shouldShowChatMessages(): boolean {
  return getSetting<boolean>(SETTINGS.SHOW_CHAT_MESSAGES);
}

/**
 * Get the tier to use (either from actor level or fixed setting)
 */
export function getConfiguredTier(): number {
  return parseInt(getSetting<string>(SETTINGS.FIXED_TIER), 10);
}

/**
 * Check if actor level should determine tier
 */
export function useActorLevel(): boolean {
  return getSetting<boolean>(SETTINGS.USE_ACTOR_LEVEL);
}
