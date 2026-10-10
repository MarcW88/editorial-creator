import test from 'node:test';
import assert from 'node:assert/strict';
import { getSiteProfile, validateSiteTarget, inspectContextConflicts } from '../src/site-profile.mjs';

test('le profil de site est séparé des skills', async () => {
  const profile = await getSiteProfile('bloc-notes-numerique');
  assert.equal(profile.language, 'fr-FR');
  assert.match(profile.topic, /E Ink/);
  assert.ok(profile.rules.some(rule => rule.includes('méthode universelles')));
});

test('les instructions étrangères restent détectables sans modifier les skills', async () => {
  const profile = await getSiteProfile('bloc-notes-numerique');
  const conflicts = await inspectContextConflicts(['fact-check', 'editorial-qa', 'search-intent'], profile);
  assert.ok(conflicts.some(conflict => conflict.marker === 'italiaanse-percolator.nl'));
  assert.ok(conflicts.every(conflict => conflict.skill && conflict.file));
});

test('refuse une cible appartenant à un autre domaine que le profil sélectionné', async () => {
  await assert.rejects(() => validateSiteTarget('bloc-notes-numerique', '/Users/marc/bloc-notes-numerique', 'https://biologische-hondensnacks.nl/eiwit/rund/'), /ne correspond pas au profil/);
});

test('détecte automatiquement les contextes étrangers pour un nouveau site', async () => {
  const conflicts = await inspectContextConflicts(['guide-content-workflow', 'fact-check'], {
    name: 'Biologische Hondensnacks', topic: 'Natuurlijke snacks voor honden', foreignContexts: []
  });
  assert.ok(conflicts.some(conflict => conflict.marker === 'bloc-notes-numeriques.fr'));
  assert.ok(conflicts.some(conflict => conflict.marker === 'italiaanse-percolator.nl'));
});
