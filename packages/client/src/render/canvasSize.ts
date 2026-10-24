/** Follow layout-driven changes, including a wrapped cockpit or a resized sidebar.
 * Recheck at the next animation frame so all frame/viewport CSS writes have settled. */
export function observeCanvasSize(parent: HTMLElement, resize: (width: number, height: number) => void): () => void {
  let frame = 0, lastWidth = 0, lastHeight = 0;
  let observer: ResizeObserver | undefined;
  const sync = (): void => {
    frame = 0;
    if (!parent.isConnected) { dispose(); return; }
    const { width, height } = parent.getBoundingClientRect();
    if (!(width > 0 && height > 0) || (width === lastWidth && height === lastHeight)) return;
    lastWidth = width; lastHeight = height;
    resize(width,height);
  };
  const queue = (): void => { if (!frame) frame = requestAnimationFrame(sync); };
  const dispose = (): void => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; observer?.disconnect();
    window.removeEventListener('resize',queue);
    window.removeEventListener('pagehide',dispose);
  };
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(queue);
    observer.observe(parent);
  }
  window.addEventListener('resize',queue);
  window.addEventListener('pagehide',dispose,{once:true});
  sync();
  return dispose;
}
