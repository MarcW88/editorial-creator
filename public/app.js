let run;
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
    health.textContent = value.codexInstalled && value.chatGptAuthenticated && value.registry.valid
      ? `Prêt · ${value.registry.skillCount} skills · ${value.openAiApiConfigured ? 'API disponible' : 'API non configurée'} · ${value.registry.commit.slice(0, 7)}`
      : 'Configuration incomplète';
  } catch { health.textContent = 'Diagnostic indisponible'; }
}

function render(selectedId) {
  workspace.hidden = false;
  const selected = run.steps.find(step => step.id === selectedId) || run.steps.find(step => step.status !== 'LOCKED') || run.steps[0];
  stepsNode.innerHTML = run.steps.map((step, index) => `<li class="${step.id === selected.id ? 'active' : ''} ${step.status}" data-id="${step.id}"><span>${index + 1}</span><span>${step.label}<br><small>${step.status}</small></span></li>`).join('');
  stepsNode.querySelectorAll('li').forEach(node => node.addEventListener('click', () => render(node.dataset.id)));
  const last = selected.attempts.at(-1);
  detail.innerHTML = `<p class="section-number">Étape contrôlée</p><h2>${selected.label}</h2><p class="status">${selected.status}</p><p>Skills originaux exigés :</p><ul class="skill-list">${selected.skills.map(skill => `<li>${skill}</li>`).join('')}</ul>${last ? `<p class="notice">Artefact : ${last.outputPath}<br>Commit : ${last.skillCommit}<br>Profil : ${last.siteProfile || '—'}<br>Exécuteur : ${last.provider === 'openai-api' ? 'API OpenAI' : 'Abonnement ChatGPT'}<br>Conflits contextuels : ${last.contextConflicts?.length || 0}<br>Statut technique : ${last.status}${last.startedAt ? `<br>Temps écoulé : <span id="elapsed">${elapsed(last.startedAt)}</span>` : ''}${last.error ? `<br>${escapeHtml(last.error)}` : ''}</p>` : ''}${selected.status === 'RUNNING' ? '<p class="notice">Exécution en cours. Cette page se rafraîchit automatiquement.</p>' : ''}<div id="artifact"></div><div id="message"></div><div class="actions">${last?.status === 'COMPLETED' ? '<button id="view-artifact" class="secondary">Consulter le livrable</button>' : ''}${['READY','REVISION_REQUIRED'].includes(selected.status) ? '<button id="execute">Exécuter avec Codex</button>' : ''}${selected.status === 'LIMIT_REACHED' ? '<button id="resume-openai">Reprendre avec l’API OpenAI</button>' : ''}${selected.status === 'AWAITING_APPROVAL' ? '<button id="approve">Valider et continuer</button><button id="reject" class="reject">Demander une correction</button>' : ''}${run.status === 'HUMAN_APPROVED' ? '<button id="prepare-branch">Préparer branche + pull request</button><button id="prepare-main" class="reject">Préparer push direct main</button>' : ''}</div>`;
  detail.querySelector('#view-artifact')?.addEventListener('click', () => viewArtifact(selected.id));
  detail.querySelector('#execute')?.addEventListener('click', () => execute(selected.id, 'chatgpt'));
  detail.querySelector('#resume-openai')?.addEventListener('click', () => execute(selected.id, 'openai-api'));
  detail.querySelector('#approve')?.addEventListener('click', () => decide(selected.id, 'approve'));
  detail.querySelector('#reject')?.addEventListener('click', () => decide(selected.id, 'reject'));
  detail.querySelector('#prepare-branch')?.addEventListener('click', () => prepareGit('branch'));
  detail.querySelector('#prepare-main')?.addEventListener('click', () => prepareGit('main'));
}

async function viewArtifact(id) {
  try {
    const artifact = await api(`/api/runs/${run.id}/steps/${id}/artifact`);
    detail.querySelector('#artifact').innerHTML = `<h3>Livrable</h3><p>${escapeHtml(artifact.summary)}</p><pre>${escapeHtml(artifact.content)}</pre>`;
  } catch (error) { detail.querySelector('#message').innerHTML = `<p class="notice error">${error.message}</p>`; }
}

async function execute(id, provider) {
  if (provider === 'openai-api' && !confirm('Cette reprise utilise l’API OpenAI facturée séparément. Continuer ?')) return;
  const endpoint = provider === 'openai-api' ? 'execute-openai' : 'execute';
  const request = api(`/api/runs/${run.id}/steps/${id}/${endpoint}`, { method: 'POST' });
  const poll = setInterval(async () => {
    try {
      run = await api(`/api/runs/${run.id}`);
      render(id);
    } catch {}
  }, 2000);
  try {
    run = await request;
    render(id);
  } catch (error) {
    const message = detail.querySelector('#message');
    if (message) message.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
  } finally { clearInterval(poll); }
}

async function prepareGit(mode) {
  try {
    const publication = await api(`/api/runs/${run.id}/git/prepare`, { method: 'POST', body: JSON.stringify({ mode }) });
    const confirmation = prompt(`Fichiers concernés:\n${publication.files.join('\n')}\n\nTapez ${mode === 'main' ? 'PUSH_MAIN' : 'PUSH_BRANCH'} pour confirmer.`);
    if (!confirmation) return;
    const result = await api(`/api/runs/${run.id}/git/execute`, { method: 'POST', body: JSON.stringify({ confirmation }) });
    detail.querySelector('#message').innerHTML = `<p class="notice">Push terminé: ${escapeHtml(result.commit)}<br>${escapeHtml(result.pullRequest?.url || result.pullRequest?.instruction || 'main mis à jour')}</p>`;
  } catch (error) { detail.querySelector('#message').innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`; }
}

async function decide(id, decision) {
  const note = decision === 'reject' ? prompt('Correction demandée :') || '' : '';
  try { run = await api(`/api/runs/${run.id}/steps/${id}/approval`, { method: 'POST', body: JSON.stringify({ decision, note }) }); render(id); }
  catch (error) { detail.querySelector('#message').innerHTML = `<p class="notice error">${error.message}</p>`; }
}

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
  try { run = await api('/api/runs', { method: 'POST', body: JSON.stringify(input) }); document.querySelector('#setup').hidden = true; render(); }
  catch (error) { alert(error.message); }
});

await refreshSites();
refreshHealth();
