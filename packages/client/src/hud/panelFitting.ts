const PANELS = '.noir-status,.noir-combat,.vhud-throttle,.noir-brake,.vhud-sublight,.vhud-bank-strip,.vhud-up-card,.noir-power-readout,.top .team,.top .ms';
interface FitPanel { panel: HTMLElement; content: HTMLElement; signature: string; dirty: boolean }

/** Fit live readouts inside the hand-traced glass. Never resize/reposition the frame. */
export function installPanelFitting(root: HTMLElement): void {
  const panels: FitPanel[] = Array.from(root.querySelectorAll<HTMLElement>(PANELS), panel => {
    const content = document.createElement('div');
    content.className = 'noir-fit-inner';
    content.append(...panel.childNodes);
    panel.append(content);
    panel.classList.add('noir-fit-panel');
    return { panel, content, signature: '', dirty: true };
  });
  // DOM-only hosts can still inspect/click all controls; measurement needs a layout engine.
  if (typeof ResizeObserver === 'undefined') return;
  let timer = 0, frame = 0, lastRun = 0;
  const signature = (panel: FitPanel): string => {
    // Ignore numeric value churn with unchanged width; refit names, digit counts,
    // locked/ready states and genuine content/viewport changes.
    return (panel.content.textContent ?? '').replace(/\d/g, '0') + '|' +
      Array.from(panel.content.querySelectorAll('.w-slot,.hull-state')).map(el => el.className).join('|');
  };
  const queue = (): void => {
    if (timer || frame) return;
    timer = window.setTimeout(() => {
      timer = 0;
      frame = requestAnimationFrame(fit);
    }, Math.max(0, 150 - (performance.now() - lastRun)));
  };
  const resize = new ResizeObserver(entries => {
    for (const entry of entries) {
      const item = panels.find(item => item.panel === entry.target);
      if (item) item.dirty = true;
    }
    queue();
  });
  const mutations = new MutationObserver(() => {
    let changed = false;
    for (const item of panels) {
      const next = signature(item);
      if (next !== item.signature) { item.signature = next; item.dirty = true; changed = true; }
    }
    if (changed) queue();
  });
  function fit(): void {
    frame = 0; lastRun = performance.now();
    if (panels.every(item => !item.panel.isConnected)) { resize.disconnect(); mutations.disconnect(); return; }
    const active = panels.filter(item => item.dirty && item.panel.clientWidth > 0 && item.panel.clientHeight > 0);
    for (const item of active) {
      item.panel.dataset.density = 'normal';
      item.panel.dataset.fitOverflow = 'false';
      item.panel.style.setProperty('--content-scale', '1');
    }
    const overflow = (item: FitPanel): boolean => item.content.scrollWidth > item.content.clientWidth + 1 || item.content.scrollHeight > item.content.clientHeight + 1;
    // Batch reads then writes to avoid a separate forced layout for every panel.
    const compact = active.filter(overflow);
    for (const item of compact) item.panel.dataset.density = 'compact';
    const oversized = compact.filter(overflow);
    const floors = new Map<FitPanel, number>();
    for (const item of oversized) {
      let smallest = Infinity;
      for (const el of item.content.querySelectorAll<HTMLElement>('*')) {
        if (!Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) continue;
        const style = getComputedStyle(el);
        if (style.display !== 'none' && el.getClientRects().length) smallest = Math.min(smallest, parseFloat(style.fontSize));
      }
      floors.set(item, Math.min(1, Math.max(.82, 10 / (Number.isFinite(smallest) ? smallest : 12))));
    }
    for (let pass = 0; pass < 4; pass++) {
      const changes: [FitPanel, number][] = [];
      for (const item of oversized) {
        if (!overflow(item)) continue;
        const current = Number(item.panel.style.getPropertyValue('--content-scale'));
        const ratio = Math.min(item.content.clientWidth / Math.max(1,item.content.scrollWidth), item.content.clientHeight / Math.max(1,item.content.scrollHeight));
        const next = Math.max(floors.get(item)!, current * ratio * .99);
        if (next < current - .005) changes.push([item,next]);
      }
      if (!changes.length) break;
      for (const [item,scale] of changes) item.panel.style.setProperty('--content-scale',scale.toFixed(4));
    }
    const stillOverflow = new Set(oversized.filter(overflow));
    for (const item of active) {
      // Never shrink below readable text. Unusually long loadouts get local access
      // rather than bleeding across the bezel or stretching the complete sidebar.
      item.panel.dataset.fitOverflow = String(stillOverflow.has(item));
      item.dirty = false;
      item.signature = signature(item);
    }
  }
  panels.forEach(item => resize.observe(item.panel));
  mutations.observe(root, { subtree: true, childList: true, characterData: true });
  document.fonts?.ready.then(() => { panels.forEach(item => { item.dirty = true; }); queue(); });
  queue();
}
