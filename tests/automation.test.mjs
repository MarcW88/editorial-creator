import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatch } from '../src/automation.mjs';
import { getRun } from '../src/run-store.mjs';

test('crée un lot multi-URL séquentiel sans mélanger les états', async () => {
  const batch = await createBatch({
    siteProfile: 'bloc-notes-numerique',
    sitePath: '/Users/marc/bloc-notes-numerique',
    urls: ['/guides/lot-a/', '/guides/lot-b/'],
    operation: 'create',
    contentType: 'guide'
  });
  assert.equal(batch.mode, 'sequential');
  assert.equal(batch.runs.length, 2);
  const first = await getRun(batch.runs[0].id);
  const second = await getRun(batch.runs[1].id);
  assert.notEqual(first.id, second.id);
  assert.equal(first.input.target, '/guides/lot-a/');
  assert.equal(second.input.target, '/guides/lot-b/');
});
