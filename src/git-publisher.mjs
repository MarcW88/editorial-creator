import { spawn } from 'node:child_process';
import { getRun, saveRun } from './run-store.mjs';
import { getSiteProfile } from './site-profile.mjs';

const runCommand = (command, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => stdout += chunk);
  child.stderr.on('data', chunk => stderr += chunk);
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `${command} exited ${code}`)));
});
const changedFiles = async cwd => (await runCommand('git', ['status', '--porcelain'], cwd)).split('\n').filter(Boolean).map(line => line.slice(3));

export async function prepareGitPublication(runId, mode) {
  const run = await getRun(runId);
  if (!['HUMAN_APPROVED', 'AUTOMATION_COMPLETED'].includes(run.status)) throw new Error('Le workflow doit être terminé avant toute préparation Git.');
  if (!['branch', 'main'].includes(mode)) throw new Error('Mode Git invalide.');
  const profile = await getSiteProfile(run.input.siteProfile);
  const files = await changedFiles(profile.localPath);
  if (!files.length) throw new Error('Aucun changement à publier dans le dépôt du site.');
  const branch = mode === 'branch' ? `editorial/${run.section}-${run.id.slice(0, 8)}` : 'main';
  run.gitPublication = { mode, branch, files, status: 'AWAITING_GIT_APPROVAL', preparedAt: new Date().toISOString() };
  await saveRun(run);
  return run.gitPublication;
}

export async function executeGitPublication(runId, confirmation) {
  const run = await getRun(runId);
  const publication = run.gitPublication;
  if (!publication || publication.status !== 'AWAITING_GIT_APPROVAL') throw new Error('Aucune publication Git préparée.');
  const required = publication.mode === 'main' ? 'PUSH_MAIN' : 'PUSH_BRANCH';
  if (confirmation !== required) throw new Error(`Confirmation exacte requise: ${required}`);
  const profile = await getSiteProfile(run.input.siteProfile);
  const currentFiles = await changedFiles(profile.localPath);
  if (JSON.stringify(currentFiles.sort()) !== JSON.stringify([...publication.files].sort())) throw new Error('Les fichiers modifiés ont changé depuis la préparation. Recommencez la revue Git.');
  const currentBranch = await runCommand('git', ['branch', '--show-current'], profile.localPath);
  if (publication.mode === 'branch') await runCommand('git', ['switch', '-c', publication.branch], profile.localPath);
  else if (currentBranch !== 'main') throw new Error('Le push direct exige que le dépôt soit déjà sur main.');
  await runCommand('git', ['add', '--', ...publication.files], profile.localPath);
  await runCommand('git', ['commit', '-m', `Editorial: ${run.input.target}\n\nRun: ${run.id}`], profile.localPath);
  await runCommand('git', ['push', '-u', 'origin', publication.branch], profile.localPath);
  publication.status = 'PUSHED';
  publication.pushedAt = new Date().toISOString();
  publication.commit = await runCommand('git', ['rev-parse', 'HEAD'], profile.localPath);
  if (publication.mode === 'branch') {
    try {
      const url = await runCommand('gh', ['pr', 'create', '--fill', '--head', publication.branch], profile.localPath);
      publication.pullRequest = { status: 'CREATED', url };
    } catch {
      publication.pullRequest = { status: 'GH_AUTH_REQUIRED', instruction: `gh auth login && gh pr create --fill --head ${publication.branch}` };
    }
  } else publication.pullRequest = null;
  await saveRun(run);
  return publication;
}
