import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, saveRun } from '../src/run-store.mjs';
import { prepareGitPublication, suggestedFilesFor } from '../src/git-publisher.mjs';

test('recommande uniquement la cible, sa source et le générateur associé', () => {
  const files = ['eiwit/kip/index.html', 'content/eiwit/kip.json', 'scripts/build.mjs', 'eiwit/eend/index.html', 'index.html'];
  assert.deepEqual(suggestedFilesFor({ input: { target: 'https://example.test/eiwit/kip/' } }, files), [
    'eiwit/kip/index.html', 'content/eiwit/kip.json', 'scripts/build.mjs'
  ]);
});

test('interdit toute préparation Git avant la validation humaine finale', async () => {
  const run = await createRun({ siteProfile: 'bloc-notes-numerique', sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/test/', operation: 'create' });
  await assert.rejects(() => prepareGitPublication(run.id, 'branch'), /workflow doit être terminé/);
});

test('refuse un mode de publication Git inconnu', async () => {
  const run = await createRun({ siteProfile: 'bloc-notes-numerique', sitePath: '/Users/marc/bloc-notes-numerique', target: '/guides/test/', operation: 'create' });
  run.status = 'HUMAN_APPROVED';
  await saveRun(run);
  await assert.rejects(() => prepareGitPublication(run.id, 'force'), /Mode Git invalide/);
});
