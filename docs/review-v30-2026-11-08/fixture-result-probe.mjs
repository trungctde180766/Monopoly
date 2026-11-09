import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await fs.readFile(new URL('../../test/browserVerificationV27.js',import.meta.url),'utf8');
const marker=source.indexOf('const devFixtureResult = await evalInPage');
const start=source.indexOf('`',marker)+1,end=source.indexOf('`);',start);
assert.ok(marker>=0&&start>0&&end>start);
let starts=0;
const controller={startLocal(){starts++;}}; // Deliberately missing injectVisualShowcaseState.
const context={window:{__CONTROLLER__:controller},document:{querySelectorAll(){return[];}},setTimeout(callback){callback();return 1;}};
const result=await vm.runInNewContext('('+source.slice(start,end)+')()',context);
assert.equal(result.success,false);
const output={checkedAt:new Date().toISOString(),mode:'actual fixture callback with controlled fake controller/DOM; no browser launch',injectFunctionPresent:false,gameStatePresent:false,startCalls:starts,reportedResult:result};
await fs.writeFile(new URL('./fixture-result.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
