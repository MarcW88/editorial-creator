import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const dataRoot = join(root, '.editorial-data');
const dataPath = join(dataRoot, 'sites.json');
const repositoriesRoot = join(dataRoot, 'repositories');
const exists = path => access(path).then(() => true, () => false);
const run = (command, args, cwd) => new Promise(resolveRun => {
  const child = spawn(command, args, { cwd });
  let output = '';
  child.stdout.on('data', chunk => output += chunk);
  child.on('error', () => resolveRun(''));
  child.on('close', code => resolveRun(code === 0 ? output.trim() : ''));
});

export function parseGitHubRepository(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('URL GitHub invalide.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') throw new Error('Seules les URL HTTPS github.com sont acceptées.');
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').split('/');
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) throw new Error('Format attendu: https://github.com/proprietaire/depot');
  return { owner: parts[0], repository: parts[1], slug: `${parts[0]}/${parts[1]}`, cloneUrl: `https://github.com/${parts[0]}/${parts[1]}.git` };
}

export async function resolveSiteSource(source) {
  if (!source) throw new Error('Un chemin local ou une URL GitHub est obligatoire.');
  if (!source.startsWith('https://')) return resolve(source);
  const repository = parseGitHubRepository(source);
  const destination = join(repositoriesRoot, `${repository.owner}--${repository.repository}`);
  if (!await exists(destination)) {
    await mkdir(repositoriesRoot, { recursive: true });
    const result = await run('gh', ['repo', 'clone', repository.slug, destination], root);
    if (!result && !await exists(join(destination, '.git'))) throw new Error('Le clone GitHub a échoué. Vérifiez l’accès au dépôt.');
  }
  return destination;
}

export async function inspectSiteSource(source) {
  return inspectSite(await resolveSiteSource(source));
}

export async function inspectSite(localPath) {
  const path = resolve(localPath);
  if (!await exists(path)) throw new Error('Le chemin du site est introuvable.');
  const gitRoot = await run('git', ['rev-parse', '--show-toplevel'], path);
  if (gitRoot !== path) throw new Error('Le chemin doit être la racine d’un dépôt Git.');
  const remote = await run('git', ['remote', 'get-url', 'origin'], path);
  const files = {
    agents: await exists(join(path, 'AGENTS.md')),
    design: await exists(join(path, 'DESIGN.md')),
    packageJson: await exists(join(path, 'package.json')),
    pyproject: await exists(join(path, 'pyproject.toml')),
    requirements: await exists(join(path, 'requirements.txt')),
    wordpress: await exists(join(path, 'wp-config.php'))
  };
  let stack = 'static-or-unknown';
  if (files.packageJson) stack = 'node';
  else if (files.pyproject || files.requirements) stack = 'python';
  else if (files.wordpress) stack = 'wordpress';
  const remoteMatch = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  const repositoryName = remoteMatch?.[2] || basename(path);
  const idSource = remoteMatch ? `${remoteMatch[1]}--${repositoryName}` : basename(path);
  const id = idSource.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return {
    id, name: repositoryName, localPath: path, repository: remote, language: 'TO_CONFIRM', topic: 'TO_CONFIRM',
    stack, files, preferredSources: [], riskAreas: [], forbiddenClaims: [], foreignContexts: [], rules: [
      'Les instructions méthodologiques universelles des skills restent obligatoires.',
      'Les règles propres à un autre site ne s’appliquent pas et doivent être consignées.'
    ], onboardingStatus: 'PENDING_HUMAN_VALIDATION'
  };
}

export async function listOnboardedSites() {
  try { return JSON.parse(await readFile(dataPath, 'utf8')); } catch { return {}; }
}

export async function confirmSite(profile) {
  if (!profile.id || !profile.localPath || !profile.language || profile.language === 'TO_CONFIRM' || !profile.topic || profile.topic === 'TO_CONFIRM') throw new Error('Identifiant, chemin, langue et thématique confirmés sont obligatoires.');
  const inspected = await inspectSite(profile.localPath);
  if (inspected.id !== profile.id) throw new Error('L’identifiant ne correspond pas au dépôt inspecté.');
  const sites = await listOnboardedSites();
  sites[profile.id] = { ...inspected, ...profile, onboardingStatus: 'HUMAN_APPROVED', approvedAt: new Date().toISOString() };
  await mkdir(join(root, '.editorial-data'), { recursive: true });
  await writeFile(dataPath, JSON.stringify(sites, null, 2));
  return sites[profile.id];
}
