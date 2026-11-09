// Isolate ready() control flow with an injected SUBSCRIBE failure; no real Redis or game code is modified.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { RedisRoomStore } from '../../server/redisRoomStore.js';
const store = new RedisRoomStore({endpoint:'redis://127.0.0.1:16391'});
const transport = () => ({isOpen:false,isReady:false,async connect(){this.isOpen=true;this.isReady=true;},async quit(){this.isOpen=false;this.isReady=false;}});
store.client = transport(); store.subscriber = transport();
let subscriptionAttempted = false;
store.subscriber.subscribe = async () => {subscriptionAttempted=true;throw new Error('Injected SUBSCRIBE failure');};
let readyResolves = false;
try {await store.ready();readyResolves=true;} finally {await store.close();}
const result = {checkedAt:new Date().toISOString(),mode:'fault injection with in-memory transport doubles',subscriptionAttempted,subscriptionSucceeded:false,readyResolves};
assert.equal(subscriptionAttempted,true);assert.equal(readyResolves,true);
await fs.writeFile(new URL('./subscription-failure-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
