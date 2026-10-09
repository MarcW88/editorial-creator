import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const lockPath = join(root, 'config', 'skills-lock.json');
const cacheRoot = join(root, '.editorial-cache', 'skills');

const run = (command, args, cwd) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => stdout += chunk);
  child.stderr.on('data', chunk => stderr += chunk);
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolveRun(stdout.trim()) : reject(new Error(stderr.trim() || `${command} exited ${code}`)));
});

const hashFile = async path => createHash('sha256').update(await readFile(path)).digest('hex');

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else files.push(child);
  }
  return files;
}

export async function readLock() {
  return JSON.parse(await readFile(lockPath, 'utf8'));
}

export async function syncSkills() {
  const lock = await readLock();
  const checkout = join(cacheRoot, lock.commit);
  try {
    await access(join(checkout, '.git'));
  } catch {
    await mkdir(dirname(checkout), { recursive: true });
    await run('git', ['clone', '--no-checkout', lock.repository, checkout], root);
  }
  await run('git', ['fetch', '--depth', '1', 'origin', lock.commit], checkout);
  await run('git', ['checkout', '--detach', lock.commit], checkout);
  const actualCommit = await run('git', ['rev-parse', 'HEAD'], checkout);
  if (actualCommit !== lock.commit) throw new Error(`Commit inattendu: ${actualCommit}`);

  const skills = {};
  for (const name of lock.required) {
    const directory = join(checkout, lock.skillsRoot, name);
    await access(join(directory, 'SKILL.md'));
    const files = await walk(directory);
    skills[name] = {
      path: directory,
      files: Object.fromEntries(await Promise.all(files.map(async file => [file.slice(directory.length + 1), await hashFile(file)])))
    };
  }
  const manifest = { repository: lock.repository, commit: lock.commit, syncedAt: new Date().toISOString(), skills };
  await writeFile(join(checkout, 'editorial-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function getRegistry() {
  const lock = await readLock();
  const manifestPath = join(cacheRoot, lock.commit, 'editorial-manifest.json');
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return syncSkills();
  }
}

export async function verifyRegistry() {
  const manifest = await getRegistry();
  const mismatches = [];
  for (const [skill, data] of Object.entries(manifest.skills)) {
    for (const [relative, expected] of Object.entries(data.files)) {
      const actual = await hashFile(join(data.path, relative));
      if (actual !== expected) mismatches.push({ skill, file: relative, expected, actual });
    }
  }
  return { valid: mismatches.length === 0, commit: manifest.commit, skillCount: Object.keys(manifest.skills).length, mismatches };
}

export async function buildSkillBundle(names) {
  const registry = await getRegistry();
  return Promise.all(names.map(async name => {
    const skill = registry.skills[name];
    if (!skill) throw new Error(`Skill non verrouillé: ${name}`);
    const files = {};
    for (const relative of Object.keys(skill.files)) files[relative] = await readFile(join(skill.path, relative), 'utf8');
    return { name, path: skill.path, files };
  }));
}
