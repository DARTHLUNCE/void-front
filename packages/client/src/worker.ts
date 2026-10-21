/// <reference lib="webworker" />
import {
  commandBlocker,
  createWorld,
  DT,
  encodeSnapshot,
  issueCommand,
  matchInfo,
  pickClass,
  setCommander,
  step,
  type BotDifficulty,
  type CommandOrder,
  type World,
} from '@void-front/shared';
import { HUMAN_SLOT, type FromWorker, type InputFrame, type ToWorker } from './protocol';

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

/** Difficulty sets the enemy fleet's skill; your allies always fly at Normal. You start docked until you pick a class. */
function start(seed: number, fleet: number, difficulty: BotDifficulty): void {
  world = createWorld({ seed, fleetSize: fleet, humanSlots: [HUMAN_SLOT], humansPickClass: true, botSkill: ['normal', difficulty] });
  latest = null;
  statQueue.length = tierQueue.length = commandQueue.length = 0;
  post({ type: 'info', info: matchInfo(world, HUMAN_SLOT) });
  post({ type: 'snap', buf: encodeSnapshot(world, HUMAN_SLOT), simMs: 0 });
  last = performance.now();
  acc = 0;
  clearInterval(timer);
  timer = setInterval(loop, 4) as unknown as number;
}

function applyInput(w: World): void {
  const me = w.ships[HUMAN_SLOT];
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
  }
  const stat = statQueue.shift();
  if (stat !== undefined) inp.statPick = stat;
  const tier = tierQueue.shift();
  if (tier !== undefined) inp.tierPick = tier;
  // Orders go in between ticks, before the step that will carry them out.
  for (const order of commandQueue.splice(0)) {
    const reason = commandBlocker(w, order);
    const ok = reason === null && issueCommand(w, order);
    post({ type: 'commandResult', id: order.id, ok, reason: reason ?? '' });
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
    const buf = encodeSnapshot(w, HUMAN_SLOT);
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
      start(msg.seed, msg.fleet, msg.difficulty);
      break;
    case 'input':
      latest = msg.input;
      break;
    case 'pickClass': {
      if (!w) break;
      const me = w.ships[HUMAN_SLOT];
      if (!me.awaitingClass) break;
      if (msg.choice === 'commander') {
        if (w.teams[me.team].commanderSlot < 0) setCommander(w, HUMAN_SLOT);
      } else {
        pickClass(w, me, msg.choice);
      }
      break;
    }
    case 'stat':
      statQueue.push(msg.index);
      break;
    case 'tier':
      tierQueue.push(msg.option);
      break;
    case 'spawn':
      if (w) w.ships[HUMAN_SLOT].spawnChoice = msg.choice;
      break;
    case 'command':
      if (w) commandQueue.push({ team: w.ships[HUMAN_SLOT].team, id: msg.id, x: msg.x, y: msg.y, point: msg.point });
      break;
    case 'devGrant':
      if (w && import.meta.env.DEV) {
        const me = w.ships[HUMAN_SLOT];
        me.xp += msg.xp;
        me.shards += msg.shards;
        for (let r = 0; r < 3; r++) w.teams[me.team].resources[r] += msg.shards * 3;
        if (msg.kill && me.alive) me.hull = 0;
      }
      break;
    case 'stop':
      clearInterval(timer);
      world = null;
      break;
  }
};
