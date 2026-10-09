import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildSkillBundle } from './skill-registry.mjs';
import { listOnboardedSites } from './onboarding.mjs';

const root = resolve(import.meta.dirname, '..');
const profilesPath = join(root, 'config', 'site-profiles.json');

export async function getSiteProfile(id) {
  const builtIn = JSON.parse(await readFile(profilesPath, 'utf8'));
  const profiles = { ...builtIn, ...await listOnboardedSites() };
  const profile = profiles[id];
  if (!profile) throw new Error(`Profil de site inconnu: ${id}`);
  return profile;
}

export async function inspectContextConflicts(skillNames, profile) {
  const bundles = await buildSkillBundle(skillNames);
  const knownContexts = ['italiaanse-percolator.nl', 'bloc-notes-numeriques.fr', 'cafetières italiennes', 'koffie', 'Nederlandse content'];
  const ownContext = [profile.domain, profile.name, profile.topic].filter(Boolean).map(value => value.toLocaleLowerCase());
  const markers = [...new Set([...(profile.foreignContexts || []), ...knownContexts])].filter(marker => !ownContext.some(value => value.includes(marker.toLocaleLowerCase())));
  const conflicts = [];
  for (const bundle of bundles) {
    for (const [file, content] of Object.entries(bundle.files)) {
      for (const marker of markers) {
        if (content.toLocaleLowerCase().includes(marker.toLocaleLowerCase())) conflicts.push({ skill: bundle.name, file, marker });
      }
    }
  }
  return conflicts;
}
