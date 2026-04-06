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
 * Foundry v14 rewrite of the three settings menu entries.
 *
 * These were originally three FormApplication subclasses (ReimportTablesDialog,
 * ResetSettingsDialog, PatreonLink), each rendering a tiny Handlebars template
 * with a single button and showing a Dialog.confirm on submit. Foundry v14
 * removed the legacy `FormApplication` and `Dialog` globals, so we replace each
 * one with a minimal ApplicationV2 stub that opens a `DialogV2.confirm` (or, for
 * the Patreon link, an ApplicationV2 with a single button) immediately on
 * render and closes itself when the user makes their choice. Foundry's
 * `registerMenu` API still accepts these as the `type` field.
 */
const ApplicationV2 = (foundry as any).applications.api.ApplicationV2;
const DialogV2 = (foundry as any).applications.api.DialogV2;

class ReimportTablesDialog extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'dlcritfumble-reimport-tables',
    classes: [],
    tag: 'div',
    window: {
      title: 'DLCRITFUMBLE.Settings.ReimportTables.DialogTitle',
      icon: 'fas fa-sync'
    },
    position: { width: 1, height: 1 }
  };

  // ApplicationV2 requires _renderHTML / _replaceHTML even if we never show
  // ourselves. Return an empty container so the framework is happy, then in
  // _onFirstRender immediately delegate to a DialogV2.confirm and close.
  async _renderHTML(): Promise<HTMLElement> {
    return document.createElement('div');
  }

  _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  async _onFirstRender(_context: unknown, _options: unknown): Promise<void> {
    // Hide our shell window — DialogV2 will be the user-visible UI.
    this.element?.style?.setProperty('display', 'none');

    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.ConfirmTitle') },
      content: `<p>${game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.ConfirmMessage')}</p>
                <p style="color: #ff6400;"><strong>${game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.Warning')}</strong></p>`,
      yes: { default: false },
      no: { default: true }
    });

    if (confirmed) {
      console.log(`${LOG_PREFIX} Re-importing tables...`);
      await TableImporter.reimportTables();
      ui.notifications.info(game.i18n.localize('DLCRITFUMBLE.Settings.ReimportTables.Success'));
    }

    this.close();
  }
}

class ResetSettingsDialog extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'dlcritfumble-reset-settings',
    classes: [],
    tag: 'div',
    window: {
      title: 'DLCRITFUMBLE.Settings.ResetSettings.ConfirmTitle',
      icon: 'fas fa-undo'
    },
    position: { width: 1, height: 1 }
  };

  async _renderHTML(): Promise<HTMLElement> {
    return document.createElement('div');
  }

  _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  async _onFirstRender(_context: unknown, _options: unknown): Promise<void> {
    this.element?.style?.setProperty('display', 'none');

    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.ConfirmTitle') },
      content: `<p>${game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.ConfirmMessage')}</p>`,
      yes: { default: false },
      no: { default: true }
    });

    if (confirmed) {
      console.log(`${LOG_PREFIX} Resetting settings to defaults...`);
      for (const [key, defaultValue] of Object.entries(SETTING_DEFAULTS)) {
        await game.settings.set(MODULE_ID, key, defaultValue);
      }
      ui.notifications.info(game.i18n.localize('DLCRITFUMBLE.Settings.ResetSettings.Success'));
    }

    this.close();
  }
}

class PatreonLink extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'dlcritfumble-patreon',
    classes: [],
    tag: 'div',
    window: {
      title: 'DLCRITFUMBLE.Settings.Patreon.Name',
      icon: 'fab fa-patreon'
    },
    position: { width: 1, height: 1 }
  };

  async _renderHTML(): Promise<HTMLElement> {
    return document.createElement('div');
  }

  _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  async _onFirstRender(_context: unknown, _options: unknown): Promise<void> {
    this.element?.style?.setProperty('display', 'none');

    await DialogV2.prompt({
      window: { title: game.i18n.localize('DLCRITFUMBLE.Settings.Patreon.Name') },
      content: `<p>${game.i18n.localize('DLCRITFUMBLE.Settings.Patreon.Hint') ?? 'Open the Patreon page in a new tab.'}</p>`,
      ok: {
        label: '<i class="fab fa-patreon"></i> Open Patreon',
        callback: () => {
          window.open(URLS.PATREON, '_blank');
        }
      }
    });

    this.close();
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
 * Inject sound preview buttons next to the sound file picker settings.
 *
 * Foundry v14 rewrite: the v13 settings panel is ApplicationV2 and the
 * `renderSettingsConfig` hook now passes a single HTMLElement (no jQuery
 * wrapper). This function previously handled both jQuery and HTMLElement input
 * shapes; the rewrite drops jQuery entirely and uses native DOM only.
 */
export function injectSoundPreviewButtons(html: HTMLElement | unknown): void {
  // Defensive: the renderSettingsConfig hook passes an HTMLElement in v14, but
  // legacy v12 hooks pass a jQuery object whose [0] index is the underlying
  // element, and some odd setups pass [HTMLElement]. Use duck typing on
  // querySelector instead of `instanceof HTMLElement` so this works regardless
  // of which window/global the element came from (ts-jest module isolation can
  // produce elements that aren't `instanceof` the test-file HTMLElement).
  const isElementLike = (x: unknown): x is HTMLElement =>
    !!x && typeof (x as { querySelector?: unknown }).querySelector === 'function';

  let root: HTMLElement | null = null;
  if (isElementLike(html)) {
    root = html;
  } else if (Array.isArray(html) && isElementLike(html[0])) {
    root = html[0];
  } else if (
    html &&
    typeof html === 'object' &&
    isElementLike((html as { [key: number]: unknown })[0])
  ) {
    // Legacy jQuery: index 0 is the underlying HTMLElement
    root = (html as unknown as { [key: number]: HTMLElement })[0];
  }
  if (!root) return;

  const soundSettings = [
    { key: SETTINGS.CRIT_SOUND, name: 'critSound' },
    { key: SETTINGS.FUMBLE_SOUND, name: 'fumbleSound' }
  ];

  for (const { key, name } of soundSettings) {
    const input = root.querySelector(`[name="${MODULE_ID}.${key}"]`) as HTMLInputElement | null;
    if (!input) continue;

    const settingRow = input.closest('.form-group');
    if (!settingRow) continue;

    const inputWrapper = settingRow.querySelector('.form-fields');
    if (!inputWrapper) continue;

    // Check if button already exists (re-render protection)
    if (inputWrapper.querySelector('.sound-preview-btn')) continue;

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.classList.add('sound-preview-btn');
    previewBtn.dataset.setting = name;
    previewBtn.title = game.i18n.localize('DLCRITFUMBLE.Settings.PreviewSound.Tooltip');
    previewBtn.style.flex = '0 0 auto';
    previewBtn.style.marginLeft = '4px';
    previewBtn.style.padding = '0 8px';
    previewBtn.innerHTML = '<i class="fas fa-play"></i>';

    previewBtn.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();

      const currentInput = settingRow.querySelector(
        `[name="${MODULE_ID}.${key}"]`
      ) as HTMLInputElement | null;
      const soundPath = currentInput?.value ?? '';

      if (!soundPath) {
        ui.notifications.warn(
          game.i18n.localize('DLCRITFUMBLE.Settings.PreviewSound.NoFileSelected')
        );
        return;
      }

      try {
        // foundry.audio.AudioHelper is the v13/v14 location; the bare
        // AudioHelper global is a legacy v12 fallback that may be removed.
        const Helper =
          (foundry as any).audio?.AudioHelper ??
          (globalThis as any).AudioHelper;
        await Helper?.play(
          { src: soundPath, volume: 0.8, autoplay: true, loop: false },
          false
        );
      } catch (error) {
        console.error(`${LOG_PREFIX} Error playing sound:`, error);
        ui.notifications.error(game.i18n.localize('DLCRITFUMBLE.Settings.PreviewSound.PlayError'));
      }
    });

    inputWrapper.appendChild(previewBtn);
  }
}
