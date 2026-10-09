import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSection, selectRoute, buildWorkflow } from '../src/workflow-router.mjs';

test('route chaque section vers ses workflows originaux', () => {
  assert.equal(detectSection('/guides/test/').analysis, 'guide-analysis-workflow');
  assert.equal(detectSection('/comparatifs/test/').content, 'comparison-content-workflow');
  assert.equal(detectSection('/marques/test/').analysis, 'brand-analysis-workflow');
  assert.equal(detectSection('/usages/test/').content, 'usage-content-workflow');
  assert.equal(detectSection('/bons-plans/test/').analysis, 'deal-analysis-workflow');
  assert.equal(detectSection('/a-propos/').content, 'trust-content-workflow');
});

test('une page existante commence par un audit et finit par le publish review', () => {
  const workflow = buildWorkflow({ target: '/comparatifs/test/', operation: 'audit-update' });
  assert.equal(workflow.steps[0].mode, 'AUDIT');
  assert.equal(workflow.steps.at(-1).mode, 'PUBLISH_REVIEW');
});

test('une création ne fabrique pas un audit préalable', () => {
  const workflow = buildWorkflow({ target: '/usages/test/', operation: 'create' });
  assert.notEqual(workflow.steps[0].id, 'audit');
  assert.ok(workflow.steps.some(step => step.skills.includes('usage-content-workflow')));
});

test('une section inconnue est refusée par la détection seule', () => {
  assert.throws(() => detectSection('/inconnue/test/'), /Aucun workflow/);
});

test('un site arbitraire peut sélectionner explicitement un workflow existant', () => {
  const route = selectRoute({ target: 'https://biologische-hondensnacks.nl/eiwit/kip/', operation: 'create', contentType: 'guide' });
  assert.equal(route.content, 'guide-content-workflow');
  const workflow = buildWorkflow({ target: 'https://biologische-hondensnacks.nl/eiwit/kip/', operation: 'create', contentType: 'guide' });
  assert.ok(workflow.steps.some(step => step.skills.includes('guide-content-workflow')));
});

test('une création inconnue utilise Guide par défaut mais un audit exige un choix', () => {
  assert.equal(selectRoute({ target: '/eiwit/kip/', operation: 'create', contentType: 'auto' }).section, 'guide');
  assert.throws(() => selectRoute({ target: '/eiwit/kip/', operation: 'audit-update', contentType: 'auto' }), /Sélectionnez explicitement/);
});
