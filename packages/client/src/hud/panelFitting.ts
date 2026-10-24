const PANELS = '.noir-status,.noir-combat,.vhud-throttle,.noir-brake,.vhud-sublight,.vhud-bank-strip,.vhud-up-card,.noir-power-readout,.top .team,.top .ms';

/** Stable layouts chosen from each measured aperture. Text never transforms or scrolls. */
export function installPanelFitting(root: HTMLElement): void {
  const panels = Array.from(root.querySelectorAll<HTMLElement>(PANELS));
  for (const panel of panels) {
    const content = document.createElement('div');
    content.className = 'noir-fit-inner';
    content.append(...panel.childNodes);
    panel.append(content);
    panel.classList.add('noir-fit-panel');
  }
  if (typeof ResizeObserver === 'undefined') return;
  const update = (panel: HTMLElement): void => {
    const height = panel.clientHeight;
    const combat = panel.classList.contains('noir-combat');
    const status = panel.classList.contains('noir-status');
    const density = combat ? height < 135 ? 'minimal' : height < 180 ? 'compact' : 'normal'
      : status ? height < 125 ? 'minimal' : height < 170 ? 'compact' : 'normal'
      : height < 40 ? 'compact' : 'normal';
    if (panel.dataset.density !== density) panel.dataset.density = density;
  };
  const observer = new ResizeObserver(entries => {
    if (!root.isConnected) { observer.disconnect(); return; }
    for (const entry of entries) update(entry.target as HTMLElement);
  });
  panels.forEach(panel => { update(panel); observer.observe(panel); });
}
