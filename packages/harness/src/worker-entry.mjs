// Worker threads don't inherit tsx's loader reliably; register it here, then load the TS worker.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
