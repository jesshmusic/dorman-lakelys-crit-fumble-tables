/**
 * ModuleSettings Tests
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
    it('should inject preview buttons for sound settings', async () => {
      const { injectSoundPreviewButtons } = await import('../../src/settings/ModuleSettings');

      // Create mock HTML structure
      const mockFormFields = {
        find: jest.fn().mockReturnValue({ length: 0 }),
        append: jest.fn().mockReturnThis()
      };
      const mockSettingRow = {
        find: jest.fn().mockReturnValue(mockFormFields)
      };
      const mockInput = {
        closest: jest.fn().mockReturnValue(mockSettingRow),
        length: 1
      };
      const mockHtml = {
        find: jest.fn().mockReturnValue(mockInput)
      } as any;

      injectSoundPreviewButtons(mockHtml);

      // Should look for both sound settings
      expect(mockHtml.find).toHaveBeenCalledWith(
        '[name="dorman-lakelys-crit-fumble-tables.critSound"]'
      );
      expect(mockHtml.find).toHaveBeenCalledWith(
        '[name="dorman-lakelys-crit-fumble-tables.fumbleSound"]'
      );
    });

    it('should not inject buttons if setting row not found', async () => {
      const { injectSoundPreviewButtons } = await import('../../src/settings/ModuleSettings');

      const mockInput = {
        closest: jest.fn().mockReturnValue({ length: 0 }),
        length: 0
      };
      const mockHtml = {
        find: jest.fn().mockReturnValue(mockInput)
      } as any;

      // Should not throw
      expect(() => injectSoundPreviewButtons(mockHtml)).not.toThrow();
    });
  });
});
