import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'cotyphu-v28-empty-'));
const setup=new URL('../../test/setup.mjs',import.meta.url).href;
const file=fileURLToPath(new URL('../../test/buildAndSession.test.js',import.meta.url));
const results={checkedAt:new Date().toISOString(),mode:'isolated empty working directory; workspace dist unchanged'};
try{
 for(const required of [false,true]){
  const env={...process.env};if(required)env.REQUIRE_PRODUCTION_BUILD='1';else delete env.REQUIRE_PRODUCTION_BUILD;
  const result=spawnSync(process.execPath,['--import',setup,'--test','--test-name-pattern=Production bundle',file],{cwd,env,encoding:'utf8',timeout:20000});
  fs.writeFileSync(new URL(required?'./required-build-missing.txt':'./optional-build-missing.txt',import.meta.url),result.stdout+result.stderr);
  results[required?'required':'optional']={exitCode:result.status,skipReported:/# skipped 1/.test(result.stdout),missingBuildReported:/dist\/assets directory is missing/.test(result.stdout)};
  assert.equal(result.status,required?1:0);
 }
}finally{fs.rmdirSync(cwd);}
fs.writeFileSync(new URL('./missing-build-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
