import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, listRuns, approveStep } from '../src/run-store.mjs';

test('seule la première étape est initialement accessible', async () => {
  const run = await createRun({ sitePath: '/tmp/site', target: '/guides/test' });
  assert.equal(run.steps[0].status, 'READY');
  assert.ok(run.steps.slice(1).every(step => step.status === 'LOCKED'));
});

test('une étape non exécutée ne peut pas être approuvée', async () => {
  const run = await createRun({ sitePath: '/tmp/site', target: '/guides/test' });
  await assert.rejects(() => approveStep(run, 'audit', 'approve'), /ne peut pas être validée/);
});

test('une approbation humaine seule déverrouille la suite', async () => {
  const run = await createRun({ sitePath: '/tmp/site', target: '/guides/test' });
  run.steps[0].status = 'AWAITING_APPROVAL';
  await approveStep(run, 'audit', 'approve');
  assert.equal(run.steps[0].status, 'APPROVED');
  assert.equal(run.steps[1].status, 'READY');
  assert.equal(run.steps[2].status, 'LOCKED');
});

test('les exécutions persistées peuvent être retrouvées après rechargement', async () => {
  const created = await createRun({ sitePath: '/tmp/site', target: '/guides/reprise', operation: 'create' });
  const runs = await listRuns();
  assert.ok(runs.some(run => run.id === created.id));
});

test('un refus bloque le workflow et exige une révision', async () => {
  const run = await createRun({ sitePath: '/tmp/site', target: '/guides/test' });
  run.steps[0].status = 'AWAITING_APPROVAL';
  await approveStep(run, 'audit', 'reject', 'Preuves insuffisantes');
  assert.equal(run.steps[0].status, 'REVISION_REQUIRED');
  assert.equal(run.steps[1].status, 'LOCKED');
});
