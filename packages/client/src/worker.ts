/// <reference lib="webworker" />
import {
  commandBlocker,
  upgradeBlocker,
  createWorld,
  DT,
  encodeSnapshot,
  matchInfo,
  pickClass,
  setCommander,
  step,
  type BotDifficulty,
  type CommandOrder,
  type SeatId,
  type World,
} from '@void-front/shared';
import type { FromWorker, InputFrame, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let world: World | null = null;
let latest: InputFrame | null = null;
const statQueue: number[] = [];
const tierQueue: number[] = [];
const commandQueue: CommandOrder[] = [];
let timer = 0;
let last = 0;
let acc = 0;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

/** The local player's slot: the first slot of the team they fly for (Team Palette). */
let humanSlot = 0;

/** Difficulty sets the enemy fleet's skill; your allies always fly at Normal. You start docked until you pick a class. */
function start(seed: number, fleet: number, difficulty: BotDifficulty, team: 0 | 1, callsign?: string, hullGeometry: 'reference' | 'original' = 'reference'): void {
  humanSlot = team === 1 ? fleet : 0;
  world = createWorld({ hullGeometry, seed, fleetSize: fleet, humanSlots: [humanSlot], humansPickClass: true, playerCallsign: callsign, botSkill: team === 1 ? [difficulty, 'normal'] : ['normal', difficulty] });
  latest = null;
  statQueue.length = tierQueue.length = commandQueue.length = 0;
  post({ type: 'info', info: matchInfo(world, humanSlot) });
  post({ type: 'snap', buf: encodeSnapshot(world, humanSlot), simMs: 0 });
  last = performance.now();
  acc = 0;
  clearInterval(timer);
  timer = setInterval(loop, 4) as unknown as number;
}

function applyInput(w: World): void {
  const me = w.ships[humanSlot];
  const inp = me.input;
  if (latest && me.alive) {
    inp.moveX = latest.moveX;
    inp.moveY = latest.moveY;
    inp.aim = latest.aim;
    inp.cursorX = latest.cursorX;
    inp.cursorY = latest.cursorY;
    inp.fire = latest.fire;
    inp.ability = latest.ability;
    inp.ultimate = latest.ultimate;
    inp.extra = latest.extra;
    inp.cruise = latest.cruise;
    inp.brake = latest.brake;
    inp.steerWithAim = latest.steerWithAim;
    inp.throttle = latest.throttle;
    // A power switch is a one-shot: apply it once, then forget it.
    if (latest.power >= 0) {
      inp.power = latest.power;
      latest.power = -1;
    }
  }
  const stat = statQueue.shift();
  if (stat !== undefined) inp.statPick = stat;
  const tier = tierQueue.shift();
  if (tier !== undefined) inp.tierPick = tier;
  // Orders go in between ticks, before the step that will carry them out.
  // Orders are checked now and carried out inside the next step (so their events reach the snapshot).
  for (const order of commandQueue.splice(0)) {
    const reason = commandBlocker(w, order);
    if (reason === null) w.pendingOrders.push(order);
    post({ type: 'commandResult', id: order.id, ok: reason === null, reason: reason ?? '' });
  }
}

/** Fixed 30 Hz steps driven by wall time; at most 4 catch-up steps per wake. */
function loop(): void {
  const w = world;
  if (!w) return;
  const now = performance.now();
  acc += (now - last) / 1000;
  last = now;
  let steps = 0;
  let simMs = 0;
  while (acc >= DT && steps < 4) {
    applyInput(w);
    const t0 = performance.now();
    step(w);
    simMs = performance.now() - t0;
    acc -= DT;
    steps++;
    const buf = encodeSnapshot(w, humanSlot);
    post({ type: 'snap', buf, simMs }, [buf.buffer]);
  }
  if (acc > DT * 4) acc = 0;
  if (w.match.over) clearInterval(timer);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  const w = world;
  switch (msg.type) {
    case 'start':
      start(msg.seed, msg.fleet, msg.difficulty, msg.team ?? 0, msg.callsign, msg.hullGeometry);
      break;
    case 'input':
      latest = msg.input;
      break;
    case 'pickClass': {
      if (!w) break;
      const me = w.ships[humanSlot];
      if (!me.awaitingClass) break;
      pickClass(w, me, msg.choice);
      break;
    }
    case 'pickSeat':
      if (w && w.ships[humanSlot].awaitingClass) setCommander(w, humanSlot, msg.seat);
      break;
    case 'upgrade': {
      if (!w) break;
      const me = w.ships[humanSlot];
      const seat = me.seat as SeatId;
      const reason = me.commander ? upgradeBlocker(w, me.team, seat, msg.base, msg.track, msg.option) : 'Not in a command seat';
      if (reason === null) w.pendingUpgrades.push({ team: me.team, seat, base: msg.base, track: msg.track, option: msg.option });
      post({ type: 'upgradeResult', ok: reason === null, reason: reason ?? '' });
      break;
    }
    case 'stat':
      statQueue.push(msg.index);
      break;
    case 'tier':
      tierQueue.push(msg.option);
      break;
    case 'spawn':
      if (w) w.ships[humanSlot].spawnChoice = msg.choice;
      break;
    case 'command':
      if (w) commandQueue.push({ team: w.ships[humanSlot].team, id: msg.id, x: msg.x, y: msg.y, point: msg.point, seat: Math.max(0, w.ships[humanSlot].seat) as SeatId });
      break;
    case 'ping':
      if (w) w.pendingPings.push({ team: w.ships[humanSlot].team, x: msg.x, y: msg.y });
      break;
    case 'devGrant':
      if (w && import.meta.env.DEV) {
        const me = w.ships[humanSlot];
        me.xp += msg.xp;
        me.shards += msg.shards;
        for (let r = 0; r < 3; r++) w.teams[me.team].resources[r] += msg.shards * 3;
        w.teams[me.team].credits += msg.shards;
        if (msg.kill && me.alive) me.hull = 0;
      }
      break;
    case 'stop':
      clearInterval(timer);
      world = null;
      break;
  }
};
