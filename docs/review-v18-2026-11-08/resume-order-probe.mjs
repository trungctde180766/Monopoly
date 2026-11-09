import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=(await fs.readFile(new URL('../../src/hooks/useGameController.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function useGameController','function useGameController').replaceAll('import.meta.env','({})');
const events={},callbacks={},effects=[],states=[];
let saved=JSON.stringify({roomCode:'ROOM99',resumeToken:'disposable-test-token'});
const socket={id:'replacement-socket',connected:true,active:true,on(e,h){events[e]=h;},timeout(){return{emit(e,p,cb){callbacks[e]=cb;}};},emit(){},disconnect(){}};
const context={useState(value){const i=states.length;states.push(value);return[value,next=>{states[i]=typeof next==='function'?next(states[i]):next;}];},useRef(value){return{current:value};},useEffect(fn){effects.push(fn);},io:()=>socket,sessionStorage:{getItem(){return saved;},setItem(k,v){saved=v;},removeItem(){saved=null;}},setTimeout,clearTimeout,Date,Math,structuredClone};
vm.runInNewContext(code+'\nuseGameController();',context);
const cleanup=effects[0]();events.connect();
const game={players:[{id:'original-player',position:0},{id:'other',position:0}],startedAt:1,revision:0};
const room={code:'ROOM99',status:'playing',gameState:game};
// Server resume_room awaits changed()/broadcast before returning its acknowledgement.
events.room_updated(room);
callbacks.resume_room(null,{success:true,playerId:'original-player',room,gameState:game});
const result={checkedAt:new Date().toISOString(),mode:'actual hook body with controlled dependencies',eventOrder:['connect','room_updated','resume ACK'],screen:states[0],expectedPlayerId:'original-player',actualPlayerId:states[4],identityRecovered:states[4]==='original-player'};
assert.equal(result.screen,'playing');assert.equal(result.identityRecovered,false);
cleanup();
process.env.VERCEL='1';
const {once}=await import('node:events');
const {io}=await import('socket.io-client');
const {MemoryRoomStore}=await import('../../server/roomStore.js');
const {createServerApp}=await import('../../server/index.js');
const service=createServerApp({roomStore:new MemoryRoomStore()}),sockets=[];
const ack=(s,e,p={})=>new Promise((resolve,reject)=>s.timeout(2500).emit(e,p,(error,value)=>error?reject(error):resolve(value)));
try{
  service.httpServer.listen(0,'127.0.0.1');await once(service.httpServer,'listening');
  const connect=async()=>{const s=io('http://127.0.0.1:'+service.httpServer.address().port,{transports:['websocket'],reconnection:false});sockets.push(s);await once(s,'connect');return s;};
  const host=await connect(),guest=await connect();
  const created=await ack(host,'create_room');await ack(guest,'join_room',{roomCode:created.roomCode});await ack(guest,'toggle_ready');await ack(host,'start_game');
  const replacement=await connect(),order=[];
  replacement.on('room_updated',()=>order.push('room_updated'));
  const resumed=await ack(replacement,'resume_room',{roomCode:created.roomCode,resumeToken:created.resumeToken});order.push('resume ACK');
  result.realSocket={order,resumeSuccess:resumed.success,stablePlayerIdReturned:resumed.playerId===created.playerId};
  assert.equal(order[0],'room_updated');assert.equal(resumed.success,true);
}finally{for(const s of sockets)s.disconnect();await new Promise(resolve=>service.io.close(resolve));}
await fs.writeFile(new URL('./resume-order-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
