# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-07-10

### Fixed

- **Release packaging: bundle the `sounds/` and `icons/` folders.** The CI release workflows built `module.zip` without these folders, so installed releases were missing the crit/fumble sound effects (`sounds/*.mp3`, referenced by the sound settings) and the DM Guru logo (`icons/dmguru-logo.svg`, shown in the Patreon settings dialog). Both are now included in the packaged zip.

## [1.3.0] - 2026-07-10

### Fixed

- **Effect durations no longer vanish when the turn advances.** Timed effects (advantage/disadvantage, custom conditions, weapon/armor penalties) previously used `duration.turns` anchored to the attacker's turn, so a debuff applied to a target expired the instant the attacker clicked "Next". They now use DAE's combatant-relative `duration.expiry: "targetEnd"`, so they last until the end of the affected token's next turn. Requires DAE (already a Midi-QOL dependency).
- **Advantage/disadvantage on saves and ability checks now actually applies.** The Midi-QOL flag keys were built with an invalid `.ability.` segment (`flags.midi-qol.advantage.ability.save.dex`); corrected to Midi-QOL 14's real paths (`flags.midi-qol.advantage.save.dex`, `...advantage.check.str`). Attack and concentration keys were already correct.
- **Bonus crit/fumble damage now applies via Foundry's native damage card.** Damage die/type were read from the dnd5e ≤4.x `system.damage.parts`, which dnd5e 5.x removed — so `"1W"`/`"2S"` and weapon damage types silently fell back to `d6`/`bludgeoning`, and `MidiQOL.applyTokenDamage` applied nothing without a Midi setting. Damage is now rolled as a dnd5e `DamageRoll` read from `system.damage.base` (weapons) / the damage activity (spells), and posted as a standard damage card with **Apply / ½ / 2×** buttons pre-targeted to the crit/fumble token, for the GM to apply.

### Added

- **Logical per-event damage types.** Bonus damage now resolves a type appropriate to the result: explicit types (e.g. `force`, `fire`) are used as authored, while `"weapon"`/`"spell"` resolve to the source item's actual damage type. Spell-crit results that describe raw arcane damage now deal `force` (or `fire` where the flavor is explicitly fiery).
- **"Attack nearest ally" fumbles.** The previously-inert Wild Swing / Friendly Fire Risk fumbles (and their per-tier equivalents) now use a new `attackAlly` effect type: the fumbler targets their nearest living ally and is prompted to roll a real attack against them, resolving normal weapon damage on a hit. A re-entry guard prevents the forced attack from itself triggering crit/fumble handling.
- **Smoke-test harness** on the `DormanLakely` console API (`listResults`, `test`, `sweep`, `clearEffects`) for driving many crit/fumble results without live rolls.
- **Triple/quadruple-damage support** via new `"NWB"`/`"NSB"` damage tokens (N full copies of the weapon's/spell's base dice). Since a crit already rolls 2× dice on the attack card, a "triple damage" result adds `"1WB"` on the bonus card.

### Changed

- **Expanded and rebalanced all 24 tables.** Every table now carries more mechanically-real effects (standard-condition saves, real advantage/disadvantage, penalties, control effects), and the chance of "nothing happens" was lowered from a flat 40% to **25% at tier 1, 18% / 12% / 6%** at tiers 2–4. Weights follow a descending ladder so mild effects are common and game-swinging ones (stun, paralysis, exhaustion, max/burst damage) stay pinned at weight 1–2 and get relatively rarer at higher tiers.
- **Removed cosmetic "dead" conditions** (`slowed`, `glowing`, `bonus_attack`, `spell_locked`, `no_reactions`, `ammo_*`, `weapon_jammed`, etc.) that created a labeled Active Effect but enforced nothing, replacing them with standard conditions, penalties, `disarm`, `attackAlly`, or advantage/disadvantage that actually apply. Save DCs now scale by tier (11/13/15/17).

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
