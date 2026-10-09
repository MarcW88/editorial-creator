import test from 'node:test';
import assert from 'node:assert/strict';
import { isCodexLimitError } from '../src/codex-executor.mjs';

test('reconnaît les limites Codex sans confondre une erreur générale', () => {
  assert.equal(isCodexLimitError('HTTP 429 Too Many Requests'), true);
  assert.equal(isCodexLimitError('usage limit reached for this period'), true);
  assert.equal(isCodexLimitError('quota exceeded'), true);
  assert.equal(isCodexLimitError('file not found'), false);
});
