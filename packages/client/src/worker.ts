/// <reference lib="webworker" />
import { createWorld, DT, encodeSnapshot, matchInfo, step, type BotDifficulty, type World } from '@void-front/shared';
import { HUMAN_SLOT, type FromWorker, type InputFrame, type ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let world: World | null = null;
let latest: InputFrame | null = null;
const statQueue: number[] = [];
let timer = 0;
let last = 0;
let acc = 0;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

/** Difficulty sets the enemy fleet's skill; your allies always fly at Normal. */
function start(seed: number, fleet: number, difficulty: BotDifficulty): void {
  world = createWorld({ seed, fleetSize: fleet, humanSlots: [HUMAN_SLOT], botSkill: ['normal', difficulty] });
  post({ type: 'info', info: matchInfo(world, HUMAN_SLOT) });
  last = performance.now();
  acc = 0;
  clearInterval(timer);
  timer = setInterval(loop, 4) as unknown as number;
}

function applyInput(w: World): void {
  const me = w.ships[HUMAN_SLOT];
  const inp = me.input;
  if (latest) {
    inp.moveX = latest.moveX;
    inp.moveY = latest.moveY;
    inp.aim = latest.aim;
    inp.cursorX = latest.cursorX;
    inp.cursorY = latest.cursorY;
    inp.fire = latest.fire;
    inp.ability = latest.ability;
    inp.cruise = latest.cruise;
  }
  const pick = statQueue.shift();
  if (pick !== undefined) inp.statPick = pick;
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
  switch (msg.type) {
    case 'start':
      start(msg.seed, msg.fleet, msg.difficulty);
      break;
    case 'input':
      latest = msg.input;
      break;
    case 'stat':
      statQueue.push(msg.index);
      break;
    case 'stop':
      clearInterval(timer);
      world = null;
      break;
  }
};
