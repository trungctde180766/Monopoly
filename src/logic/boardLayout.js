export function getTile3DTransform(tileId) {
  const half = 10.5, step = 1.9;
  if (tileId === 0) return { x: half, z: half, rotY: -Math.PI / 4, isCorner: true, side: 'bottom' };
  if (tileId < 10) return { x: half - 2.5 - (tileId - 1) * step, z: half, rotY: 0, isCorner: false, side: 'bottom' };
  if (tileId === 10) return { x: -half, z: half, rotY: Math.PI / 4, isCorner: true, side: 'left' };
  if (tileId < 20) return { x: -half, z: half - 2.5 - (tileId - 11) * step, rotY: Math.PI / 2, isCorner: false, side: 'left' };
  if (tileId === 20) return { x: -half, z: -half, rotY: 3 * Math.PI / 4, isCorner: true, side: 'top' };
  if (tileId < 30) return { x: -half + 2.5 + (tileId - 21) * step, z: -half, rotY: Math.PI, isCorner: false, side: 'top' };
  if (tileId === 30) return { x: half, z: -half, rotY: -3 * Math.PI / 4, isCorner: true, side: 'right' };
  return { x: half, z: -half + 2.5 + (tileId - 31) * step, rotY: -Math.PI / 2, isCorner: false, side: 'right' };
}
export function getTileLayoutVectors(side) {
  return {
    bottom: { inward: { x: 0, z: -1 }, tangent: { x: 1, z: 0 } },
    left: { inward: { x: 1, z: 0 }, tangent: { x: 0, z: -1 } },
    top: { inward: { x: 0, z: 1 }, tangent: { x: -1, z: 0 } },
    right: { inward: { x: -1, z: 0 }, tangent: { x: 0, z: 1 } },
  }[side];
}
// Token bases have diameter 1.04. Layout reserves a gap using the actual scaled footprint.
export function getTokenLayout(tileId, index = 0, count = 1) {
  const tile = getTile3DTransform(tileId);
  count = Math.max(1, Math.min(6, count));
  index = Math.max(0, Math.min(count - 1, index));
  if (tile.isCorner) {
    const cols = Math.min(3, count), rows = Math.ceil(count / cols);
    const row = Math.floor(index / cols), col = index % cols;
    const rowCount = Math.min(cols, count - row * cols);
    return { x: tile.x + (col - (rowCount - 1) / 2) * 0.75,
      z: tile.z + (row - (rows - 1) / 2) * 0.75, scale: count === 1 ? 0.8 : 0.6 };
  }
  const cols = Math.min(3, count), row = Math.floor(index / cols), col = index % cols;
  const rowCount = Math.min(cols, count - row * cols);
  const scale = count === 1 ? 0.65 : count === 2 ? 0.55 : count === 3 ? 0.44 : 0.38;
  const along = (col - (rowCount - 1) / 2) * (count === 2 ? 0.8 : 0.52);
  const outward = count <= 3 ? 0.65 : 0.40 + row * 0.42;
  const { inward, tangent } = getTileLayoutVectors(tile.side);
  return { x: tile.x - inward.x * outward + tangent.x * along,
    z: tile.z - inward.z * outward + tangent.z * along, scale };
}
export function sampleTokenHop(hop, delta) {
  hop.progress += Math.max(0, delta) * 4.2;
  if (hop.progress >= hop.totalSteps) return { ...hop.targetLayout, y: 0.25, done: true };
  const step = Math.floor(hop.progress), t = hop.progress - step;
  const from = step === 0 ? hop.fromPosition : getTokenLayout((hop.fromPos + step) % 40);
  const to = step + 1 === hop.totalSteps ? hop.targetLayout : getTokenLayout((hop.fromPos + step + 1) % 40);
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t,
    y: 0.25 + 4 * 1.45 * t * (1 - t), scale: hop.targetLayout.scale,
    rotation: Math.atan2(to.x - from.x, to.z - from.z), step, done: false };
}
