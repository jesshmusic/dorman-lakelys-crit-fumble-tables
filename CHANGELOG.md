# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.2] - 2026-04-08

### Added

- Branded `dungeonmaster.guru` cross-promotion card in the Patreon settings menu dialog, alongside the existing "Open Patreon" button. Uses the DM Guru logo and brand palette.

## [1.2.1] - 2026-04-07

### Added

- **Runtime dependency version warning** for Midi QoL. When Midi QoL is installed and active but its manifest declares itself incompatible with the running Foundry version (i.e. `compatibility.maximum` is below the current Foundry major, or `compatibility.verified` is behind), a notification now fires on `ready` naming the Midi QoL version and its declared max/verified. Hard-cap mismatches are permanent notifications; stale-verified mismatches are transient. The existing "Midi-QOL not active" error path is untouched.
- **`dungeonmaster.guru` cross-promotion link** in the PatreonLink settings menu dialog. The dialog now shows two paragraphs: the original Patreon hint, and an inline link to [dungeonmaster.guru](https://dungeonmaster.guru) for SRD rules and DM tools. The single "Open Patreon" button is unchanged.

## [1.2.0] - 2026-04-06

### Added

- Foundry VTT v14 compatibility (`compatibility.verified` bumped to `14`). **Minimum Foundry version bumped to 14**. Earlier versions of this module remain available for v13 users from the GitHub releases page; this version is v14-only by design.
- Verified against midi-qol v14.0.1 (verified pinned in `relationships.requires.midi-qol.compatibility`).

### Fixed

- **Three legacy `FormApplication` subclasses rewritten as `ApplicationV2`**: `ReimportTablesDialog`, `ResetSettingsDialog`, and `PatreonLink` (registered via `game.settings.registerMenu`) previously extended the v12-era `FormApplication` class, which was removed in v14. They are now thin `foundry.applications.api.ApplicationV2` stubs that hide their own shell window in `_onFirstRender` and immediately delegate to a `DialogV2.confirm` (or `DialogV2.prompt` for the Patreon link), then close themselves.
- **Three `Dialog.confirm` calls migrated to `DialogV2.confirm`**: two in `src/settings/ModuleSettings.ts` (the reimport and reset confirmations) and one in `src/services/TableImporter.ts` (the version-update prompt). The legacy `defaultYes: true|false` option is replaced with the v14 `yes: { default: true }` / `no: { default: true }` shape, and `title` moves under `window.title`.
- **`renderSettingsConfig` hook signature updated**: in v14 SettingsConfig is ApplicationV2 and the hook passes a single HTMLElement (no jQuery wrapper). The handler in `src/main.ts` now declares `(_app, html: HTMLElement)`.
- **`injectSoundPreviewButtons` rewritten to native DOM**: the previous dual-mode jQuery / HTMLElement helper used Foundry's bundled jQuery (`html.find().closest()`, `previewBtn.on('click', ...)`, `inputWrapper.append(...)`). The rewrite uses only `querySelector`, `closest`, `addEventListener`, and `appendChild`. Functionally identical, but no jQuery dependency.
- **AudioHelper namespace**: the sound preview now resolves `AudioHelper` through `foundry.audio.AudioHelper` (the v13/v14 location) with a `globalThis.AudioHelper` fallback for v12 worlds. The bare `AudioHelper` global is no longer referenced.

### Removed

- jQuery type shim (`interface JQuery`, `function $`) from `src/types/foundry.d.ts`. The module no longer depends on Foundry's bundled jQuery.
- Legacy `Dialog` and `FormApplication` ambient class declarations from `src/types/foundry.d.ts` (replaced with comments pointing at `foundry.applications.api.DialogV2` / `ApplicationV2`).
- The `registerMenu` `type` field is now typed as a generic constructor (`new (...args: any[]) => any`) so it accepts both ApplicationV2 and any remaining FormApplication subclasses.

### Notes (dnd5e 5.x audit)

- The dnd5e surface in this module is small: only `actor.system.details.level` and `actor.system.details.cr` for tier scaling. Both paths are unchanged in dnd5e 5.3.
- The bigger 5.3 risk is **midi-qol's** workflow shape (`workflow.attackRoll.terms`, `workflow.isCritical`, `workflow.isFumble`, `workflow.item`, `workflow.actor`, `workflow.hitTargets`, `workflow.targets`). midi-qol v14.0.1 maintains backwards compatibility for these — the existing `getD20Result` and `getAttackType` helpers continue to work.
- **DiceTerm namespace**: in v14 the canonical location is `foundry.dice.terms.DiceTerm`, but the bare `term.faces` / `term.results` property access in `getD20Result` still works because midi-qol returns the same Roll instance shape.

## [1.1.0] - 2026-02-04

### Added

- Bundle custom crit/fumble sound effects with the module (Stabs-Success.mp3, Stabs-Fail.mp3)
- Sound playback for `testSpecificFumble` debug function
- Patreon link and reset settings dialog templates

### Fixed

- Fix `toggleStatusEffect` to use Foundry v13 Actor API (`token.actor.toggleStatusEffect`) instead of Token
- Fix sound not playing during `testSpecificFumble` test function

### Changed

- Default crit/fumble sounds now use bundled module sounds instead of Foundry built-in sounds
- Settings QoL improvements

## [1.0.3] - 2026-02-04

### Added

- Add GitHub workflows and release infrastructure

### Fixed

- update all workflows to use npm install and Node 22
- address PR review feedback
- remove package-lock.json to regenerate in CI
- upgrade Node to v22 for lockfile compatibility
- use npm install instead of npm ci for cross-platform compatibility
- regenerate package-lock.json completely
- sync package-lock.json version with package.json
- regenerate package-lock.json to fix CI

### Changed

- more tracked files
- bump version to 1.0.1

### Other

- Initial commit: Dorman Lakely's Critical Hit & Fumble Tables

## [1.0.1] - 2026-02-02

### Added

- Add GitHub workflows and release infrastructure

### Fixed

- CI workflow compatibility issues

## [1.0.0] - 2024-02-02

### Added

- Initial release
- 24 roll tables (4 tiers × 3 attack types × 2 result types)
- Tier-based system scaling with character level/CR
- Midi-QOL integration for automatic crit/fumble detection
- Automatic effect application (conditions, damage, penalties)
- Disarm effect that unequips weapons
- Penalty effects for weapon/armor damage (-2 modifiers)
- Times Up integration for effect duration
- Configurable settings for GM control
- Re-import tables functionality
- Debug functions for testing (DormanLakely.simulateCrit, etc.)
- Full test suite with 83 passing tests
