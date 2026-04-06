/**
 * ModuleSettings Tests
 *
 * @jest-environment jsdom
 *
 * The injectSoundPreviewButtons helper uses native DOM (document.createElement,
 * querySelector, addEventListener) so this whole test file runs under jsdom
 * even though most of the tests in here don't actually touch the DOM.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks } from '../mocks/foundry';

describe('ModuleSettings', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('registerSettings', () => {
    it('should register all settings', async () => {
      const { registerSettings } = await import('../../src/settings/ModuleSettings');

      registerSettings();

      // Should register main settings
      expect(game.settings.register).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'enabled',
        expect.any(Object)
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'enableCrits',
        expect.any(Object)
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'enableFumbles',
        expect.any(Object)
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'applyEffects',
        expect.any(Object)
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'useActorLevel',
        expect.any(Object)
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'fixedTier',
        expect.any(Object)
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'showChatMessages',
        expect.any(Object)
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'critSound',
        expect.any(Object)
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'fumbleSound',
        expect.any(Object)
      );
    });

    it('should register reimport tables menu', async () => {
      const { registerSettings } = await import('../../src/settings/ModuleSettings');

      registerSettings();

      expect(game.settings.registerMenu).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'reimportTables',
        expect.any(Object)
      );
    });

    it('should register reset settings menu', async () => {
      const { registerSettings } = await import('../../src/settings/ModuleSettings');

      registerSettings();

      expect(game.settings.registerMenu).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'resetSettings',
        expect.objectContaining({
          icon: 'fas fa-undo'
        })
      );
    });

    it('should register Patreon link menu', async () => {
      const { registerSettings } = await import('../../src/settings/ModuleSettings');

      registerSettings();

      expect(game.settings.registerMenu).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'patreonLink',
        expect.objectContaining({
          icon: 'fab fa-patreon'
        })
      );
    });
  });

  describe('getSetting', () => {
    it('should get setting value', async () => {
      (game.settings.get as jest.Mock).mockReturnValue(true);

      const { getSetting } = await import('../../src/settings/ModuleSettings');

      const result = getSetting<boolean>('enabled');
      expect(result).toBe(true);
    });
  });

  describe('setSetting', () => {
    it('should set setting value', async () => {
      (game.settings.set as jest.Mock<any>).mockResolvedValue(false);

      const { setSetting } = await import('../../src/settings/ModuleSettings');

      await setSetting<boolean>('enabled', false);
      expect(game.settings.set).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'enabled',
        false
      );
    });
  });

  describe('isModuleEnabled', () => {
    it('should return true when module is enabled', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'enabled') return true;
        return false;
      });

      const { isModuleEnabled } = await import('../../src/settings/ModuleSettings');

      expect(isModuleEnabled()).toBe(true);
    });

    it('should return false when module is disabled', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'enabled') return false;
        return true;
      });

      const { isModuleEnabled } = await import('../../src/settings/ModuleSettings');

      expect(isModuleEnabled()).toBe(false);
    });
  });

  describe('areCritsEnabled', () => {
    it('should return true when both module and crits are enabled', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'enabled') return true;
        if (key === 'enableCrits') return true;
        return false;
      });

      const { areCritsEnabled } = await import('../../src/settings/ModuleSettings');

      expect(areCritsEnabled()).toBe(true);
    });

    it('should return false when module is disabled', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'enabled') return false;
        if (key === 'enableCrits') return true;
        return false;
      });

      const { areCritsEnabled } = await import('../../src/settings/ModuleSettings');

      expect(areCritsEnabled()).toBe(false);
    });

    it('should return false when crits are disabled', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'enabled') return true;
        if (key === 'enableCrits') return false;
        return false;
      });

      const { areCritsEnabled } = await import('../../src/settings/ModuleSettings');

      expect(areCritsEnabled()).toBe(false);
    });
  });

  describe('areFumblesEnabled', () => {
    it('should return true when both module and fumbles are enabled', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'enabled') return true;
        if (key === 'enableFumbles') return true;
        return false;
      });

      const { areFumblesEnabled } = await import('../../src/settings/ModuleSettings');

      expect(areFumblesEnabled()).toBe(true);
    });

    it('should return false when module is disabled', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'enabled') return false;
        if (key === 'enableFumbles') return true;
        return false;
      });

      const { areFumblesEnabled } = await import('../../src/settings/ModuleSettings');

      expect(areFumblesEnabled()).toBe(false);
    });
  });

  describe('shouldApplyEffects', () => {
    it('should return true when effects should be applied', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'applyEffects') return true;
        return false;
      });

      const { shouldApplyEffects } = await import('../../src/settings/ModuleSettings');

      expect(shouldApplyEffects()).toBe(true);
    });

    it('should return false when effects should not be applied', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'applyEffects') return false;
        return true;
      });

      const { shouldApplyEffects } = await import('../../src/settings/ModuleSettings');

      expect(shouldApplyEffects()).toBe(false);
    });
  });

  describe('shouldShowChatMessages', () => {
    it('should return true when chat messages should be shown', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'showChatMessages') return true;
        return false;
      });

      const { shouldShowChatMessages } = await import('../../src/settings/ModuleSettings');

      expect(shouldShowChatMessages()).toBe(true);
    });
  });

  describe('getConfiguredTier', () => {
    it('should return configured tier as number', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'fixedTier') return '3';
        return false;
      });

      const { getConfiguredTier } = await import('../../src/settings/ModuleSettings');

      expect(getConfiguredTier()).toBe(3);
    });

    it('should handle tier 1', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'fixedTier') return '1';
        return false;
      });

      const { getConfiguredTier } = await import('../../src/settings/ModuleSettings');

      expect(getConfiguredTier()).toBe(1);
    });

    it('should handle tier 4', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'fixedTier') return '4';
        return false;
      });

      const { getConfiguredTier } = await import('../../src/settings/ModuleSettings');

      expect(getConfiguredTier()).toBe(4);
    });
  });

  describe('useActorLevel', () => {
    it('should return true when using actor level for tier', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'useActorLevel') return true;
        return false;
      });

      const { useActorLevel } = await import('../../src/settings/ModuleSettings');

      expect(useActorLevel()).toBe(true);
    });

    it('should return false when not using actor level for tier', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'useActorLevel') return false;
        return true;
      });

      const { useActorLevel } = await import('../../src/settings/ModuleSettings');

      expect(useActorLevel()).toBe(false);
    });
  });

  describe('getCritSound', () => {
    it('should return configured crit sound', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'critSound') return 'custom/crit-sound.ogg';
        return '';
      });

      const { getCritSound } = await import('../../src/settings/ModuleSettings');

      expect(getCritSound()).toBe('custom/crit-sound.ogg');
    });

    it('should return default when no crit sound configured', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'critSound') return '';
        return '';
      });

      const { getCritSound } = await import('../../src/settings/ModuleSettings');

      // Should return default sound path
      expect(getCritSound()).toBe(
        'modules/dorman-lakelys-crit-fumble-tables/sounds/Stabs-Success.mp3'
      );
    });
  });

  describe('getFumbleSound', () => {
    it('should return configured fumble sound', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'fumbleSound') return 'custom/fumble-sound.ogg';
        return '';
      });

      const { getFumbleSound } = await import('../../src/settings/ModuleSettings');

      expect(getFumbleSound()).toBe('custom/fumble-sound.ogg');
    });

    it('should return default when no fumble sound configured', async () => {
      (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) => {
        if (key === 'fumbleSound') return '';
        return '';
      });

      const { getFumbleSound } = await import('../../src/settings/ModuleSettings');

      // Should return default sound path
      expect(getFumbleSound()).toBe(
        'modules/dorman-lakelys-crit-fumble-tables/sounds/Stabs-Fail.mp3'
      );
    });
  });

  describe('injectSoundPreviewButtons', () => {
    /**
     * Build a minimal DOM tree that matches the structure
     * `injectSoundPreviewButtons` looks for:
     *   <root>
     *     <div class="form-group">
     *       <input name="dorman-lakelys-crit-fumble-tables.critSound" />
     *       <div class="form-fields"></div>
     *     </div>
     *     <div class="form-group">
     *       <input name="dorman-lakelys-crit-fumble-tables.fumbleSound" />
     *       <div class="form-fields"></div>
     *     </div>
     *   </root>
     */
    function buildSettingsRoot(): HTMLElement {
      const root = document.createElement('div');
      for (const setting of ['critSound', 'fumbleSound']) {
        const group = document.createElement('div');
        group.className = 'form-group';
        const input = document.createElement('input');
        // Use setAttribute (rather than the .name property) so jsdom's
        // querySelector('[name="..."]') matches.
        input.setAttribute('name', `dorman-lakelys-crit-fumble-tables.${setting}`);
        const fields = document.createElement('div');
        fields.className = 'form-fields';
        group.appendChild(input);
        group.appendChild(fields);
        root.appendChild(group);
      }
      return root;
    }

    it('should inject preview buttons for both sound settings', async () => {
      const { injectSoundPreviewButtons } = await import('../../src/settings/ModuleSettings');

      const root = buildSettingsRoot();
      injectSoundPreviewButtons(root);

      const buttons = root.querySelectorAll('.sound-preview-btn');
      expect(buttons.length).toBe(2);

      const datasets = Array.from(buttons).map(btn => (btn as HTMLElement).dataset.setting);
      expect(datasets).toContain('critSound');
      expect(datasets).toContain('fumbleSound');
    });

    it('should not inject duplicate buttons on re-render', async () => {
      const { injectSoundPreviewButtons } = await import('../../src/settings/ModuleSettings');

      const root = buildSettingsRoot();
      injectSoundPreviewButtons(root);
      injectSoundPreviewButtons(root);

      // Same number of buttons after a second invocation.
      expect(root.querySelectorAll('.sound-preview-btn').length).toBe(2);
    });

    it('should not throw when the input is missing entirely', async () => {
      const { injectSoundPreviewButtons } = await import('../../src/settings/ModuleSettings');

      const empty = document.createElement('div');
      expect(() => injectSoundPreviewButtons(empty)).not.toThrow();
      expect(empty.querySelectorAll('.sound-preview-btn').length).toBe(0);
    });

    it('should accept an array-of-element shape (legacy hook signature)', async () => {
      const { injectSoundPreviewButtons } = await import('../../src/settings/ModuleSettings');

      const root = buildSettingsRoot();
      // Some legacy hooks pass [HTMLElement] instead of HTMLElement.
      injectSoundPreviewButtons([root] as any);
      expect(root.querySelectorAll('.sound-preview-btn').length).toBe(2);
    });
  });
});
