// Explicit local-only backend for fixtures; production Vercel never silently falls back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NODE_ENV = 'test';
if (!process.env.COTYPHU_TEST_SCRATCH) {
  const parent = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent, 'cotyphu-tests-'));
  process.env.COTYPHU_TEST_SCRATCH = dir;
  process.env.TEMP = dir; process.env.TMP = dir; process.env.TMPDIR = dir;
  process.once('exit', () => {
    if (path.dirname(path.resolve(dir)) === parent && path.basename(dir).startsWith('cotyphu-tests-')) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* A test child may still hold a Windows file handle. */ }
    }
  });
}
