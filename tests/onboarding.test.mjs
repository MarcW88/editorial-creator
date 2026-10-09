import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSite } from '../src/onboarding.mjs';

test('inspecte un dépôt existant sans modifier ses fichiers', async () => {
  const profile = await inspectSite('/Users/marc/bloc-notes-numerique');
  assert.equal(profile.stack, 'node');
  assert.equal(profile.files.agents, true);
  assert.equal(profile.onboardingStatus, 'PENDING_HUMAN_VALIDATION');
});

test('refuse un chemin qui n’est pas une racine Git', async () => {
  await assert.rejects(() => inspectSite('/Users/marc/bloc-notes-numerique/guides'), /racine d’un dépôt Git/);
});
