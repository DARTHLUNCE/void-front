# Momentum and brake controls

Mouse steering applies gimballed force at the actual, class-scaled aft engine sockets.
The force moves the hull and generates yaw torque. Angular inertia and sideslip damping
smooth turns without snapping velocity to the cursor. WASD and bots retain vector controls.
Existing upstream class speeds, acceleration ratios, turn-rate caps and status effects
remain in force; no class definitions, upgrades, weapons or AI policies are replaced.

Hold Space to apply counter-thrust and stop. Braking consumes actual velocity, so release
continues from the remaining momentum. Aim and fire remain available. Braking prevents
new signature activation; an active dash finishes at the upstream ability exit speed.
Space previously activated the upstream ultimate, so that binding and its labels move to T.
The ultimate itself and the G extra ability are unchanged.

Exhaust uses the same mounts as propulsion, follows engine direction with 100 ms smoothing,
and keeps its existing width pulse. The glow rotates with the hull. Motion state resets at
respawn, participates in determinism hashing, and reaches the renderer in snapshots.

The port targets the upstream nine-class roster. It deliberately retains its heavy-hull
handling differences; it is not a claim of identical feel to the older Interceptor prototype.
