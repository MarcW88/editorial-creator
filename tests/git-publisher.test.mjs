import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, saveRun } from '../src/run-store.mjs';
import { prepareGitPublication } from '../src/git-publisher.mjs';

test('interdit toute préparation Git avant la validation humaine finale', async () => {
  const run = await createRun({ siteProfile: 'bloc-notes-numerique', sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/test/', operation: 'create' });
  await assert.rejects(() => prepareGitPublication(run.id, 'branch'), /revue humaine finale/);
});

test('refuse un mode de publication Git inconnu', async () => {
  const run = await createRun({ siteProfile: 'bloc-notes-numerique', sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/test/', operation: 'create' });
  run.status = 'HUMAN_APPROVED';
  await saveRun(run);
  await assert.rejects(() => prepareGitPublication(run.id, 'force'), /Mode Git invalide/);
});
