# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
