import { parentPort, workerData } from 'node:worker_threads';
import { runMatch } from './runMatch';

interface Job {
  index: number;
  seed: number;
  fleet: number;
}

const jobs = (workerData as { jobs: Job[] }).jobs;
for (const job of jobs) {
  const result = runMatch(job.index, job.seed, job.fleet);
  parentPort!.postMessage(result);
}
