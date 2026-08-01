# Capstone (roll 100) Result Proposals — v2, with the carnage put back

**Nothing is implemented.** Read, pick, tell me which.

## What changed from v1

v1 was too polite. It buried limb loss inside a referenced injuries table and topped out at
"save or drop to 0 HP". The classics of this genre are unapologetic: Rolemaster's crit tables
are legendary for entries like _"target's bones are vaporized, target is reduced to a liquid
paste. Try a ladle"_, limbs lopped off, and outright instant kills on specific rolls. If a
natural 20 does not occasionally take someone's head off, the table is not doing its job.

So: decapitation, severed limbs, disembowelment and instant death are now **on the table
itself**, at 100, where they belong.

---

## Two design points worth deciding first

### 1. Gore should follow damage type

The good tables branch carnage by how the weapon actually hurts you. Ours are split by
melee / ranged / spell, not damage type — but each result can check the weapon's type:

| Damage type     | Signature carnage                                       |
| --------------- | ------------------------------------------------------- |
| **Slashing**    | Decapitation, severed limbs, split open shoulder to hip |
| **Piercing**    | Impaled, run through, organ destroyed, eye taken        |
| **Bludgeoning** | Skull caved, bones pulped, ribs driven inward           |

A single capstone entry can read _"you take their head / run them through / cave their skull"_
based on `damageType`. That's one small helper and it makes 100 land right every time.

### 2. Crits and fumbles are NOT symmetrical

Crits are almost always rolled **by players against monsters** — beheading an orc is a
highlight. Fumbles happen **to players** — instant death there is a very different
proposition and most groups hate it.

So my recommendation: **crits can be outright lethal; fumbles maim, cripple and humiliate but
leave a save or a way back.** Every fumble option below follows that rule. Say the word if you
want fumbles equally lethal and I will write those too.

---

# MELEE CRIT

### Tier 1 — now: _Gut Wound_ — poisoned, DC11 CON

- **A · Opened Up** — "Your blade parts them from hip to navel. They try to hold themselves together."
  `2d6` + `save` DC11 CON · fail: `1d6` bleed at the start of each turn until magically healed
- **B · Hamstrung** — "You sever the tendon behind the knee. The leg simply stops working."
  `save` DC11 DEX · fail: speed halved, cannot Dash, until healed

### Tier 2 — now: _Ribcracker_ — stunned, DC13 CON

- **A · Ribs Driven Inward** — "You feel the ribs give and go somewhere ribs should not go."
  `save` DC13 CON · fail: `stunned` 1 round, then `1d8` bleed and disadvantage on CON until healed
- **B · Sword Arm Ruined** — "Your strike takes them through the shoulder joint. The arm hangs."
  `save` DC13 CON · fail: that arm is useless — no two-handed weapons, no shield, until healed

### Tier 3 — now: _Near-Fatal Blow_ — 4d10, DC15 CON

- **A · Severed Limb** — _slashing:_ "You take the arm off cleanly at the elbow."
  _piercing:_ "You run them through and the limb goes dead." _bludgeoning:_ "The bone shatters into gravel."
  `4d10` + limb is **gone** — needs _Regenerate_. `1d6` bleed each turn until stabilised
- **B · Disembowelled** — "You open them and their insides are suddenly outside."
  `4d10` + `save` DC15 CON at the start of each turn; **three consecutive failures → dead**

### Tier 4 — now: _Devastating Strike_ — 6d10, DC17 CON

- **A · DECAPITATED** — _slashing:_ "Their head leaves their shoulders and does not come back."
  _piercing:_ "You drive straight through the skull." _bludgeoning:_ "The head simply is not there any more."
  **Instant death** if the target has ≤ its damage threshold or is not Legendary; otherwise `6d10` and draw on **Carnage**
- **B · Split Asunder** — "You cleave them shoulder to hip. Both halves fall separately."
  **Maximum critical damage.** If that reduces them to 0 they are killed outright, no death saves

---

# RANGED CRIT

### Tier 1 — now: _Deadly Precision_ — frightened

- **A · Through the Hand** — "The shot pins their hand to the grip of their own weapon."
  `save` DC11 DEX · fail: drop held item, `1d8` piercing
- **B · Pinned** — "You nail them to whatever is behind them by the shoulder."
  `save` DC11 STR · fail: speed 0 until they spend an action tearing free (`1d4` doing so)

### Tier 2 — now: _Legendary Shot_ — frightened

- **A · Throat Shot** — "It goes through the throat. Whatever they were shouting stops."
  `2d8` + cannot speak or cast verbal components until magically healed
- **B · Lung Shot** — "They breathe and you hear it whistle."
  `save` DC13 CON · fail: `1d6` at start of each turn, speed halved, until healed

### Tier 3 — now: _Heart Shot_ — 4d10, DC15 CON

- **A · Eye Taken** — "The shaft goes in through the eye socket and stops somewhere behind it."
  `4d10` + that eye is **destroyed** permanently — needs _Regenerate_
- **B · Spine Shot** — "The shot finds the spine. Everything below it stops answering."
  `4d10` + `save` DC15 CON · fail: `paralyzed` until magically healed

### Tier 4 — now: _Heart-Piercing Shot_ — 6d10, DC17 CON

- **A · HEART PIERCED** — "You put it through the heart. They are dead before they land."
  **Instant death** unless Legendary; otherwise maximum critical damage
- **B · Through and Through** — "It goes through them and keeps going."
  Maximum damage to the target **and** the same to the next creature in line behind them

---

# SPELL CRIT

### Tier 1 — now: _Perfect Casting_ — frightened

- **A · Overcharged** — "More power arrives than you asked for."
  **Maximum** damage on the spell's dice
- **B · Seared** — "The magic cooks what it touches."
  `2d6` + `blinded` until the end of their next turn

### Tier 2 — now: _Stunning Spell_ — stunned

- **A · Mind Seared** — "The spell goes in behind the eyes and stays there."
  `save` DC13 INT · fail: `stunned` 1 round, cannot cast on their next turn
- **B · Flesh Warped** — "Something about them is the wrong shape now."
  `2S` + disadvantage on all physical checks until _Greater Restoration_

### Tier 3 — now: _Elemental Detonation_ — 1SB

- **A · Detonation** — "They come apart and take the space around them with it."
  `1SB` to the target, half to every creature within 10 ft
- **B · Immolated** — "They burn from the inside and keep burning."
  `1SB` + `1S` at the start of each of their turns until someone spends an action putting them out

### Tier 4 — now: _Elemental Detonation_ — 1SB _(identical to T3)_

- **A · ANNIHILATED** — "There is nothing left to bury. Not really."
  **Instant death** unless Legendary — no body, no remains, no _Revivify_. Otherwise `2SB`
- **B · Unmade** — "The spell takes them apart faster than they can fall."
  Maximum critical spell damage + `save` DC17 CON · fail: draw on **Carnage**

---

# MELEE FUMBLE _(maim, don't kill)_

### Tier 1 — now: _Wild Overswing_ — prone + 1d6, DC11 DEX

- **A · Overbalanced** — "Your own swing puts you on the floor."
  `prone` + take the damage you rolled
- **B · Fouled Grip** — "The haft twists and the edge comes back at your knuckles."
  `1d6` + disadvantage on your next attack

### Tier 2 — now: _Devastating Rebound_ — prone + 2d6, DC13 CON

- **A · Full-Force Backswing** — "The weapon comes all the way back around into you."
  **Maximum** weapon damage to yourself + `prone`
- **B · Opened Your Own Arm** — "The edge finds your forearm on the way past."
  `2d6` + `1d4` bleed at start of each turn until you or someone else stops it

### Tier 3 — now: _Devastating Rebound_ — prone + 3d6, DC15 CON _(dupe of T2)_

- **A · Fingers Gone** — "Two of your fingers are on the floor. You notice a moment later."
  Maximum weapon damage + disadvantage on all weapon attacks until magically healed
- **B · Weapon Fouled** — "The shock runs up the blade and the blade loses."
  Maximum weapon damage to yourself + weapon **damaged**: −1 to hit and damage until repaired

### Tier 4 — now: _Grievous Overswing_ — prone + 4d6, DC17 CON

- **A · Weapon Shattered, Body Follows** — "Your weapon fails and takes a piece of you with it."
  **Maximum critical** damage to yourself + weapon **breaks** (magical: DC15 or it survives)
- **B · Self-Maimed** — "You bury your own weapon in your own leg to the hilt."
  Maximum critical damage + `save` DC17 CON · fail: speed halved until _Greater Restoration_

---

# RANGED FUMBLE _(maim, don't kill)_

### Tier 1 — now: _Self-Impaling Bolt_ — 1d8 **bludgeoning** _(wrong type)_

- **A · Fouled Release** — "It leaves badly and opens your forearm on the way."
  `1d8` **piercing** to yourself
- **B · Snapped String** — "The string parts and takes the skin off your cheek."
  `1d4` + weapon unusable until you spend an action restringing

### Tier 2 — now: _Wild Ricochet_ — attack ally

- **A · Ricochet** — keep as-is; this is the right tier for hitting a friend
- **B · Shot Your Own Foot** — "You put it clean through your own boot."
  `2d6` piercing + speed halved until healed

### Tier 3 — now: _Wild Ricochet_ _(dupe of T2)_

- **A · Hard Ricochet** — "It comes off the stone with everything it had left."
  `attackAlly` at **advantage**; on a hit the ally takes **maximum** weapon damage
- **B · String Takes Your Eye** — "The string parts at the worst moment and comes back across your face."
  Maximum weapon damage + `blinded` until magically healed

### Tier 4 — now: _Wild Ricochet_ _(dupe of T2 and T3)_

- **A · Catastrophic Misfire** — "The weapon comes apart in your hands and goes through them."
  **Maximum critical** damage to yourself + weapon **breaks** + `save` DC17 CON or lose the use of that hand until _Regenerate_
- **B · Wild Volley** — "Every shot goes exactly where it should not."
  `attackAlly` against **two** different allies in range

---

# SPELL FUMBLE _(maim, don't kill)_

### Tier 1 — now: _Wild Magic Surge_ _(inconsistent with T2-T4)_

- **A · Move the surge to 97-98**, restore **Misfired Blast** at 99-100 — _recommended_
- **B · Keep as-is**

### Tier 2 — now: _Misfired Blast_ — attack ally

- **A · Misfired Blast** — keep as-is
- **B · Backfire** — "The spell turns around and finds you instead."
  The spell's damage applies to **you**, maximised

### Tier 3 — now: _Misfired Blast_ _(dupe of T2)_

- **A · Wild Misfire** — "It goes off in the worst available direction, and some of it comes home."
  `attackAlly` **and** you take `2S`
- **B · Weave Burn** — "The magic takes its price out of you directly."
  Lose your highest remaining slot, take `2S`, and your casting hand is burned useless until healed

### Tier 4 — now: _Misfired Blast_ _(dupe of T2 and T3)_

- **A · Catastrophic Misfire** — "It fails in every direction at once."
  `attackAlly` against **every** ally within 15 ft
- **B · Torn Weave** — "You lose your grip on magic itself, and it notices."
  Lose **all** slots of your highest level, take maximum spell damage, roll on the **Wild Magic** table

---

# The Carnage table (referenced by the T4 crits)

For targets too tough to behead outright. Your world has **no** lingering-injuries table — I
searched all 8 RollTable compendiums and found only madness and trinkets — so this ships with
the module. It reuses the wild magic plumbing exactly: a setting, a silent draw, rendered in
the crit card.

| d10 | Result                                                                                |
| --- | ------------------------------------------------------------------------------------- |
| 1   | Face ruined — disadvantage on Persuasion, advantage on Intimidation, permanent        |
| 2   | Ribs staved in — disadvantage on STR and CON checks until magically healed            |
| 3   | Eye destroyed — disadvantage on sight Perception; a second one blinds permanently     |
| 4   | Leg crippled — speed halved; a second one takes walking entirely                      |
| 5   | Hand maimed — cannot use two-handed items or somatic components                       |
| 6   | Guts opened — `1d6` at the start of each turn until magically healed                  |
| 7   | Jaw shattered — cannot speak or cast verbal components until healed                   |
| 8   | Limb severed — gone. Needs _Regenerate_                                               |
| 9   | Skull cracked — `stunned` 1 round, then disadvantage on INT/WIS/CHA until a long rest |
| 10  | **Killed outright** — whatever it was, it is over                                     |

---

# What these need mechanically

| Mechanic                                          | Used by                              | Cost                               |
| ------------------------------------------------- | ------------------------------------ | ---------------------------------- |
| `maximize: true` on damage                        | most fumbles, several crits          | small                              |
| `instantDeath` (with a Legendary/threshold guard) | crit T4 capstones                    | small–medium                       |
| Damage-type-aware text                            | all "sever / impale / crush" results | small helper                       |
| `breakWeapon` / `damageWeapon`                    | melee + ranged fumble T3-T4          | small — extends `disarm`           |
| Carnage table draw                                | crit T4 fallbacks                    | small — clone of `WildMagicRoller` |
| Bleed (damage at start of turn)                   | many                                 | medium — needs an over-time effect |
| Consecutive-failure death chain                   | Disembowelled                        | large — failure tracking           |
| Multi-target `attackAlly`                         | ranged/spell fumble T4               | medium                             |

---

# My picks

1. **Melee crit T4-A (DECAPITATED)**, **Ranged crit T4-A (HEART PIERCED)**, **Spell crit T4-A
   (ANNIHILATED)** — the three capstones that should make the table's reputation.
2. **Melee crit T3-A (Severed Limb)** and **Ranged crit T3-A (Eye Taken)** — real, permanent,
   memorable, and they stop T3 being a pale T4.
3. **Damage-type-aware carnage** — cheap, and it's what makes these land.
4. **The Carnage table**, so bosses and Legendary creatures still get something horrible when
   they survive the instant-death clause.
5. Fumble side: **maximum-damage-to-self ladder** at T2-T4, plus the T1 fixes.

Open question I'd want your call on: **should instant death be a setting?** Some groups will
love "natural 20 takes the head", others will not want their BBEG deleted by one roll. The
Legendary guard covers most of it, but a toggle is cheap.

---

# Sources

Mechanics and genre conventions only — no table content copied.

- [Rolemaster deconstruction: critical tables](https://www.rolemasterblog.com/rolemaster-deconstruction-critical-tables/)
- [Rolemaster — TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/TabletopGame/RoleMaster)
- [Critical Hits — WFRP 1e Wiki](https://wfrp1e.fandom.com/wiki/Critical_Hits)
- [Combat — Dungeon Crawl Classics](https://roll20.net/compendium/dcc/Combat)
- [Critical Fumble Charts — Hipsters & Dragons](https://www.hipstersanddragons.com/critical-misses-5e-dnd/)
- [Fumble Charts — Save Versus](https://saveversus.wordpress.com/2014/09/15/fumble-charts-dd-5th-edition/)
- [Critical Hit Tables — Roll them Tomes](https://rollthemtomes.com/critical-hit-tables-dnd-5e-optional-rules)
- [Critical Hit Tables (5e Variant Rule) — D&D Wiki](<https://www.dandwiki.com/wiki/Critical_Hit_Tables_(5e_Variant_Rule)>)
- [200 Critical & Fumble Tables (5E) — rob2e](https://rob2e.itch.io/200-critical)
