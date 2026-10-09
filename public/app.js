let run;
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
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

async function refreshHealth() {
  try {
    const value = await api('/api/health');
    health.textContent = value.codexInstalled && value.chatGptAuthenticated && value.registry.valid
      ? `Prêt · ${value.registry.skillCount} skills · ${value.registry.commit.slice(0, 7)}`
      : 'Configuration incomplète';
  } catch { health.textContent = 'Diagnostic indisponible'; }
}

function render(selectedId) {
  workspace.hidden = false;
  const selected = run.steps.find(step => step.id === selectedId) || run.steps.find(step => step.status !== 'LOCKED') || run.steps[0];
  stepsNode.innerHTML = run.steps.map((step, index) => `<li class="${step.id === selected.id ? 'active' : ''} ${step.status}" data-id="${step.id}"><span>${index + 1}</span><span>${step.label}<br><small>${step.status}</small></span></li>`).join('');
  stepsNode.querySelectorAll('li').forEach(node => node.addEventListener('click', () => render(node.dataset.id)));
  const last = selected.attempts.at(-1);
  detail.innerHTML = `<p class="section-number">Étape contrôlée</p><h2>${selected.label}</h2><p class="status">${selected.status}</p><p>Skills originaux exigés :</p><ul class="skill-list">${selected.skills.map(skill => `<li>${skill}</li>`).join('')}</ul>${last ? `<p class="notice">Artefact : ${last.outputPath}<br>Commit : ${last.skillCommit}<br>Profil : ${last.siteProfile || '—'}<br>Conflits contextuels : ${last.contextConflicts?.length || 0}<br>Statut technique : ${last.status}</p>` : ''}<div id="artifact"></div><div id="message"></div><div class="actions">${last?.status === 'COMPLETED' ? '<button id="view-artifact" class="secondary">Consulter le livrable</button>' : ''}${['READY','REVISION_REQUIRED'].includes(selected.status) ? '<button id="execute">Exécuter avec Codex</button>' : ''}${selected.status === 'AWAITING_APPROVAL' ? '<button id="approve">Valider et continuer</button><button id="reject" class="reject">Demander une correction</button>' : ''}</div>`;
  detail.querySelector('#view-artifact')?.addEventListener('click', () => viewArtifact(selected.id));
  detail.querySelector('#execute')?.addEventListener('click', () => execute(selected.id));
  detail.querySelector('#approve')?.addEventListener('click', () => decide(selected.id, 'approve'));
  detail.querySelector('#reject')?.addEventListener('click', () => decide(selected.id, 'reject'));
}

async function viewArtifact(id) {
  try {
    const artifact = await api(`/api/runs/${run.id}/steps/${id}/artifact`);
    detail.querySelector('#artifact').innerHTML = `<h3>Livrable</h3><p>${escapeHtml(artifact.summary)}</p><pre>${escapeHtml(artifact.content)}</pre>`;
  } catch (error) { detail.querySelector('#message').innerHTML = `<p class="notice error">${error.message}</p>`; }
}

async function execute(id) {
  const message = detail.querySelector('#message');
  message.innerHTML = '<p class="notice">Codex exécute cette étape. Les étapes suivantes restent verrouillées.</p>';
  try { run = await api(`/api/runs/${run.id}/steps/${id}/execute`, { method: 'POST' }); render(id); }
  catch (error) { message.innerHTML = `<p class="notice error">${error.message}</p>`; }
}

async function decide(id, decision) {
  const note = decision === 'reject' ? prompt('Correction demandée :') || '' : '';
  try { run = await api(`/api/runs/${run.id}/steps/${id}/approval`, { method: 'POST', body: JSON.stringify({ decision, note }) }); render(id); }
  catch (error) { detail.querySelector('#message').innerHTML = `<p class="notice error">${error.message}</p>`; }
}

document.querySelector('#run-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.currentTarget));
  try { run = await api('/api/runs', { method: 'POST', body: JSON.stringify(input) }); document.querySelector('#setup').hidden = true; render(); }
  catch (error) { alert(error.message); }
});

refreshHealth();
