/**
 * TableImporter Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks } from '../mocks/foundry';

describe('TableImporter', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('hasImported', () => {
    it('should return false when tables have not been imported', async () => {
      // Set up mock to return false for tablesImported
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'tablesImported') return false;
        return true;
      });

      const { TableImporter } = await import('../../src/services/TableImporter');
      expect(TableImporter.hasImported()).toBe(false);
    });

    it('should return true when tables have been imported', async () => {
      // Set up mock to return true for tablesImported
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'tablesImported') return true;
        return true;
      });

      const { TableImporter } = await import('../../src/services/TableImporter');
      expect(TableImporter.hasImported()).toBe(true);
    });
  });

  describe('importTables', () => {
    it('should skip import for non-GM users', async () => {
      // Set up as non-GM user
      (game as any).user = { id: 'player-id', isGM: false };

      const { TableImporter } = await import('../../src/services/TableImporter');
      await TableImporter.importTables();

      // Should not call settings.set or show notifications
      expect(game.settings.set).not.toHaveBeenCalled();
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    it('should skip import when tables already imported', async () => {
      // Set up mock to return true for tablesImported
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'tablesImported') return true;
        return true;
      });

      const { TableImporter } = await import('../../src/services/TableImporter');
      await TableImporter.importTables();

      // Should not call RollTable.create
      expect(RollTable.create).not.toHaveBeenCalled();
    });

    it('should import tables when not already imported', async () => {
      // Set up mock to return false for tablesImported
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'tablesImported') return false;
        return true;
      });

      // Clear any existing tables
      (game.tables as any).clear();

      const { TableImporter } = await import('../../src/services/TableImporter');
      await TableImporter.importTables();

      // Should create folder
      expect(Folder.create).toHaveBeenCalledWith({
        name: "Dorman Lakely's Crit/Fumble Tables",
        type: 'RollTable',
        parent: null
      });

      // Should create 24 tables (4 tiers x 3 attack types x 2 result types)
      expect(RollTable.create).toHaveBeenCalledTimes(24);

      // Should mark as imported
      expect(game.settings.set).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'tablesImported',
        true
      );

      // Should show success notification
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should skip tables that already exist', async () => {
      // Set up mock to return false for tablesImported
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'tablesImported') return false;
        return true;
      });

      // Clear existing tables and add only specific ones
      (game.tables as Map<string, any>).clear();
      const existingTables = ['tier1-melee-crits', 'tier1-melee-fumbles'];
      existingTables.forEach(name => {
        (game.tables as Map<string, any>).set(name, { name, id: name });
      });

      const { TableImporter } = await import('../../src/services/TableImporter');
      await TableImporter.importTables();

      // Should only create 22 tables (24 - 2 existing)
      expect(RollTable.create).toHaveBeenCalledTimes(22);
    });

    it('should handle fetch errors gracefully', async () => {
      // Set up mock to return false for tablesImported
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'tablesImported') return false;
        return true;
      });

      // Clear any existing tables
      (game.tables as any).clear();

      // Mock fetch to return an error response
      (global as any).fetch = jest.fn<any>().mockResolvedValue({
        ok: false,
        status: 404
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { TableImporter } = await import('../../src/services/TableImporter');
      await TableImporter.importTables();

      // Should log errors for failed fetches
      expect(consoleSpy).toHaveBeenCalled();

      // Should still mark as imported (even if some tables failed)
      expect(game.settings.set).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'tablesImported',
        true
      );

      consoleSpy.mockRestore();
    });

    it('should use existing folder if one exists', async () => {
      // Set up mock to return false for tablesImported
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'tablesImported') return false;
        return true;
      });

      // Add existing folder
      const existingFolder = {
        id: 'existing-folder-id',
        name: "Dorman Lakely's Crit/Fumble Tables",
        type: 'RollTable',
        parent: null
      };
      (game.folders as Map<string, any>).set('existing-folder-id', existingFolder);

      const { TableImporter } = await import('../../src/services/TableImporter');
      await TableImporter.importTables();

      // Should NOT create a new folder
      expect(Folder.create).not.toHaveBeenCalled();

      // Should still create tables
      expect(RollTable.create).toHaveBeenCalled();
    });
  });

  describe('reimportTables', () => {
    it('should delete existing tables and re-import', async () => {
      // Set up as GM
      (game as any).user = { id: 'gm-id', isGM: true };

      // Set up mock to return true then false for tablesImported
      let tablesImported = true;
      (game.settings.get as jest.Mock).mockImplementation((_module: string, key: string) => {
        if (key === 'tablesImported') return tablesImported;
        return true;
      });
      (game.settings.set as jest.Mock).mockImplementation(
        (_module: string, key: string, value: any) => {
          if (key === 'tablesImported') tablesImported = value;
          return Promise.resolve(value);
        }
      );

      // Add existing folder and tables
      const existingFolder = {
        id: 'existing-folder-id',
        name: "Dorman Lakely's Crit/Fumble Tables",
        type: 'RollTable',
        parent: null
      };
      (game.folders as Map<string, any>).set('existing-folder-id', existingFolder);

      const mockDelete = jest.fn<any>().mockResolvedValue({});
      const existingTable = {
        id: 'existing-table-id',
        name: 'tier1-melee-crits',
        folder: existingFolder,
        delete: mockDelete
      };
      (game.tables as Map<string, any>).set('existing-table-id', existingTable);

      const { TableImporter } = await import('../../src/services/TableImporter');
      await TableImporter.reimportTables();

      // Should delete existing tables
      expect(mockDelete).toHaveBeenCalled();

      // Should reset tablesImported flag
      expect(game.settings.set).toHaveBeenCalledWith(
        'dorman-lakelys-crit-fumble-tables',
        'tablesImported',
        false
      );

      // Should import tables again
      expect(RollTable.create).toHaveBeenCalled();
    });

    it('should show warning for non-GM users', async () => {
      // Set up as non-GM user
      (game as any).user = { id: 'player-id', isGM: false };

      const { TableImporter } = await import('../../src/services/TableImporter');
      await TableImporter.reimportTables();

      // Should show warning
      expect(ui.notifications.warn).toHaveBeenCalled();

      // Should not delete or import
      expect(game.settings.set).not.toHaveBeenCalled();
    });
  });
});
