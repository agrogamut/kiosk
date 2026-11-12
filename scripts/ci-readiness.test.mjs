import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const command = workflow.match(/if ! curl ([\s\S]*?)http:\/\/127\.0\.0\.1:19000\/minio\/health\/ready; then/);
assert.ok(command, 'MinIO readiness command must be exercised');
const options = command[1].replace(/\\\s*\n/g, ' ').trim().split(/\s+/);

async function probe(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const child = spawn('curl', [...options, 'http://127.0.0.1:' + server.address().port + '/minio/health/ready']);
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.resume();
  const timeout = setTimeout(() => child.kill('SIGKILL'), 65_000);
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  clearTimeout(timeout);
  return { code, stderr };
}

test('readiness recovers after the first connection resets', { timeout: 10_000 }, async t => {
  let requests = 0;
  const result = await probe(t, (_req, res) => {
    if (++requests === 1) res.socket.resetAndDestroy();
    else res.end('ready');
  });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(requests >= 2, 'a real failed request must be retried');
});

test('persistent unhealthy responses still fail within the readiness deadline', { timeout: 70_000 }, async t => {
  let requests = 0;
  const started = Date.now();
  const result = await probe(t, (_req, res) => {
    requests++;
    res.writeHead(503).end('not ready');
  });
  assert.equal(result.code, 22, result.stderr);
  assert.ok(requests > 1, 'unhealthy responses must be retried');
  assert.ok(Date.now() - started < 65_000, 'health failure must stay bounded');
});
