import { syncSkills, verifyRegistry } from './skill-registry.mjs';
import { doctor } from './codex-executor.mjs';

const command = process.argv[2];
const result = command === 'sync' ? await syncSkills() : command === 'doctor' ? await doctor() : await verifyRegistry();
console.log(JSON.stringify(result, null, 2));
