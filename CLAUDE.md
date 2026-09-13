# CLAUDE.md - Technical Reference for AI Assistants

This document contains technical notes, patterns, and conventions for working on Dorman Lakely's Critical Hit & Fumble Tables module.

> **Note**: This is **developer documentation**. README.md is for end users.
>
> - **README.md**: User-focused, benefits-oriented, no technical jargon
> - **CLAUDE.md**: Developer-focused, implementation details, code patterns

## Project Overview

**Dorman Lakely's Critical Hit & Fumble Tables** is a FoundryVTT v14 module providing tier-based critical hit and fumble tables for D&D 5e. It hooks the dnd5e system's own attack-roll hooks directly and has **no dependency on Midi-QOL** or any other automation module.

**Key Dependencies:**

- FoundryVTT v14+
- dnd5e system 5.0+ (verified against 6.0.1). Midi-QOL may be installed but is ignored.
- DFreds Convenient Effects (optional, for enhanced conditions)

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

- Module hooks `dnd5e.rollAttackV2` (detection) and `dnd5e.preRollAttackV2` (target-granted adv/dis)
- Effects on actors the roller doesn't own are relayed to the active GM over the module's own socket
- Tier selection based on actor level (1-4, 5-8, 9-12, 13-20)
- Tables stored as JSON in `tables/source/`, compiled to `packs/`
- Effect types: none, condition, damage, save

## Architecture

### File Structure

```
src/
├── main.ts                    # Module entry; registers AttackHooks, GrantsEnforcer, GmSocket on ready
├── index.ts                   # Barrel export
├── constants.ts               # MODULE_ID, TIER_LEVELS, settings keys, flag paths
├── types/
│   ├── index.ts               # Type exports
│   ├── tables.ts              # TableResult, TableEffect interfaces
│   ├── foundry.d.ts           # Foundry API type declarations
│   └── attack.ts              # AttackContext, AttackItem, RollLike, DND5E_HOOKS, action-type helpers
├── services/
│   ├── index.ts               # Service exports
│   ├── AttackHooks.ts         # dnd5e.rollAttackV2 handler: crit/fumble detection, hit-vs-AC, dispatch
│   ├── GrantsEnforcer.ts      # dnd5e.preRollAttackV2 handler: target-side "grants" adv/dis
│   ├── GmSocket.ts            # module.<MODULE_ID> socket; executeAsGM(createEffects|toggleStatusEffect)
│   ├── CritSuppression.ts     # Per-target noCritical flag check (Midi-free)
│   ├── TableSelector.ts       # Picks correct table by tier/attack type
│   ├── EffectsManager.ts      # Applies conditions, damage, adv/dis, disarm, attackAlly
│   ├── SaveManager.ts         # Real saving throws for save-gated results
│   ├── WildMagicRoller.ts     # Silent wild magic surge roll for spell fumbles
│   ├── TableImporter.ts       # Imports compendium tables into the world
│   └── TestHarness.ts         # DormanLakely console API (listResults, test, sweep, clearEffects)
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
│   └── foundry.ts             # Mock game (settings, socket, users.activeGM), Hooks, createMockAttackContext
├── services/
│   ├── AttackHooks.test.ts
│   ├── GrantsEnforcer.test.ts
│   ├── GmSocket.test.ts
│   ├── CritSuppression.test.ts
│   ├── TableSelector.test.ts
│   ├── EffectsManager.test.ts
│   ├── TableImporter.test.ts
│   └── WildMagicRoller.test.ts
├── settings/
│   └── ModuleSettings.test.ts
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
      "type": "text",
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
      "type": "text",
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

## dnd5e Integration

The module has **zero runtime dependency on Midi-QOL**: no `MidiQOL` global, no `midi-qol.*` hooks, no `flags.midi-qol.*` writes, no `game.modules.get('midi-qol')` gating. Everything below is built on hooks and data paths that dnd5e 5.0+ provides natively (verified against 6.0.1). If Midi-QOL happens to be installed, dnd5e's hooks still fire and nothing special is needed.

Hook names live in `src/types/attack.ts`:

```typescript
export const DND5E_HOOKS = {
  ROLL_ATTACK: 'dnd5e.rollAttackV2',
  PRE_ROLL_ATTACK: 'dnd5e.preRollAttackV2'
} as const;
```

### Attack Roll Hook (`AttackHooks`)

`dnd5e.rollAttackV2` fires on the **rolling client only**, after the attack chat message is created. `AttackHooks.register()` subscribes on `ready`; the handler builds an `AttackContext` and dispatches to `handleCriticalHit` / `handleFumble`.

```typescript
Hooks.on('dnd5e.rollAttackV2', (rolls: D20Roll[], { subject, ammoUpdate }) => {
  // subject is the AttackActivity: subject.actor, subject.item, subject.id, subject.type === 'attack'
  const roll = rolls[0];
  if (!roll || subject?.type !== 'attack') return;

  const ctx = buildAttackContext(roll, subject);
  if (roll.isCritical && areCritsEnabled()) void handleCriticalHit(ctx);
  if (roll.isFumble && areFumblesEnabled()) void handleFumble(ctx);
});
```

Useful fields on `rolls[0]`: `isCritical` / `isFumble` (getters that honour the actor's crit threshold), `total`, `options.attackMode`, `options.advantageMode`, `d20` (the D20Die). `terms` still exists, so the raw-d20 extraction fallback below is kept for cases where the getters are unavailable.

Action type resolution (values `mwak` / `rwak` / `msak` / `rsak`), in priority order:

```typescript
const actionType =
  subject.getActionType?.(roll.options.attackMode) ?? // dnd5e 6.0
  subject.actionType ??                               // dnd5e 5.x getter
  getActionType(item);                                // module helper (legacy items)
```

### `AttackContext`

Replaces the old Midi workflow object. Defined in `src/types/attack.ts`:

```typescript
interface AttackContext {
  actor: Actor;
  item: AttackItem;
  activity?: AttackActivity;
  targets: Set<Token>;      // every token the user had targeted (fumble "grants" effects use these)
  hitTargets: Set<Token>;   // subset that actually hit, computed below
  attackRoll?: RollLike;
  isCritical: boolean;
  isFumble: boolean;
  actionType?: string;      // mwak | rwak | msak | rsak
}
```

Companion types: `AttackItem` (was `MidiQolItem`), `RollLike` (was `MidiQolRoll`), `DiceTermLike` (was `MidiQolDiceTerm`). Tests build one with `createMockAttackContext()` from `tests/mocks/foundry.ts` (default `hitTargets = targets`).

### Hit Detection vs AC

dnd5e exposes no `hitTargets`, so the module computes hits itself, mirroring `AttackMessageData#evaluatedTargets` in the system's attack card. `targets` is `game.user.targets` at hook time.

```typescript
function isHit(roll: D20Roll, targetActor: Actor): boolean {
  const ac = targetActor.statuses.has('coverTotal')
    ? null
    : targetActor.system.attributes?.ac?.value;
  const isMiss = ac === null || (!roll.isCritical && (roll.total < ac || roll.isFumble));
  return !isMiss;
}
```

Consequences: a crit hits every target except those with total cover; a fumble hits nothing; an unknown AC (no `ac.value`) counts as a hit unless total cover applies, matching dnd5e.

### D20 Result Extraction (fallback)

```typescript
function getD20Result(ctx: AttackContext): number | null {
  const d20Term = ctx.attackRoll?.terms.find(
    term => term.faces === 20 && term.results?.length > 0
  );
  const activeResult = d20Term?.results?.find(r => r.active);
  return activeResult?.result ?? null;
}
```

### Native Advantage / Disadvantage (self-side effects)

dnd5e models advantage with `AdvantageModeField` (a NumberField, -1 / 0 / 1). Effects write it via an Active Effect change with mode `CONST.ACTIVE_EFFECT_MODES.ADD` (= 2) and value `'1'` (advantage) or `'-1'` (disadvantage). ADD counts sources, so stacking advantage and disadvantage cancels to normal, which is correct 5e; do **not** use OVERRIDE.

Every key below is prefixed with `system.`:

| Module scope      | dnd5e key(s)                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `attack.all`      | `rolls.attack.mode`                                                                                                              |
| `attack.mwak` etc | `rolls.attack.mwak.mode` (`rwak` / `msak` / `rsak` likewise)                                                                     |
| `ability.all`     | `rolls.ability.check.mode`                                                                                                       |
| `ability.<abl>`   | `abilities.<abl>.check.roll.mode`                                                                                                |
| `save.all`        | `rolls.ability.save.mode`                                                                                                        |
| `save.<abl>`      | `abilities.<abl>.save.roll.mode`                                                                                                 |
| `concentration`   | `attributes.concentration.roll.mode`                                                                                             |
| `all`             | `rolls.attack.mode` + `rolls.ability.check.mode` + `rolls.ability.save.mode` + `rolls.ability.skill.mode` + `attributes.concentration.roll.mode` |

dnd5e combines `abilities.<abl>.attack.roll`, `rolls.attack` and `rolls.attack.<actionType>` when rolling an attack, so `rolls.attack.mode` alone covers all attacks. `rolls.ability.skill.mode` exists in the 6.0.1 creature template; per-skill `skills.<id>.roll.mode` also exists.

### Target-Side "Grants" (`GrantsEnforcer`)

Tables use `advantageTarget: 'grants'` with scopes `attack.all` ("attacks **against** the bearer get adv/dis") and `save.all`. dnd5e has **no native equivalent**, so the module enforces these itself:

1. `EffectsManager` writes the module's own flag on the effect: change key `flags.dorman-lakelys-crit-fumble-tables.grants.<advantage|disadvantage>.<scope>`, value `'1'`, mode OVERRIDE. Foundry applies unknown flag keys straight onto `actor.flags`.
2. `GrantsEnforcer.register()` subscribes to `dnd5e.preRollAttackV2`, which fires on the rolling client **before** the roll dialog. `onPreRollAttack(config)` inspects `game.user.targets`; if any target actor has `flags.<MODULE_ID>.grants.advantage.attack.all` (or `.attack.<actionType>`) it sets `config.rolls[0].options.advantage = true`; likewise for `disadvantage`. Both set means dnd5e resolves to a normal roll.

```typescript
Hooks.on('dnd5e.preRollAttackV2', (config, dialog, message) => {
  // config.subject is the AttackActivity; config.rolls[0].options.{advantage,disadvantage} are booleans
  const actionType = config.subject?.getActionType?.(config.rolls[0]?.options?.attackMode);
  if (GrantsEnforcer.targetsGrant(game.user.targets, 'advantage', actionType)) {
    config.rolls[0].options.advantage = true;
  }
  if (GrantsEnforcer.targetsGrant(game.user.targets, 'disadvantage', actionType)) {
    config.rolls[0].options.disadvantage = true;
  }
});
```

`grants` + `save.<X>`: the table semantics are "the target has advantage on its next save against you", which is applied as an ordinary self-side save advantage on the bearer, i.e. it maps to the same native key as `self` + `save.<X>`. Fumble-side grants were already rewritten to plain self-side effects on the fumbler's targets in `applyFumbleResult`; only crit results write true grants flags onto the victim.

### GM Socket (`GmSocket`)

Replaces `MidiQOL.socket().executeAsGM(...)`. Effects on actors the rolling user does not own are created by a GM client.

- **Channel**: `module.${MODULE_ID}` (`module.dorman-lakelys-crit-fumble-tables`), registered on `ready` via `game.socket.on(channel, handler)`.
- **API**: `GmSocket.executeAsGM(action, payload): Promise<void>` with `action` of `'createEffects' | 'toggleStatusEffect'`.
  - If `game.user.isGM`: run locally.
  - Else if `!game.users.activeGM`: `ui.notifications.warn(...)` and resolve (effect is skipped, not thrown).
  - Else: emit `{ type: 'request', id, action, payload, userId }` and await a matching `{ type: 'response', id, ok, error }`. A ~10s timeout rejects.
- **Handler**: only the client whose `game.user.id === game.users.activeGM?.id` executes requests (prevents double-apply when several GMs are connected), then emits the response. Non-originating clients ignore responses.
- **Actions**:
  - `createEffects({ actorUuid, effects, options })` → `(await fromUuid(actorUuid)).createEmbeddedDocuments('ActiveEffect', effects, options)`
  - `toggleStatusEffect({ actorUuid, statusId, options })` → `actor.toggleStatusEffect(statusId, options)`
- Unit-tested against a mocked `game.socket` (`{ on: jest.fn(), emit: jest.fn() }`) and `game.users.activeGM` in `tests/mocks/foundry.ts`.

### Crit Suppression (`CritSuppression`)

Adamantine-style "criticals against you become normal hits" has no native dnd5e automation. `CritSuppression` reads the flag directly, per hit target, from either `actor.flags['midi-qol']?.grants?.noCritical?.[key]` (still populated by DAE/Midi-authored items) or `actor.flags[MODULE_ID]?.noCritical?.[key]`, coercing with `isFlagEnabled`. Suppressed targets are dropped from `hitTargets`; if every hit target is suppressed the crit is cancelled outright (no table roll, sound or card).

### Damage Cards and Targets

dnd5e ≥5 stores a chat message's targets in `message.system.targets` (TargetsField descriptors `{ actor, token, name, img, ac }`); `flags.dnd5e.targets` is legacy. `postDamageActivityCard` passes **both** with the same descriptor array. With `damageCardMode` = `Automatic` the Activity card is always used (no Midi check); dnd5e 6's damage card lets a player apply to targets they own.

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
import { setupMocks, resetMocks, createMockAttackContext } from '../mocks/foundry';

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

1. **Hooks fire on the rolling client only** - `dnd5e.rollAttackV2` runs on whoever clicked the attack, so a player's crit executes on the player's client. Anything that needs GM permissions (effects on unowned actors, status toggles) must go through `GmSocket.executeAsGM`, and a connected GM is required for it to land. Midi-QOL is neither required nor consulted.
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
