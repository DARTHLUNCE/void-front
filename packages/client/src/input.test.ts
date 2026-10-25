import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '../../shared/src/sim/step';
import { moveShips } from '../../shared/src/sim/systems/movement';
import { Input, type ControlScheme } from './input';

describe.each<ControlScheme>(['mouse', 'wasd'])('%s brake controls', (scheme) => {
  let target: EventTarget;
  let input: Input;

  function event(type: string, fields: Record<string, unknown> = {}): Event {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, fields);
    target.dispatchEvent(e);
    return e;
  }

  function frame() {
    return input.frame({ x: 400, y: 300 }, 1, (x, y) => ({ x, y }));
  }

  beforeEach(() => {
    target = new EventTarget();
    Object.assign(target, { innerWidth: 800, innerHeight: 600, closest: () => null });
    vi.stubGlobal('window', target);
    input = new Input(scheme, { stat: vi.fn(), digit: vi.fn(), press: vi.fn(), wheel: vi.fn(), escape: vi.fn(), confirm: vi.fn(), scoreboard: vi.fn(), bigMap: vi.fn(), autofire: vi.fn() });
    event('mousemove', { clientX: 700, clientY: 300 });
    event('keydown', { code: 'KeyD' });
    event('keydown', { code: 'ShiftLeft' });
  });

  afterEach(() => {
    input.dispose();
    vi.unstubAllGlobals();
  });

  it('overrides steering, cruise and new dashes but retains aim and fire until released', () => {
    event('mousedown', { button: 0 });
    event('mousedown', { button: 2 });
    const moving = frame();
    expect(moving.moveX).toBe(1);
    expect(moving.cruise).toBe(true);
    expect(event('keydown', { code: 'Space' }).defaultPrevented).toBe(true);
    expect(event('keydown', { code: 'Space', repeat: true }).defaultPrevented).toBe(true);
    expect(input.braking).toBe(true);
    expect(frame()).toEqual({ ...moving, moveX: 0, moveY: 0, cruise: false, ability: false, brake: true });
    expect(event('keyup', { code: 'Space' }).defaultPrevented).toBe(true);
    expect(input.braking).toBe(false);
    expect(frame()).toEqual(moving);
  });

  it('tracks the raw camera pointer over HUD without firing or changing the gameplay aim', () => {
    event('mousedown', { button: 0 });
    const aim = input.mouse;
    Object.assign(target, { closest: () => ({}) });
    event('mousemove', { clientX: 5, clientY: 100 });
    expect(input.viewPointer).toEqual({ x: 5, y: 100 });
    expect(input.mouse).toEqual(aim);
    expect(input.pointerOverHud).toBe(true);
    expect(frame().fire).toBe(false);
  });

  it('keeps near-center aim stable while the camera carries the ship across the cursor', () => {
    const context = {center:{x:800,y:364},heading:Math.PI};
    event('mousemove', {clientX:400,clientY:364});
    const first=input.frame({x:800,y:364},1,(x,y)=>({x,y}),context);
    expect(first.aim).toBeCloseTo(Math.PI);
    event('mousemove', {clientX:795,clientY:364});
    for(const x of [680,740,795,815]) {
      const f=input.frame({x,y:364},1,(x,y)=>({x,y}),context);
      expect(f.aim).toBeCloseTo(Math.PI);
      if(scheme==='mouse')expect(Math.hypot(f.moveX,f.moveY)).toBe(0);
    }
    event('mousemove', {clientX:1100,clientY:364});
    for(let i=0;i<12;i++)input.frame({x:815,y:364},1,(x,y)=>({x,y}),context);
    expect(input.frame({x:815,y:364},1,(x,y)=>({x,y}),context).aim).toBe(0);
    input.resetAim();
    event('mousemove', {clientX:800,clientY:364});
    expect(input.frame({x:800,y:364},1,(x,y)=>({x,y}),{...context,heading:1}).aim).toBe(1);
  });

  it('restores mouse thrust gradually as the pointer leaves the center zone',()=>{
    if(scheme!=='mouse')return;
    const context={center:{x:800,y:364},heading:0},ship={x:600,y:364};
    event('mousemove',{clientX:800,clientY:364});
    input.frame(ship,1,(x,y)=>({x,y}),context);
    let previous=0;
    for(let x=865;x<=925;x+=2){
      event('mousemove',{clientX:x,clientY:364});
      const f=input.frame(ship,1,(x,y)=>({x,y}),context);
      const magnitude=Math.hypot(f.moveX,f.moveY);
      expect(magnitude).toBeGreaterThanOrEqual(previous);
      expect(magnitude-previous).toBeLessThan(.06);
      previous=magnitude;
    }
    expect(previous).toBe(1);
  });

  it('clears a held brake and cruise when the window loses focus', () => {
    event('keydown', { code: 'Space' });
    event('blur');
    expect(input.braking).toBe(false);
    expect(frame().cruise).toBe(false);
  });

  it('keeps the upstream ultimate on T and uses Space only for braking', () => {
    event('keydown', { code: 'Space' });
    expect(frame().brake).toBe(true);
    expect(frame().ultimate).toBe(false);
    event('keydown', { code: 'KeyT' });
    expect(frame().ultimate).toBe(true);
    event('keyup', { code: 'KeyT' });
    expect(frame().ultimate).toBe(false);
  });

  it('settles cruise velocity, holds position, then accelerates again on release', () => {
    const w = createWorld({ seed: 1, fleetSize: 1, humanSlots: [0] });
    const ship = w.ships[0];
    ship.x = 5000;
    ship.y = 5000;
    ship.vx = 900;
    ship.cruising = true;
    ship.cruiseSpool = 1;
    event('keydown', { code: 'Space' });
    Object.assign(ship.input, frame());
    for (let tick = 0; tick < 90; tick++) moveShips(w);
    expect(ship.cruising).toBe(false);
    expect(ship.cruiseSpool).toBe(0);
    expect(Math.hypot(ship.vx, ship.vy)).toBeLessThan(0.02);
    const stoppedX = ship.x;
    for (let tick = 0; tick < 30; tick++) moveShips(w);
    expect(Math.abs(ship.x - stoppedX)).toBeLessThan(0.01);
    event('keyup', { code: 'Space' });
    Object.assign(ship.input, frame());
    moveShips(w);
    expect(ship.vx).toBeGreaterThan(0);
    expect(ship.x).toBeGreaterThan(stoppedX);
  });
});

describe('v2 throttle and Reactor Power', () => {
  let target: EventTarget;

  function make(wheel = vi.fn()): Input {
    target = new EventTarget();
    Object.assign(target, { innerWidth: 800, innerHeight: 600, closest: () => null });
    vi.stubGlobal('window', target);
    return new Input('wasd', { stat: vi.fn(), digit: vi.fn(), press: vi.fn(), wheel, escape: vi.fn(), confirm: vi.fn(), scoreboard: vi.fn(), bigMap: vi.fn(), autofire: vi.fn() });
  }

  function key(code: string): Event {
    const e = new Event('keydown', { cancelable: true });
    Object.assign(e, { code });
    target.dispatchEvent(e);
    return e;
  }

  const frame = (input: Input) => input.frame({ x: 400, y: 300 }, 1, (x, y) => ({ x, y }));

  afterEach(() => vi.unstubAllGlobals());

  it('steps the throttle 10% at a time through zero into reverse, down to the ship’s ceiling', () => {
    const input = make();
    for (let i = 0; i < 3; i++) input.stepThrottle(-1);
    expect(input.throttle).toBeCloseTo(0.7);
    for (let i = 0; i < 20; i++) input.stepThrottle(-1);
    expect(input.throttle).toBeCloseTo(-0.4);
    input.reverseMax = 0.55;
    input.stepThrottle(-1);
    expect(input.throttle).toBeCloseTo(-0.5);
    for (let i = 0; i < 30; i++) input.stepThrottle(1);
    expect(input.throttle).toBe(1);
  });

  it('sends the signed throttle unscaled and never spools Sub-Light in reverse', () => {
    const input = make();
    key('KeyD');
    key('ShiftLeft');
    expect(frame(input).cruise).toBe(true);
    for (let i = 0; i < 13; i++) input.stepThrottle(-1);
    const f = frame(input);
    expect(f.moveX).toBe(1);
    expect(f.throttle).toBeCloseTo(-0.3);
    expect(f.cruise).toBe(false);
  });

  it('arrow keys shunt Reactor Power once each, without scrolling the page', () => {
    const input = make();
    expect(key('ArrowLeft').defaultPrevented).toBe(true);
    expect(frame(input).power).toBe(1);
    expect(frame(input).power).toBe(-1);
    key('ArrowUp');
    expect(frame(input).power).toBe(2);
    key('ArrowRight');
    expect(frame(input).power).toBe(3);
    key('ArrowDown');
    expect(frame(input).power).toBe(0);
  });

  it('the bare wheel is throttle, Ctrl + wheel asks for zoom', () => {
    const wheel = vi.fn();
    make(wheel);
    const turn = (ctrlKey: boolean) => {
      const e = new Event('wheel', { cancelable: true });
      Object.assign(e, { deltaY: 100, clientX: 0, clientY: 0, ctrlKey });
      target.dispatchEvent(e);
    };
    turn(false);
    turn(true);
    expect(wheel.mock.calls.map((c) => c[3])).toEqual([false, true]);
  });
});


describe('pointer focus recovery and reverse toggle',()=>{
  let target: EventTarget, doc: EventTarget, input: Input;
  const emit=(type:string,fields:Record<string,unknown>={})=>{
    const e=new Event(type,{cancelable:true});Object.assign(e,fields);target.dispatchEvent(e);return e;
  };
  const frame=()=>input.frame({x:400,y:300},1,(x,y)=>({x,y}));
  beforeEach(()=>{
    target=new EventTarget();doc=new EventTarget();
    Object.assign(doc,{visibilityState:'visible',hasFocus:()=>false,elementFromPoint:()=>null});
    Object.assign(target,{innerWidth:800,innerHeight:600,closest:()=>null,document:doc});
    vi.stubGlobal('window',target);
    input=new Input('mouse',{stat:vi.fn(),digit:vi.fn(),press:vi.fn(),wheel:vi.fn(),escape:vi.fn(),confirm:vi.fn(),scoreboard:vi.fn(),bigMap:vi.fn(),autofire:vi.fn()});
  });
  afterEach(()=>{input.dispose();vi.unstubAllGlobals();});
  it('resumes camera tracking on hover without browser focus or a click',()=>{
    emit('mousemove',{clientX:650,clientY:300});expect(input.pointerActive).toBe(true);
    emit('mousedown',{button:0});emit('keydown',{code:'ShiftLeft'});emit('blur');
    expect(input.pointerActive).toBe(false);
    emit('mouseover',{clientX:700,clientY:320});
    expect(input.pointerActive).toBe(true);expect(input.mouse).toEqual({x:700,y:320});
    expect(frame().fire).toBe(false);expect(frame().cruise).toBe(false);
  });
  it('clears stale HUD suppression on reentry and never tracks a hidden tab',()=>{
    Object.assign(target,{closest:()=>({})});emit('mousemove',{clientX:10,clientY:10});
    expect(input.pointerOverHud).toBe(true);emit('blur');
    Object.assign(target,{closest:()=>null});emit('mouseover',{clientX:650,clientY:300});
    expect(input.pointerOverHud).toBe(false);expect(input.pointerActive).toBe(true);
    Object.assign(doc,{visibilityState:'hidden'});doc.dispatchEvent(new Event('visibilitychange'));
    emit('mousemove',{clientX:750,clientY:300});expect(input.pointerActive).toBe(false);
    Object.assign(doc,{visibilityState:'visible'});emit('mousemove',{clientX:660,clientY:300});
    expect(input.pointerActive).toBe(true);
    emit('mouseout',{relatedTarget:null});expect(input.pointerActive).toBe(false);
  });
  it('toggles full reverse then restores the exact previous throttle and ignores repeats',()=>{
    input.throttle=.7;input.reverseMax=.55;
    emit('keydown',{code:'KeyS'});expect(input.throttle).toBe(-.55);expect(input.reverseToggled).toBe(true);
    emit('keydown',{code:'KeyS',repeat:true});expect(input.throttle).toBe(-.55);
    emit('keyup',{code:'KeyS'});emit('keydown',{code:'KeyS'});
    expect(input.throttle).toBe(.7);expect(input.reverseToggled).toBe(false);
    input.throttle=0;emit('keydown',{code:'KeyS'});emit('keydown',{code:'KeyS'});expect(input.throttle).toBe(0);
  });
  it('lets manual throttle adjustment override reverse, and respects editable fields',()=>{
    emit('keydown',{code:'KeyS'});input.stepThrottle(1);expect(input.reverseToggled).toBe(false);
    expect(input.throttle).toBeCloseTo(-.3);
    Object.assign(target,{closest:()=>({})});emit('keydown',{code:'KeyS'});expect(input.throttle).toBeCloseTo(-.3);
  });
  it('keeps S as directional movement in WASD mode',()=>{
    input.dispose();
    input=new Input('wasd',{stat:vi.fn(),digit:vi.fn(),press:vi.fn(),wheel:vi.fn(),escape:vi.fn(),confirm:vi.fn(),scoreboard:vi.fn(),bigMap:vi.fn(),autofire:vi.fn()});
    emit('keydown',{code:'KeyS'});expect(frame().moveY).toBe(1);expect(input.throttle).toBe(1);
  });
});
