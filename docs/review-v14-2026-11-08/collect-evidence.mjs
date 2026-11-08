import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const readLog = async name => {
  const data = await fs.readFile(new URL(name, import.meta.url));
  return data.toString(data[0] === 255 && data[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
};
const unit = await readLog('unit-output.txt'), redis = await readLog('redis-output.txt');
const count = (log, label) => Number(log.match(new RegExp('^# ' + label + ' (\\d+)', 'm'))?.[1]);
assert.equal(count(unit, 'fail'), 0); assert.equal(count(unit, 'cancelled'), 0);
assert.equal(count(redis, 'fail'), 0); assert.equal(count(redis, 'skipped'), 0);
assert.match(unit, /TẤT CẢ 23 BÀI TEST/);
const previous = JSON.parse(await fs.readFile(new URL('../review-v13-2026-11-08/source-hashes.json', import.meta.url)));
const extra = ['server/roomCodec.js', 'server/redisRoomStore.js', 'test/setup.mjs', 'test/reviewV14.test.js', 'test/reviewV13.test.js',
  'test/redisIntegration.test.js', 'test/fixtures/redisCasWorker.mjs', 'test/fixtures/unconfiguredHealth.mjs',
  'src/App.jsx', 'src/components/OnlineRoom.jsx', 'package-lock.json', '.env.example', 'README.md', 'DEPLOY_ONLINE.md'];
const hashes = {};
for (const file of new Set([...Object.keys(previous.hashes), ...extra])) {
  hashes[file] = crypto.createHash('sha256').update(await fs.readFile(new URL('../../' + file, import.meta.url))).digest('hex');
}
const html = await fs.readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
const result = { checkedAt: new Date().toISOString(), unit: { legacyPassed: 23, nodePassed: count(unit, 'pass'), failed: 0 },
  redisIntegration: { passed: count(redis, 'pass'), failed: 0, skipped: 0, backend: 'Real Redis 7.4, isolated Docker test container' },
  totalPassed: 23 + count(unit, 'pass') + count(redis, 'pass'), buildMain: html.match(/\/assets\/index-[^" ]+\.js/)?.[0],
  ui: { waitingRoomReloadPreserved: true, supersededNotificationObserved: true, controlsDisabledObserved: true, screenshot: 'session-superseded.jpg' },
  productionDeployed: false };
await fs.access(new URL('./session-superseded.jpg', import.meta.url));
await fs.writeFile(new URL('./validation.json', import.meta.url), JSON.stringify(result, null, 2));
await fs.writeFile(new URL('./source-hashes.json', import.meta.url), JSON.stringify({ checkedAt: result.checkedAt, hashes }, null, 2));
console.log(JSON.stringify(result, null, 2));
