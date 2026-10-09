import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildWorkflow } from './workflow-router.mjs';

const root = resolve(import.meta.dirname, '..');
const runsRoot = join(root, 'runs');
const pathFor = id => join(runsRoot, `${id}.json`);

export async function createRun(input) {
  const workflow = buildWorkflow(input);
  const id = randomUUID();
  const now = new Date().toISOString();
  const run = {
    id,
    workflow: workflow.id,
    section: workflow.section,
    createdAt: now,
    updatedAt: now,
    status: 'READY',
    input,
    steps: workflow.steps.map((step, index) => ({ ...step, status: index === 0 ? 'READY' : 'LOCKED', attempts: [], approval: null }))
  };
  await saveRun(run);
  return run;
}

export async function getRun(id) {
  return JSON.parse(await readFile(pathFor(id), 'utf8'));
}

export async function listRuns() {
  const files = await readdir(runsRoot).catch(() => []);
  const runs = await Promise.all(files.filter(file => file.endsWith('.json')).map(file => getRun(file.slice(0, -5))));
  return runs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveRun(run) {
  await mkdir(runsRoot, { recursive: true });
  run.updatedAt = new Date().toISOString();
  await writeFile(pathFor(run.id), JSON.stringify(run, null, 2));
  return run;
}

export async function recoverCompletedArtifact(run, stepId) {
  const step = run.steps.find(candidate => candidate.id === stepId);
  const attempt = step?.attempts.at(-1);
  if (!step || !attempt?.artifactBytes || attempt.exitCode !== 0) throw new Error('Aucun artefact technique récupérable pour cette étape.');
  attempt.status = 'COMPLETED';
  attempt.recoveredAt = new Date().toISOString();
  step.status = 'AWAITING_APPROVAL';
  run.status = 'AWAITING_APPROVAL';
  return saveRun(run);
}

export async function approveStep(run, stepId, decision, note = '') {
  const index = run.steps.findIndex(step => step.id === stepId);
  const step = run.steps[index];
  if (!step || step.status !== 'AWAITING_APPROVAL') throw new Error('Cette étape ne peut pas être validée.');
  step.approval = { decision, note, at: new Date().toISOString() };
  if (decision === 'approve') {
    step.status = 'APPROVED';
    const next = run.steps[index + 1];
    if (next) next.status = 'READY';
    else run.status = 'HUMAN_APPROVED';
  } else {
    step.status = 'REVISION_REQUIRED';
    run.status = 'REVISION_REQUIRED';
  }
  return saveRun(run);
}
