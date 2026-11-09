import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createClient } from 'redis';
import { RedisRoomStore } from '../../server/redisRoomStore.js';
const endpoint = 'redis://127.0.0.1:16391';
const control = createClient({url:endpoint, socket:{reconnectStrategy:false}});
const store = new RedisRoomStore({endpoint});
const result = {checkedAt:new Date().toISOString(), requestedEndpoint:endpoint, storedEndpointType:typeof store.endpoint, clientOptionUrl:store.client.options.url ?? null};
control.on('error',()=>{});
store.client.on('error',error=>{result.connectionErrors=(error.errors||[error]).map(e=>({code:e.code,address:e.address,port:e.port}));});
try {
  await control.connect(); result.controlPing=await control.ping();
  try {await store.ready(); result.storeReady=true;} catch(error) {result.storeReady=false; result.storeError=error.message;}
  assert.equal(result.controlPing,'PONG'); assert.equal(result.storedEndpointType,'undefined'); assert.equal(result.storeReady,false);
} finally {await store.close();if(control.isOpen) await control.quit();}
await fs.writeFile(new URL('./redis-endpoint-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
