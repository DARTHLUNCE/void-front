import { installFrameLayout } from './frameLayout';
import { installPanelFitting } from './panelFitting';

/** Reparent the existing live controls before HUD bindings attach. The artwork is
 * decorative; every readout still uses simulation data and every action uses the
 * existing handler. No UI state is painted into the frame texture. */
export function arrangePilotSidebar(root: HTMLElement): void {
  const take = (selector: string): HTMLElement => {
    const node = root.querySelector<HTMLElement>(selector);
    if (!node) throw new Error(`Missing cockpit control: ${selector}`);
    return node;
  };
  const node = (tag: string, cls: string, label?: string): HTMLElement => {
    const el = document.createElement(tag);
    el.className = cls;
    if (label) el.setAttribute('aria-label', label);
    return el;
  };
  // Linear-light chroma reduction and cool channel balance, with no additive
  // tint: blacks stay black and the original texture remains losslessly stored.
  const grade = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  grade.setAttribute('width', '0');
  grade.setAttribute('height', '0');
  grade.setAttribute('aria-hidden', 'true');
  grade.setAttribute('focusable', 'false');
  grade.innerHTML = `<defs>
    <filter id="noir-frame-grade" x="0" y="0" width="100%" height="100%" color-interpolation-filters="linearRGB">
      <feColorMatrix type="saturate" values="0.18" />
      <feColorMatrix type="matrix" values="0.88 0 0 0 0  0 0.96 0 0 0  0 0 1.04 0 0  0 0 0 1 0" />
    </filter>
  </defs>`;
  root.prepend(grade);
  const hud = take('.vhud');
  const shell = document.createElement('div');
  shell.className = 'noir-shell';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'noir-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'noir-instruments');
  const setDrawer = (open: boolean): void => {
    shell.classList.toggle('drawer-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setDrawer(!shell.classList.contains('drawer-open')));
  toggle.textContent = 'Instruments';
  const rack = node('div', 'noir-rack');
  rack.id = 'noir-instruments';
  const surface = node('div', 'noir-surface');
  shell.append(toggle, rack);
  rack.append(surface);
  root.prepend(shell);

  const status = node('section', 'noir-status noir-screen', 'Ship condition');
  const identity = node('div', 'noir-identity');
  identity.append(take('[data-k="tierBadge"]'), take('[data-k="hullState"]'));
  const ship = take('[data-k="shipScreen"]');
  const meters = node('div', 'noir-meters');
  meters.innerHTML = `
    <div class="noir-meter"><span>SHIELD</span><b data-k="sidebarShieldValue"></b><div><i data-k="sidebarShieldBar"></i></div></div>
    <div class="noir-meter hull"><span>HULL</span><b data-k="sidebarHullValue"></b><div><i data-k="sidebarHullBar"></i></div></div>`;
  status.append(identity, ship, meters);
  const armor = take('[data-k="armorArcs"]');
  armor.classList.add('noir-armor');
  status.append(armor);
  const condition = node('div', 'pilot-status');
  condition.dataset.k = 'pilotStatus';
  condition.setAttribute('role', 'status');
  condition.setAttribute('aria-live', 'polite');
  status.append(condition);

  const combat = node('section', 'noir-combat noir-screen', 'Weapons and abilities');
  const weapons = take('.vhud-weapons-dash');
  const auto = take('[data-k="auto"]');
  const autoButton = document.createElement('button');
  autoButton.type = 'button';
  autoButton.className = auto.className;
  autoButton.dataset.k = 'auto';
  autoButton.setAttribute('aria-label', 'Toggle automatic fire');
  autoButton.setAttribute('aria-pressed', 'false');
  autoButton.append(...auto.childNodes);
  auto.replaceWith(autoButton);
  weapons.querySelector('.w-slot-head')!.append(autoButton);
  combat.append(weapons);

  const flight = node('section', 'noir-flight', 'Flight controls');
  const throttle = take('.vhud-throttle');
  const brake = node('div', 'noir-brake', 'Hold Space to brake');
  brake.append(throttle.querySelector('kbd')!, throttle.querySelector('.thr-brake')!);
  throttle.querySelector('label')!.textContent = 'THROTTLE';
  const cruise = take('.vhud-sublight');
  cruise.querySelector('label')!.textContent = 'SUB-LIGHT';
  const driveState = node('span', 'flight-state');
  driveState.dataset.k = 'flightState';
  throttle.append(driveState);
  flight.append(throttle, brake, cruise);

  const upgrades = node('section', 'noir-upgrades noir-screen', 'Shard calibration upgrades');
  const bank = take('.vhud-upgrades-bank');
  const shardCounter = bank.querySelector('.vhud-shard-counter')!;
  const shards = take('[data-k="shards"]');
  const upgradePrompt = node('span', 'upgrade-prompt');
  upgradePrompt.dataset.k = 'upgradePrompt';
  upgradePrompt.textContent = 'SHARDS';
  shardCounter.replaceChildren(shards, upgradePrompt);
  upgrades.append(bank);
  bank.querySelectorAll<HTMLElement>('.vhud-up-top b').forEach((label, i) => {
    const key = label.querySelector('kbd')!;
    label.replaceChildren(key, document.createTextNode(['WPN', 'HULL', 'ENG', 'PWR'][i]));
  });

  const navigation = node('section', 'noir-navigation noir-screen', 'Tactical radar');
  const radarWrap = take('.vhud-radar-wrap');
  const radar = take('.radar');
  const mapButton = document.createElement('button');
  mapButton.type = 'button';
  mapButton.className = 'noir-map';
  mapButton.setAttribute('aria-label', 'Toggle sector map (M)');
  mapButton.append(radar);
  const mapLabel = node('span', 'noir-map-label');
  mapLabel.innerHTML = '<kbd>M</kbd> MAP';
  mapButton.append(mapLabel);
  radarWrap.append(mapButton);
  navigation.append(radarWrap);

  const power = node('section', 'noir-power noir-screen', 'Reactor power routing');
  const powerPanel = take('.led-power-panel');
  const mode = take('[data-k="powerMode"]');
  mode.classList.add('noir-power-mode');
  const powerHead = powerPanel.querySelector('.led-power-head')!;
  powerHead.textContent = 'POWER';
  powerHead.append(mode);
  powerPanel.querySelectorAll<HTMLElement>('.led-col').forEach((old, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = old.className;
    button.dataset.power = old.dataset.power;
    button.setAttribute('aria-label', ['Route power to engines (Left arrow)', 'Route power to weapons (Up arrow)', 'Route power to shields (Right arrow)'][i]);
    button.title = button.getAttribute('aria-label')!;
    old.querySelector('small')!.textContent = ['ENG', 'WPN', 'SHD'][i];
    button.append(...old.childNodes);
    old.replaceWith(button);
  });
  const equalize = powerPanel.querySelector<HTMLButtonElement>('.led-eq-btn')!;
  equalize.innerHTML = 'EQ <kbd>↓</kbd>';
  equalize.setAttribute('aria-label', 'Equalize reactor power (Down arrow)');
  const powerKeys = node('div', 'noir-power-keys');
  const shunt = (value: number, text: string, label: string): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.power = String(value);
    button.textContent = text;
    button.setAttribute('aria-label', label);
    return button;
  };
  powerKeys.append(shunt(1, '◀', 'Route power to engines'), equalize, shunt(3, '▶', 'Route power to shields'));
  const powerReadout = node('div', 'noir-power-readout');
  powerReadout.append(powerHead, powerPanel.querySelector('.led-cols')!);
  powerPanel.append(powerReadout, powerKeys);
  // Each physical key has a tiny display; retain full names on the native buttons.
  powerKeys.children[0].textContent = '←';
  equalize.textContent = '↓';
  powerKeys.children[2].textContent = '→';
  power.append(powerPanel);
  hud.replaceChildren(status, combat, flight, upgrades, navigation, power);
  surface.append(hud);

  // Scores and strategic state remain visible for pilot AND commander seats.
  const top = take('.top');
  const topSurface = node('div', 'noir-top-surface');
  const cobalt = take('.top .team.cobalt');
  const ember = take('.top .team.ember');
  ember.append(ember.querySelector('.kills')!);
  const clock = take('[data-k="clock"]');
  const points = take('[data-k="pointStrip"]');
  const fleet = take('.ms');
  fleet.setAttribute('aria-label', 'Cobalt and Ember Titan hull and FOB status');
  const fleetTitle = node('span', 'noir-fleet-title');
  fleetTitle.textContent = 'TITANS / FOB';
  fleet.prepend(fleetTitle);
  const banner = take('[data-k="banner"]');
  root.append(banner);
  topSurface.append(cobalt, clock, ember, points, fleet);
  top.replaceChildren(topSurface);
  const windowFrame = node('div', 'noir-window-frame');
  windowFrame.setAttribute('aria-hidden', 'true');
  root.prepend(windowFrame);
  installFrameLayout(root);
  installPanelFitting(root);
  // Native activation still works; keyboard UI use must not also fire/brake.
  root.addEventListener('keydown', event => {
    if ((event.target as Element)?.closest('button, summary') &&
        ['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.stopPropagation();
    if (event.code === 'Escape' && shell.classList.contains('drawer-open')) { setDrawer(false); toggle.focus(); }
  });
}
