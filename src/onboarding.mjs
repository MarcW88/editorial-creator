import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const dataPath = join(root, '.editorial-data', 'sites.json');
const exists = path => access(path).then(() => true, () => false);
const run = (command, args, cwd) => new Promise(resolveRun => {
  const child = spawn(command, args, { cwd });
  let output = '';
  child.stdout.on('data', chunk => output += chunk);
  child.on('error', () => resolveRun(''));
  child.on('close', code => resolveRun(code === 0 ? output.trim() : ''));
});

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
  const id = basename(path).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return {
    id, name: basename(path), localPath: path, repository: remote, language: 'TO_CONFIRM', topic: 'TO_CONFIRM',
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
