import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, getRun, saveRun, approveStep, routeAutomaticCorrection } from './run-store.mjs';
import { executeStep } from './codex-executor.mjs';

const root = resolve(import.meta.dirname, '..');
const batchesRoot = join(root, '.editorial-data', 'batches');
const batchPath = id => join(batchesRoot, `${id}.json`);
const maxCorrections = Number(process.env.AUTO_CORRECTION_LIMIT || 2);

async function saveBatch(batch) {
  await mkdir(batchesRoot, { recursive: true });
  batch.updatedAt = new Date().toISOString();
  await writeFile(batchPath(batch.id), JSON.stringify(batch, null, 2));
  return batch;
}

export async function getBatch(id) {
  return JSON.parse(await readFile(batchPath(id), 'utf8'));
}

export async function executeRunAutomatically(runId) {
  let run = await getRun(runId);
  if (['RUNNING', 'AUTO_CORRECTION'].includes(run.status)) throw new Error('Cette automatisation est déjà active.');
  run.executionMode = 'automatic';
  run.automation = { corrections: {}, maxCorrections, startedAt: new Date().toISOString() };
  await saveRun(run);
  while (true) {
    run = await getRun(runId);
    const step = run.steps.find(candidate => ['READY', 'REVISION_REQUIRED'].includes(candidate.status));
    if (!step) return run;
    run = await executeStep(run, step.id, 'chatgpt');
    const completed = run.steps.find(candidate => candidate.id === step.id);
    const attempt = completed.attempts.at(-1);
    if (completed.status !== 'AWAITING_APPROVAL') {
      run.status = 'AUTOMATION_BLOCKED';
      run.automation.blocker = { step: step.id, status: completed.status, error: attempt?.error };
      return saveRun(run);
    }
    const needsCorrection = attempt.outcome !== 'PASS' || attempt.publishVerdict === 'FAIL — KEEP_NOINDEX';
    if (needsCorrection) {
      const corrections = run.automation.corrections[step.id] || 0;
      if (corrections >= maxCorrections) {
        run.status = 'AUTOMATION_BLOCKED';
        run.automation.blocker = { step: step.id, status: attempt.outcome, verdict: attempt.publishVerdict, reason: 'Limite de corrections automatiques atteinte.' };
        return saveRun(run);
      }
      run.automation.corrections[step.id] = corrections + 1;
      await routeAutomaticCorrection(run, step.id, `Correction automatique ${corrections + 1}/${maxCorrections}`);
      continue;
    }
    run = await approveStep(run, step.id, 'approve', 'Validation automatique après artefact PASS.', 'automation');
    if (run.status === 'AUTOMATION_COMPLETED') return run;
  }
}

export async function createBatch(input) {
  const urls = [...new Set(input.urls?.map(value => value.trim()).filter(Boolean))];
  if (!urls.length) throw new Error('Au moins une URL est obligatoire.');
  const batch = { id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'READY', mode: 'sequential', runs: [] };
  for (const target of urls) {
    const run = await createRun({ ...input, urls: undefined, target, executionMode: 'automatic' });
    batch.runs.push({ id: run.id, target, status: run.status });
  }
  await saveBatch(batch);
  return batch;
}

export async function executeBatch(batchId) {
  const batch = await getBatch(batchId);
  batch.status = 'RUNNING';
  await saveBatch(batch);
  for (const item of batch.runs) {
    item.status = 'RUNNING';
    await saveBatch(batch);
    const run = await executeRunAutomatically(item.id);
    item.status = run.status;
    await saveBatch(batch);
    if (run.status === 'AUTOMATION_BLOCKED') {
      batch.status = 'BLOCKED';
      await saveBatch(batch);
      return batch;
    }
  }
  batch.status = 'COMPLETED';
  return saveBatch(batch);
}
