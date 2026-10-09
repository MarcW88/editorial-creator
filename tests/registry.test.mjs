import test from 'node:test';
import assert from 'node:assert/strict';
import { readLock, syncSkills, verifyRegistry, buildSkillBundle } from '../src/skill-registry.mjs';

test('le verrou référence un commit Git complet et les orchestrateurs Guide', async () => {
  const lock = await readLock();
  assert.match(lock.commit, /^[a-f0-9]{40}$/);
  assert.ok(lock.required.includes('guide-analysis-workflow'));
  assert.ok(lock.required.includes('guide-content-workflow'));
});

test('la synchronisation conserve les skills complets et vérifie leur intégrité', async () => {
  await syncSkills();
  const result = await verifyRegistry();
  assert.equal(result.valid, true);
  const [workflow] = await buildSkillBundle(['guide-content-workflow']);
  assert.ok(workflow.files['SKILL.md'].includes('# Guide Content Workflow'));
  assert.ok(Object.keys(workflow.files).some(file => file.startsWith('references/')));
});
