// Scheduling fixture: pause at set(), after the production atomicUpdate acquired/checks its lock.
import fs from 'node:fs';
import path from 'node:path';
import { SharedRoomStore } from '../../server/roomStore.js';
import { reduceGameAction } from '../../src/logic/gameSession.js';
const [dir, code, release] = process.argv.slice(2);
const store = new SharedRoomStore({ dir }), persist = store.set.bind(store);
store.set = (key, room) => {
  process.send({ stage: 'locked-before-write', lockExists: fs.existsSync(path.join(dir, code + '.lock')) });
  const sleeper = new Int32Array(new SharedArrayBuffer(4)), deadline = Date.now() + 5000;
  while (!fs.existsSync(release)) {
    if (Date.now() > deadline) throw new Error('Review barrier timeout');
    Atomics.wait(sleeper, 0, 0, 5);
  }
  return persist(key, room);
};
try {
  const room = store.atomicUpdate(code, r => {
    r.gameState = reduceGameAction(r.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 });
    return r;
  }, 0);
  process.send({ stage: 'result', success: true, revision: room.gameState.revision });
} catch (error) { process.send({ stage: 'result', success: false, message: error.message, conflict: !!error.conflict }); }
store.close(); process.disconnect();
