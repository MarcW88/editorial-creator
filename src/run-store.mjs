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
  if (!step || !attempt || attempt.exitCode !== 0) throw new Error('Aucun artefact technique récupérable pour cette étape.');
  if (!attempt.artifactBytes) {
    const artifact = await readFile(attempt.outputPath, 'utf8');
    const parsed = JSON.parse(artifact);
    if (!parsed.content || !Array.isArray(parsed.skillExecution)) throw new Error('L’artefact présent ne respecte pas le contrat minimal.');
    attempt.artifactBytes = Buffer.byteLength(artifact);
    attempt.outcome = parsed.outcome;
    attempt.publishVerdict = step.allowedVerdicts?.find(verdict => parsed.content.includes(verdict)) || (parsed.content.includes('FAIL — KEEP_NOINDEX') ? 'FAIL — KEEP_NOINDEX' : undefined);
  }
  attempt.status = 'COMPLETED';
  attempt.recoveredAt = new Date().toISOString();
  step.status = 'AWAITING_APPROVAL';
  run.status = 'AWAITING_APPROVAL';
  return saveRun(run);
}

export async function routeAutomaticCorrection(run, stepId, note) {
  const failedIndex = run.steps.findIndex(step => step.id === stepId);
  if (failedIndex < 0) throw new Error('Étape de correction introuvable.');
  const targetIndex = stepId === 'publish-review' ? Math.max(0, run.steps.findIndex(step => step.id === 'writing')) : failedIndex;
  run.steps.forEach((step, index) => {
    if (index < targetIndex) return;
    step.status = index === targetIndex ? 'REVISION_REQUIRED' : 'LOCKED';
    step.approval = null;
  });
  run.automation = { ...run.automation, lastCorrection: { from: stepId, to: run.steps[targetIndex].id, note, at: new Date().toISOString() } };
  run.status = 'AUTO_CORRECTION';
  return saveRun(run);
}

export async function approveStep(run, stepId, decision, note = '', actor = 'human') {
  const index = run.steps.findIndex(step => step.id === stepId);
  const step = run.steps[index];
  if (!step || step.status !== 'AWAITING_APPROVAL') throw new Error('Cette étape ne peut pas être validée.');
  const attempt = step.attempts.at(-1);
  if (decision === 'approve' && attempt?.publishVerdict === 'FAIL — KEEP_NOINDEX') throw new Error('Un Publish Review FAIL doit retourner en correction et ne peut pas être approuvé.');
  step.approval = { decision, note, actor, at: new Date().toISOString() };
  if (decision === 'approve') {
    step.status = actor === 'automation' ? 'AUTO_APPROVED' : 'APPROVED';
    const next = run.steps[index + 1];
    if (next) {
      next.status = 'READY';
      run.status = 'READY';
    } else run.status = actor === 'automation' ? 'AUTOMATION_COMPLETED' : 'HUMAN_APPROVED';
  } else if (step.mode === 'PUBLISH_REVIEW') {
    const writingIndex = run.steps.findIndex(candidate => candidate.id === 'writing');
    run.steps.forEach((candidate, candidateIndex) => {
      if (candidateIndex < writingIndex) return;
      candidate.status = candidateIndex === writingIndex ? 'REVISION_REQUIRED' : 'LOCKED';
      candidate.approval = null;
    });
    run.status = 'REVISION_REQUIRED';
  } else {
    step.status = 'REVISION_REQUIRED';
    run.status = 'REVISION_REQUIRED';
  }
  return saveRun(run);
}
