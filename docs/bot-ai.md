# Non-RL bot brains

Bots previously chose common destinations, changed targets frequently, and steered with an independent strafe vector. The redesign separates objective assignment, small travelling squads, individual combat decisions, and legal flight controls. The fleet director assigns missions, not aim or movement; a ship can leave a mission to help an ally, defend itself or recover.

## Individual ship behavior

| Hull | Combat decisions |
| --- | --- |
| Patrol | Approaching attack passes and repositioning; light-target preference |
| Corvette | Committed flank, ambush window, withdrawal and re-entry |
| Frigate | Follow damaged allies, aim the existing repair gun, screen behind nearby allies |
| Destroyer | Intercept incoming threats and hold an anti-armor escort position |
| Cruiser | Maintain a stable firing station and line position |
| Battlecruiser | Line up, fire on approach, release the trigger for a clear passing lane, then recover |
| Battleship | Keep its bow toward the fight; use ordinary reverse and braking to hold range |
| Dreadnought | Hold a siege station, displace when crowded, refuse distant pursuit |
| Carrier | Stay behind the local screen within real weapon reach instead of chasing |

`botDoctrine.ts` holds each ship's committed maneuver state. `pilot.ts` applies class-specific target preferences, reaction time, range, support and survival decisions. Assault pilots ignore distant transit distractions but briefly commit to clearing visible enemies blocking a slow or under-fire approach. Hysteresis retains a viable target through small utility changes, but death or visibility loss releases it immediately. Soft focus reservations discourage excessive focus on one enemy while still allowing coordinated attacks.

## Perception and retreat

`botPerception.ts` estimates presence from recognizable hull categories and three visible hull-damage bands. It does not compute an exact damage/health matchup or probability of winning. Both director and pilot use this estimate. Local pressure is smoothed over 1.25 seconds. Pressure-driven regrouping requires recent incoming damage on separate occasions and at least 2.25 seconds of sustained pressure; seeing superior numbers alone does not route a healthy ship. Critical hull retreat and deliberate class maneuvers such as corvette withdrawal remain separate decisions. The class-specific critical thresholds are 20% lower than the first redesign, following playtest feedback; stable individual resolve varies modestly.

Enemy ships are considered only while visible to the team. A pilot extrapolates its last sampled observation for at most one decision interval. Losing visibility immediately stops attacks. Existing aim error, burst patterns and difficulty remain; minimum acquisition reaction is 0.22 seconds and lead prediction is capped below perfect. Targeted offensive abilities also wait for reaction and real bow alignment. No input reads from enemy brains.

## Team coordination and traffic

- The director evaluates objectives at 0.5 Hz, with travel costs, role suitability, visible threats and diminishing demand. It supports multiple threatened bases, useful node staffing, bounded salvage collection, commander orders and finite assault waves with a travel allowance and a bounded engagement period.
- Gathering uses frozen friendly-side anchors and hull-sized slots. A viable assembled group can launch without waiting forever for stragglers. Attrition, a failed objective or a home emergency can end a wave.
- `botSquads.ts` groups up to six nearby ships with the same mission. Membership persists, durable hulls lead, escorts take flank stations, and support stays behind. Pacing is bounded. Combat, repair, retreat and mission arrival release formation guidance. Ahead followers may briefly wait but cannot be sent backward to rejoin. Assaults use assembly and siege reservations directly, so transit cohesion cannot pull a reserved gunner back toward a lagging leader.
- `botSiege.ts` reserves physically separated firing stations within real weapon range. Surplus ships wait in side bays outside a capital-width ingress corridor and rotate in; an outer ring beyond weapon reach is no longer a permanent assignment.
- `botFlight.ts` samples up to 24 contacts and scores 14 candidate headings using relative motion, oriented hull clearance, stopping distance and turning time. Staggered full searches run at roughly 7.5 Hz; immediate danger still interrupts the cached route. Passing-side and forward/reverse/holding hysteresis reduce oscillation.

The flight controller emits only mouse-steered aim, throttle, reverse, brake and sublight inputs. Shared movement, firing slowdown, turning, collision and weapon code execute those inputs exactly as for the player. It never assigns velocity or position directly. There is no bot-only strafe, independent gun aim, free upgrade, stat bonus, RL policy, or ability-definition change.

`botEquipment.ts` selects affordable existing tier branches and stat upgrades through the existing purchase functions, based on class, mission, health and stable preference. It does not reroll on every query or bypass costs.

## Research and limits

These are practical adaptations, not implementations inheriting formal collision-avoidance guarantees.

- [Graham: An Introduction to Utility Theory](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter09_An_Introduction_to_Utility_Theory.pdf): comparable decision factors and inertia to avoid constant switching.
- [Zielinski: Telling Paragon Bots Where to Go](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter24_Being_Where_It_Counts_Telling_Paragon_Bots_Where_to_Go.pdf): objective demand, suitability and decreasing assignment priority. Its perfect enemy-position knowledge is not adopted.
- [Fray: Context Steering](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter18_Context_Steering_Behavior-Driven_Steering_at_the_Macro_Scale.pdf): separate danger from interest instead of cancelling steering vectors.
- [Acceleration-Velocity Obstacles](https://gamma-web.iacs.umd.edu/AVO/AVO.pdf) and [nonholonomic collision avoidance](https://la.disneyresearch.com/wp-content/uploads/alonsomora10dars_paper1.pdf): instantaneous velocity assumptions do not fit inertial, mouse-steered ships. Our bounded predictive controller offers no proof of collision freedom.
- [Agent Reaction Time](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter05_Agent_Reaction_Time_How_Fast_Should_An_AI_React.pdf): perceptual delay must also cover abilities and reacquisition.
- [1000 NPCs at 60 FPS](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter34_1000_NPCs_at_60_FPS.pdf): bounded work and separate decision/update rates; the source's performance is not a benchmark for this game.
- [Hierarchical AI for Multiplayer Bots in Killzone 3](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter29_Hierarchical_AI_for_Multiplayer_Bots_in_Killzone_3.pdf): separate team, squad and individual responsibilities.

The brain is deliberately heuristic and imperfect. Tests of legal controls, collision clearance and successful attack assembly do not by themselves establish strong campaign strategy. Long battle results and local timing evidence are recorded separately in `bot-ai-validation.md`.
