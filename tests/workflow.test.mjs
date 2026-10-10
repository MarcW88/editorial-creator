import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, listRuns, recoverCompletedArtifact, approveStep } from '../src/run-store.mjs';

test('seule la première étape est initialement accessible', async () => {
  const run = await createRun({ sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/test' });
  assert.equal(run.steps[0].status, 'READY');
  assert.ok(run.steps.slice(1).every(step => step.status === 'LOCKED'));
});

test('une étape non exécutée ne peut pas être approuvée', async () => {
  const run = await createRun({ sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/test' });
  await assert.rejects(() => approveStep(run, 'audit', 'approve'), /ne peut pas être validée/);
});

test('une approbation humaine seule déverrouille la suite', async () => {
  const run = await createRun({ sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/test' });
  run.steps[0].status = 'AWAITING_APPROVAL';
  await approveStep(run, 'audit', 'approve');
  assert.equal(run.steps[0].status, 'APPROVED');
  assert.equal(run.steps[1].status, 'READY');
  assert.equal(run.steps[2].status, 'LOCKED');
});

test('les exécutions persistées peuvent être retrouvées après rechargement', async () => {
  const created = await createRun({ sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/reprise', operation: 'create' });
  const runs = await listRuns();
  assert.ok(runs.some(run => run.id === created.id));
});

test('un artefact conforme peut être récupéré indépendamment de son verdict éditorial', async () => {
  const run = await createRun({ sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/reprise', operation: 'create' });
  run.steps[0].status = 'FAILED';
  run.steps[0].attempts.push({ exitCode: 0, artifactBytes: 120, status: 'FAILED', outcome: 'FAIL' });
  const recovered = await recoverCompletedArtifact(run, run.steps[0].id);
  assert.equal(recovered.steps[0].status, 'AWAITING_APPROVAL');
  assert.equal(recovered.steps[0].attempts[0].outcome, 'FAIL');
});

test('un Publish Review FAIL ne peut pas être approuvé et retourne vers la rédaction', async () => {
  const run = await createRun({ sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/reprise', operation: 'create' });
  const publish = run.steps.at(-1);
  run.steps.forEach(step => step.status = 'APPROVED');
  publish.status = 'AWAITING_APPROVAL';
  publish.attempts.push({ publishVerdict: 'FAIL — KEEP_NOINDEX', outcome: 'FAIL' });
  await assert.rejects(() => approveStep(run, publish.id, 'approve'), /ne peut pas être approuvé/);
  const corrected = await approveStep(run, publish.id, 'reject', 'Corriger les blockers');
  assert.equal(corrected.steps.find(step => step.id === 'writing').status, 'REVISION_REQUIRED');
  assert.equal(corrected.steps.at(-1).status, 'LOCKED');
});

test('un refus bloque le workflow et exige une révision', async () => {
  const run = await createRun({ sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/test' });
  run.steps[0].status = 'AWAITING_APPROVAL';
  await approveStep(run, 'audit', 'reject', 'Preuves insuffisantes');
  assert.equal(run.steps[0].status, 'REVISION_REQUIRED');
  assert.equal(run.steps[1].status, 'LOCKED');
});
