/**
 * Terminal copy: the Field Manual chapters, the flight controls and the patch notes, as data the
 * screens lay out (menu/screens.ts).
 */

const key = (...k: string[]) => k.map((x) => `<kbd>${x}</kbd>`).join(' ');

export interface Chapter {
  id: string;
  title: string;
  /** One line under the title. */
  kicker: string;
  /** Body HTML. */
  body: string;
  /** Short key figures shown as chips beside the text. */
  facts: string[];
}

export const CONTROLS: { keys: string; what: string }[] = [
  { keys: key('←', '↑', '→', '↓'), what: 'Reactor Power: speed / weapons / shields / equalize' },
  { keys: key('Wheel'), what: 'Throttle −40% … +100% (reverse below zero)' },
  { keys: key('Ctrl', 'Wheel'), what: `Zoom (also ${key('-')} ${key('=')})` },
  { keys: key('Q', 'W', 'E', 'R'), what: `Shard Calibration (WASD steering: ${key('Z', 'X', 'C', 'V')})` },
  { keys: `${key('1')} ${key('2')}`, what: 'Pick a tier with XP' },
  { keys: `${key('LMB')} ${key('RMB')}`, what: 'Primary gun · signature ability' },
  { keys: `${key('T')} ${key('G')}`, what: 'Ultimate (tier 5) · extra ability' },
  { keys: `${key('Shift')} ${key('Space')}`, what: 'Sub-Light drive · brake' },
  { keys: `${key('Tab')} ${key('M')}`, what: 'Scoreboard · sector map' },
  { keys: key('L'), what: 'Toggle radiance lighting' },
  { keys: key('Esc'), what: 'Hangar: back to the menu' },
];

export const MANUAL: Chapter[] = [
  {
    id: 'nodes',
    title: 'Take the asteroid nodes',
    kicker: 'Objective 1 · hold the middle',
    body: `<p>Seven asteroid nodes sit in no-man's-land. Fly inside a node's 450 u ring to capture it; the rock itself is solid, and it blocks every shot, so use it as cover. Factories pay Munitions, refineries Fuel, training camps Manpower each minute; the central Research Lab speeds your team's XP. A held node has to be shot down, then sits locked for 20 s before anyone can retake it.</p>`,
    facts: ['7 nodes', '450 u capture ring', 'Rock blocks shots', '20 s lock after it falls'],
  },
  {
    id: 'fobs',
    title: 'Break the FOBs',
    kicker: 'Objective 2 · open the shield',
    body: `<p>Each Titan hides behind two forward operating bases. While either FOB stands the Titan is shielded. Destroying one leaves your team a salvage beacon to respawn at. FOBs and Titans heal friendly ships nearby and their twin turrets out-range most guns.</p>`,
    facts: ['2 FOBs per Titan', 'Salvage beacon respawn', 'FOBs heal allies'],
  },
  {
    id: 'titan',
    title: 'Kill the exposed Titan',
    kicker: 'Objective 3 · win the match',
    body: `<p>With both FOBs down the enemy Titan is exposed: its heal aura weakens and the enemy respawns slower. Push in, destroy it, win. If 35 minutes pass, victory points decide.</p>`,
    facts: ['Both FOBs down = exposed', '35 min time limit', 'Victory points decide a draw'],
  },
  {
    id: 'power',
    title: 'Reactor Power',
    kicker: 'Arrow keys · shunt power',
    body: `<p>Arrow keys shunt power between three channels.</p>
      <ul class="mn-list">
        <li><b>← Speed</b> +25% speed, +35% acceleration, faster Sub-Light.</li>
        <li><b>↑ Weapons</b> +25% damage, +15% caliber, faster turrets.</li>
        <li><b>→ Shields</b> ×1.4 shield, double regen and a trickle even in combat.</li>
        <li><b>↓ Equalize</b> balances them.</li>
      </ul>
      <p>The channels you starve drop to 33%.</p>`,
    facts: ['← Speed', '↑ Weapons', '→ Shields', '↓ Equalize'],
  },
  {
    id: 'armor',
    title: 'Shields, armor and caliber',
    kicker: 'Point your bow at the enemy',
    body: `<p>Hits strike your energy shield first; it regenerates after 3.5 s without damage. Overflow hits the hull through armor. Every gun has a caliber (AP): small calibers glance off heavy armor (watch for sparks), heavy slugs overpenetrate thin scouts for 65%. Your bow carries +25% armor and your stern −25%, so point your nose at the enemy and hunt their engines. Wheel below zero to back away while keeping your bow forward.</p>
      <p class="mn-see">The <a href="#" data-jump="armory">Armory</a> screen shows every gun against every hull.</p>`,
    facts: ['Shield regen after 3.5 s', 'Bow +25% armor', 'Stern −25% armor', 'Overpen = 65% damage'],
  },
  {
    id: 'turrets',
    title: 'Turrets and Sub-Light',
    kicker: 'Auto-aim and the long drive',
    body: `<p>Frigates and bigger ships carry loose auto-aim secondary turrets that fire on their own; cloaked ships are ignored by them. Hold Shift to charge the Sub-Light drive (2.5× speed); it can't spool in reverse and any hit drops you out.</p>`,
    facts: ['Turrets: Frigate and up', 'Sub-Light 2.5× speed', 'Any hit drops you out'],
  },
  {
    id: 'command',
    title: 'High Command seats',
    kicker: 'Lead instead of fly',
    body: `<p>Instead of flying, take a command seat. The <b>Admiral</b> spends Munitions and Manpower on bombs, strikes and reinforcements and upgrades the Titan. Two <b>FOB Commanders</b> launch Fuel wings from their FOB and upgrade it. 10% of the loot from every kill becomes Credits for base upgrades.</p>`,
    facts: ['1 Admiral', '2 FOB Commanders', '10% of kill loot → Credits'],
  },
  {
    id: 'growth',
    title: 'Growing your ship',
    kicker: 'XP tiers and Shard Calibration',
    body: `<p>XP buys five tiers, A or B each: tier 3 swaps your hull, tier 5 adds an ultimate on T. Shards buy Shard Calibration (Weapons, Hull &amp; Plating, Engines, Reactor), kept all match. Dying spills 40% of unspent shards. Want a different ship? <b>Change hull</b> on the respawn screen sends you back to the hangar, but your tiers, XP and shards start over.</p>
      <p class="mn-see">Plan a build on the <a href="#" data-jump="tree">Tech Tree</a> screen.</p>`,
    facts: ['5 tiers, A or B', 'Tier 3 swaps hull', 'Tier 5 adds an ultimate', '40% shards spill on death'],
  },
  {
    id: 'score',
    title: 'Score',
    kicker: 'Damage, healing and objectives',
    body: `<p>The live score panel (top right) ranks everyone in the match. Damage to enemy ships and healing your friends score the same. A kill goes to whoever dealt the most of the damage, not the last hit; anyone else who dealt at least 10% gets an assist worth half a kill. Capturing nodes, shooting down enemy nodes and wrecking FOBs score too. Commanders score through their orders: their strikes and wings count like a pilot's guns, and every resource they spend counts.</p>`,
    facts: ['Healing = damage', 'Kill: most damage dealt', 'Assist at 10%: half a kill'],
  },
];

export interface Release {
  version: string;
  title: string;
  items: string[];
}

export const NOTES: Release[] = [
  {
    version: 'New',
    title: 'Hangar & terminal remaster',
    items: [
      'Choose your ship is now a launch bay: the selected hull floats at its true relative size, with a roster rail, a stat dossier and a pinned gold High Command panel.',
      'The terminal is rebuilt in the same style and takes your team colour: numbered screens across the top (keys 1–6), the Launch Dock on the left.',
      'New native Tech Tree: pick tiers and Shard Calibration for any class and watch the live stat deck change.',
      'New Armory: every class gun against every hull and armor arc, with glance and overpenetration shown.',
      'Cosmetic Drydock shows a live preview of your hull finish, engine plume and bolt colour. Settings are one-click option cards; the Field Manual and these notes read chapter by chapter.',
    ],
  },
  {
    version: 'Recent',
    title: 'Score, assists & hull changes',
    items: [
      'The kill feed is replaced by a live score panel: the match top five and your own place. Hold Tab for the full board with score, kills, assists and deaths.',
      'Kills go to the ship that dealt the most damage; others with 10% or more get an assist for half a kill.',
      'Commanders now score: their strikes, bombs, platforms and wings earn damage, kill and assist score, and spending resources or Credits scores too.',
      'The respawn screen says who destroyed you, with what, how much of the damage they dealt, and who assisted.',
      'Change hull from the respawn screen: back to the hangar for a new ship (or a command seat); tiers, XP and shards restart.',
    ],
  },
  {
    version: 'v2.1',
    title: 'Hangar, strike craft & calibers',
    items: [
      'New Orbital Hangar ship picker: echelon tabs, a 3×3 roster and a dossier with combat figures and both Tier-3 hulls. 1–9 select, Enter launches.',
      'The picker, Tier-3 pop-up and HUD ship screen now show the detailed team-painted ship sprites.',
      'Fighters, interceptors, bombers, recon and defenders each have their own model, size and thrusters.',
      'Laser bolts scale with caliber: needle tracers on scouts up to capital lances on Dreadnoughts, and they grow when you shunt power to Weapons.',
      'Missiles and torpedoes use your live caliber (Weapons calibration, nodes, Weapons power) and never overpenetrate; bombers fire real 95 AP torpedoes that point defense can shoot down.',
      'Pilot call sign on the Launch Dock, shown on your nameplate, the kill feed and the scoreboard.',
      'Balance: Patrol Craft, Corvettes and Frigates are tougher and evade while flying fast (less damage taken, faster guns, wider enemy turret scatter, extra AP against Armored hulls); capital guns deal less to Light hulls; lighter Dreadnought and Battleship main guns.',
    ],
  },
  {
    version: 'v2.0',
    title: 'Gameplay & UI overhaul',
    items: [
      'Energy shields over every hull, Armor Rating with +25% bow and −25% stern arcs, and weapon calibers (AP): glancing ricochets on heavy armor, overpenetration through thin scouts.',
      'Reactor Power Shunting on the arrow keys: Speed, Weapons, Shields or Equalized.',
      'Signed throttle on the mouse wheel down to −40% reverse (−55% with nodes); Ctrl + wheel zooms.',
      'Dramatic size ladder: hulls from 22 u Patrol Craft to 155 u Dreadnoughts; 320 u FOBs and a 520 u Titan.',
      'Axial primary guns, plus loose auto-aim secondary turrets on Frigates and every bigger hull.',
      'Asteroid nodes are solid rock and block all fire; Frigates heal and fortify nodes (never FOBs or Titans).',
      'All nine classes rebuilt with 90 reworked nodes; Shard Calibration no longer resets at tier 3.',
      'Cockpit: reverse throttle LEDs, a three-channel power indicator and a shield bar. New home terminal.',
    ],
  },
  {
    version: 'v1.4',
    title: 'Command seats & cockpit',
    items: ['Admiral and FOB Commander seats, new commander orders, High Command Credits and base upgrades.', 'Cockpit dashboard HUD, Sub-Light drive, detailed sprite art for ships and nodes.'],
  },
  {
    version: 'v1.3',
    title: 'Hull classes & objectives',
    items: ['Nine hull classes on a size ladder, FOBs, destructible resource nodes and commander pings.'],
  },
];
