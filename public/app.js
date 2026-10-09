let run;
let selectedStepId;
let syncTimer;
let openAiConfigured = false;
let activeBatch;
let pendingPublication;
let batchTimer;
let sites = {};
const builtInSite = { id: 'bloc-notes-numerique', name: 'Bloc-notes numériques', localPath: '/Users/marc/bloc-notes-numerique', language: 'fr-FR' };
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const elapsed = startedAt => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
};
const health = document.querySelector('#health');
const workspace = document.querySelector('#workspace');
const stepsNode = document.querySelector('#steps');
const detail = document.querySelector('#step-detail');
const expectedOutputs = {
  audit: 'Un diagnostic, une décision éditoriale et la valeur existante à préserver.',
  intent: 'L’intention, le périmètre, la tâche du lecteur et les chevauchements internes.',
  evidence: 'Un registre de sources, claims, dates, niveaux de preuve et inconnues.',
  brief: 'Un brief propre à la page, fondé sur l’intention et les preuves.',
  writing: 'La rédaction ou correction intégrée à la source de vérité du site.',
  editorial: 'Les rapports séparés de maillage, naturel, écriture et anti-AI-slop.',
  'fact-check-final': 'La vérification des affirmations réellement présentes après les révisions.',
  quality: 'Les contrôles SEO, techniques et éditoriaux applicables.',
  'publish-review': 'Le verdict PASS — READY_FOR_HUMAN_VALIDATION ou FAIL — KEEP_NOINDEX.',
  'final-review': 'La revue finale et les risques résiduels avant validation humaine.'
};

async function api(path, options) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Erreur inattendue');
  return value;
}

async function refreshSites() {
  sites = { [builtInSite.id]: builtInSite, ...await api('/api/sites') };
  const select = document.querySelector('#site-profile');
  select.innerHTML = Object.values(sites).map(site => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)} · ${escapeHtml(site.language)}</option>`).join('');
  select.dispatchEvent(new Event('change'));
}

async function refreshHealth() {
  try {
    const value = await api('/api/health');
    openAiConfigured = value.openAiApiConfigured;
    health.textContent = value.codexInstalled && value.chatGptAuthenticated && value.registry.valid
      ? `Prêt · ${value.registry.skillCount} skills · ${value.openAiApiConfigured ? 'API disponible' : 'API non configurée'} · ${value.registry.commit.slice(0, 7)}`
      : 'Configuration incomplète';
  } catch { health.textContent = 'Diagnostic indisponible'; }
}

function render(selectedId) {
  workspace.hidden = false;
  selectedStepId = selectedId || selectedStepId;
  const selected = run.steps.find(step => step.id === selectedStepId) || run.steps.find(step => step.status !== 'LOCKED') || run.steps[0];
  selectedStepId = selected.id;
  stepsNode.innerHTML = run.steps.map((step, index) => `<li class="${step.id === selected.id ? 'active' : ''} ${step.status}" data-id="${step.id}"><span>${index + 1}</span><span>${step.label}<br><small>${step.status}</small></span></li>`).join('');
  stepsNode.querySelectorAll('li').forEach(node => node.addEventListener('click', () => render(node.dataset.id)));
  const last = selected.attempts.at(-1);
  detail.innerHTML = `<p class="section-number">Étape contrôlée</p><h2>${selected.label}</h2><p class="status">${selected.status}</p><p><strong>Livrable attendu :</strong> ${escapeHtml(expectedOutputs[selected.id] || selected.artifact)}</p><p>Skills originaux exigés :</p><ul class="skill-list">${selected.skills.map(skill => `<li>${skill}</li>`).join('')}</ul>${last ? `<p class="notice">Artefact : ${last.outputPath}<br>Commit : ${last.skillCommit}<br>Profil : ${last.siteProfile || '—'}<br>Exécuteur : ${last.provider === 'openai-api' ? 'API OpenAI' : 'Abonnement ChatGPT'}<br>Conflits contextuels : ${last.contextConflicts?.length || 0}<br>Statut technique : ${last.status}${last.outcome ? `<br>Résultat éditorial : ${last.outcome}` : ''}${last.startedAt ? `<br>Temps écoulé : <span id="elapsed">${elapsed(last.startedAt)}</span>` : ''}${last.error ? `<br>${escapeHtml(last.error)}` : ''}</p>` : ''}${selected.status === 'RUNNING' ? `<p class="notice">Exécution en cours. Dernière activité : ${escapeHtml(last?.lastActivityAt ? new Date(last.lastActivityAt).toLocaleTimeString() : 'initialisation')}. Cette page se rafraîchit automatiquement.</p>` : ''}${last?.events?.length ? `<details open><summary>Activité récente</summary><ol class="activity">${last.events.slice(-12).map(event => `<li><time>${escapeHtml(new Date(event.at).toLocaleTimeString())}</time> ${escapeHtml(event.label)}</li>`).join('')}</ol></details>` : ''}<div id="artifact"></div><div id="message"></div><div class="actions">${last?.artifactBytes ? '<button id="view-artifact" class="secondary">Consulter le livrable</button>' : ''}${selected.status === 'FAILED' && last?.artifactBytes ? '<button id="recover-artifact">Récupérer ce livrable terminé</button>' : ''}${['READY','REVISION_REQUIRED','FAILED','TIMEOUT'].includes(selected.status) ? `<button id="execute">${['FAILED','TIMEOUT'].includes(selected.status) ? 'Relancer avec Codex' : 'Exécuter avec Codex'}</button>` : ''}${selected.status === 'LIMIT_REACHED' && openAiConfigured ? '<button id="resume-openai">Reprendre avec l’API OpenAI</button>' : ''}${selected.status === 'LIMIT_REACHED' && !openAiConfigured ? '<p class="notice error">Limite Codex détectée. Redémarrez le serveur avec OPENAI_API_KEY pour autoriser une reprise API explicite.</p>' : ''}${selected.status === 'AWAITING_APPROVAL' && last?.publishVerdict !== 'FAIL — KEEP_NOINDEX' ? `<button id="approve">${last?.outcome === 'PASS' ? 'Valider et continuer' : 'Accepter le diagnostic et continuer'}</button><button id="reject" class="reject">Demander une correction</button>` : ''}${selected.status === 'AWAITING_APPROVAL' && last?.publishVerdict === 'FAIL — KEEP_NOINDEX' ? '<button id="reject" class="reject">Corriger les blockers et rejouer les contrôles</button>' : ''}${['HUMAN_APPROVED','AUTOMATION_COMPLETED'].includes(run.status) ? '<button id="prepare-branch">Préparer branche + pull request</button><button id="prepare-main" class="reject">Préparer push direct main</button>' : ''}</div>`;
  detail.querySelector('#view-artifact')?.addEventListener('click', () => viewArtifact(selected.id));
  detail.querySelector('#execute')?.addEventListener('click', () => execute(selected.id, 'chatgpt'));
  detail.querySelector('#resume-openai')?.addEventListener('click', () => execute(selected.id, 'openai-api'));
  detail.querySelector('#recover-artifact')?.addEventListener('click', () => recoverArtifact(selected.id));
  detail.querySelector('#approve')?.addEventListener('click', () => decide(selected.id, 'approve'));
  detail.querySelector('#reject')?.addEventListener('click', () => decide(selected.id, 'reject'));
  detail.querySelector('#prepare-branch')?.addEventListener('click', () => prepareGit('branch'));
  detail.querySelector('#prepare-main')?.addEventListener('click', () => prepareGit('main'));
}

async function recoverArtifact(id) {
  try {
    run = await api(`/api/runs/${run.id}/steps/${id}/recover`, { method: 'POST' });
    render(id);
    await viewArtifact(id);
  } catch (error) { detail.querySelector('#message').innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`; }
}

async function viewArtifact(id) {
  try {
    const artifact = await api(`/api/runs/${run.id}/steps/${id}/artifact`);
    detail.querySelector('#artifact').innerHTML = `<h3>Livrable</h3><p>${escapeHtml(artifact.summary)}</p><pre>${escapeHtml(artifact.content)}</pre>`;
  } catch (error) { detail.querySelector('#message').innerHTML = `<p class="notice error">${error.message}</p>`; }
}

function renderBatch() {
  const node = document.querySelector('#batch-status');
  if (!activeBatch) { node.hidden = true; return; }
  node.hidden = false;
  node.className = 'notice';
  node.innerHTML = `<strong>Lot séquentiel · ${escapeHtml(activeBatch.status)}</strong><div class="batch-runs">${activeBatch.runs.map((item, index) => `<button class="batch-run" data-run-id="${escapeHtml(item.id)}">${index + 1}. ${escapeHtml(item.target)} — ${escapeHtml(item.status)}</button>`).join('')}</div>`;
  node.querySelectorAll('.batch-run').forEach(button => button.addEventListener('click', async () => {
    run = await api(`/api/runs/${button.dataset.runId}`);
    localStorage.setItem('editorial-active-run', run.id);
    selectedStepId = undefined;
    render();
  }));
}

function startBatchSync() {
  clearInterval(batchTimer);
  batchTimer = setInterval(async () => {
    try {
      activeBatch = await api(`/api/batches/${activeBatch.id}`);
      renderBatch();
      const current = activeBatch.runs.find(item => ['RUNNING','READY'].includes(item.status)) || activeBatch.runs.at(-1);
      if (current) {
        run = await api(`/api/runs/${current.id}`);
        localStorage.setItem('editorial-active-run', run.id);
        render();
      }
      if (['COMPLETED','BLOCKED'].includes(activeBatch.status)) clearInterval(batchTimer);
    } catch {}
  }, 2500);
}

function startRunSync() {
  clearInterval(syncTimer);
  syncTimer = setInterval(async () => {
    if (!run) return;
    try {
      run = await api(`/api/runs/${run.id}`);
      render(selectedStepId);
      if (!run.steps.some(step => step.status === 'RUNNING')) clearInterval(syncTimer);
    } catch {}
  }, 2000);
}

async function restoreRun() {
  const savedBatchId = localStorage.getItem('editorial-active-batch');
  if (savedBatchId) {
    try {
      activeBatch = await api(`/api/batches/${savedBatchId}`);
      renderBatch();
      if (!['COMPLETED','BLOCKED'].includes(activeBatch.status)) startBatchSync();
    } catch { localStorage.removeItem('editorial-active-batch'); }
  }
  const runs = await api('/api/runs');
  const savedId = localStorage.getItem('editorial-active-run');
  run = runs.find(candidate => candidate.id === savedId) || runs.find(candidate => candidate.steps.some(step => step.status === 'RUNNING')) || runs.find(candidate => candidate.input?.siteProfile && !candidate.input.target?.includes('test'));
  if (!run) return;
  localStorage.setItem('editorial-active-run', run.id);
  document.querySelector('#setup').hidden = true;
  render();
  if (run.steps.some(step => step.status === 'RUNNING')) startRunSync();
}

async function execute(id, provider) {
  if (provider === 'openai-api' && !confirm('Cette reprise utilise l’API OpenAI facturée séparément. Continuer ?')) return;
  const endpoint = provider === 'openai-api' ? 'execute-openai' : 'execute';
  const request = api(`/api/runs/${run.id}/steps/${id}/${endpoint}`, { method: 'POST' });
  startRunSync();
  try {
    run = await request;
    render(id);
  } catch (error) {
    run = await api(`/api/runs/${run.id}`);
    render(id);
    const message = detail.querySelector('#message');
    if (message) message.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
  }
}

function renderGitSelection(publication) {
  pendingPublication = publication;
  const suggested = new Set(publication.suggestedFiles || []);
  detail.querySelector('#message').innerHTML = `<section class="git-review"><h3>Revue des fichiers à publier</h3><p>Seuls les fichiers cochés seront commités. Les autres modifications resteront locales.</p><div class="git-files">${publication.files.map(file => `<label><input type="checkbox" value="${escapeHtml(file)}" ${suggested.has(file) ? 'checked' : ''}> ${escapeHtml(file)}${suggested.has(file) ? ' — recommandé' : ''}</label>`).join('')}</div><button id="confirm-git">${publication.mode === 'main' ? 'Confirmer le push sur main' : 'Créer la branche et la pull request'}</button><button id="cancel-git" class="reject">Annuler</button></section>`;
  detail.querySelector('#cancel-git').addEventListener('click', () => { pendingPublication = undefined; detail.querySelector('#message').innerHTML = ''; });
  detail.querySelector('#confirm-git').addEventListener('click', executeSelectedPublication);
}

async function executeSelectedPublication() {
  const files = [...detail.querySelectorAll('.git-files input:checked')].map(input => input.value);
  const confirmation = pendingPublication.mode === 'main' ? 'PUSH_MAIN' : 'PUSH_BRANCH';
  try {
    const result = await api(`/api/runs/${run.id}/git/execute`, { method: 'POST', body: JSON.stringify({ confirmation, files }) });
    detail.querySelector('#message').innerHTML = `<p class="notice">Push terminé: ${escapeHtml(result.commit)}<br>${escapeHtml(result.pullRequest?.url || result.pullRequest?.instruction || 'main mis à jour')}</p>${result.pullRequest?.status === 'CREATED' ? '<button id="merge-main">Fusionner cette pull request dans main</button>' : ''}`;
    detail.querySelector('#merge-main')?.addEventListener('click', mergePullRequest);
  } catch (error) { detail.querySelector('#message').innerHTML += `<p class="notice error">${escapeHtml(error.message)}</p>`; }
}

async function mergePullRequest() {
  if (!confirm('Fusionner cette pull request dans main ? Cette action met à jour la branche de production.')) return;
  try {
    const result = await api(`/api/runs/${run.id}/git/merge`, { method: 'POST', body: JSON.stringify({ confirmation: 'MERGE_MAIN' }) });
    detail.querySelector('#message').innerHTML = `<p class="notice">Pull request fusionnée dans main.<br>${escapeHtml(result.pullRequest.url)}</p>`;
  } catch (error) { detail.querySelector('#message').innerHTML += `<p class="notice error">${escapeHtml(error.message)}</p>`; }
}

async function prepareGit(mode) {
  try {
    const publication = await api(`/api/runs/${run.id}/git/prepare`, { method: 'POST', body: JSON.stringify({ mode }) });
    renderGitSelection(publication);
  } catch (error) { detail.querySelector('#message').innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`; }
}

async function decide(id, decision) {
  const selected = run.steps.find(step => step.id === id);
  const defaultCorrection = selected?.mode === 'PUBLISH_REVIEW' ? 'Intégrer le brouillon dans la source réelle du site, corriger les blockers du Publish Review, puis rejouer révisions, fact-check, QA et revue finale.' : 'Corriger les problèmes indiqués dans le livrable puis rejouer cette étape.';
  const note = decision === 'reject' ? prompt('Consigne de correction :', defaultCorrection) || defaultCorrection : '';
  try {
    run = await api(`/api/runs/${run.id}/steps/${id}/approval`, { method: 'POST', body: JSON.stringify({ decision, note }) });
    const next = run.steps.find(step => ['REVISION_REQUIRED', 'READY'].includes(step.status));
    render(next?.id || id);
  }
  catch (error) { detail.querySelector('#message').innerHTML = `<p class="notice error">${error.message}</p>`; }
}

document.querySelector('#new-run').addEventListener('click', () => {
  clearInterval(syncTimer);
  clearInterval(batchTimer);
  localStorage.removeItem('editorial-active-run');
  localStorage.removeItem('editorial-active-batch');
  activeBatch = undefined;
  renderBatch();
  run = undefined;
  selectedStepId = undefined;
  workspace.hidden = true;
  document.querySelector('#setup').hidden = false;
});

document.querySelector('#site-profile').addEventListener('change', event => {
  const site = sites[event.target.value];
  if (site) document.querySelector('[name="sitePath"]').value = site.localPath;
});

document.querySelector('#site-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const message = document.querySelector('#site-message');
  try {
    const candidate = await api('/api/sites/inspect', { method: 'POST', body: JSON.stringify({ source: values.source }) });
    const profile = await api('/api/sites/confirm', { method: 'POST', body: JSON.stringify({ ...candidate, language: values.language, topic: values.topic }) });
    message.innerHTML = `<p class="notice">Profil ${escapeHtml(profile.name)} validé. Stack détectée: ${escapeHtml(profile.stack)}.</p>`;
    await refreshSites();
    document.querySelector('#site-profile').value = profile.id;
    document.querySelector('#site-profile').dispatchEvent(new Event('change'));
  } catch (error) { message.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`; }
});

document.querySelector('#run-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.currentTarget));
  const urls = input.target.split(/\n+/).map(value => value.trim()).filter(Boolean);
  try {
    if (input.executionMode === 'automatic') {
      activeBatch = await api('/api/batches', { method: 'POST', body: JSON.stringify({ ...input, target: undefined, urls }) });
      localStorage.setItem('editorial-active-batch', activeBatch.id);
      run = await api(`/api/runs/${activeBatch.runs[0].id}`);
      renderBatch();
      startBatchSync();
    } else {
      if (urls.length !== 1) throw new Error('Le mode manuel accepte une URL à la fois. Utilisez le mode automatique pour un lot.');
      run = await api('/api/runs', { method: 'POST', body: JSON.stringify({ ...input, target: urls[0] }) });
    }
    localStorage.setItem('editorial-active-run', run.id);
    document.querySelector('#setup').hidden = true;
    render();
  } catch (error) { alert(error.message); }
});

await refreshSites();
await refreshHealth();
await restoreRun();
