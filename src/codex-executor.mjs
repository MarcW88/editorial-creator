import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { buildSkillBundle, verifyRegistry } from './skill-registry.mjs';
import { saveRun } from './run-store.mjs';
import { getSiteProfile, inspectContextConflicts } from './site-profile.mjs';

const root = resolve(import.meta.dirname, '..');
const artifactSchema = join(root, 'config', 'artifact-schema.json');

const commandExists = command => new Promise(resolveExists => {
  const child = spawn(command, ['--version']);
  child.on('error', () => resolveExists(false));
  child.on('close', code => resolveExists(code === 0));
});

export async function doctor() {
  const codexInstalled = await commandExists('codex');
  let auth = false;
  if (codexInstalled) auth = await new Promise(resolveAuth => {
    const child = spawn('codex', ['login', 'status']);
    child.on('error', () => resolveAuth(false));
    child.on('close', code => resolveAuth(code === 0));
  });
  const registry = await verifyRegistry();
  return { codexInstalled, chatGptAuthenticated: auth, paidApiFallback: false, registry };
}

function promptFor(run, step, bundles, outputPath, profile, conflicts) {
  const skillIndex = bundles.map(bundle => `- ${bundle.name}: ${bundle.path} (${Object.keys(bundle.files).length} fichiers chargés)`).join('\n');
  return `Tu exécutes UNE étape d'un workflow éditorial contrôlé.\n\nRÈGLES NON NÉGOCIABLES\n- Lis et applique intégralement chaque SKILL.md indiqué, ainsi que toutes ses références, scripts et templates pertinents.\n- Préserve la méthodologie universelle de chaque skill à l'identique.\n- Les mentions d'un autre site, domaine, produit ou langue sont des règles contextuelles étrangères: ne les applique pas à la cible. Consigne-les dans contextConflicts.\n- N'affirme jamais qu'un skill est exécuté sans livrable vérifiable.\n- Évalue chaque skill conditionnel et marque-le NOT_APPLICABLE avec justification s'il ne s'applique pas; ne l'ignore jamais silencieusement.\n- Ne passe pas à une autre étape.\n- Ne publie pas, ne pousse pas et ne retire jamais noindex.\n- N'utilise aucune API payante.\n- Retourne le résultat final conforme au schéma JSON imposé; Codex l’enregistrera dans ${outputPath}.\n- Le champ outcome évalue l’exécution de cette étape, pas la décision éditoriale sur la page: PASS si le travail demandé est complet même si l’audit recommande une révision.\n- Le champ content contient le livrable éditorial complet et, pour un Publish Review, le verdict exact.\n- Le résultat doit inclure skillExecution et contextConflicts. Pour chaque skill: fichiers consultés, actions, outils, statut PASS/FAIL/NOT_APPLICABLE et justification.\n\nPROFIL DU SITE — couche contextuelle séparée\n${JSON.stringify(profile, null, 2)}\n\nCONFLITS CONTEXTUELS DÉTECTÉS AVANT EXÉCUTION\n${JSON.stringify(conflicts, null, 2)}\n\nÉTAPE\n${JSON.stringify({ id: step.id, label: step.label, mode: step.mode, artifact: step.artifact, conditionalSkills: step.conditionalSkills || [] }, null, 2)}\n\nCONTEXTE DE PAGE\n${JSON.stringify(run.input, null, 2)}\n\nSKILLS ORIGINAUX VERROUILLÉS\n${skillIndex}\n\nSi une donnée ou un accès manque, échoue explicitement au lieu d'inventer.`;
}

export async function executeStep(run, stepId) {
  const step = run.steps.find(candidate => candidate.id === stepId);
  if (!step || !['READY', 'REVISION_REQUIRED'].includes(step.status)) throw new Error('Étape verrouillée ou déjà exécutée.');
  const health = await doctor();
  if (!health.codexInstalled || !health.chatGptAuthenticated || !health.registry.valid) throw new Error('Diagnostic Codex/skills invalide.');
  const skills = step.skills;
  const profile = await getSiteProfile(run.input.siteProfile || 'bloc-notes-numerique');
  if (run.input.sitePath !== profile.localPath) throw new Error('Le chemin local ne correspond pas au profil de site sélectionné.');
  const bundles = await buildSkillBundle(skills);
  const contextConflicts = await inspectContextConflicts(skills, profile);
  const runDir = join(root, 'runs', run.id);
  await mkdir(runDir, { recursive: true });
  const outputPath = join(runDir, step.artifact);
  const logPath = join(runDir, `${step.id}.jsonl`);
  step.status = 'RUNNING';
  const attempt = { startedAt: new Date().toISOString(), skills, skillCommit: health.registry.commit, siteProfile: profile.id, contextConflicts, outputPath, logPath, status: 'RUNNING' };
  step.attempts.push(attempt);
  await saveRun(run);

  const result = await new Promise((resolveExec, reject) => {
    const child = spawn('codex', ['exec', '--ephemeral', '--json', '--model', 'gpt-6.1-sol', '--output-schema', artifactSchema, '--output-last-message', outputPath, '-c', 'model_reasoning_effort="low"', '--sandbox', 'workspace-write', '--add-dir', bundles[0].path.split('/.agents/')[0], '--add-dir', profile.localPath, '-C', root, promptFor(run, step, bundles, outputPath, profile, contextConflicts)], { cwd: root });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, Number(process.env.CODEX_TIMEOUT_MS || 900_000));
    let log = '';
    let stderr = '';
    child.stdout.on('data', chunk => log += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timeout);
      resolveExec({ code, log, stderr, timedOut });
    });
  });
  await writeFile(logPath, result.log + (result.stderr ? `\n${result.stderr}` : ''));
  attempt.finishedAt = new Date().toISOString();
  attempt.exitCode = result.code;
  attempt.timedOut = result.timedOut;
  try {
    const artifact = await readFile(outputPath, 'utf8');
    const parsed = JSON.parse(artifact);
    const reported = new Set(parsed.skillExecution?.map(item => item.skill));
    const missingSkills = skills.filter(skill => !reported.has(skill));
    if (missingSkills.length) throw new Error(`Skills absents du journal: ${missingSkills.join(', ')}`);
    if (step.requiredVerdict && !parsed.content.includes(step.requiredVerdict)) throw new Error(`Verdict requis absent: ${step.requiredVerdict}`);
    attempt.artifactBytes = Buffer.byteLength(artifact);
    attempt.outcome = parsed.outcome;
    attempt.status = result.code === 0 && parsed.outcome === 'PASS' ? 'COMPLETED' : 'FAILED';
  } catch (error) {
    attempt.status = result.timedOut ? 'TIMEOUT' : 'FAILED';
    attempt.error = result.timedOut ? 'Délai Codex dépassé; aucune validation accordée.' : `Artefact absent ou non conforme: ${error.message}`;
  }
  step.status = attempt.status === 'COMPLETED' ? 'AWAITING_APPROVAL' : 'FAILED';
  run.status = step.status;
  await saveRun(run);
  return run;
}
