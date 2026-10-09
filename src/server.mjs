import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRun, getRun, approveStep } from './run-store.mjs';
import { executeStep, doctor } from './codex-executor.mjs';
import { syncSkills } from './skill-registry.mjs';
import { listRoutes } from './workflow-router.mjs';
import { inspectSiteSource, confirmSite, listOnboardedSites } from './onboarding.mjs';
import { prepareGitPublication, executeGitPublication } from './git-publisher.mjs';

const root = resolve(import.meta.dirname, '..');
const publicRoot = join(root, 'public');
const port = Number(process.env.PORT || 4310);
const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
};
const body = request => new Promise((resolveBody, reject) => {
  let value = '';
  request.on('data', chunk => {
    value += chunk;
    if (value.length > 1_000_000) request.destroy();
  });
  request.on('end', () => {
    try { resolveBody(value ? JSON.parse(value) : {}); } catch (error) { reject(error); }
  });
  request.on('error', reject);
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === '/api/health') return json(response, 200, await doctor());
    if (url.pathname === '/api/workflows') return json(response, 200, listRoutes());
    if (url.pathname === '/api/sites' && request.method === 'GET') return json(response, 200, await listOnboardedSites());
    if (url.pathname === '/api/sites/inspect' && request.method === 'POST') return json(response, 200, await inspectSiteSource((await body(request)).source));
    if (url.pathname === '/api/sites/confirm' && request.method === 'POST') return json(response, 201, await confirmSite(await body(request)));
    if (url.pathname === '/api/skills/sync' && request.method === 'POST') return json(response, 200, await syncSkills());
    if (url.pathname === '/api/runs' && request.method === 'POST') return json(response, 201, await createRun(await body(request)));
    const gitPrepareMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/git\/prepare$/);
    if (gitPrepareMatch && request.method === 'POST') return json(response, 200, await prepareGitPublication(gitPrepareMatch[1], (await body(request)).mode));
    const gitExecuteMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/git\/execute$/);
    if (gitExecuteMatch && request.method === 'POST') return json(response, 200, await executeGitPublication(gitExecuteMatch[1], (await body(request)).confirmation));
    const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (runMatch && request.method === 'GET') return json(response, 200, await getRun(runMatch[1]));
    const artifactMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/steps\/([^/]+)\/artifact$/);
    if (artifactMatch && request.method === 'GET') {
      const run = await getRun(artifactMatch[1]);
      const step = run.steps.find(candidate => candidate.id === artifactMatch[2]);
      const attempt = step?.attempts.at(-1);
      if (!attempt || attempt.status !== 'COMPLETED') return json(response, 404, { error: 'Artefact validé indisponible' });
      return json(response, 200, JSON.parse(await readFile(attempt.outputPath, 'utf8')));
    }
    const executeApiMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/steps\/([^/]+)\/execute-openai$/);
    if (executeApiMatch && request.method === 'POST') return json(response, 200, await executeStep(await getRun(executeApiMatch[1]), executeApiMatch[2], 'openai-api'));
    const executeMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/steps\/([^/]+)\/execute$/);
    if (executeMatch && request.method === 'POST') return json(response, 200, await executeStep(await getRun(executeMatch[1]), executeMatch[2], 'chatgpt'));
    const approveMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/steps\/([^/]+)\/approval$/);
    if (approveMatch && request.method === 'POST') {
      const input = await body(request);
      return json(response, 200, await approveStep(await getRun(approveMatch[1]), approveMatch[2], input.decision, input.note));
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (file.includes('..')) return json(response, 400, { error: 'Chemin invalide' });
    const content = await readFile(join(publicRoot, file));
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
    response.writeHead(200, { 'content-type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(content);
  } catch (error) {
    json(response, 500, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Editorial Creator: http://127.0.0.1:${port}`));
