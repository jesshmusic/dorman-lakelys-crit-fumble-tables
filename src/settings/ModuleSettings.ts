/**
 * Module Settings Registration
 */

import { MODULE_ID, LOG_PREFIX, SETTINGS, DEFAULT_SOUNDS, URLS } from '../constants';
import { TableImporter } from '../services/TableImporter';

/**
 * Default values for all configurable settings
 */
const SETTING_DEFAULTS: Record<string, boolean | string> = {
  [SETTINGS.ENABLED]: true,
  [SETTINGS.ENABLE_CRITS]: true,
  [SETTINGS.ENABLE_FUMBLES]: true,
  [SETTINGS.APPLY_EFFECTS]: true,
  [SETTINGS.USE_ACTOR_LEVEL]: true,
  [SETTINGS.FIXED_TIER]: '1',
  [SETTINGS.SHOW_CHAT_MESSAGES]: true,
  [SETTINGS.CRIT_SOUND]: DEFAULT_SOUNDS.CRIT,
  [SETTINGS.FUMBLE_SOUND]: DEFAULT_SOUNDS.FUMBLE
};

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
 * Dialog for resetting settings to defaults
 */
class ResetSettingsDialog extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'dlcritfumble-reset-settings',
      title: game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.ConfirmTitle'),
      template: `modules/${MODULE_ID}/templates/reset-settings-dialog.html`,
      width: 400
    });
  }

  getData() {
    return {
      message: game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.ConfirmMessage')
    };
  }

  async _updateObject(_event: Event, _formData: object): Promise<void> {
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.ConfirmTitle'),
      content: `<p>${game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.ConfirmMessage')}</p>`,
      defaultYes: false
    });

    if (confirmed) {
      console.log(`${LOG_PREFIX} Resetting settings to defaults...`);
      for (const [key, defaultValue] of Object.entries(SETTING_DEFAULTS)) {
        await game.settings.set(MODULE_ID, key, defaultValue);
      }
      ui.notifications.info(game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.Success'));
    }
  }
}

/**
 * Form application that opens Patreon link
 */
class PatreonLink extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'dlcritfumble-patreon',
      title: game.i18n.localize('DLCRITFUMBLE.Settings.Patreon.Name'),
      template: `modules/${MODULE_ID}/templates/patreon-link.html`,
      width: 400
    });
  }

  getData() {
    return {
      patreonUrl: URLS.PATREON
    };
  }

  async _updateObject(_event: Event, _formData: object): Promise<void> {
    window.open(URLS.PATREON, '_blank');
  }

  activateListeners(html: JQuery) {
    super.activateListeners(html);
    html.find('.patreon-button').on('click', () => {
      window.open(URLS.PATREON, '_blank');
    });
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

  game.settings.register(MODULE_ID, SETTINGS.CRIT_SOUND, {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.CritSound.Name'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.CritSound.Hint'),
    scope: 'world',
    config: true,
    type: String,
    default: DEFAULT_SOUNDS.CRIT,
    filePicker: 'audio'
  });

  game.settings.register(MODULE_ID, SETTINGS.FUMBLE_SOUND, {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.FumbleSound.Name'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.FumbleSound.Hint'),
    scope: 'world',
    config: true,
    type: String,
    default: DEFAULT_SOUNDS.FUMBLE,
    filePicker: 'audio'
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

  game.settings.registerMenu(MODULE_ID, 'resetSettings', {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.Name'),
    label: game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.Label'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.Hint'),
    icon: 'fas fa-undo',
    type: ResetSettingsDialog,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, 'patreonLink', {
    name: game.i18n.localize('DLCRITFUMBLE.Settings.Patreon.Name'),
    label: game.i18n.localize('DLCRITFUMBLE.Settings.Patreon.Label'),
    hint: game.i18n.localize('DLCRITFUMBLE.Settings.Patreon.Hint'),
    icon: 'fab fa-patreon',
    type: PatreonLink,
    restricted: false
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

/**
 * Get the configured critical hit sound path
 */
export function getCritSound(): string {
  return getSetting<string>(SETTINGS.CRIT_SOUND) || DEFAULT_SOUNDS.CRIT;
}

/**
 * Get the configured fumble sound path
 */
export function getFumbleSound(): string {
  return getSetting<string>(SETTINGS.FUMBLE_SOUND) || DEFAULT_SOUNDS.FUMBLE;
}

/**
 * Inject sound preview buttons next to the sound file picker settings
 * Supports both jQuery (legacy) and HTMLElement (Foundry v13 ApplicationV2)
 */
export function injectSoundPreviewButtons(html: JQuery | HTMLElement | unknown): void {
  // Safety check - bail out early if html is null/undefined
  if (!html) {
    return;
  }

  // Try to convert to jQuery
  let $html: JQuery;
  try {
    // Check if it's already jQuery-like (has find method)
    if (typeof (html as JQuery).find === 'function') {
      $html = html as JQuery;
    }
    // Check if it's an HTMLElement and $ is available
    else if (typeof $ === 'function' && html instanceof HTMLElement) {
      $html = $(html);
    }
    // Check if it's an array-like with an element (some Foundry versions pass [element])
    else if (typeof $ === 'function' && Array.isArray(html) && html[0] instanceof HTMLElement) {
      $html = $(html[0]);
    }
    // Can't handle this type
    else {
      return;
    }
  } catch {
    // If anything goes wrong, silently bail out
    return;
  }

  // Final safety check
  if (!$html || typeof $html.find !== 'function') {
    return;
  }

  const soundSettings = [
    { key: SETTINGS.CRIT_SOUND, name: 'critSound' },
    { key: SETTINGS.FUMBLE_SOUND, name: 'fumbleSound' }
  ];

  for (const { key, name } of soundSettings) {
    const settingRow = $html.find(`[name="${MODULE_ID}.${key}"]`).closest('.form-group');
    if (!settingRow.length) continue;

    const inputWrapper = settingRow.find('.form-fields');
    if (!inputWrapper.length) continue;

    // Check if button already exists
    if (inputWrapper.find('.sound-preview-btn').length) continue;

    const previewBtn = $(`
      <button type="button" class="sound-preview-btn"
              data-setting="${name}"
              title="${game.i18n.localize('DLCRITFUMBLE.Settings.PreviewSound.Tooltip')}"
              style="flex: 0 0 auto; margin-left: 4px; padding: 0 8px;">
        <i class="fas fa-play"></i>
      </button>
    `);

    previewBtn.on('click', async event => {
      event.preventDefault();
      event.stopPropagation();

      const input = settingRow.find(`[name="${MODULE_ID}.${key}"]`);
      const soundPath = (input.val() as string) || '';

      if (!soundPath) {
        ui.notifications.warn('No sound file selected');
        return;
      }

      try {
        // Use Foundry's AudioHelper to play the sound
        await (foundry.audio?.AudioHelper ?? AudioHelper).play(
          { src: soundPath, volume: 0.8, autoplay: true, loop: false },
          false
        );
      } catch (error) {
        console.error(`${LOG_PREFIX} Error playing sound:`, error);
        ui.notifications.error('Failed to play sound');
      }
    });

    inputWrapper.append(previewBtn);
  }
}
