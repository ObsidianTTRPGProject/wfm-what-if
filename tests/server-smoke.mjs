import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 18000 + process.pid % 10000;
const child = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stderr = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', chunk => stderr += chunk);

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start: ${stderr}`)), 5000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (chunk.includes(`127.0.0.1:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`server exited early with ${code}: ${stderr}`));
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(body, /<div id="root"><\/div>/, 'server must return the application shell');
  console.log('local server smoke check passed');
} finally {
  child.kill();
}
