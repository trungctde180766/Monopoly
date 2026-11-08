import { RedisRoomStore } from '../../server/redisRoomStore.js';
import { reduceGameAction } from '../../src/logic/gameSession.js';
const [endpoint, prefix, tile] = process.argv.slice(2);
const store = new RedisRoomStore({ endpoint, prefix });
try {
  const room = await store.atomicUpdate('RACE', async r => {
    const release = new Promise(resolve => process.once('message', resolve));
    process.send({ stage: 'ready' });
    await release;
    r.gameState = reduceGameAction(r.gameState, 'a', { type: 'mortgage', tileId: Number(tile), revision: 0 });
    return r;
  }, 0);
  process.send({ stage: 'result', success: true, revision: room.gameState.revision });
} catch (error) { process.send({ stage: 'result', success: false, conflict: !!error.conflict, message: error.message }); }
await store.close(); process.disconnect();
