export function serializeRoom(room) {
  if (!room) return null;
  return {
    code: room.code, hostId: room.hostId, status: room.status, customRules: room.customRules,
    players: room.players, gameState: room.gameState,
    connections: [...(room.connections || [])], resumeTokens: [...(room.resumeTokens || [])],
    pendingOffers: [...(room.pendingOffers || [])], processedRequests: [...(room.processedRequests || [])],
    activeSessions: [...(room.activeSessions || [])], version: room.version || 0, updatedAt: room.updatedAt || 0,
  };
}

export function deserializeRoom(raw, existingRoom) {
  if (!raw) return null;
  return {
    ...raw, players: raw.players || [], gameState: raw.gameState || null,
    connections: new Map(raw.connections || []), resumeTokens: new Map(raw.resumeTokens || []),
    pendingOffers: new Map(raw.pendingOffers || []), processedRequests: new Map(raw.processedRequests || []),
    activeSessions: new Map(raw.activeSessions || []), disconnectTimers: existingRoom?.disconnectTimers || new Map(),
    version: raw.version || 0,
  };
}

export const cloneRoom = room => deserializeRoom(structuredClone(serializeRoom(room)), room);
export function conflictError(room) {
  return Object.assign(new Error('Phòng đã thay đổi. Hãy thử lại với trạng thái mới.'), {
    conflict: true, currentRevision: room?.gameState?.revision,
  });
}

export function normalizeRoomCode(code) {
  if (typeof code !== 'string' || !/^[A-Z0-9_-]{1,64}$/i.test(code)) throw new Error('Mã phòng không hợp lệ.');
  return code.toUpperCase();
}

export function publicRoom(room) {
  if (!room) return null;
  const { code, hostId, status, customRules, players, gameState, version } = room;
  return { code, hostId, status, customRules, players, gameState, version };
}
