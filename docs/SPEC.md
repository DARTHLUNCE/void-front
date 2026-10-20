# Void Front — Architecture & Design Spec

Oct 20, 2026 · Landon Sellers

## Overview

Void Front is a browser-based team space shooter: two fleets of up to 100 ships each fight across a large map for capture points, forward bases and finally the enemy mothership. It is inspired by warin.space; "Void Front" is a working title. This spec is the build brief for Claude Code. It states what to build, how to structure it, and how to know each phase is done.

A single-file playable prototype already exists (void-front.html). It proves the core loop: bot-filled teams, crystal farming, levels, stat points and a 22-hull evolution tree. Treat it as a reference for game feel, not as code to extend.

## Design pillars

- **Chaos you can read.** Hundreds of ships on screen, but you always know where the fight is, what you're flying and what to do next.
- **Every class plays differently.** Six base models, each with a quirk that changes how you fly, not just bigger numbers.
- **Territory matters.** Capture points feed your team resources; resources buy fleet-wide tools; you cannot win by ignoring the map.
- **Comebacks are possible.** A lead should be an advantage, never a guaranteed win. The prototype showed this is the first thing to break.
- **Playable alone, better together.** Bots fill every empty slot, so a match is full from the first minute.

## Design calls on the big asks

Each of the four headline asks is kept, but three needed a constraint to be buildable and fun. These are decided; change them here before Claude Code starts, not mid-build.

| Ask | Decision | Why |
|---|---|---|
| Map 10x bigger | 10x the area: 22,000 × 11,000 units (about 3.2x each side). | 10x per side is 100x the area. At prototype speed, crossing it would take 4.5 minutes and 200 ships would almost never meet. Even at 10x area the map needs cruise drive, jump gates and terrain to feel alive (see Map). |
| 6 base models, 5 upgrade tiers | 6 classes × 5 tiers × 2 choices = 60 upgrade nodes, 18 hull models. You pick A or B at each tier. Only tier 3 changes the hull model. | If every tier branched into new hulls, 6 classes would need 372 hulls. Nobody can balance that. Two choices per tier still gives 32 builds per class (192 total) from 60 pieces of content. |
| FOBs or capture points before the main base | Both routes. The mothership's shield drops if all 3 of its FOBs are destroyed or the enemy holds 5 of 7 capture points for 60 seconds. | Two win routes means a team that loses the siege can still win on territory, and the reverse. It also keeps every part of the map relevant all match. |
| Capture points speed up a resource, like Empire at War | 3 resources (Alloy, Energy, Intel) from 3 point types, spent by a Fleet Commander on team-wide tools. | A resource with nothing to spend it on is just a number. Resources never buy ship power directly, because that would stack on top of XP and make snowballing worse. |

One more call: build 2 classes completely before the other 4 (see Roadmap). 60 nodes is still a lot of content, and the first two classes will expose every problem in the ability system cheaply.

## Match structure

A match targets 20–30 minutes with a hard limit of 35. You win by destroying the enemy mothership, and its shield must come down first.

**Shield rule (the Aegis Grid).** Each mothership starts shielded and takes no damage while shielded. The shield drops when either is true:

1. Siege route: all 3 of that team's FOBs are destroyed.
2. Territory route: the enemy holds 5 or more of the 7 capture points continuously for 60 seconds ("Grid Overload").

The shield comes back up once neither condition has been true for 30 seconds, for example after the defenders rebuild a FOB or retake points. That gives the losing side a real way back.

**Match flow**

1. Opening (0–4 min). Both fleets race for capture points. FOBs are full strength. Most ships are tier 0–1.
2. Midgame (4–18 min). Resource fights, the first FOB sieges, Fleet Command abilities come online.
3. Breach (18+ min). A shield drops. The attacking team pushes the mothership while defenders try to restore the grid.

**Time limit.** If 35 minutes pass, the team with more Victory Points wins: 1 point per 1% of enemy mothership hull removed, 5 per enemy FOB destroyed at that moment, 3 per capture point held. Ties go to the side with more total kills.

**Mothership.** 60,000 hull, 4 turrets (range 900, 22 damage every 0.24 s each), heals allies within 600 units by 7% of max hull per second, and is the default respawn point and a jump gate.

## Map

The launch map, Kessler Reach, is 22,000 × 11,000 units and point-symmetric about its center (11,000, 5,500), so neither side has a better position. Every coordinate below for one team mirrors to (22,000 − x, 11,000 − y) for the other.

| Structure | Cobalt position | Ember position | Linked capture point (Cobalt / Ember) |
|---|---|---|---|
| Mothership | (1,500, 5,500) | (20,500, 5,500) | None; respawn and jump gate |
| FOB North | (5,500, 2,000) | (16,500, 2,000) | Refinery West / Array East |
| FOB Center | (6,000, 5,500) | (16,000, 5,500) | Nexus / Nexus |
| FOB South | (5,500, 9,000) | (16,500, 9,000) | Array West / Refinery East |

**Terrain.** Open space at this size feels empty, so the map has four terrain types:

- Asteroid belts block projectiles and ships. They form lanes and cover. Bots path around them.
- Nebulae hide ships inside them from enemy vision and the minimap, and reduce vision for ships inside to 900 units.
- Gravity wells pull ships gently toward their center. A well sits near each Relay to make those fights messy.
- Debris fields spawn crystals faster. They are where new and respawning pilots farm safely, one per side.

**Travel.** Base ship speeds are 185–360 units/s, so three systems keep the map crossable:

- Cruise drive (hold Shift): after a 1 s spool-up, speed ×2.5. You can't fire or use abilities, and taking damage drops you out. Crossing the map takes about 35 s.
- Jump gates at the mothership and every standing FOB. Channel 4 s to jump to any friendly gate. 20 s cooldown per pilot.
- Respawn select. On death, pick the mothership or any FOB that hasn't taken damage in the last 10 s (plus Engineer beacons).

**Vision.** Each ship sees 1,800 units; structures and held points see 2,500. Enemies outside your team's combined vision are not drawn and not sent to your client. Default camera shows about 2,200 × 1,250 units and zooms out 40% while cruising. The minimap shows terrain, structures, points and anything your team can see.

The map mirrors through its center: Cobalt's north FOB is linked to an Alloy point and Ember's to an Energy point, and the south lane is the reverse, so each lane is worth fighting for both sides.

## Objectives

Seven capture points sit in no-man's-land and three FOBs guard each side. Points feed resources; FOBs protect the mothership; each FOB is linked to one point, so the two systems lean on each other.

### Capture points

| Point | Position | Resource | Income | Held buff (team-wide, stacks per point) |
|---|---|---|---|---|
| Nexus | (11,000, 5,500) | Energy | 2/s | +15% XP gain |
| Relay North | (11,000, 1,500) | Intel | 1/s | +10% vision radius |
| Relay South | (11,000, 9,500) | Intel | 1/s | +10% vision radius |
| Refinery West | (8,000, 3,500) | Alloy | 1/s | +10% hull regen |
| Refinery East | (14,000, 7,500) | Alloy | 1/s | +10% hull regen |
| Array West | (8,000, 7,500) | Energy | 1/s | −5% ability cooldowns |
| Array East | (14,000, 3,500) | Energy | 1/s | −5% ability cooldowns |

**Capturing.** Each point has a 450-unit radius and a 0–100 control meter. Ships inside push it toward their team at 4/s each, up to 4 ships (16/s). Engineers count double. If both teams are inside, it is contested and does not move. A held point at 100 must be pushed back through 0 before it flips. Cloaked ships capture at half rate and don't show as contesting.

**Hot zones.** At minutes 8, 16 and 24, one random point becomes a Hot Zone for 3 minutes: double income and a visible beacon on every minimap. This pulls the fight around the map so it never settles into one lane.

### FOBs

- 12,000 hull, 2 turrets (range 700, 18 damage every 0.3 s), heals allies within 450 units by 5% per second.
- Respawn point and jump gate while standing.
- Armored link: a FOB takes 50% damage unless the attacking team holds its linked capture point. Take the point first, then the FOB.
- Destroyed FOBs leave a wreck site. After 90 s the Fleet Commander can rebuild it for 600 Alloy; an Engineer must stay within 300 units for the 20 s build. A rebuilt FOB returns at 50% hull.

## Resources and Fleet Command

Each team banks three resources from the points it holds, and one pilot per team, the Fleet Commander, spends them. Think Empire at War's planet income, spent the way Hell Let Loose's commander spends munitions and fuel.

**Income.** Every team gets a base trickle of 0.5/s of each resource so a team with zero points isn't locked out. Points add the income in the Objectives table. Each enemy FOB destroyed pays 150 Alloy. The bank caps at 1,500 per resource so teams can't hoard for 20 minutes.

**Comeback pricing.** If a team holds 2 or fewer points, every Fleet Command action costs 30% less.

### Fleet Command actions

| Action | Cost | Cooldown | Effect |
|---|---|---|---|
| Rebuild FOB | 600 Alloy | per site | Rebuilds a wreck site (needs an Engineer present, 20 s) |
| Defense platform | 200 Alloy | 45 s | Drops a 2,500-hull turret platform anywhere your team has vision, lasts 3 min |
| Hull reinforcement | 300 Alloy | 120 s | +5% mothership hull |
| Orbital strike | 400 Energy | 90 s | 600-unit circle, 3 s warning visible to everyone, then 400 damage to ships, 2,000 to structures |
| Fleet overcharge | 300 Energy | 120 s | Whole team gets −20% ability cooldowns for 30 s |
| Recon sweep | 150 Intel | 40 s | Reveals a 3,000-unit circle for 15 s, cloaked ships included |
| Signal jam | 250 Intel | 120 s | Your team vanishes from the enemy minimap for 30 s |
| Rally order | 100 Intel | 30 s | Places a waypoint; bots on your team weight it heavily for 60 s |

### The commander

- Any human can press C → Take command. If two volunteer, the higher-level pilot gets it. If the commander leaves or goes idle for 90 s, command passes on.
- With no human commander, a bot commander runs a simple rule set: rebuild FOBs first, strike clusters of 6+ enemies, sweep when a point is lost.
- The commander still flies a ship. Command actions are used from a minimap overlay (C to open, click to target), so commanding costs attention, not participation.
- Commanders earn a small XP trickle (1 XP/s) so the job doesn't hold them back.

## Ship progression

You pick one of six classes when you spawn, then make five A-or-B choices as you level. Tier 3 is the big one: it swaps your hull model and upgrades your signature ability into a specialization. Tier 5 unlocks an ultimate.

| Tier | Unlocks at | What the choice is |
|---|---|---|
| Base | Lv 1 | Class picked at spawn: hull, gun, quirk, signature ability |
| 1 | Lv 3 | Weapon mod |
| 2 | Lv 7 | Survival or mobility mod |
| 3 | Lv 12 | Specialization: new hull model + upgraded signature ability |
| 4 | Lv 18 | Passive that defines your role in fights |
| 5 | Lv 25 | Ultimate on its own key, 60–90 s cooldown |

**Levels and XP.** Max level 30. XP to the next level = 14 + 8 × current level (same curve as the prototype; about 4,000 XP to reach Lv 30). XP comes from crystals, kills (30 + 10 × victim level), damage to structures (0.12 XP per point), capturing (20 per flip) and the Nexus buff.

**Stat points.** Kept from the original and the prototype: 1 point per level into Weapons, Hull, Engines or Reactor, 7 max each. Same effects as the prototype (+12% damage, +15% hull, +7% speed, +6% fire rate and −5% cooldown per point).

**Death and respawn.** You keep 60% of your XP, never less than 80% of the enemy team's average level. You keep your class and your past picks: when you re-reach a tier, your previous choice is pre-selected and one key confirms it. You can switch class on the respawn screen; that keeps your XP but clears your picks. Respawn takes 5 s plus 0.2 s per level (max 11 s).

## Controls

| Action | Mouse steering (classic) | WASD mode |
|---|---|---|
| Move | Point where you want to go | W A S D |
| Fire | Hold left click (Lancer: hold to charge) | Same |
| Signature ability | Right click | Right click |
| Ultimate (tier 5) | Space | Space |
| Cruise drive | Hold Shift | Hold Shift |
| Stat points | Q W E R | Z X C V |
| Tier choice | 1 or 2 | 1 or 2 |
| Auto-fire toggle | X | F |
| Fleet Command overlay | C | C |
| Scoreboard / big map | Tab / M | Tab / M |

## The six classes

Each class covers one job and has one quirk that changes how it flies. Numbers are starting values for balance testing, not final.

| Class | Role | Hull | Speed (u/s) | Gun | Signature (RMB) | Quirk |
|---|---|---|---|---|---|---|
| Interceptor | Flanker | 140 | 320 | Twin rapid, 100 DPS | Phase Dash, 5 s | Momentum |
| Phantom | Assassin | 130 | 330 | Twin precise, 110 DPS | Ambush cloak, 11 s | Ghost Drive |
| Dreadnought | Frontline tank | 300 | 200 | Heavy cannons, 95 DPS | Bulwark shield, 12 s | Heat |
| Lancer | Sniper | 150 | 240 | Rail rifle, 50–150 DPS | Rail Beam, 6 s | Charge Shot |
| Carrier | Summoner | 220 | 225 | Light gun, 35 DPS | Launch Swarm, 12 s | Drone Bay |
| Engineer | Support / builder | 200 | 245 | Nanite gun, 40 DPS | Repair Pulse, 10 s | Field Engineer |

### Interceptor

Quirk, **Momentum**: after 2 s flying within 30° of straight, gain up to +15% speed and +30% damage. A sharp turn or taking a hit resets it. Signature, **Phase Dash**: fast dash, no damage taken during it.

| Tier | Option A | Option B |
|---|---|---|
| 1 | Split Barrels — +1 barrel, −15% damage per shot | Tracer Rounds — hits slow targets 10% for 1 s |
| 2 | Afterburner Tank — Phase Dash holds 2 charges | Reactive Plating — first hit after a dash deals 50% less |
| 3 | Striker — dash becomes Blink Strike: teleport up to 380 u, 50 damage in 130 u where you land | Comet — dash becomes Ram Charge: 90 damage and knockback to anything you hit |
| 4 | Hunter's Mark — ships you dash past take +20% damage from your team for 4 s | Slipstream — allies flying behind you within 300 u gain +15% speed |
| 5 | Storm Run — 6 s of unlimited dashes, 70 s | Missile Swarm — 12 homing missiles, 30 damage each, 60 s |

### Phantom

Quirk, **Ghost Drive**: cloaks automatically after 3 s without firing or taking damage. Firing breaks it. Signature, **Ambush**: instant 4 s cloak; your first volley out of cloak deals ×2.

| Tier | Option A | Option B |
|---|---|---|
| 1 | Silenced Guns — your first shot doesn't break cloak | Shredder Rounds — crits add a 30-damage bleed over 3 s |
| 2 | Ghost Step — 250 u blink while cloaked, 8 s cooldown | Sensor Ghost — invisible to Recon Sweep and the enemy minimap |
| 3 | Wraith — Ambush lasts 5 s and crits deal ×3 | Specter — Ambush also spawns 3 decoys that draw bot fire |
| 4 | Executioner — +40% damage to targets under 35% hull | Saboteur — ×2 damage to structures and turrets for 3 s after leaving cloak |
| 5 | Assassinate — mark a target within 900 u, teleport behind it, guaranteed crit volley, 75 s | Blackout — 6 s zone (700 u) where enemies lose minimap, names and health bars, 80 s |

### Dreadnought

Quirk, **Heat**: sustained fire builds heat. Above 50% heat you deal +20% damage; at 100% your guns lock for 2 s. Riding the edge is the skill. Signature, **Bulwark**: shield blocks 80% of damage for 4 s.

| Tier | Option A | Option B |
|---|---|---|
| 1 | Heavy Shells — +30% damage, −20% fire rate | Flak Spread — 3-shot spread, −35% damage per shot |
| 2 | Ablative Hull — +20% max hull | Heat Sinks — heat builds 30% slower |
| 3 | Bastion — Bulwark becomes Aegis: 85% block for 4.5 s and reflects enemy shots | Juggernaut — Bulwark becomes Overdrive: ×2 fire rate, no heat, +35% speed for 5 s |
| 4 | Anchor — immune to knockback and pulls; +25% damage reduction when not moving | Rampage — kills vent all heat and cut Overdrive's cooldown by 50% |
| 5 | Siege Mode — lock in place 8 s; guns become artillery, ×2 range, 120 u splash, ×1.5 vs structures, 75 s | Fortress Dome — 600 u dome that blocks enemy projectiles for 5 s, 85 s |

### Lancer

Quirk, **Charge Shot**: hold fire up to 1.5 s; a full charge deals ×3 and pierces 2 extra targets. Turning is capped at 180°/s. Signature, **Rail Beam**: instant 1,000 u beam, 110 damage to everything in the line.

| Tier | Option A | Option B |
|---|---|---|
| 1 | Long Barrel — +25% range | Quick Capacitor — charge time −30% |
| 2 | Targeting Uplink — enemies you hit are revealed to your team for 4 s | Recoil Thrusters — a full-charge shot pushes you 200 u back |
| 3 | Railstorm — Rail Beam fires 3 beams in a spread | Eclipse — Rail Beam becomes Event Horizon: a black hole at your cursor that pulls and crushes for 3.2 s |
| 4 | Headhunter — full-charge hits on higher-level ships deal +50% | Overpenetration — each target pierced adds +15% damage to the shot |
| 5 | Orbital Lance — target any point your team can see; 2 s later a 400-damage beam hits a 250 u circle, 80 s | Gravity Collapse — pull everything within 500 u to the center, stun 1.5 s, 85 s |

### Carrier

Quirk, **Drone Bay**: always has 2 permanent drones that respawn 8 s after dying and grow stronger with your level. Your own gun is weak. Signature, **Launch Swarm**: 4 extra attack drones for 12 s.

| Tier | Option A | Option B |
|---|---|---|
| 1 | Interceptor Drones — drones +40% speed, −20% damage | Bomber Drones — slower drones with 80 u splash, ×2 vs structures |
| 2 | Bay Expansion — +2 permanent drones | Point Defense — drones shoot down missiles and mines near you |
| 3 | Hive — Launch Swarm sends 7 fast drones; drone hits heal you for 20% of damage | Overlord — Launch Swarm becomes EMP Burst: 380 u pulse, slows and silences 2.5 s, destroys enemy drones |
| 4 | Drone Link — +2% hull regen per second per active drone | Command Uplink — drones attack whatever is under your cursor |
| 5 | Mothership Mode — become immobile for 10 s, spawn 12 drones and a turret ring, 85 s | Kamikaze Wing — every drone dives your cursor point and explodes for 80 damage each, 70 s |

### Engineer

Quirk, **Field Engineer**: captures points at double rate, builds and rebuilds FOBs, and its gun heals friendly ships and structures it hits. Signature, **Repair Pulse**: heals you 35% and allies within 300 u for 25%.

| Tier | Option A | Option B |
|---|---|---|
| 1 | Nanite Rounds — heal on allies raised to 60% of gun damage | Salvager — your kills pay your team 15 Alloy |
| 2 | Turret Kit — deploy 1 auto-turret for 20 s, 14 s cooldown (on a second key, G) | Mine Layer — drop 6 proximity mines, 9 s cooldown (G) |
| 3 | Fortress — Repair Pulse also builds 2 turrets and a 300 u shield emitter | Warden — Repair Pulse becomes a heal beam locked to one ally for 6 s |
| 4 | Rapid Rebuild — FOB rebuild time −50% and possible while contested | Overcharge — allies you heal gain +20% fire rate for 3 s |
| 5 | Forward Beacon — deploy a 60 s mini-FOB: respawn point, 1,500 hull, 90 s | Restoration Field — 8 s zone (500 u) healing allies 10% per second, 80 s |

Hull models needed: 6 base + 12 specializations = 18. Tier 5 can be shown by an emissive trim on the tier-3 hull rather than a new model.

## Combat systems

Every ability in the game, all 60 nodes included, must be built from a small set of shared primitives configured by data. No ability gets one-off code. This is what keeps 60 nodes buildable and balanceable.

### Ability primitives

| Primitive | Parameters | Used by (examples) |
|---|---|---|
| Dash | speed multiplier, duration, invulnerable, charges | Phase Dash, Ram Charge |
| Teleport | max distance, target (cursor / behind target), arrival effect | Blink Strike, Ghost Step, Assassinate |
| ProjectilePattern | count, spread, speed, damage, size, life, pierce, homing turn rate, splash | guns, Barrage, Missile Swarm |
| Beam | length, width, count, spread, damage, delay | Rail Beam, Railstorm, Orbital Lance |
| AreaPulse | radius, damage, falloff, status to apply, affects (ships / drones / structures) | EMP Burst, Repair Pulse, Blink landing |
| Zone | radius, duration, per-second effect, pull strength | Event Horizon, Blackout, Restoration Field |
| Summon | unit type (drone / decoy), count, life, AI behavior | Launch Swarm, Mirage, Drone Bay |
| Deploy | structure type (turret / mine / emitter / beacon), cap per owner, life, hull | Turret Kit, Fortress, Forward Beacon |
| SelfStatus | status, duration | Cloak, Bulwark, Overdrive, Siege Mode |
| Modifier | stat, amount, condition | all tier 1, 2 and 4 passives |

An ability is a list of primitives run in order (Blink Strike = Teleport then AreaPulse). Modifiers attach conditions like "while cloaked", "target below 35% hull" or "within 300 u of an ally".

### Status effects

Slow, silence (no firing or abilities), stun, cloak, shield (damage reduction %), reflect, mark (+% damage taken), bleed, overdrive, heat, invulnerable, revealed. Each has a duration, a stacking rule (refresh, stack, or strongest wins) and a visual. Silence and stun last at most 2.5 s, and the same target can't be stunned again for 4 s after a stun ends.

### Damage order

Base damage → attacker modifiers (stat points, momentum, heat, crit, mark) → defender reduction (shield, anchor) → hull. Structures take a separate multiplier per source (e.g. Bomber Drones ×2). Friendly fire is off.

### Snowball controls

The prototype's first versions let one early fight decide the whole match. These controls fixed it there and are required here:

- Respawn floor: never respawn below 80% of the enemy team's average level.
- Trailing-team XP: the team behind on kills earns up to +60% XP (scales with the gap, full bonus at 160 kills behind).
- Bounty: killing a ship 3+ levels above you pays ×1.6 XP.
- Shield recovery and comeback pricing (see Match structure and Fleet Command).
- Respawn time grows with level (5–11 s), so high-level deaths cost more.

## Bots and AI

On a map this size, bots that each decide alone will scatter or clump. Bots need a team brain (the Fleet Director) that assigns jobs, and a pilot brain that carries them out.

### Fleet Director (one per team, runs every 2 s)

1. Score every objective: capture points by value (Hot Zone ×2, Nexus ×1.5), contest state and distance; own FOBs by threat (enemy ships nearby, hull lost); enemy FOBs by whether their linked point is held.
2. Assign each bot one job: Capture, Defend, Assault (a FOB or the mothership), Escort (follow a human) or Farm (debris field, only below Lv 6).
3. Keep minimums: at least 15% of bots on defense, never more than 40% of the team on one objective.
4. Every 70–100 s, call a fleet push on the best target for 30 s. The prototype needed these waves to stop matches from stalling.
5. Obey Rally orders from the commander.

### Pilot brain (per bot, every frame, decisions every 0.3–0.45 s)

- Travel: path to the job on a coarse grid (500 u cells) around asteroid belts; cruise when no enemy is within 2,000 u; use jump gates when that's faster.
- Fight: pick the nearest visible threat within 800 u; keep a preferred range per class (Lancer far, Dreadnought close); strafe; lead shots.
- Abilities: each node is tagged (move, heal, guard, stealth, hit, close-range, structure). The bot fires an ability when its tag's condition is true, e.g. heal below 65% hull, close-range when an enemy is within 350 u.
- Retreat: below 30% hull, fall back to the nearest FOB or mothership unless a heal is ready.
- Builds: each bot rolls a stat-point weighting and picks tier options by a class preference table with some randomness, so the harness sees every node used.
- Skill spread: aim error between 0.03 and 0.12 radians per bot, so bots range from easy to sharp.

**Fairness rule from the prototype:** all ships must move before any ship aims or fires in a tick. When aiming happened inside the movement loop, the team updated second won about 75% of matches.

## Technical architecture

One simulation package runs everywhere: in a Web Worker for offline play, on the server for multiplayer, and in Node for the balance harness. Write it once and the same game logic is tested, played solo and served online.

The client and server only exchange inputs and snapshots; all game rules live in the shared package, so the harness tests exactly what players play.

### Stack

- Language: TypeScript everywhere, strict mode.
- Repo: pnpm workspaces monorepo.
- Client: Vite build, PixiJS (WebGL) for the battlefield, plain DOM for menus and HUD. The prototype's Canvas 2D will not hold 200 ships, thousands of projectiles and a 22k map at 60 fps.
- Server: Node with a WebSocket library (ws or uWebSockets.js), one process hosting several match rooms.
- Tests: Vitest for unit tests; the harness for balance.

### Repo layout

```
void-front/
  packages/
    shared/        simulation, content data, protocol (no DOM, no Node APIs)
      src/sim/       world, systems, spatial hash, seeded RNG
      src/content/   classes, nodes, abilities, maps (data only)
      src/net/       message types, binary encode/decode
    client/        renderer, HUD, input, prediction, offline worker
    server/        rooms, tick loop, interest management, bot backfill
    harness/       headless match runner + balance reports
  docs/
    SPEC.md        this document
    CLAUDE.md      conventions for Claude Code
```

### Simulation tick (30 Hz, fixed step)

1. Apply inputs (humans) and decisions (Fleet Director + pilot brains).
2. Move every ship, resolve terrain and structure collisions, separation.
3. Then aim, fire and run abilities for every ship (two-pass, see the fairness rule).
4. Step projectiles, beams, zones, drones, deployables; resolve hits.
5. Apply damage, statuses, deaths, XP, level-ups.
6. Update capture points, FOBs, shields, resources, Fleet Command.
7. Match state: Hot Zones, pushes, win and time-limit checks.
8. Cleanup and emit events (kills, flips, explosions) for clients.

Rules for the sim: entities in pooled arrays, never allocated per frame; all spatial queries through one spatial hash (512 u cells); all randomness from a seeded RNG so a match can be replayed from its seed and inputs; no rendering or timing calls inside shared.

## Multiplayer and performance

The server is authoritative: clients send inputs, the server runs the sim and sends back what each player can see. Multiplayer comes after the game is fun offline (Roadmap phase 4), but the sim is built for it from day one.

### Netcode

- Inputs up: clients send input frames at 60 Hz (move vector, aim angle, buttons) with a sequence number.
- Prediction: the client predicts its own ship's movement and corrects to the server's position when they differ (reconciliation). Everything else is shown 100 ms in the past and interpolated between snapshots.
- Snapshots down: 30 Hz, delta-compressed against the last snapshot the client confirmed, binary encoded with quantized positions and angles.
- Projectiles as events: send a spawn event (origin, angle, speed, seed), not a position every tick. Clients simulate the flight. This is the biggest bandwidth saving.
- Interest management: each client gets full updates only for entities within 3,000 u of its ship or inside its team's vision. Structures, points, scores and the minimap list go to everyone at 2 Hz.
- Rooms: one match per room, up to 100 v 100. Bots fill every empty slot; a joining human replaces a bot on the smaller team.
- Hosting: a single small VPS to start. No accounts or persistence until after phase 4.

### Performance budgets

| Measure | Target |
|---|---|
| Server tick, 200 ships + 3,000 projectiles | ≤ 12 ms on one core |
| Client frame rate, mid-range laptop, busiest fight | 60 fps |
| Download per client | ≤ 30 KB/s average, ≤ 60 KB/s peak |
| Upload per client | ≤ 4 KB/s |
| Offline mode (sim in worker), 100 v 100 | 60 fps render, sim at full 30 Hz |

Client rendering rules: cull everything off screen; one sprite batch per layer; particle cap of 2,000; name labels only within 1,200 u; level-of-detail for ships when zoomed out (cruise).

## Data schemas

All content lives in `packages/shared/src/content` as typed data. Adding or rebalancing a node should mean editing data, never touching systems. These types are the starting contract; Claude Code may extend them but should not bypass them.

```ts
type ClassId = 'interceptor' | 'phantom' | 'dreadnought' | 'lancer' | 'carrier' | 'engineer';

interface ShipClass {
  id: ClassId;
  name: string;
  role: string;
  hull: number;            // base max hull
  speed: number;           // units per second
  radius: number;
  turnRate?: number;       // radians/s cap (Lancer)
  gun: GunDef;
  quirk: QuirkId;          // 'momentum' | 'ghostDrive' | 'heat' | 'chargeShot' | 'droneBay' | 'fieldEngineer'
  signature: AbilityDef;
  hullModel: string;       // base art key
  tiers: [TierDef, TierDef, TierDef, TierDef, TierDef];
}

interface TierDef {
  level: 3 | 7 | 12 | 18 | 25;
  options: [NodeDef, NodeDef];
}

interface NodeDef {
  id: string;              // 'lancer.t3.eclipse'
  name: string;
  description: string;     // player-facing, one sentence
  modifiers?: ModifierDef[];
  replacesSignature?: AbilityDef;   // tier 3
  ultimate?: AbilityDef;            // tier 5
  extraAbility?: AbilityDef;        // e.g. Engineer tier 2 on G
  hullModel?: string;               // tier 3 only
  botTags: AbilityTag[];
}

interface GunDef {
  damage: number; fireInterval: number; projectileSpeed: number;
  count: number; spread: number; size: number; life: number;
  pierce?: number; splash?: number; homingTurn?: number;
  chargeMax?: number;      // Lancer
  heatPerShot?: number;    // Dreadnought
}

interface AbilityDef {
  id: string; name: string; cooldown: number;
  steps: PrimitiveDef[];   // run in order
}

type PrimitiveDef =
  | { kind: 'dash'; speedMul: number; duration: number; invulnerable?: boolean; charges?: number }
  | { kind: 'teleport'; maxDistance: number; target: 'cursor' | 'behindTarget' }
  | { kind: 'projectiles'; gun: Partial<GunDef> }
  | { kind: 'beam'; length: number; width: number; count: number; spread: number; damage: number; delay?: number }
  | { kind: 'pulse'; radius: number; damage?: number; heal?: number; status?: StatusApply; affects: Affects[] }
  | { kind: 'zone'; radius: number; duration: number; perSecond: Partial<Effect>; pull?: number }
  | { kind: 'summon'; unit: 'drone' | 'decoy'; count: number; life: number; params: Record<string, number> }
  | { kind: 'deploy'; structure: 'turret' | 'mine' | 'emitter' | 'beacon'; count: number; cap: number; life: number; hull: number }
  | { kind: 'selfStatus'; status: StatusId; duration: number; params?: Record<string, number> };

interface ModifierDef {
  stat: StatId; op: 'add' | 'mul'; value: number;
  when?: ConditionId;      // 'cloaked' | 'targetBelow35' | 'nearAlly300' | ...
}

interface MapDef {
  id: string; width: number; height: number;
  motherships: [Vec2, Vec2];
  fobs: { team: 0 | 1; pos: Vec2; linkedPoint: string }[];
  points: { id: string; pos: Vec2; resource: 'alloy' | 'energy' | 'intel'; income: number; buff: ModifierDef }[];
  terrain: TerrainDef[];   // belts (polygons), nebulae, wells, debris fields
}
```

## Testing and balance harness

The harness is not optional. In the prototype, three serious bugs (a 75% side bias, runaway snowballing and a 15-minute stalemate) were invisible in normal play and obvious after 30 simulated matches. Build the harness in phase 0 and run it after every gameplay change.

What it does: `pnpm harness --matches 50 --fleet 60 --seed 1` runs full bot-only matches headless at maximum speed and writes a report (JSON + a short Markdown summary).

### Report and targets

| Metric | Target | Fail if |
|---|---|---|
| Side win rate | 45–55% | outside 40–60% over 50 matches |
| Median match length | 20–30 min | under 15 or over 34 |
| Matches ending by time limit | under 15% | over 25% |
| Comebacks (winner trailed in kills at minute 10) | 20%+ | under 10% |
| Win route split (siege vs territory) | both above 20% | either under 10% |
| Class share of kills | 12–22% each | any over 26% or under 8% |
| Tier option pick rate (bots) | 35–65% per option | any under 20% (dead option) |
| Capture point flips per match | 15+ | under 8 (map not moving) |
| Sim tick time, 100 v 100 | ≤ 12 ms | over 16 ms |

### Unit tests (required)

- Capture meter: contest, ship cap, Engineer double rate, cloak half rate, flip through zero.
- Shield gating: both routes drop it, 30 s recovery, FOB armored link.
- Each primitive in isolation, then one test per class signature.
- Determinism: same seed + same inputs = identical match state after 10,000 ticks.
- Fairness: a mirrored start state produces mirrored outcomes for 300 ticks.

## Build roadmap

Build in six phases and don't start a phase until the previous gate passes in the harness. The game should be fun offline with bots before any multiplayer work begins.

Phase 0 is the current step. Phases 1 and 2 split the classes so the ability system is proven on two classes before content is built for the other four.

> Note: the per-phase roadmap table was not included in the pasted copy of this spec. Phase 0's scope is taken from the kickoff prompt below; phase 4 = multiplayer and phase 5 = audio/mobile are referenced elsewhere in the spec.

## Open decisions

Each has a default so Claude Code is never blocked. Change the default here if you disagree.

| Decision | Default in this spec | Alternative |
|---|---|---|
| Final name | Void Front (working title) | Anything not using "warin.space" |
| Death penalty | Keep 60% XP, keep class and picks | Full reset to base class (harsher, like diep.io) |
| Commander | Human volunteer, else bot | Bot only |
| Default match size | 60 v 60, max 100 v 100 | 100 v 100 default |
| Progression between matches | None: every match starts at Lv 1 | Cosmetic unlocks only (never stat power) |
| Art direction | Flat vector ships with team-color glow, like the prototype | Pre-rendered sprites (much more art work) |
| Mobile | Not supported until after phase 5 | Touch controls in phase 5 |
| Audio | Phase 5 | Earlier, if game feel needs it |

## Claude Code kickoff

Export this doc as Markdown, save it as docs/SPEC.md in an empty repo, add the prototype as docs/reference/void-front-prototype.html, then start Claude Code with the prompt below. Work one phase per session and review the harness report before moving on.

> You're building Void Front, a browser team space shooter. The full spec is docs/SPEC.md. Read it completely before writing code. A single-file prototype is at docs/reference/void-front-prototype.html; use it for game feel and the lessons it encodes (two-pass update, snowball controls, push waves), not as code to extend.
>
> Start with Phase 0 only:
>
> 1. Set up the pnpm monorepo exactly as in "Repo layout", TypeScript strict, Vitest.
> 2. Write docs/CLAUDE.md with the conventions you'll follow (no one-off ability code, all randomness seeded, nothing in packages/shared touches DOM or Node APIs).
> 3. Build the shared sim with the 30 Hz tick order from the spec, the spatial hash, seeded RNG and pooled entities.
> 4. Port the prototype's loop: one class (Interceptor base only), crystals, levels, stat points, two motherships, bots.
> 5. Build the offline client (PixiJS renderer, sim in a Web Worker) and the headless harness.
> 6. Run the harness for 30 matches and paste the report.
>
> Stop at the end of Phase 0 and summarize what's done, what deviated from the spec and why, and what you need decided. Don't start Phase 1 until I say so. If the spec is ambiguous, pick the option that keeps content data-driven and note it.
