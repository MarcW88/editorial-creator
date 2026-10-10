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

export async function validateSiteTarget(profileId, sitePath, target) {
  const profile = await getSiteProfile(profileId);
  if (profile.localPath !== sitePath) throw new Error('Le chemin local ne correspond pas au profil sélectionné.');
  let hostname;
  try { hostname = new URL(target).hostname.replace(/^www\./, ''); } catch { return profile; }
  if (profile.domain && hostname !== profile.domain.replace(/^www\./, '')) throw new Error(`La cible ${hostname} ne correspond pas au profil ${profile.name} (${profile.domain}).`);
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
