import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(join(root, 'config', 'workflows.json'), 'utf8'));

export function detectSection(target) {
  const pathname = new URL(target, 'https://editorial.local').pathname;
  const route = config.routes.find(candidate => candidate.prefixes?.some(prefix => pathname.startsWith(prefix)) || candidate.exact?.includes(pathname));
  if (!route) throw new Error(`Aucun workflow enregistré pour ${pathname}`);
  return route;
}

export function selectRoute(input) {
  if (input.contentType && input.contentType !== 'auto') {
    const explicit = config.routes.find(route => route.section === input.contentType);
    if (!explicit) throw new Error(`Type éditorial inconnu: ${input.contentType}`);
    return explicit;
  }
  try { return detectSection(input.target); }
  catch (error) {
    if (input.operation === 'create') return config.routes.find(route => route.section === 'guide');
    throw new Error(`${error.message}. Sélectionnez explicitement le type éditorial pour cette architecture de site.`);
  }
}

export function buildWorkflow(input) {
  const route = selectRoute(input);
  const skills = config.sectionSkills[route.section];
  const existing = input.operation !== 'create';
  const steps = [];
  if (existing && route.analysis) steps.push({ id: 'audit', label: 'Analyse et décision', skills: [route.analysis, ...skills.intent], mode: 'AUDIT', artifact: 'audit.json', humanApproval: true });
  steps.push(
    { id: 'intent', label: 'Intention et périmètre', skills: skills.intent, artifact: 'intent.json', humanApproval: true },
    { id: 'evidence', label: 'Recherche et preuves', skills: skills.evidence, artifact: 'evidence.json', humanApproval: true },
    { id: 'brief', label: 'Brief éditorial', skills: [route.content, ...skills.brief], artifact: 'brief.json', humanApproval: true },
    { id: 'writing', label: 'Rédaction ou correction', skills: [route.content, ...skills.writing], artifact: 'draft.json', humanApproval: true },
    { id: 'editorial', label: 'Révisions spécialisées', skills: skills.editorial, artifact: 'editorial-review.json', humanApproval: true },
    { id: 'fact-check-final', label: 'Fact-check après révisions', skills: ['fact-check'], artifact: 'claims-review.json', humanApproval: true },
    { id: 'quality', label: 'SEO et QA', skills: skills.quality, artifact: 'quality-report.json', humanApproval: true }
  );
  if (route.analysis) steps.push({ id: 'publish-review', label: 'Publish Review', skills: [route.analysis], mode: 'PUBLISH_REVIEW', artifact: 'publish-review.json', allowedVerdicts: ['PASS — READY_FOR_HUMAN_VALIDATION', 'FAIL — KEEP_NOINDEX'], humanApproval: true });
  else steps.push({ id: 'final-review', label: 'Revue finale', skills: [route.content, ...skills.quality], artifact: 'final-review.json', humanApproval: true });
  return { id: `${route.section}-${input.operation}`, version: 1, section: route.section, route, steps };
}

export function listRoutes() {
  return config.routes;
}
