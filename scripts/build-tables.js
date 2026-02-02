/**
 * Build Tables Script
 * Converts source JSON tables into Foundry-compatible RollTable format
 *
 * Usage: node scripts/build-tables.js
 */

const fs = require('fs');
const path = require('path');

const tablesDir = path.join(__dirname, '../tables/source');
const outputDir = path.join(__dirname, '../packs');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const tiers = ['tier1', 'tier2', 'tier3', 'tier4'];
const tableTypes = [
  'melee-crits',
  'melee-fumbles',
  'ranged-crits',
  'ranged-fumbles',
  'spell-crits',
  'spell-fumbles'
];

/**
 * Generate a random ID similar to Foundry's format
 */
function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Convert source JSON to Foundry RollTable format
 */
function convertToFoundryFormat(sourceData, tableName) {
  const tableId = generateId();

  // Convert results to Foundry format
  const results = sourceData.results.map((result, index) => ({
    _id: generateId(),
    type: 0, // Text result
    text: result.text || result.name,
    img: result.img || 'icons/svg/dice-target.svg',
    weight: result.weight || 1,
    range: result.range || [index + 1, index + 1],
    documentCollection: '',
    documentId: null,
    drawn: false,
    flags: result.flags || {}
  }));

  return {
    _id: tableId,
    name: sourceData.name || tableName,
    description: sourceData.description || '',
    img: sourceData.img || 'icons/svg/d20-highlight.svg',
    formula: sourceData.formula || '1d100',
    replacement: true,
    displayRoll: true,
    results,
    folder: null,
    sort: 0,
    ownership: {
      default: 0
    },
    flags: {
      'dorman-lakelys-crit-fumble-tables': {
        tier: parseInt(tableName.match(/tier(\d)/)?.[1] || '1'),
        attackType: tableName.includes('melee') ? 'melee' :
                    tableName.includes('ranged') ? 'ranged' : 'spell',
        resultType: tableName.includes('crit') ? 'crit' : 'fumble'
      }
    },
    _stats: {
      systemId: 'dnd5e',
      systemVersion: '4.0.0',
      coreVersion: '13.0',
      createdTime: Date.now(),
      modifiedTime: Date.now(),
      lastModifiedBy: 'build-script'
    }
  };
}

/**
 * Build tables for all tiers
 */
function buildTables() {
  console.log('Building crit/fumble tables...\n');

  let totalTables = 0;
  let missingTables = [];

  for (const tier of tiers) {
    const tierDir = path.join(tablesDir, tier);
    const packDir = path.join(outputDir, `${tier}-crits-fumbles`);

    // Create pack directory
    if (!fs.existsSync(packDir)) {
      fs.mkdirSync(packDir, { recursive: true });
    }

    const packData = [];

    for (const tableType of tableTypes) {
      const tableName = `${tier}-${tableType}`;
      const filePath = path.join(tierDir, `${tableType}.json`);

      if (fs.existsSync(filePath)) {
        try {
          const sourceData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const foundryTable = convertToFoundryFormat(sourceData, tableName);
          packData.push(foundryTable);
          console.log(`  ✓ ${tableName}`);
          totalTables++;
        } catch (error) {
          console.error(`  ✗ Error processing ${tableName}: ${error.message}`);
        }
      } else {
        console.log(`  ○ ${tableName} (not found)`);
        missingTables.push(tableName);
      }
    }

    // Write LevelDB-style pack (one JSON per line)
    if (packData.length > 0) {
      const packContent = packData.map(table => JSON.stringify(table)).join('\n');
      const packFile = path.join(packDir, '000000.ldb');
      fs.writeFileSync(packFile, packContent);

      // Also write MANIFEST file
      fs.writeFileSync(path.join(packDir, 'MANIFEST-000001'), '');
      fs.writeFileSync(path.join(packDir, 'CURRENT'), 'MANIFEST-000001');
      fs.writeFileSync(path.join(packDir, 'LOG'), `Build: ${new Date().toISOString()}`);

      console.log(`  → Created pack: ${tier}-crits-fumbles (${packData.length} tables)\n`);
    }
  }

  console.log(`\n✓ Built ${totalTables} tables`);

  if (missingTables.length > 0) {
    console.log(`\n⚠ Missing ${missingTables.length} tables:`);
    missingTables.forEach(t => console.log(`  - ${t}`));
  }
}

// Run the build
buildTables();
