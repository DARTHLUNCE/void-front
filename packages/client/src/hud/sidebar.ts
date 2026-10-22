/** Rearrange the existing live controls before HUD bindings are attached. Keeping the
 * same elements preserves their data keys, callbacks and the optional bottom layout. */
export function arrangePilotSidebar(root: HTMLElement): void {
  const take = (selector: string): HTMLElement => {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing pilot HUD element: ${selector}`);
    return element;
  };
  const hud = take('.vhud');
  const section = (name: string, className: string): HTMLElement => {
    const element = document.createElement('section');
    element.className = `pilot-section ${className}`;
    element.setAttribute('aria-label', name);
    const heading = document.createElement('h2');
    heading.className = 'pilot-section-title';
    heading.textContent = name;
    element.append(heading);
    return element;
  };

  const status = section('Ship status', 'pilot-status');
  const healthState = take('[data-k="hullState"]');
  healthState.classList.add('pilot-health-state');
  status.firstElementChild!.append(healthState);
  const identity = take('[data-k="tierBadge"]');
  status.append(identity);
  const vitals = document.createElement('div');
  vitals.className = 'pilot-vitals';
  const readouts = document.createElement('div');
  readouts.className = 'pilot-readouts';
  readouts.innerHTML = `
    <div class="pilot-meter shield"><div><span>Shields</span><b data-k="sidebarShieldValue"></b></div><div class="pilot-meter-track"><i data-k="sidebarShieldBar"></i></div></div>
    <div class="pilot-meter hull"><div><span>Hull</span><b data-k="sidebarHullValue"></b></div><div class="pilot-meter-track"><i data-k="sidebarHullBar"></i></div></div>`;
  vitals.append(take('[data-k="shipScreen"]'), readouts);
  status.append(vitals, take('[data-k="armorArcs"]'));
  const power = take('.led-power-panel');
  const powerMode = take('[data-k="powerMode"]');
  const powerHeading = power.querySelector('.led-power-head')!;
  powerHeading.textContent = 'Power';
  powerHeading.append(powerMode);
  power.querySelector('.led-eq-btn')!.innerHTML = '<kbd>↓</kbd> Equalize';
  power.querySelectorAll<HTMLElement>('.led-col small').forEach((label, i) => {
    label.textContent = ['Engines', 'Weapons', 'Shields'][i];
  });
  power.querySelectorAll<HTMLElement>('.led-col').forEach(old => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = old.className;
    button.dataset.power = old.dataset.power;
    button.title = old.title;
    button.append(...old.childNodes);
    old.replaceWith(button);
  });
  status.append(power);

  const combat = section('Weapons & abilities', 'pilot-combat');
  combat.append(take('.vhud-weapons-dash'));
  const upgrades = section('Upgrades', 'pilot-upgrades');
  upgrades.append(take('.vhud-upgrades-bank'));

  const navigation = section('Radar & flight', 'pilot-navigation');
  const navBody = document.createElement('div');
  navBody.className = 'pilot-nav-body';
  const flight = document.createElement('div');
  flight.className = 'pilot-flight';
  const throttle = take('.vhud-throttle');
  throttle.querySelector('label')!.textContent = 'Throttle';
  const cruise = take('.vhud-sublight');
  cruise.querySelector('label')!.textContent = 'Cruise';
  flight.append(throttle, cruise);
  const hint = document.createElement('div');
  hint.className = 'pilot-flight-hint';
  hint.innerHTML = 'Wheel · speed<br><kbd>Space</kbd> brake · <kbd>Shift</kbd> cruise';
  flight.append(hint);
  navBody.append(take('.vhud-radar-wrap'), flight);
  navigation.append(navBody);
  hud.replaceChildren(status, combat, upgrades, navigation);
}
