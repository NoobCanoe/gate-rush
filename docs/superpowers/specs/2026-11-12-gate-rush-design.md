# Gate Rush — design

Date: 2026-11-12
Status: awaiting review

## Purpose

A relaxing, overpowered crowd-runner game for one person to play on their
iPhone. Original game in the gate-runner genre: it does not reuse the name,
characters, art, levels or look of any existing title.

Success means: it opens from a Home Screen icon, runs fullscreen and smoothly,
a level takes one to two minutes, and the player feels steadily more powerful.

## Decisions made with the user

- Delivered as a web game added to the iPhone Home Screen (no App Store, no Xcode).
- 3D view with the camera behind the army.
- Short levels ending in a boss, with coins and permanent upgrades.
- Rare, gentle failure: losing is possible but forgiving.
- Multiple weapon types.
- Sound effects, no music.

## Gameplay

### Controls

Portrait, one thumb. Dragging left and right moves the army across the road.
The army runs forward and fires automatically. There are no other inputs
during a run.

### A level

A level is a straight road taking 60–90 seconds, followed by a boss.
The road carries, in generated order:

- **Gate pairs.** Two gates side by side; the army passes through one.
  Types: add (+N), multiply (×N), and red trap gates (−N or ÷2).
  At least one gate of every pair is beneficial.
- **Enemy squads.** Groups of red soldiers that walk toward the army.
  Each enemy that reaches the army removes one soldier and dies.
- **Barrels.** Obstacles with a hit-point number. Shooting one to zero
  destroys it and drops coins. Running into one costs soldiers equal to a
  fraction of its remaining hit points.
- **Weapon crates.** A weapon on a pedestal with a hit-point number.
  Shooting it to zero equips that weapon for the rest of the run.

### Boss

A giant with a large hit-point bar stands at the end of the road and walks
slowly toward the army. The army stops and fires. While the boss is in
contact it removes soldiers every second. Killing it ends the level with a
coin shower. Every fifth level has a larger boss and a new road colour theme.

### Winning and losing

- Win: boss hit points reach zero. Coins are awarded for kills, barrels,
  the boss, and soldiers remaining.
- Lose: army size reaches zero. All coins earned in the run are kept.
  One tap retries the same level.
- Balance target: with sensible gate choices and no upgrades beyond what the
  coins so far could buy, the player wins every level with army to spare.
  Losing should require repeatedly choosing trap gates or ignoring enemies.

### Weapons

One weapon is active at a time and is shared by the whole army. Every run
starts with the Rifle. Other weapons are picked up from weapon crates and
last until the run ends or another crate is taken.

| Weapon | Behaviour | Unlocks at level |
|---|---|---|
| Rifle | Steady single shots, medium damage | 1 |
| Machine gun | Very fast fire, low damage per shot | 2 |
| Shotgun | Wide spread, high damage, short range | 4 |
| Rocket launcher | Slow fire, explosion damages everything nearby | 7 |
| Laser | Continuous beam that passes through every target in line | 10 |

A weapon only appears in crates once it is unlocked. Unlocking shows a short
"new weapon" card after the level. Each weapon is tuned so it is at least as
good as the Rifle overall and clearly better in its niche.

### Upgrades

Bought with coins on the screen between levels. Permanent.

- Starting army size
- Fire rate
- Damage
- Coin bonus
- Weapon level, one per unlocked weapon (raises that weapon's damage)

Costs rise geometrically but more slowly than coin income, so the player
out-scales level difficulty.

### Level generation

Levels are generated deterministically from the level number, so there is no
fixed last level and a retry replays the same layout. Enemy counts, barrel
hit points, and boss hit points scale with level number. Gate values scale
so that army sizes grow into the hundreds and then thousands.

## Presentation

- Bright, chunky low-polygon shapes built from primitives; no external art.
- Blue army, red enemies, coloured translucent gates with large numerals.
- Floating damage numbers, hit flashes, screen shake on large hits,
  coin showers, and a progress bar showing distance to the boss.
- Up to about 300 soldiers are drawn individually. Above that the counter
  keeps rising and the drawn crowd stays at the cap.
- Sound effects generated in code with the Web Audio API: shots (one per
  weapon), gate pass (good and bad), enemy and barrel destruction, coin
  pickup, weapon pickup, boss hit, boss death, win, lose, button tap.
  Sound starts on the first tap, as iOS requires. A mute button persists
  its setting. No music.

## Technical design

Plain HTML, CSS and JavaScript modules with Three.js vendored into the
project. No build step. The project lives in
its own folder, `Gate Rush/`.

| Unit | Responsibility | Depends on |
|---|---|---|
| `rules.js` | Pure game rules: gate maths, damage, weapon stats, upgrade costs, coin rewards | nothing |
| `levelgen.js` | Level number → list of road items and boss stats | `rules.js` |
| `sim.js` | Run state and its per-frame update: positions, collisions, firing, win/lose | `rules.js`, `levelgen.js` |
| `render.js` | Draws the sim state with Three.js (instanced meshes for crowds and bullets) | Three.js |
| `input.js` | Touch and mouse drag → steering value | nothing |
| `audio.js` | Synthesised sound effects, mute | nothing |
| `ui.js` | Menus: title, upgrades, win, lose, new weapon | `rules.js` |
| `save.js` | Loads and saves progress in `localStorage` | nothing |
| `main.js` | Game loop and screen flow; wires the units together | all |
| `sw.js`, `manifest.webmanifest`, icons | Offline caching and Home Screen install | — |

The simulation holds no Three.js objects, so `rules.js`, `levelgen.js` and
`sim.js` can be tested without a browser.

### Saved data

One `localStorage` record: current level, coins, upgrade levels, unlocked
weapons, mute setting, and a version number. A missing or unreadable record
starts a new game rather than failing.

### Error handling

- If WebGL is unavailable, show a plain message instead of a blank screen.
- If saving fails (private browsing, storage full), the game keeps running
  and progress lasts for the session.
- When the page is hidden, the run pauses and audio suspends.

## Testing

- Automated tests with Node's built-in test runner for `rules.js`,
  `levelgen.js` and `sim.js`: gate maths, upgrade costs, deterministic level
  generation, weapon unlock levels, win and lose conditions, and a
  simulated-run check that a simple "always take the better gate" player
  wins each of the first 30 levels.
- Manual play in a phone-sized browser on the Mac, then on the iPhone.
- Frame rate checked with the soldier cap reached.

## Delivery

The game needs an HTTPS address to be installable and work offline.
Proposed: GitHub Pages (free, public but unlisted address). **Not yet
confirmed by the user.** Nothing is published without their go-ahead.
During development the game can be opened from the Mac over home Wi-Fi.

Limits of the web route: no haptic feedback in Safari, and sound cannot
start before the first tap.

## Out of scope for the first version

Endless mode, skins, leaderboards, music, accounts, cloud save, landscape
orientation, Android-specific tuning.

## Amendment, 2026-11-12: more enemies, faster pace

After playing the first build the user asked for significantly more enemies,
arriving as a constant flow, and a faster pace. This replaces the affected
lines above.

- **Constant enemy stream.** Besides the set-piece squads, ranks of enemies
  march at the army for the whole run, thickening toward the boss. A level
  has over a thousand enemies instead of a few dozen.
- **Always overpowered.** The stream is sized to a share of what the army can
  currently kill, so a small army meets a thin stream and a huge army a flood.
  Enemies alone should not defeat a player; trap gates and barrels still can.
- **Piercing fire.** A bullet carries its leftover damage through weak enemies.
  Rocket launchers fire several rockets at separate clusters. The laser is a
  wide sheet.
- **Pace.** Run speed is 12 units a second (was 8) and enemies close faster.
  A level takes about 50–75 seconds before the boss (was 60–90).
- **Coins.** A kill is worth a tenth of a coin, since there are far more kills.
- Running into a weapon pedestal picks the weapon up at no cost.

## Amendment 2, 2026-11-12: choices with consequences, containers every level

The user found the game too easy: gate choices did not matter. This replaces
the "always overpowered" rule in the first amendment.

- **Fixed stream.** The enemy stream is set by the level, not by the army
  facing it. It is sized against a reference army: what a player has after
  middling gate picks, with the upgrades expected by that level and about half
  the containers opened. Enemies toughen along the level with that reference.
- **Consequences.** A player ahead of the reference mows the stream down; one
  behind it lets enemies through, and each one that arrives removes a soldier.
  The boss is sized the same way and removes soldiers faster on later levels.
- **Targets (automated players, levels 1–30, buying upgrades):** always the
  better gate wins every level; alternating better and worse wins nearly all
  with a much smaller army; always the worse gate loses most levels. Coins are
  kept on a loss, so upgrades eventually carry a stuck player through.
- **Gates.** About a third are traps, over a third are multiply-versus-add
  where the better side depends on current army size, the rest are two adds.
- **Containers in every level** (two on level 1, up to four later), each with a
  hit count. Shot open, one gives a different unlocked weapon or a power tier
  (★ to ★★★★★, +40% damage each) for the rest of the run; a container for the
  weapon already carried gives a tier. Bumping one unopened destroys it for
  nothing. Level 1 containers are all power tiers.

## Amendment 3, 2026-11-12: harder, and more enemies

The user still found it too easy and asked for more enemies.

- Stream enemies are weaker and about three times as numerous: a level has
  roughly 1,300 to 6,000 of them.
- Bullets fan out over ten lanes spanning the road, one tracer per soldier up
  to ten, so a small army's fire covers a whole rank.
- The reference army now sits closer to perfect gate picks (weight 0.7 on the
  better side), assumes a faster upgrade pace, and the stream demands 40% of
  its kill rate on level 1 rising to 85%.
- Targets (automated players, levels 1–40, buying upgrades): always the better
  gate wins every level but stops only about 90% of the stream; alternating
  wins about nine in ten; always the worse gate wins about one in ten.

## Amendment 4, 2026-11-13: a second mode, "Hold the Line"

The user asked for a second version in which the army stays put and must
choose between adding soldiers and adding firepower. Built as a second mode
inside Gate Rush, original in look and name.

- **Mode picker** on the title screen: Gate Rush and Hold the Line. Coins,
  upgrades and unlocked weapons are shared; each mode has its own level number.
- **Two lanes.** The right lane is a constant stream of cards, mostly +1 with
  some +3 and a few −2 to step around. The left lane holds containers with hit
  counts that give a weapon, a power tier or coins when shot open. Cards only
  count, and containers can only be shot, from their own lane.
- **The horde** comes down the whole road, sized against a reference player
  who splits their time between the lanes. Each level ends in a boss.
- **Targets (automated players, buying upgrades):** stepping across for each
  container and back wins levels 1–30; staying in the soldier lane reaches the
  boss but loses to it; staying in the container lane is overrun at once.
- Technically it reuses the same simulation and renderer: the camera is locked
  to the army, so the army appears to stand still while the road streams past.
  Cards share one mesh shape and one material per label.
