# CLAUDE.md - Technical Reference for AI Assistants

This document contains technical notes, patterns, and conventions for working on Dorman Lakely's Critical Hit & Fumble Tables module.

> **Note**: This is **developer documentation**. README.md is for end users.
>
> - **README.md**: User-focused, benefits-oriented, no technical jargon
> - **CLAUDE.md**: Developer-focused, implementation details, code patterns

## Project Overview

**Dorman Lakely's Critical Hit & Fumble Tables** is a FoundryVTT v13 module providing tier-based critical hit and fumble tables for D&D 5e with Midi-QOL automation.

**Key Dependencies:**

- FoundryVTT v13+ (D&D 5e system)
- Midi-QOL (required for automatic crit/fumble detection)
- DFreds Convenient Effects (recommended for enhanced conditions)

## Quick Start for AI Assistants

**Essential Commands:**

```bash
npm install              # Install dependencies
npm run build            # Build TypeScript → dist/main.js
npm run watch            # Auto-rebuild on changes
npm run lint             # Check code style
npm run lint:fix         # Auto-fix issues
npm test                 # Run Jest unit tests
npm run test:watch       # Watch mode for tests
npm run test:coverage    # Generate coverage report
npm run build:tables     # Compile table JSON to Foundry format
```

**Key Patterns:**

- Module hooks into Midi-QOL's attack roll workflow
- Tier selection based on actor level (1-4, 5-8, 9-12, 13-20)
- Tables stored as JSON in `tables/source/`, compiled to `packs/`
- Effect types: none, condition, damage, save

## Architecture

### File Structure

```
src/
├── main.ts                    # Module entry, hooks registration
├── constants.ts               # MODULE_ID, TIER_LEVELS, settings keys
├── types/
│   ├── index.ts               # Type exports
│   ├── tables.ts              # TableResult, TableEffect interfaces
│   ├── foundry.d.ts           # Foundry API type declarations
│   └── midi-qol.d.ts          # Midi-QOL type declarations
├── services/
│   ├── index.ts               # Service exports
│   ├── TableSelector.ts       # Picks correct table by tier/attack type
│   ├── EffectsManager.ts      # Applies conditions and damage
│   └── MidiQolHooks.ts        # Midi-QOL integration
└── settings/
    ├── index.ts               # Settings exports
    └── ModuleSettings.ts      # Settings registration

tables/
├── source/                    # Human-editable JSON tables
│   ├── tier1/
│   │   ├── melee-crits.json
│   │   ├── melee-fumbles.json
│   │   ├── ranged-crits.json
│   │   ├── ranged-fumbles.json
│   │   ├── spell-crits.json
│   │   └── spell-fumbles.json
│   ├── tier2/ (same structure)
│   ├── tier3/ (same structure)
│   └── tier4/ (same structure)

packs/                         # Foundry-format output (generated)
├── tier1-crits-fumbles/
├── tier2-crits-fumbles/
├── tier3-crits-fumbles/
└── tier4-crits-fumbles/

tests/
├── setup.ts                   # Jest setup with Foundry mocks
├── mocks/
│   └── foundry.ts             # Mock game, Hooks, etc.
├── services/
│   ├── TableSelector.test.ts
│   └── EffectsManager.test.ts
└── constants.test.ts
```

### Build System

- **Vite** bundles TypeScript → single IIFE at `dist/main.js`
- Custom plugin increments build number on each build
- `build-info.json` tracks build number (auto-generated)
- Table build script converts source JSON → Foundry RollTable format

## Tier System

### Tier Levels

| Tier | Levels | "Nothing" % | Effect Severity |
| ---- | ------ | ----------- | --------------- |
| 1    | 1-4    | 60%         | Mild            |
| 2    | 5-8    | 45%         | Moderate        |
| 3    | 9-12   | 35%         | Powerful        |
| 4    | 13-20  | 25%         | Legendary       |

### Tier Determination

```typescript
function getTierFromLevel(level: number): number {
  if (level <= 4) return 1;
  if (level <= 8) return 2;
  if (level <= 12) return 3;
  return 4;
}
```

## Table JSON Format

### Source Table Structure

```json
{
  "name": "Tier 1 Melee Critical Hits (Levels 1-4)",
  "description": "Description here",
  "img": "icons/skills/melee/strike-sword.webp",
  "formula": "1d100",
  "results": [
    {
      "type": 0,
      "text": "Nothing Special - Your strike deals damage as normal.",
      "weight": 60,
      "range": [1, 60],
      "img": "icons/svg/d20-highlight.svg",
      "flags": {
        "dorman-lakelys-crit-fumble-tables": {
          "effectType": "none"
        }
      }
    },
    {
      "type": 0,
      "text": "Knockdown - Target is knocked prone.",
      "weight": 10,
      "range": [61, 70],
      "img": "icons/svg/falling.svg",
      "flags": {
        "dorman-lakelys-crit-fumble-tables": {
          "effectType": "condition",
          "effectCondition": "prone",
          "duration": 0
        }
      }
    }
  ]
}
```

### Effect Types

```typescript
type EffectType = 'none' | 'condition' | 'damage' | 'save';

interface TableEffectConfig {
  effectType: EffectType;
  effectCondition?: string; // For condition type
  damageFormula?: string; // For damage type (e.g., "2d6")
  damageType?: string; // For damage type (e.g., "slashing")
  duration?: number; // Rounds (-1 = permanent until healed)
  saveDC?: number; // For save type
  saveAbility?: string; // For save type (str, dex, con, etc.)
  failEffect?: string; // Description of failed save effect
}
```

### Weight Distribution Rules

- Weights must sum to 100
- Ranges must be contiguous (1-60, 61-70, 71-78, etc.)
- "Nothing" result should be first with highest weight
- More powerful effects get lower weights

## Midi-QOL Integration

### Hook Registration

```typescript
// Listen to attack roll complete
Hooks.on('midi-qol.AttackRollComplete', async workflow => {
  const d20Result = getD20Result(workflow);

  if (d20Result === 20 && areCritsEnabled()) {
    await handleCriticalHit(workflow);
  }

  if (d20Result === 1 && areFumblesEnabled()) {
    await handleFumble(workflow);
  }
});
```

### Attack Type Detection

```typescript
function getAttackType(item: MidiQolItem): AttackType {
  // Spell attacks (msak, rsak)
  if (item.system.actionType === 'msak' || item.system.actionType === 'rsak') {
    return 'spell';
  }
  // Ranged weapon attacks (rwak)
  if (item.system.actionType === 'rwak') {
    return 'ranged';
  }
  // Melee weapon attacks (mwak) or default
  return 'melee';
}
```

### D20 Result Extraction

```typescript
function getD20Result(workflow: MidiQolWorkflow): number | null {
  const d20Term = workflow.attackRoll?.terms.find(
    term => term.faces === 20 && term.results?.length > 0
  );
  const activeResult = d20Term?.results?.find(r => r.active);
  return activeResult?.result ?? null;
}
```

## Settings Registration

### Available Settings

```typescript
const SETTINGS = {
  ENABLED: 'enabled', // Master on/off
  ENABLE_CRITS: 'enableCrits', // Enable crit tables
  ENABLE_FUMBLES: 'enableFumbles', // Enable fumble tables
  APPLY_EFFECTS: 'applyEffects', // Auto-apply effects
  USE_ACTOR_LEVEL: 'useActorLevel', // Use level for tier
  FIXED_TIER: 'fixedTier', // Fixed tier (1-4)
  SHOW_CHAT_MESSAGES: 'showChatMessages' // Show chat output
};
```

### Settings Helper Functions

```typescript
function isModuleEnabled(): boolean;
function areCritsEnabled(): boolean;
function areFumblesEnabled(): boolean;
function shouldApplyEffects(): boolean;
function useActorLevel(): boolean;
function getConfiguredTier(): number;
```

## Testing Patterns

### Mock Setup

```typescript
import { setupMocks, resetMocks, createMockWorkflow } from '../mocks/foundry';

describe('TableSelector', () => {
  beforeEach(() => {
    resetMocks();
    // Set up specific setting mocks
    (game.settings.get as jest.Mock).mockImplementation((_, key) => {
      const defaults = { enabled: true, useActorLevel: true, fixedTier: '1' };
      return defaults[key];
    });
  });

  it('should select correct tier', async () => {
    const { TableSelector } = await import('../../src/services/TableSelector');
    expect(TableSelector.getTier(5)).toBe(2);
  });
});
```

### Testing Effect Application

```typescript
it('should apply condition effect', async () => {
  const { EffectsManager } = await import('../../src/services/EffectsManager');
  const token = createMockToken();
  const result = createMockRolledResult({
    effectType: 'condition',
    effectCondition: 'prone',
    duration: 0
  });

  await EffectsManager.applyResult(result, token);

  expect(token.actor?.createEmbeddedDocuments).toHaveBeenCalled();
});
```

## Adding New Tables

### Steps to Add a New Effect

1. **Edit the source JSON** in `tables/source/tierX/`
2. **Add the effect to results array:**
   ```json
   {
     "text": "Effect Name - Description",
     "weight": 5,
     "range": [X, Y],
     "img": "icons/path/to/icon.svg",
     "flags": {
       "dorman-lakelys-crit-fumble-tables": {
         "effectType": "condition",
         "effectCondition": "new_condition",
         "duration": 1
       }
     }
   }
   ```
3. **Adjust ranges** so they sum to 100
4. **Run `npm run build:tables`** to recompile
5. **If new condition type**, update `EffectsManager.ts`

### Adding a New Tier

1. Create folder `tables/source/tier5/`
2. Create all 6 JSON files (melee/ranged/spell x crits/fumbles)
3. Update `constants.ts` TIER_LEVELS
4. Update `module.json` packs array
5. Update build script tier list

## Development Workflow

### Branch Naming

- `feat/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation
- `test/` - Tests

### Version Bumps

```bash
npm run release:patch  # 1.0.0 → 1.0.1 (bug fixes)
npm run release:minor  # 1.0.0 → 1.1.0 (new features)
npm run release:major  # 1.0.0 → 2.0.0 (breaking changes)
```

### Before Committing

```bash
npm run lint:fix
npm run build
npm test
npm run build:tables
```

## Common Gotchas

1. **Midi-QOL must be active** - Module checks on ready and won't register hooks without it
2. **Tables must exist** - Import from compendiums or run build:tables
3. **Ranges must be contiguous** - No gaps in d100 ranges
4. **Weights must sum to 100** - Validation in build script
5. **Effect duration -1** means "permanent until healed"
6. **Save effects are simplified** - Currently auto-fail, needs enhancement
7. **Attack types map to actionType**:
   - `mwak` → melee
   - `rwak` → ranged
   - `msak`, `rsak` → spell

## Code References

When referencing code, use pattern `file_path:line_number`:

```
TableSelector service in src/services/TableSelector.ts:25
Tier calculation in src/constants.ts:65
```

## Localization

All user-facing strings in `lang/en.json` under `DLCRITFUMBLE` key:

```json
{
  "DLCRITFUMBLE": {
    "Settings": { ... },
    "Chat": { ... },
    "Errors": { ... }
  }
}
```

In code: `game.i18n.localize('DLCRITFUMBLE.KeyName')`

## Style Guide

### Linting

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

### Key Rules

- Use single quotes
- No trailing commas
- 100 character line width
- Prefix unused parameters with underscore (`_event`)

- Always ensure all tests pass before completing a task. Never leave failing tests.
- Always add tests for new functionality.
