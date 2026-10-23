/**
 * Leaving a match. The renderer and sim worker aren't built to be torn down in place, so leaving
 * reloads the page; a one-shot flag tells the next load to open the terminal instead of the title.
 */
const KEY = 'vf.bootTo';

export function backToMenu(): void {
  try {
    sessionStorage.setItem(KEY, 'menu');
  } catch {
    /* storage unavailable: the reload just shows the title screen */
  }
  location.reload();
}

/** True (once) when the last page asked to come back to the terminal. */
export function bootToMenu(): boolean {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v === 'menu';
  } catch {
    return false;
  }
}
