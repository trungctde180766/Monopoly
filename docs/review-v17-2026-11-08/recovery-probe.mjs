import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { MemoryRoomStore } from '../../server/roomStore.js';
process.env.VERCEL='1';
const {createServerApp}=await import('../../server/index.js');
const result={checkedAt:new Date().toISOString()};
const store=new MemoryRoomStore();
let available=false;
store.ready=async()=>{if(!available)throw new Error('Temporary store outage');};
const service=createServerApp({roomStore:store});
let socket;
try{
  service.httpServer.listen(0,'127.0.0.1');await once(service.httpServer,'listening');
  socket=io('http://127.0.0.1:'+service.httpServer.address().port,{transports:['websocket'],reconnectionDelay:1000,reconnectionDelayMax:5000});
  const [error]=await once(socket,'connect_error');
  result.middlewareRecovery={firstError:error.message,activeAfterRejection:socket.active};
  available=true;
  await new Promise(resolve=>setTimeout(resolve,1800));
  result.middlewareRecovery.connectedAfterStoreRestored=socket.connected;
  const connected=once(socket,'connect');socket.connect();await connected;
  result.middlewareRecovery.connectedAfterExplicitConnect=socket.connected;
  assert.equal(result.middlewareRecovery.activeAfterRejection,false);
  assert.equal(result.middlewareRecovery.connectedAfterStoreRestored,false);
  assert.equal(result.middlewareRecovery.connectedAfterExplicitConnect,true);
}finally{socket?.disconnect();await new Promise(resolve=>service.io.close(resolve));}

// Execute the actual hook body with controlled React/socket/storage doubles.
// Imports alone are removed; behavior under review is not reimplemented.
const code=(await fs.readFile(new URL('../../src/hooks/useGameController.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'')
  .replace('export function useGameController','function useGameController')
  .replaceAll('import.meta.env','({})');
const effects=[],events={},callbacks={},states=[];
let saved=JSON.stringify({roomCode:'TEST',resumeToken:'disposable-test-token'});
const fakeSocket={id:'replacement-socket',connected:true,on(event,handler){events[event]=handler;},timeout(){return{emit(event,payload,callback){callbacks[event]=callback;}};},disconnect(){},emit(){}};
const context={useState(initial){const i=states.length;states.push(initial);return[initial,value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(value){return{current:value};},useEffect(fn){effects.push(fn);},io:()=>fakeSocket,
  sessionStorage:{getItem(){return saved;},setItem(key,value){saved=value;},removeItem(){saved=null;}},setTimeout,clearTimeout,Date,Math,structuredClone};
vm.runInNewContext(code+'\nuseGameController();',context);
effects[0]();events.connect();
assert.equal(typeof callbacks.resume_room,'function');
callbacks.resume_room(new Error('Injected acknowledgement timeout'));
result.resumeTimeout={mode:'actual hook body with controlled hooks/socket/storage',tokenPresentBefore:true,tokenPresentAfter:!!saved,screenAfter:states[0],errorAfter:states[8]};
assert.equal(result.resumeTimeout.tokenPresentAfter,false);
await fs.writeFile(new URL('./recovery-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
