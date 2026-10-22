# Void Front v2.0 — Complete Overhaul Specification & Claude Code Prompt

> [!TIP]
> **Ready to hand to Claude Code.** Copy the kickoff prompt in **Section 0** below and paste it directly into Claude Code, or tell Claude to read `rework-concept/CLAUDE_REWORK_SPEC.md`.
> An interactive reference build with all PBR sprites, Shard steppers, Reactor Power shunting, and Armor/Caliber calculators is available at [`rework-concept/tech-tree-v2.html`](file:///C:/VOID%20FRONT/rework-concept/tech-tree-v2.html).

---

## 0. Copy-Paste Kickoff Prompt for Claude Code

```text
Read docs/CLAUDE.md, docs/SPEC.md, and rework-concept/CLAUDE_REWORK_SPEC.md completely before writing code.

You are implementing the Void Front v2.0 Gameplay & UI Overhaul defined in rework-concept/CLAUDE_REWORK_SPEC.md (and visualized in rework-concept/tech-tree-v2.html). Follow every architecture rule in docs/CLAUDE.md strictly:
- Keep packages/shared 100% pure TypeScript (no DOM, no Node APIs, no Math.random, no timers).
- All randomness must use the deterministic Rng stream.
- Keep all abilities and passives data-driven through primitives and modifiers in packages/shared/src/content and packages/shared/src/sim/systems/abilities.ts (extend primitives/modifiers cleanly with tests; never add one-off ability ID branches).
- Preserve the two-pass fairness rule (all ships move and resolve collisions in step 2 before any ship aims, fires primary guns, fires secondary auto-turrets, or casts abilities in step 3).

Execute the rework in clean, verifiable phases:
1. Simulation Core & Combat Math (packages/shared):
   - Dramatic ship, node, FOB, and Titan radius scaling (Section 3).
   - Regenerating Energy Shield layer + Armor Rating + Directional Bow/Stern Armor (+25% front 90° bow arc, -25% rear 90° stern arc) + Weapon Caliber (AP) penetration curve + Overpenetration on light hulls (Section 2).
   - Reactor Power Shunting (Speed / Weapons / Shields / Equalized 50-50-50) controlled by Arrow Keys (Section 1).
   - Signed throttle supporting -40% reverse thrust (up to -55% with nodes) on Mouse Wheel (Section 4).
   - Keep Primary Weapons axial/front-mounted and add loose auto-aim Secondary Turrets to Frigate through Dreadnought (Section 3).
   - Collidable Asteroid Nodes (110u radius) that block all projectiles as line-of-sight cover, plus bot orbit stand-off pathing (Section 5).
   - Shard Calibration stat upgrade tuning (Weapons, Hull & Plating, Engines, Reactor) and removal of the Tier-3 shard upgrade wipe (Section 6).
2. 9-Class Content & 90 Skill Tree Nodes (packages/shared/src/content/classes/*):
   - Implement all reworked base stats, axial guns, secondary auto-turrets, torpedo rebalance (1 base -> 3 at T3 -> 5 sequential at T5), Frigate Node-healing/fortification rework (never heal FOBs or Titans), and all 90 reworked nodes in Section 7.
3. Client HUD, Controls, Renderer & Home Screen (packages/client):
   - Update Input (Arrow Keys = Power Shunting, Wheel = -40%..+100% Throttle, Ctrl+Wheel = Zoom), Cockpit HUD (Reverse throttle LEDs + 3-channel Power indicator + Shield bar), Renderer (scaled hulls/sprites, secondary turret fire, glancing ricochet sparks), and rebuild the Home Screen with the far-left Launch Dock + 5-tab right terminal (Tech Tree, Cosmetic Drydock, How to Play, Settings, Patch Notes) in Section 8.
4. Verification:
   - Run pnpm typecheck, pnpm test, and pnpm harness --matches 30 --fleet 60 --seed 1, and summarize the updated balance report.
```

---

## 1. Reactor Power Shunting (`←` Speed / `↑` Weapons / `→` Shields / `↓` Equalize)

Every ship gains a **3-Channel Reactor Power State** (`powerMode: 'balanced' | 'speed' | 'weapons' | 'shields'` on `Ship` and `ShipInput`):

| Keybind | State | Power Split (SPD / WPN / SHD) | Multipliers Applied in Sim |
|---|---|---|---|
| **Down Arrow (`↓`)** | `balanced` *(default)* | **50% / 50% / 50%** | `1.00×` Top Speed & Accel · `1.00×` Weapon DPS & AP · `1.00×` Shield Cap & Regen |
| **Left Arrow (`←`)** | `speed` | **100% / 33% / 33%** | **`1.25×` Top Speed**, **`1.35×` Accel**, `−0.3s` Sub-Light spool · `0.80×` Weapon DPS · `0.70×` Shield Cap & Regen |
| **Up Arrow (`↑`)** | `weapons` | **33% / 100% / 33%** | **`1.25×` Primary DPS**, **`+15%` Primary AP Caliber**, **`1.15×` Secondary Turret ROF**, `−30%` Heat/Charge time · `0.82×` Speed · `0.70×` Shield Cap & Regen |
| **Right Arrow (`→`)** | `shields` | **33% / 33% / 100%** | **`1.40×` Max Energy Shield**, **`2.00×` Shield Regen Rate** (allows 25% combat regen trickle), `+15%` Shield DR · `0.82×` Speed · `0.80×` Weapon DPS |

- **Bot Pilot Brain (`pilot.ts`):** Bots dynamically shift power based on job state: `speed` while traveling/retreating, `weapons` when attacking structures/targets with >60% shield, and `shields` when taking heavy focus fire (<50% shield).

---

## 2. Armor Rating, Laser Calibers (AP), Directional Angling & Overpenetration

### 2.1 Energy Shield + Hull Layer
- Every ship now has `shield` / `maxShield` in addition to `hull` / `maxHull`.
- Shields regenerate at `8% maxShield/s` after `3.5s` without taking damage (or continuously at `2% maxShield/s` even in combat when Reactor Power is set to **`→` Max Shields**).
- Incoming hits strike `shield` first (modified by Shield DR and anti-shield modifiers), and overflow damage strikes `hull` through the **Armor vs. Caliber** formula below.

### 2.2 Directional Armor Arcs
When a projectile or beam hits a ship at impact angle $\theta$ relative to the defender's facing `target.angle`:
- **Bow Arc ($|\Delta\theta| \le 45^\circ$, front $90^\circ$ cone):** $\text{EffectiveArmor} = \text{Armor} \times (1 + \text{bowArmorBonus})$ where default $\text{bowArmorBonus} = 0.25$ (**+25% Bow Armor**).
- **Flank Arc ($45^\circ < |\Delta\theta| < 135^\circ$):** $\text{EffectiveArmor} = \text{Armor}$ (**100% Base Armor**).
- **Stern Arc ($|\Delta\theta| \ge 135^\circ$, rear $90^\circ$ engine cone):** $\text{EffectiveArmor} = \text{Armor} \times 0.75$ (**−25% Stern Armor**).

### 2.3 Caliber Penetration & Overpenetration Formula (`damageShip`)
Each weapon/projectile carries `ap: number` (Armor Penetration / Caliber) and `noOverpen?: boolean`:
1. **Overpenetration Check (Heavy Slugs vs. Paper-Thin Scouts):**
   If `!p.noOverpen && p.ap >= effectiveArmor * 3.5`, the heavy shell/rail slug punches clean through thin plating without transferring full energy:
   $$\text{ArmorMul} = 0.65 \quad (\text{Overpenetration})$$
2. **Standard Penetration Curve:**
   $$\text{ArmorMul} = \text{clamp}\left(\left(\frac{\text{WeaponAP}}{\text{EffectiveArmor}}\right)^{0.75},\, 0.25,\, 1.00\right)$$
   - **Full Penetration ($\text{ArmorMul} = 1.00$):** Full hull damage.
   - **Partial Penetration ($0.65 \le \text{ArmorMul} < 1.00$):** Reduced hull damage.
   - **Glancing Ricochet ($\text{ArmorMul} < 0.65$):** Emits a ricochet event/spark so the player sees their small-caliber weapon bouncing off heavy armor.

---

## 3. Dramatic Size Scaling + Axial Primary Guns + Loose Auto-Aim Secondary Turrets

### 3.1 Dramatic Hull & Structure Size Ladder
Update `ShipClass.radius`, `CLASS_SCALE` in `art/hulls.ts`, `HULL_CLASS_SCALE` in `content/thrusters.ts`, `MAX_SHIP_RADIUS` in `combat.ts` (raise to `165`), and `SpatialHash` cell size (raise from `512` to `768`):

| Entity / Class | Old Radius | New Radius | Base Hull | Base Shield | Base Armor (Bow / Flank / Stern) | Primary Axial Gun (Caliber / AP) | Loose Auto-Aim Secondary Turrets |
|---|---|---|---|---|---|---|---|
| **Patrol Craft** | `13 u` | **`22 u`** | `220` | `70` | **`19 / 15 / 11`** | Twin 20mm Pulse (`22 AP`, 88 DPS) | *None* |
| **Corvette** | `16 u` | **`28 u`** | `260` | `90` | **`25 / 20 / 15`** | Twin 30mm Phase (`34 AP`, 96 DPS) | *None* |
| **Frigate** | `20 u` | **`38 u`** | `400` | `160` | **`40 / 32 / 24`** | Nanite Lance (`32 AP`, 55 DPS) | **1× Dorsal PD/Nanite** (`20 AP`, 22 DPS, `±18°`) |
| **Destroyer** | `24 u` | **`52 u`** | `540` | `180` | **`56 / 45 / 34`** | Dual 50mm Autocannon (`52 AP`, 102 DPS) | **2× 25mm Flak** (`24 AP`, 18 DPS ea, `±16°`) |
| **Cruiser** | `30 u` | **`72 u`** | `780` | `280` | **`75 / 60 / 45`** | Triple 75mm Laser (`65 AP`, 118 DPS) | **3× 30mm Deck Laser** (`32 AP`, 16 DPS ea, `±15°`) |
| **Battlecruiser** | `34 u` | **`90 u`** | `1020` | `340` | **`94 / 72 / 54`** | Twin 105mm Plasma (`88 AP`, 132 DPS) | **4× 40mm Casemates** (`42 AP`, 18 DPS ea, `±16°`) |
| **Battleship** | `40 u` | **`118 u`** | `1500` | `500` | **`115 / 92 / 69`** | Twin 150mm Gauss (`105 AP`, 140 DPS) | **6× 35mm Auto-Batteries** (`35 AP`, 15 DPS ea, `±18°`) |
| **Carrier** | `44 u` | **`135 u`** | `1350` | `560` | **`103 / 82 / 62`** | Axial Designator (`48 AP`, 68 DPS) | **6× 22mm CIWS Mounts** (`25 AP`, 14 DPS ea, `±17°`) |
| **Dreadnought** | `48 u` | **`155 u`** | `1850` | `620` | **`138 / 110 / 83`** | 240mm Spinal Rail (`135 AP`, 148 DPS) | **8× 25mm Blisters** (`28 AP`, 12 DPS ea, `±20°`) |
| **Asteroid Node** | `110 u` | **`110 u`** | `6,000` | — | **`65`** | Optional Fortified Node Turret | Solid collision + blocks projectiles |
| **FOB Station** | `170 u` | **`320 u`** | `36,000` | — | **`95`** | 2× Station Turrets | Heal & spawn hub |
| **Fleet Titan** | `280 u` | **`520 u`** | `60,000` | — | **`110`** | 4× Twin Capital Turrets | Mothership objective |

### 3.2 How Secondary Auto-Turrets Work (`combat.ts`)
- **Primary Weapons** remain fixed axial/front weapons fired along `s.angle` when the player holds `LMB` (or toggles auto-fire).
- **Secondary Auto-Turrets** on `frigate`, `destroyer`, `cruiser`, `battlecruiser`, `battleship`, `carrier`, and `dreadnought` are mounted at symmetric hull offsets around the ship.
- In Pass 3 (`aimAndFire`), each secondary turret independently acquires the nearest visible, non-cloaked enemy within its `range` (Destroyer & Carrier CIWS prioritize enemy missiles/torpedoes and starships first, then ships) and fires automatically using the ship's deterministic `s.rng`:
  $$\theta_{\text{shot}} = \text{leadAngle}(\text{turret}, \text{target}) + (s.\text{rng.next}() - 0.5) \times 2 \times \text{jitterRad}$$
- Because `jitterDeg` starts at `±15°` to `±20°`, secondary turrets look awesome spraying suppressive tracer fire around massive capital ships without aimbotting fast small craft at range—unless the ship invests in **Fire-Control / Turret skill tree nodes**!

---

## 4. Controls: `-40%` Reverse Throttle & Keybind Update

- **Throttle on Mouse Wheel (`-40%` to `+100%`):**
  - Update `Input` in `packages/client/src/input.ts`: `THROTTLE_MIN = -0.4` (or down to `-0.55` with class nodes), stepping in `10%` increments (`-40%, -30%, -20%, -10%, 0%, +10% ... +100%`).
  - Mouse Wheel adjusts throttle; `Ctrl + Wheel` (or `+` / `-`) zooms the camera.
  - **Arrow Keys (`ArrowLeft`, `ArrowUp`, `ArrowRight`, `ArrowDown`)** switch Reactor Power (`speed`, `weapons`, `shields`, `balanced`).
- **Reverse Physics (`movement.ts`):**
  - Send signed `throttle` in `InputFrame`.
  - When `throttle < 0`, disable Sub-Light (`Shift`) spooling. In Mouse Steering mode, attitude jets still turn the ship's nose (`s.angle`) toward `inp.aim`, while retro-thrusters drive velocity backward along `-Math.cos(s.angle), -Math.sin(s.angle)` up to `|throttle| * speed`.

---

## 5. Asteroid Node Collision, Projectile Cover & Frigate Node Rework

1. **Physical Ship Collision (`resolveCollisions` in `movement.ts`):**
   - Push all ships out of `w.points` at radius `NODE.radius + s.radius` (`110 + s.radius`) just like `w.structures`, regardless of whether the node is neutral, friendly, or enemy.
2. **Line-of-Sight Projectile Cover (`stepProjectiles` in `combat.ts`):**
   - Previously, projectiles skipped neutral and friendly nodes (`if (pt.owner < 0 || pt.owner === p.team) continue;`).
   - Now **every projectile** checks collision against all 7 Asteroid Nodes (`NODE.radius = 110`). If `pt.owner >= 0 && pt.owner !== p.team`, it damages the enemy node as before; if neutral or friendly, the asteroid rock simply blocks and absorbs the projectile!
3. **Bot Orbit Stand-Off (`pilot.ts`):**
   - Update bot navigation around capture points so bots orbit/strafe at `NODE.radius + s.radius + 90` (inside the `450u` capture ring, outside the `110u` asteroid rock) instead of driving straight into `(pt.x, pt.y)`.
4. **Frigate Base-Heal Removal $\rightarrow$ Node Fortification (`frigate.ts`, `abilities.ts`):**
   - **Never allow Frigate abilities or guns to heal FOBs or Titans (`w.structures`).**
   - Frigate's `Axial Nanite Lance` and `Repair & Shield Pulse` heal friendly ships and **friendly Asteroid Nodes (`w.points`)** + deployables.
   - Tier 4A `Node Bastion Protocol` and Tier 5A `Node Citadel Overhaul` repair friendly Nodes, grant them temporary Armor, and mount defensive laser turrets / respawn capability onto the Node!

---

## 6. Shard Calibration Stat Upgrades & Economy Tuning

- **Keep all 4 Shard Calibration Tracks (`0–7` levels each, costs `[12, 18, 26, 36, 50, 68, 90]` = `300 Shards` per track / `1,200 Shards` total):**
  1. **Weapons (`Q` / `Z`):** `+8%` Primary & Secondary Turret Damage and `+2 AP` Caliber per level *(max `+56% Dmg`, `+14 AP`)*.
  2. **Hull & Plating (`W` / `X`):** `+15%` Max Hull & Max Shield and `+3 Armor Rating` per level *(max `+105% Hull/Shield`, `+21 Armor`)*.
  3. **Engines (`E` / `C`):** `+7%` Top Speed & Reverse Thrust per level *(max `+49% Speed`)*.
  4. **Reactor (`R` / `V`):** `+6%` Fire Rate & Shield Regen and `−5%` Ability Cooldowns per level *(max `+42% ROF`, `−35% CD`)*.
- **Remove the Tier-3 Shard Reset (`progression.ts`):** Unlocking a Tier-3 specialization hull **no longer wipes your Shard stat upgrades**. Players keep all purchased Shard levels across their entire match lifecycle.

---

## 7. Complete 9-Class & 90-Node Reworked Skill Trees

### 7.1 Patrol Craft (`patrol`) — *Light Interceptor / Scout*
- **Scale & Survivability:** Radius **`22 u`** *(was `13 u`)* · **`220` Hull** + **`70` Energy Shield** · **Base Armor `15`** *(Bow `19` / Stern `11`)*
- **Mobility & Fleet Cap:** Speed **`360 u/s`** · Turn Rate **`360°/s`** · Respawn **`×0.8`** · Team Cap: **Unlimited**
- **Primary Axial Weapon (LMB):** **Twin 20mm Pulse Lasers** — Fixed Axial Nose, **`20mm` (`22 AP`)**, **`88 DPS`** (2× 8.8 dmg every 0.2s, Range `720 u`, Type: *Laser*)
- **Secondary Auto-Turrets:** None (Pure axial dogfighter/striker)
- **Chassis Quirk — Slipstream Momentum:** Flying within 30° of straight for 1.8s builds +15% speed and +25% fire rate. Shifting Power to SPEED (←) doubles momentum buildup rate.
- **Base Signature (RMB, 5s CD) — Phase Dash:** High-G vector burst (3.2× speed for 0.3s); invulnerable to projectiles and breaks enemy auto-turret tracking locks.

| Tier | Branch A | Branch B |
|---|---|---|
| **Tier 1** | **Focused X-Ray Lenses** (`patrol.t1.focusedLenses`, *CALIBER*)<br>Raises laser caliber from 22 AP to 38 AP (+72% penetration) so your twin guns bite into Medium armor & stern plates. | **Rotary Scatter Array** (`patrol.t1.scatterCapacitors`, *WEAPON*)<br>+1 axial laser barrel and +20% fire rate (−12% per-shot damage); shreds starships, missiles, and unarmored scouts. |
| **Tier 2** | **Shunt Afterburners** (`patrol.t2.injectorOverdrive`, *POWER*)<br>Phase Dash holds 2 charges. While Power is set to SPEED (←), Weapons only drop to 42% instead of 33%. | **Electronic Chaff Hull** (`patrol.t2.chaffWeave`, *ARMOR*)<br>Doubles enemy Secondary Auto-Turret aim jitter against you and increases Shield capacity by +35%. |
| **Tier 3** | **Striker** (`patrol.t3.striker`, *SPEC*) [Hull: `striker`]<br>Phase Dash becomes Blink Strike: micro-warp 420u to cursor, discharging a 65-damage EMP arc that drains 50% of enemy Shields. | **Comet** (`patrol.t3.comet`, *SPEC*) [Hull: `comet`]<br>Hardened nose cone (+15 Armor). Dash becomes Kinetic Ram: 110 high-AP impact damage + knockback, resetting on kill. |
| **Tier 4** | **Stern Exhaust Seeker** (`patrol.t4.sternHunter`, *CALIBER*)<br>Hits on an enemy ship’s rear 120° engine arc ignore 50% of Armor and slow their turn rate by 25% for 2s. | **Tri-Flux Power Coupler** (`patrol.t4.fluxCoupler`, *POWER*)<br>Switching Reactor Power (← ↑ → ↓) grants a 2.5s surge of +20% to ALL three subsystems and instantly restores 30 Shield. |
| **Tier 5** | **Vector Storm Protocol** (`patrol.t5.stormRun`, *ULTIMATE*)<br>For 6s, Phase Dash / Blink Strike has 0s cooldown, and all three Reactor Power bars lock at 100% simultaneously. | **Armor-Stripper Micro-Pods** (`patrol.t5.submunitionSwarm`, *ULTIMATE*)<br>Fire 8 agile micro-missiles (30 dmg each) that corrode target plating, reducing enemy Armor Rating by −30 for 6s. |

---

### 7.2 Corvette (`corvette`) — *Stealth Assassin / Saboteur*
- **Scale & Survivability:** Radius **`28 u`** *(was `16 u`)* · **`260` Hull** + **`90` Energy Shield** · **Base Armor `20`** *(Bow `25` / Stern `15`)*
- **Mobility & Fleet Cap:** Speed **`335 u/s`** · Turn Rate **`310°/s`** · Respawn **`×0.9`** · Team Cap: **Unlimited**
- **Primary Axial Weapon (LMB):** **Twin 30mm Phase Repeaters** — Fixed Axial Nose, **`30mm` (`34 AP`)**, **`96 DPS`** (2× 14.4 dmg every 0.3s, Range `800 u`, Type: *Laser*)
- **Secondary Auto-Turrets:** None (Pure axial dogfighter/striker)
- **Chassis Quirk — Ghost Drive:** Cloaks automatically after 3s without firing or taking hull damage. Cloaked ships are completely ignored by enemy Secondary Auto-Turrets.
- **Base Signature (RMB, 11s CD) — Ambush Cloak:** Enter active stealth for 4.5s. Your opening volley from cloak deals ×2.0 damage and gains +45 bonus Armor Penetration.

| Tier | Branch A | Branch B |
|---|---|---|
| **Tier 1** | **Shield-Piercing Nullifiers** (`corvette.t1.nullifierRounds`, *CALIBER*)<br>+18 Weapon AP. 40% of your damage bypasses enemy Energy Shields and strikes Hull Armor directly. | **Suppressed Phase Emitters** (`corvette.t1.silencedEmitter`, *WEAPON*)<br>Your first 2 volleys from stealth do not break cloak, and reverse throttle ceiling increases from −40% to −55%. |
| **Tier 2** | **Phase Slip Thrusters** (`corvette.t2.ghostStep`, *POWER*)<br>Gain Ghost Step (G): 280u blink while cloaked. Setting Power to WEAPONS (↑) while cloaked does not reduce your Speed. | **Radar-Absorptive Carapace** (`corvette.t2.absorptivePlating`, *ARMOR*)<br>Invisible to Recon Scans & minimap. +40% Shield capacity; when Shields break, auto-trigger 1.5s of emergency cloak. |
| **Tier 3** | **Wraith** (`corvette.t3.wraith`, *SPEC*) [Hull: `wraith`]<br>Surgical capital-killer. Ambush lasts 5.5s; opening volley deals ×2.6 damage with 110 AP (punches straight through Battleship armor). | **Specter** (`corvette.t3.specter`, *SPEC*) [Hull: `specter`]<br>Electronic warfare hull. Ambush spawns 3 holographic decoys that spoof enemy Secondary Auto-Turrets and missiles. |
| **Tier 4** | **Demolition Saboteur** (`corvette.t4.saboteurCharges`, *NODE*)<br>×2.2 damage against held Asteroid Nodes and deployables for 4s after leaving cloak; disables Node defense turrets for 5s. | **Reactor Executioner** (`corvette.t4.executioner`, *POWER*)<br>+35% damage vs targets below 40% hull. Hitting an enemy from behind locks their Reactor Power state for 4s. |
| **Tier 5** | **Shadow Guillotine** (`corvette.t5.assassinate`, *ULTIMATE*)<br>Blink directly behind an enemy ship within 950u (into their weak −25% Rear Armor zone) and fire an guaranteed ×2.8 AP-120 crit volley. | **Sensor Blackout Shroud** (`corvette.t5.blackoutField`, *ULTIMATE*)<br>Deploy a 750u dark-matter shroud for 7s: enemies inside lose HUD/minimap, and all enemy Secondary Auto-Turrets shut down. |

---

### 7.3 Frigate (`frigate`) — *Fleet Support & Node Engineer*
- **Scale & Survivability:** Radius **`38 u`** *(was `20 u`)* · **`400` Hull** + **`160` Energy Shield** · **Base Armor `32`** *(Bow `40` / Stern `24`)*
- **Mobility & Fleet Cap:** Speed **`270 u/s`** · Turn Rate **`250°/s`** · Respawn **`×1`** · Team Cap: **Unlimited**
- **Primary Axial Weapon (LMB):** **Axial Nanite Lance** — Fixed Axial Nose, **`35mm` (`32 AP`)**, **`55 DPS`** (1× 11 dmg every 0.2s, Range `700 u`, Type: *Nanite*)
- **Secondary Auto-Turrets:** 1× Dorsal PD / Nanite Auto-Turret (18mm, 20 AP, 22 DPS/turret, Range 520u, ±18° loose auto-aim jitter)
- **Chassis Quirk — Field Engineer:** Captures Asteroid Nodes at 2× rate. Axial Nanite Lance repairs friendly ships AND friendly Asteroid Nodes (never FOBs/Titans) for 55% of shot value.
- **Base Signature (RMB, 10s CD) — Repair & Shield Pulse:** 350u burst: restores 30% Hull + 40% Shield to nearby allied ships, and repairs 8% Hull on a friendly Asteroid Node within range.

| Tier | Branch A | Branch B |
|---|---|---|
| **Tier 1** | **High-Density Nanite Matrix** (`frigate.t1.naniteInjector`, *NODE*)<br>Raises ally & Asteroid Node healing from 55% to 85% of gun damage. Shifting Power to SHIELDS (→) also boosts healing output by +30%. | **Deconstructor Beam Caliber** (`frigate.t1.corrosiveDeconstructor`, *CALIBER*)<br>Raises Nanite Lance AP from 32 to 58 and deals +35% bonus damage to enemy-held Asteroid Nodes and deployables. |
| **Tier 2** | **Orbital Sentry Kit** (`frigate.t2.turretKit`, *TURRET*)<br>Deploy a 450-Hull heavy auto-turret (G, 14s CD) with 55 AP that guards Asteroid Nodes. +1 dorsal auto-turret on your hull. | **Magnetic Anchor Mines** (`frigate.t2.magneticMines`, *NODE*)<br>Drop 5 proximity mines (G, 10s CD) around an Asteroid Node; mines deal 85 HE damage and force enemy Power to 33% Speed for 3s. |
| **Tier 3** | **Fortress** (`frigate.t3.fortress`, *SPEC*) [Hull: `fortress`]<br>Heavily armored tender (+18 Armor). Repair Pulse also drops a 350u Shield Dome Emitter and fortifies nearby Asteroid Nodes with a point-defense gun. | **Warden** (`frigate.t3.warden`, *SPEC*) [Hull: `warden`]<br>Repair Pulse becomes Warden Tether: locks a continuous dual-beam onto an ally OR friendly Asteroid Node for 6s, restoring 14% Hull & Shield/s and granting +25 Armor. |
| **Tier 4** | **Node Bastion Protocol** (`frigate.t4.nodeHardening`, *NODE*)<br>Replaces old base-heal: Repair Pulse heals friendly Asteroid Nodes for +15% max hull (900 HP), clears lockout timers 40% faster, and gives the Node +40 Armor for 8s. | **Fleet Power Conduit** (`frigate.t4.reactorConduit`, *POWER*)<br>Allies healed by your gun or signature inherit your current 100% Reactor Power bonus (Speed, Weapons, or Shields) for 3.5s. |
| **Tier 5** | **Node Citadel Overhaul** (`frigate.t5.nodeCitadel`, *ULTIMATE*)<br>Target a friendly Asteroid Node or deploy a Forward Beacon: restores the Node to 100% Hull, doubles its max HP to 12,000, adds 2 heavy laser turrets, and enables fleet respawning there for 60s! | **Aegis Sanctuary Field** (`frigate.t5.aegisSanctuary`, *ULTIMATE*)<br>Project a 550u regeneration zone for 8s that heals allied ships and Asteroid Nodes (never FOBs/Titans) for 10%/s and raises their Armor Rating by +35. |

---

### 7.4 Destroyer (`destroyer`) — *Torpedo Hunter & Flak Escort*
- **Scale & Survivability:** Radius **`52 u`** *(was `24 u`)* · **`540` Hull** + **`180` Energy Shield** · **Base Armor `45`** *(Bow `56` / Stern `34`)*
- **Mobility & Fleet Cap:** Speed **`280 u/s`** · Turn Rate **`210°/s`** · Respawn **`×1.05`** · Team Cap: **Unlimited**
- **Primary Axial Weapon (LMB):** **Dual 50mm Heavy Autocannons** — Fixed Axial Bow, **`50mm` (`52 AP`)**, **`102 DPS`** (2× 12.75 dmg every 0.25s, Range `780 u`, Type: *Kinetic AP*)
- **Secondary Auto-Turrets:** 2× Twin 25mm Flak Auto-Turrets (25mm, 24 AP, 18 DPS/turret, Range 560u, ±16° loose auto-aim jitter)
- **Chassis Quirk — Point-Defense Screen:** Your Flak Auto-Turrets automatically intercept 1 enemy missile/torpedo within 360u every 0.6s and deal ×2 damage to starships.
- **Base Signature (RMB, 8.5s CD) — Heavy Torpedo:** Launch 1 heavy homing torpedo (115 damage, 105 AP, ×1.5 vs structures/Nodes). Punches clean through Battleship armor, though agile scouts can out-turn it.

| Tier | Branch A | Branch B |
|---|---|---|
| **Tier 1** | **Proximity Fragmentation Shells** (`destroyer.t1.proximityFlak`, *CALIBER*)<br>Primary 50mm shells detonate with 45u splash and never overpenetrate light ships (+25% damage vs Patrol Craft & Corvettes). | **Capped AP-Sabot & Tubes** (`destroyer.t1.sabotAutoloader`, *CALIBER*)<br>+18 Primary Gun AP (52 → 70 AP) and −20% Torpedo cooldown. Built for cracking Cruisers and Battleships. |
| **Tier 2** | **Auxiliary Fire-Control Radar** (`destroyer.t2.fireControlRadar`, *TURRET*)<br>Tightens Secondary Flak Auto-Turret aim jitter by −45% (±16° → ±8.8°) and adds +1 Flak Auto-Turret. | **Vectored Retro-Burners** (`destroyer.t2.evasiveRetro`, *POWER*)<br>Unlock Evasive Burn (G, 8s CD) and raise Reverse Throttle ceiling to −50%. Shifting Power to SPEED (←) grants +15 Armor. |
| **Tier 3** | **Hunter-Killer** (`destroyer.t3.hunterKiller`, *SPEC*) [Hull: `hunter`]<br>Reworked Torpedo Spread: fires a 3-torpedo fan (85 dmg each, 105 AP) that breaches capital armor and inflicts a 4s Armor Sunder (−20 Armor). | **Escort Leader** (`destroyer.t3.escort`, *SPEC*) [Hull: `escort`]<br>+15 Armor & +2 Flak Auto-Turrets. Signature becomes Flak Curtain: 450u blast dealing 75 damage, vaporizing enemy missiles/drones, and boosting ally Shields. |
| **Tier 4** | **Laser Target Painter** (`destroyer.t4.targetPainter`, *TURRET*)<br>Enemies hit by your Primary Guns are painted for 3s: your Secondary Auto-Turrets and homing torpedoes lock onto them with +35% tracking accuracy. | **Reinforced Bow Bulkheads** (`destroyer.t4.bulkheadShunt`, *ARMOR*)<br>Increases front 90° Bow Armor bonus from +25% to +45%, and restores 15% Hull over 4s whenever you shift Power to SHIELDS (→). |
| **Tier 5** | **Sequential Tube Salvo** (`destroyer.t5.torpedoBarrage`, *ULTIMATE*)<br>Reworked from 16-missile spam: ripple-fires 5 heavy armor-piercing torpedoes (95 dmg each, 115 AP) in a tight hunting pack over 1.2s. | **Magnetic EMP Torpedo** (`destroyer.t5.empWarhead`, *ULTIMATE*)<br>Fire a heavy warhead that detonates in a 400u radius at cursor: strips 100% of enemy Shields, silences abilities for 2.5s, and forces enemy Power to 33%. |

---

### 7.5 Cruiser (`cruiser`) — *Multi-Role Line Cruiser*
- **Scale & Survivability:** Radius **`72 u`** *(was `30 u`)* · **`780` Hull** + **`280` Energy Shield** · **Base Armor `60`** *(Bow `75` / Stern `45`)*
- **Mobility & Fleet Cap:** Speed **`245 u/s`** · Turn Rate **`165°/s`** · Respawn **`×1.15`** · Team Cap: **20% of Fleet**
- **Primary Axial Weapon (LMB):** **Triple 75mm High-Caliber Lasers** — Fixed Axial Superfiring Mounts, **`75mm` (`65 AP`)**, **`118 DPS`** (3× 9.8 dmg every 0.25s, Range `860 u`, Type: *Laser*)
- **Secondary Auto-Turrets:** 3× 3× Deck Pulse Auto-Turrets (30mm, 32 AP, 16 DPS/turret, Range 620u, ±15° loose auto-aim jitter)
- **Chassis Quirk — Harmonic Target Lock:** Sustained primary fire ramps laser frequency over 3s, granting up to +20% damage and +20 AP (65 → 85 AP) to melt heavier armor.
- **Base Signature (RMB, 13s CD) — Shield Harmonic Battery:** Instantly restores 45% of max Shield and hardens Shield absorption to block 55% of all damage for 4s.

| Tier | Branch A | Branch B |
|---|---|---|
| **Tier 1** | **Long-Focal Collimators** (`cruiser.t1.lanceCollimators`, *CALIBER*)<br>+22% Primary Laser range and +15 base AP (65 → 80 AP), letting you duel Battlecruisers and Battleships from standoff range. | **Broadside Sponson Mounts** (`cruiser.t1.broadsideSponsons`, *TURRET*)<br>Adds +2 Secondary Deck Auto-Turrets (3 → 5 turrets) and increases their caliber to 40 AP for devastating close-in brawling. |
| **Tier 2** | **Sloped Tritanium Belt** (`cruiser.t2.slopedBelt`, *ARMOR*)<br>+15 Armor Rating (60 → 75) and +20% max Hull. Small-caliber lasers (<30 AP) bounce off your hull for minimum 25% damage. | **Dynamic Power Bus** (`cruiser.t2.capacitorShunt`, *POWER*)<br>In EQUALIZED Power mode (↓), all three systems run at 62% instead of 50%. +12% base top speed. |
| **Tier 3** | **Strike Cruiser** (`cruiser.t3.strikeCruiser`, *SPEC*) [Hull: `strikecruiser`]<br>Offensive refit (+15% primary DPS). Signature becomes VLS Breacher Pod: launches 4 armor-cracking missiles (55 dmg, 75 AP) that home in on painted targets. | **Command Cruiser** (`cruiser.t3.commandCruiser`, *SPEC*) [Hull: `commandcruiser`]<br>Flagship aura: allies within 550u gain +12 Armor and +20% Shield regen. Signature becomes Fleet Aegis Pulse (shields all nearby allies). |
| **Tier 4** | **Predictive Turret Servos** (`cruiser.t4.aegisFireControl`, *TURRET*)<br>Cuts Secondary Auto-Turret aim jitter by −50% and makes secondary turrets fire 30% faster while Reactor Power is set to WEAPONS (↑). | **Deep-Space Telemetry Array** (`cruiser.t4.sensorSuite`, *CALIBER*)<br>+35% vision radius. Primary laser hits reveal cloaked ships for 3s and expose weak points (+15 AP for all allied fire). |
| **Tier 5** | **Battery Overclock** (`cruiser.t5.totalOverdrive`, *ULTIMATE*)<br>For 6.5s, primary lasers fire at ×1.8 rate and all Secondary Auto-Turrets lock onto your cursor with 0° jitter! | **Coherent Ion Lance** (`cruiser.t5.ionLance`, *ULTIMATE*)<br>Fire a 1,450u spinal ion beam (240 damage, 110 AP) that penetrates every ship in a line and disables enemy Shields for 4s. |

---

### 7.6 Battlecruiser (`battlecruiser`) — *Heavy Linebreaker / Rammer*
- **Scale & Survivability:** Radius **`90 u`** *(was `34 u`)* · **`1020` Hull** + **`340` Energy Shield** · **Base Armor `72`** *(Bow `90` / Stern `54`)*
- **Mobility & Fleet Cap:** Speed **`265 u/s`** · Turn Rate **`140°/s`** · Respawn **`×1.25`** · Team Cap: **12% of Fleet**
- **Primary Axial Weapon (LMB):** **Twin 105mm Siege Plasma Cannons** — Fixed Axial Prow, **`105mm` (`88 AP`)**, **`132 DPS`** (2× 19.8 dmg every 0.3s, Range `840 u`, Type: *Plasma HE*)
- **Secondary Auto-Turrets:** 4× 4× Broadside Casemate Turrets (40mm, 42 AP, 18 DPS/turret, Range 640u, ±16° loose auto-aim jitter)
- **Chassis Quirk — Heavy Momentum & Bow Wedge:** Flying straight builds +15% speed and +25% primary damage. Front 90° bow arc gains +30% bonus Armor Rating (94 effective Bow Armor).
- **Base Signature (RMB, 9s CD) — Overdrive Ram Burn:** Surge forward at 2.5× speed for 0.55s; ships you collide with take 95 kinetic damage (knocked aside) while your Bow Armor doubles.

| Tier | Branch A | Branch B |
|---|---|---|
| **Tier 1** | **Depleted-Core 120mm Shells** (`battlecruiser.t1.armorPiercingCores`, *CALIBER*)<br>Upgrades primary cannons from 88 AP to 112 AP (+18% damage, −8% fire rate) so every shot penetrates Battleships and Dreadnoughts at 100%. | **Anti-Screen Plasma Canisters** (`battlecruiser.t1.plasmaCanister`, *CALIBER*)<br>Eliminates overpenetration against Light hulls, adds 50u splash, and boosts fire rate by +15% to annihilate Frigates and Destroyers. |
| **Tier 2** | **Broadside Casemate Crew** (`battlecruiser.t2.casemateGunners`, *TURRET*)<br>+2 Secondary Casemate Auto-Turrets (4 → 6) and −35% auto-aim jitter. Secondary turrets deal +25% damage when Power is in SHIELDS (→). | **Twin Afterburner Injectors** (`battlecruiser.t2.twinBurners`, *POWER*)<br>Overdrive Ram Burn holds 2 charges and Reverse Throttle reaches −50%. Shifting Power to SPEED (←) immediately clears Slow effects. |
| **Tier 3** | **Raider** (`battlecruiser.t3.raider`, *SPEC*) [Hull: `raider`]<br>+15% top speed. Signature becomes Micro-Jump Strike: warp 480u to cursor and unleash a 5-shell 105mm fan + full secondary turret salvo. | **Ironclad** (`battlecruiser.t3.ironclad`, *SPEC*) [Hull: `ironclad`]<br>+22 Armor Rating (72 → 94 base, 122 on Bow!), +25% Hull, knockback immune. Signature becomes Ironclad Ram (160 ram damage + 2s stun). |
| **Tier 4** | **Breacher Momentum** (`battlecruiser.t4.bloodhound`, *POWER*)<br>At full Momentum, your primary cannons ignore 25% of target Shield and deal +30% damage to targets below 45% Hull. | **Kinetic Shield Dynamo** (`battlecruiser.t4.kineticConversion`, *ARMOR*)<br>Every deflected/glancing small-caliber hit on your armor restores 8 Shield, and kills halve your Signature cooldown. |
| **Tier 5** | **Devastator Prow Salvo** (`battlecruiser.t5.devastatorSalvo`, *ULTIMATE*)<br>Unleash an 8-shell 120mm armor-piercing volley (60 dmg each, 115 AP) from your bow that punches through entire battle lines. | **Tri-Core Reactor Overload** (`battlecruiser.t5.reactorOverload`, *ULTIMATE*)<br>For 7s, lock Speed, Weapons, and Shields Power at 100% simultaneously, gain +35% speed/fire-rate, and double secondary turret fire rate. |

---

### 7.7 Battleship (`battleship`) — *Dread-Line Brawler & Fortress*
- **Scale & Survivability:** Radius **`118 u`** *(was `40 u`)* · **`1500` Hull** + **`500` Energy Shield** · **Base Armor `92`** *(Bow `115` / Stern `69`)*
- **Mobility & Fleet Cap:** Speed **`195 u/s`** · Turn Rate **`105°/s`** · Respawn **`×1.4`** · Team Cap: **10% of Fleet**
- **Primary Axial Weapon (LMB):** **Twin 150mm Heavy Gauss Batteries** — Fixed Axial Forward Turrets, **`150mm` (`105 AP`)**, **`140 DPS`** (2× 28 dmg every 0.4s, Range `880 u`, Type: *Kinetic AP*)
- **Secondary Auto-Turrets:** 6× 6× 35mm Deck Auto-Batteries (35mm, 35 AP, 15 DPS/turret, Range 660u, ±18° loose auto-aim jitter)
- **Chassis Quirk — Thermal Reactor Ride:** Primary fire builds Heat. Above 50% Heat, primary & secondary guns deal +25% damage and +15 AP; at 100% Heat, primary guns vent for 1.8s (secondary turrets keep firing!).
- **Base Signature (RMB, 12s CD) — Bulwark Plating Matrix:** Raise effective Armor Rating by +60 and absorb 75% of all incoming damage for 4.5s.

| Tier | Branch A | Branch B |
|---|---|---|
| **Tier 1** | **180mm Super-Heavy Shells** (`battleship.t1.superheavySabot`, *CALIBER*)<br>Raises Primary Gauss caliber to 130 AP and +28% damage per shot (−15% ROF). Crushes enemy Battleships, Dreadnoughts, and FOBs. | **High-Explosive Canister Shot** (`battleship.t1.shrapnelCanister`, *CALIBER*)<br>Adds +1 barrel in a 3-shell spread with 60u HE splash and removes Overpenetration so light ships take full catastrophic damage. |
| **Tier 2** | **Layered Citadel Belt & Reverse Gear** (`battleship.t2.citadelBelt`, *ARMOR*)<br>+18 Armor Rating (92 → 110) and +20% Hull. Improves Reverse Throttle ceiling to −45% so you can tank bow-first while backing up. | **Secondary Battery Director & Sinks** (`battleship.t2.secondaryDirector`, *TURRET*)<br>+2 Secondary Auto-Turrets (6 → 8), −35% turret aim jitter, and Heat builds 30% slower. |
| **Tier 3** | **Bastion** (`battleship.t3.bastion`, *SPEC*) [Hull: `bastion`]<br>Ultimate fleet anchor (+25% Shield). Bulwark becomes Aegis Mirror: blocks 85% damage for 4.5s and reflects enemy projectiles back at attackers. | **Juggernaut** (`battleship.t3.juggernaut`, *SPEC*) [Hull: `juggernaut`]<br>Brawler dreadnought. Bulwark becomes Thermal Overdrive: for 5.5s, 0 Heat buildup, +75% primary fire rate, +30% speed, and secondary turrets fire nonstop. |
| **Tier 4** | **Bow-Tank Stabilizers** (`battleship.t4.reverseAnchor`, *POWER*)<br>Immune to knockback/pulls. While stationary or in Reverse Throttle (−10% to −45%) with Power in SHIELDS (→), take 30% less damage and double Shield regen. | **Thermal Turret Coupling** (`battleship.t4.heatTransfer`, *TURRET*)<br>Above 50% Heat, your 6–8 Secondary Auto-Turrets switch to incendiary plasma (+18 AP and apply a 25-DPS hull burn for 3s). |
| **Tier 5** | **Siege Bastion Mode** (`battleship.t5.siegeArtillery`, *ULTIMATE*)<br>Brace for 8s: +50 Armor, primary range ×1.8 with 130u splash (×1.6 vs Nodes/FOBs), and Secondary Auto-Turrets gain +50% range & accuracy. | **Citadel Aegis Dome** (`battleship.t5.fortressDome`, *ULTIMATE*)<br>Project a massive 650u Fleet Shield Dome for 6s that intercepts all incoming enemy projectiles and restores 25% Shield to allies inside. |

---

### 7.8 Dreadnought (`dreadnought`) — *Super-Heavy Spinal Siege Platform*
- **Scale & Survivability:** Radius **`155 u`** *(was `48 u`)* · **`1850` Hull** + **`620` Energy Shield** · **Base Armor `110`** *(Bow `138` / Stern `83`)*
- **Mobility & Fleet Cap:** Speed **`165 u/s`** · Turn Rate **`75°/s`** · Respawn **`×1.6`** · Team Cap: **5% of Fleet (Max 3 in 60v60)**
- **Primary Axial Weapon (LMB):** **240mm Spinal Rail Cannon** — Full-Length Axial Spine (Charge 1.4s), **`240mm` (`135 AP`)**, **`148 DPS`** (1× 260 dmg every 1.1s, Range `1450 u`, Type: *Spinal Rail*)
- **Secondary Auto-Turrets:** 8× 8× 25mm Point-Defense Blisters (25mm, 28 AP, 12 DPS/turret, Range 600u, ±20° loose auto-aim jitter)
- **Chassis Quirk — Spinal Capacitor & Overpenetration:** Hold fire 1.4s for a ×3.0 full-charge rail slug (135 AP, pierces 3 ships). Unmodified full-charge slugs overpenetrate Patrol Craft/Corvettes for 65% damage, but deal 100% devastating damage to Medium/Capital hulls.
- **Base Signature (RMB, 7s CD) — Hyper-Velocity Rail Beam:** Instantaneous 1,250u coherent particle beam (135 damage, 125 AP) that hits every enemy in the line without overpenetration falloff.

| Tier | Branch A | Branch B |
|---|---|---|
| **Tier 1** | **Fragmenting Sabot Jacket** (`dreadnought.t1.shatterSabot`, *CALIBER*)<br>Spinal slugs shatter on light armor: removes Overpenetration penalty vs small ships and creates a 70u plasma wake behind every target hit. | **Cryo-Cooled Rail Coils** (`dreadnought.t1.superconductor`, *POWER*)<br>Charge time −30% and +20% range. While Reactor Power is set to WEAPONS (↑), full-charge shots gain +25 AP (160 AP) and ignore 50% of target Shields. |
| **Tier 2** | **Recoil-Assisted Retro Thrusters** (`dreadnought.t2.recoilRetro`, *POWER*)<br>Firing a full-charge shot while in Reverse Throttle pushes you 220u backward, and increases Reverse Throttle cap to −45% with +20% turn rate. | **Flak Blister Network** (`dreadnought.t2.blisterGrid`, *TURRET*)<br>Adds +2 Secondary Blister Turrets (8 → 10), tightens their aim jitter by −35%, and allows them to shoot down incoming enemy torpedoes. |
| **Tier 3** | **Railstorm** (`dreadnought.t3.railstorm`, *SPEC*) [Hull: `railstorm`]<br>Triple-emitter prow. Rail Beam fires 3 hyper-velocity beams in a spread (115 dmg each, 125 AP), clearing entire lanes and Node approaches. | **Eclipse** (`dreadnought.t3.eclipse`, *SPEC*) [Hull: `eclipse`]<br>Graviton siege dreadnought (+20 Armor). Signature becomes Event Horizon: spawns a 280u singularity at cursor that drags enemies together for spinal shots. |
| **Tier 4** | **Citadel Cavitator** (`dreadnought.t4.capitalKiller`, *CALIBER*)<br>Full-charge hits against ships with 60+ Armor (Cruisers, Battlecruisers, Battleships, Carriers, Dreadnoughts) deal +40% bonus damage and rupture their Armor (−25 Armor for 5s). | **Monolithic Bow Armor** (`dreadnought.t4.fortressPlating`, *ARMOR*)<br>Raises base Armor to 130 (162 on Bow!). Small & Medium calibers (<65 AP) deal minimum glancing damage, and Shield capacity increases by +30%. |
| **Tier 5** | **Orbital Siege Lance** (`dreadnought.t5.orbitalLance`, *ULTIMATE*)<br>Call down a 300u tactical beam at any visible point after 2s: deals 450 AP-150 damage to ships and 900 damage to enemy Asteroid Nodes / FOBs. | **Graviton Singularity Wave** (`dreadnought.t5.gravityCollapse`, *ULTIMATE*)<br>Detonate a 550u gravity wave around your hull: yanks all flanking ships in front of your bow, stuns them 1.5s, and supercharges your next spinal shot. |

---

### 7.9 Carrier (`carrier`) — *Fleet Flagship & Starship Carrier*
- **Scale & Survivability:** Radius **`135 u`** *(was `44 u`)* · **`1350` Hull** + **`560` Energy Shield** · **Base Armor `82`** *(Bow `103` / Stern `62`)*
- **Mobility & Fleet Cap:** Speed **`185 u/s`** · Turn Rate **`95°/s`** · Respawn **`×1.5`** · Team Cap: **10% of Fleet**
- **Primary Axial Weapon (LMB):** **Axial Command Designator Beam** — Fixed Axial Flight-Deck Prow, **`45mm` (`48 AP`)**, **`68 DPS`** (1× 13.6 dmg every 0.2s, Range `820 u`, Type: *Laser*)
- **Secondary Auto-Turrets:** 6× 6× Deck CIWS Auto-Turrets (22mm, 25 AP, 14 DPS/turret, Range 580u, ±17° loose auto-aim jitter)
- **Chassis Quirk — Armored Flight Deck:** Maintains 2 permanent Escort Starships (relaunch in 7s) that inherit your Reactor Power state (← +30% drone speed, ↑ +25% drone AP & damage, → +40% drone hull).
- **Base Signature (RMB, 12s CD) — Scramble Strike Wing:** Launch 4 Strike Starships from your flight bays for 14s to swarm enemies near your cursor.

| Tier | Branch A | Branch B |
|---|---|---|
| **Tier 1** | **High-Velocity Interceptor Wing** (`carrier.t1.apInterceptorPods`, *CALIBER*)<br>Starships fly +35% faster and mount 45-AP laser cannons so they shred Light and Medium ships without glancing off. | **Armor-Piercing Bomber Wing** (`carrier.t1.heavyTorpedoBombers`, *CALIBER*)<br>Starships carry 95-AP micro-torpedoes with 75u splash: deals 100% damage to Battleships/Dreadnoughts and ×2 damage to enemy Asteroid Nodes. |
| **Tier 2** | **Double-Deck Hangar Bays** (`carrier.t2.hangarExpansion`, *POWER*)<br>+2 permanent Escort Starships (2 → 4). Shifting Power to WEAPONS (↑) reduces starship relaunch time by 40%. | **Phalanx CIWS & Armored Deck** (`carrier.t2.ciwsPhalanx`, *TURRET*)<br>+2 Secondary CIWS Auto-Turrets (6 → 8), −40% turret aim jitter, +15 Armor Rating, and escort starships shoot down enemy torpedoes. |
| **Tier 3** | **Hive Carrier** (`carrier.t3.hive`, *SPEC*) [Hull: `hive`]<br>Launch Swarm scrambles 7 high-speed starships; starship hits siphon 20% of damage dealt back into your Carrier’s Energy Shield. | **Overlord Command Carrier** (`carrier.t3.overlord`, *SPEC*) [Hull: `overlord`]<br>+20 Armor & +25% Primary Designator DPS. Signature becomes Fleet EMP Pulse: 420u wave that silences enemies, wrecks enemy drones, and supercharges your wing. |
| **Tier 4** | **Integrated Fire-Control Uplink** (`carrier.t4.telemetryLink`, *TURRET*)<br>Your starships AND all 6–8 Secondary CIWS Auto-Turrets focus-fire whichever target your Axial Designator Beam hits, with +20 AP. | **Escort Shield Harmonic** (`carrier.t4.shieldRelay`, *POWER*)<br>+3% Hull & Shield regen/s per active starship. While Power is in SHIELDS (→), your starships project a 25% damage-reduction aura to nearby allies. |
| **Tier 5** | **Bastion Flight Deck Mode** (`carrier.t5.armadaBastion`, *ULTIMATE*)<br>Anchor for 10s (+40 Armor): launch 10 heavy starships, deploy 4 orbital defense turrets around your hull, and double CIWS fire rate. | **Valkyrie Torpedo Run** (`carrier.t5.alphaStrikeWing`, *ULTIMATE*)<br>Order every active starship to fire a synchronized AP-100 micro-torpedo volley at your cursor (85 damage per starship) without sacrificing the starships! |


---

## 8. Home Screen UI Rework (`packages/client/src/main.ts` & `style.css`)

Replace the centered single-card menu with a **2-Column Orbital Terminal Layout**:
1. **Far-Left Launch Dock (`340px` fixed width):**
   - Game Title (`VOID FRONT // ORB-COM v2.0`)
   - Match Play Options: `Fleet Size` (`20v20`, `40v40`, `60v60`, `100v100`), `Enemy Difficulty` (`Easy`, `Normal`, `Hard`), and `Team Palette`.
   - Compact Keybind Quick-Card (`← ↑ → ↓` Power, `Wheel` Reverse/Forward Throttle, `Q W E R` Shards, `1 / 2` Tiers, `LMB / RMB / T / G`).
   - Full-width primary **LAUNCH TO SECTOR** button anchored at the bottom.
2. **Right Main Viewport (`flex: 1`, ~75–80% of screen) with 5 Top Tabs:**
   - **Tab 1 — Tech Tree & Armory:** Embeds the interactive 9-class Tech Tree (using the PBR Reference Sprites, Shard Calibration steppers, Reactor Power toggle, and Armor vs. Caliber Penetration simulator).
   - **Tab 2 — Cosmetic Drydock:** Preview and select hull paint finishes (`Reference Team Paint`, `Neutral Tactical Gray`, `Original Vector`), engine plume tints, and weapon beam colors saved to `localStorage`.
   - **Tab 3 — How to Play (Field Manual):** Visual guide covering the 3-stage sector loop (Collidable Nodes $\rightarrow$ FOBs & Salvage Beacons $\rightarrow$ Exposed Titan), Reactor Power Shunting, Armor Angling & Calibers, and High Command seats (Admiral & FOB Commanders).
   - **Tab 4 — Settings:** Steering scheme (`Mouse Gimbal` vs. `WASD`), Radiance Cascades GI Lighting toggle, Derived Normal Maps toggle, and audio/interface preferences.
   - **Tab 5 — Patch Notes:** Scrollable orbital terminal changelog.
