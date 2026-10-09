import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSite, inspectSiteSource, parseGitHubRepository } from '../src/onboarding.mjs';

test('inspecte un dépôt existant sans modifier ses fichiers', async () => {
  const profile = await inspectSite('/Users/marc/bloc-notes-numerique');
  assert.equal(profile.stack, 'node');
  assert.equal(profile.files.agents, true);
  assert.equal(profile.onboardingStatus, 'PENDING_HUMAN_VALIDATION');
});

test('refuse un chemin qui n’est pas une racine Git', async () => {
  await assert.rejects(() => inspectSite('/Users/marc/bloc-notes-numerique/guides'), /racine d’un dépôt Git/);
});

test('normalise une URL GitHub HTTPS sans accepter un autre hébergeur', () => {
  assert.deepEqual(parseGitHubRepository('https://github.com/MarcW88/editorial-creator'), {
    owner: 'MarcW88', repository: 'editorial-creator', slug: 'MarcW88/editorial-creator', cloneUrl: 'https://github.com/MarcW88/editorial-creator.git'
  });
  assert.throws(() => parseGitHubRepository('https://example.com/MarcW88/editorial-creator'), /github.com/);
});

test('accepte encore directement un chemin local', async () => {
  const profile = await inspectSiteSource('/Users/marc/bloc-notes-numerique');
  assert.equal(profile.localPath, '/Users/marc/bloc-notes-numerique');
});
