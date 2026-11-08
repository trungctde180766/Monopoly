// Independent process probe: no shared Map/EventEmitter is injected from the parent.
process.env.VERCEL = '1';
const { ExternalRoomStore, defaultRoomStore } = await import('../../server/roomStore.js');
const store = new ExternalRoomStore({ endpoint: 'redis://127.0.0.1:1' });
const mode = process.argv[2];
if (mode === 'write') store.set('EXTV13', { code: 'EXTV13', status: 'waiting', players: [] });
process.send({ mode, hasRoom: store.has('EXTV13'), defaultStoreClass: defaultRoomStore.constructor.name, storageClass: store.storage.constructor.name });
store.close(); defaultRoomStore.close(); process.disconnect();
