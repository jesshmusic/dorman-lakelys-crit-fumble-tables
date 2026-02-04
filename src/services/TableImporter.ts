/**
 * TableImporter Service
 * Automatically imports roll tables to the world on first module load
 * Handles version-based table updates when module is upgraded
 */

import { MODULE_ID, LOG_PREFIX, SETTINGS } from '../constants';

/**
 * Get the current module version from module.json
 */
function getModuleVersion(): string {
  const moduleData = game.modules.get(MODULE_ID);
  return (moduleData as any)?.version ?? '0.0.0';
}

interface TableResultData {
  type: number;
  text: string;
  weight: number;
  range: [number, number];
  img: string;
  flags?: Record<string, unknown>;
}

interface TableSourceData {
  name: string;
  description: string;
  img: string;
  formula: string;
  results: TableResultData[];
}

export class TableImporter {
  private static readonly TIERS = [1, 2, 3, 4] as const;
  private static readonly ATTACK_TYPES = ['melee', 'ranged', 'spell'] as const;
  private static readonly RESULT_TYPES = ['crits', 'fumbles'] as const;
  private static readonly FOLDER_NAME = "Dorman Lakely's Crit/Fumble Tables";

  /**
   * Check if tables have been imported to this world
   */
  static hasImported(): boolean {
    return game.settings.get(MODULE_ID, SETTINGS.TABLES_IMPORTED) as boolean;
  }

  /**
   * Get the version of tables currently imported
   */
  static getImportedVersion(): string {
    return (game.settings.get(MODULE_ID, SETTINGS.TABLES_VERSION) as string) || '';
  }

  /**
   * Check if tables need to be updated (module version is newer than imported version)
   */
  static needsUpdate(): boolean {
    if (!this.hasImported()) {
      return false; // No tables imported yet, will be handled by importTables
    }

    const importedVersion = this.getImportedVersion();
    const currentVersion = getModuleVersion();

    // If no version stored (legacy), assume update needed
    if (!importedVersion) {
      return true;
    }

    return this.isNewerVersion(currentVersion, importedVersion);
  }

  /**
   * Compare semantic versions (major.minor.patch) - returns true if v1 > v2.
   * Only the first three numeric components are considered; additional components are ignored.
   * Note: Prerelease versions (e.g., "1.0.0-alpha") are not supported and will compare
   * as equal to their release counterparts since only numeric parts are parsed.
   */
  private static isNewerVersion(v1: string, v2: string): boolean {
    const parseSemver = (version: string): [number, number, number] => {
      const parts = version
        .split('.')
        .slice(0, 3)
        .map(n => parseInt(n, 10) || 0);
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
    };

    const [major1, minor1, patch1] = parseSemver(v1);
    const [major2, minor2, patch2] = parseSemver(v2);

    if (major1 !== major2) return major1 > major2;
    if (minor1 !== minor2) return minor1 > minor2;
    if (patch1 !== patch2) return patch1 > patch2;
    return false;
  }

  /**
   * Prompt the GM to update tables when a new version is detected
   */
  static async promptForUpdate(): Promise<void> {
    if (!game.user?.isGM) {
      return;
    }

    const importedVersion = this.getImportedVersion() || 'unknown';
    const currentVersion = getModuleVersion();

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize('DLCRITFUMBLE.Dialogs.UpdateTables.Title'),
      content: `<p>${game.i18n.format('DLCRITFUMBLE.Dialogs.UpdateTables.Content', {
        oldVersion: importedVersion,
        newVersion: currentVersion
      })}</p>
      <p style="color: #ff9800;"><strong>${game.i18n.localize('DLCRITFUMBLE.Dialogs.UpdateTables.Warning')}</strong></p>`,
      defaultYes: true
    });

    if (confirmed) {
      await this.reimportTables();
    } else {
      // User declined - store current version to prevent repeated prompts
      await game.settings.set(MODULE_ID, SETTINGS.TABLES_VERSION, currentVersion);
      ui.notifications.info(game.i18n.localize('DLCRITFUMBLE.Notifications.UpdateSkipped'));
    }
  }

  /**
   * Check for updates and prompt if needed (called on module ready)
   */
  static async checkForUpdates(): Promise<void> {
    if (!game.user?.isGM) {
      return;
    }

    if (this.needsUpdate()) {
      console.log(`${LOG_PREFIX} Table update available`);
      await this.promptForUpdate();
    }
  }

  /**
   * Import all tables to the world (GM only, idempotent)
   */
  static async importTables(): Promise<void> {
    if (!game.user?.isGM) {
      return;
    }

    if (this.hasImported()) {
      console.log(`${LOG_PREFIX} Tables already imported to this world`);
      return;
    }

    console.log(`${LOG_PREFIX} Importing tables...`);
    ui.notifications.info(game.i18n.localize('DLCRITFUMBLE.Notifications.ImportingTables'));

    const folder = await this.getOrCreateFolder();
    let imported = 0;
    let skipped = 0;

    for (const tier of this.TIERS) {
      for (const attackType of this.ATTACK_TYPES) {
        for (const resultType of this.RESULT_TYPES) {
          const success = await this.importTable(tier, attackType, resultType, folder);
          if (success) {
            imported++;
          } else {
            skipped++;
          }
        }
      }
    }

    await game.settings.set(MODULE_ID, SETTINGS.TABLES_IMPORTED, true);
    await game.settings.set(MODULE_ID, SETTINGS.TABLES_VERSION, getModuleVersion());

    const message = game.i18n.format('DLCRITFUMBLE.Notifications.TablesImported', {
      count: imported.toString()
    });
    ui.notifications.info(message);
    console.log(
      `${LOG_PREFIX} Imported ${imported} tables (v${getModuleVersion()}), skipped ${skipped}`
    );
  }

  /**
   * Get or create the module folder for organizing tables
   */
  private static async getOrCreateFolder(): Promise<Folder | null> {
    const existingFolder = game.folders?.find(
      (f: Folder) => f.name === this.FOLDER_NAME && f.type === 'RollTable'
    );

    if (existingFolder) {
      return existingFolder;
    }

    try {
      const folder = await Folder.create({
        name: this.FOLDER_NAME,
        type: 'RollTable',
        parent: null
      });
      console.log(`${LOG_PREFIX} Created folder: ${this.FOLDER_NAME}`);
      return folder ?? null;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to create folder:`, error);
      return null;
    }
  }

  /**
   * Import a single table from JSON source
   */
  private static async importTable(
    tier: number,
    attackType: string,
    resultType: string,
    folder: Folder | null
  ): Promise<boolean> {
    const tableName = `tier${tier}-${attackType}-${resultType}`;

    const existing = game.tables?.getName(tableName);
    if (existing) {
      console.log(`${LOG_PREFIX} Table ${tableName} already exists, skipping`);
      return false;
    }

    try {
      const jsonPath = `modules/${MODULE_ID}/tables/source/tier${tier}/${attackType}-${resultType}.json`;
      const response = await fetch(jsonPath);

      if (!response.ok) {
        console.error(`${LOG_PREFIX} Failed to load ${jsonPath}: ${response.status}`);
        return false;
      }

      const tableData: TableSourceData = await response.json();

      await RollTable.create({
        name: tableName,
        description: tableData.description,
        img: tableData.img,
        formula: tableData.formula || '1d100',
        replacement: true,
        displayRoll: true,
        folder: folder?.id ?? null,
        results: tableData.results.map((r: TableResultData) => ({
          type: r.type || 0,
          text: r.text,
          img: r.img,
          weight: r.weight,
          range: r.range,
          flags: r.flags || {}
        })),
        flags: {
          [MODULE_ID]: {
            tier,
            attackType,
            resultType: resultType === 'crits' ? 'crit' : 'fumble'
          }
        }
      });

      console.log(`${LOG_PREFIX} Imported table: ${tableName}`);
      return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error importing ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Force re-import all tables (deletes existing and recreates)
   * Use with caution - this will delete any modifications made to the tables
   */
  static async reimportTables(): Promise<void> {
    if (!game.user?.isGM) {
      ui.notifications.warn(game.i18n.localize('DLCRITFUMBLE.Errors.GMRequired'));
      return;
    }

    ui.notifications.info(game.i18n.localize('DLCRITFUMBLE.Notifications.ReimportingTables'));

    const folder = game.folders?.find(
      (f: Folder) => f.name === this.FOLDER_NAME && f.type === 'RollTable'
    );

    if (folder) {
      const tablesToDelete =
        game.tables?.filter((t: RollTable) => t.folder?.id === folder.id) ?? [];
      for (const table of tablesToDelete) {
        await table.delete();
      }
      console.log(`${LOG_PREFIX} Deleted ${tablesToDelete.length} existing tables`);
    }

    await game.settings.set(MODULE_ID, SETTINGS.TABLES_IMPORTED, false);
    await this.importTables();
  }
}
