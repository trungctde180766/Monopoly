// Review fixture: force two real processes past the same revision check before either writes.
import fs from 'node:fs';
import path from 'node:path';
import { SharedRoomStore } from '../../server/roomStore.js';
import { reduceGameAction } from '../../src/logic/gameSession.js';
const [dir, code, tile, release] = process.argv.slice(2);
const store = new SharedRoomStore({ dir });
const sleeper = new Int32Array(new SharedArrayBuffer(4));
try {
  const updated = store.atomicUpdate(code, room => {
    process.send({ stage: 'read', revision: room.gameState.revision });
    const deadline = Date.now() + 6000;
    while (!fs.existsSync(release)) {
      if (Date.now() > deadline) throw new Error('Review barrier timeout');
      Atomics.wait(sleeper, 0, 0, 5);
    }
    room.gameState = reduceGameAction(room.gameState, 'a', { type: 'mortgage', tileId: Number(tile), revision: 0 });
    return room;
  }, 0);
  process.send({ stage: 'result', success: true, revision: updated.gameState.revision });
} catch (error) {
  process.send({ stage: 'result', success: false, conflict: !!error.conflict, message: error.message });
} finally {
  store.close();
  process.disconnect();
}
