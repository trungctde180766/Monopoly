import { BOARD_TILES, COLOR_GROUPS } from '../data/boardData.js';
import { calculateRent, calculateBuyoutPrice, calculateBuildTierCost, validateBuildAction, formatVND } from './gameEngine.js';

export const BUILDING_TIERS = [
  { level: 1, title: 'Nhà cấp 1', icon: '🏡' },
  { level: 2, title: 'Nhà cấp 2', icon: '🏘️' },
  { level: 3, title: 'Biệt thự', icon: '🏛️' },
  { level: 4, title: 'Khách sạn Landmark', icon: '🏰' },
];
export function getBuildingLabel(houses = 0) {
  return BUILDING_TIERS.find(t => t.level === houses)?.title || 'Đất trống';
}
export function getBuildChoices(tile, player, prop) {
  if (!tile || !player) return [];
  const source = tile.type === 'property' ? BUILDING_TIERS : [{ level: 1, title: 'Mua tài sản', icon: tile.type === 'railroad' ? '🚂' : '⚡' }];
  return source.map(tier => {
    const check = validateBuildAction(tile.id, tier.level, { [tile.id]: prop }, [player], player.id);
    const rent = tile.type === 'property' ? calculateRent(tile, { [tile.id]: { ...prop, owner: player.id, houses: tier.level } }) : null;
    const cost = tile.type === 'property' ? calculateBuildTierCost(tile, prop?.houses || 0, tier.level, !prop?.owner) : tile.price;
    return { ...tier, cost, rent, can: check.can, locked: !check.can && check.reasonCode !== 'funds', reason: check.reason };
  });
}
export function getTileDetails(tile, propertiesState = {}, players = [], dice = [1, 1]) {
  if (!tile) return null;
  const prop = propertiesState[tile.id], owner = players.find(p => p.id === prop?.owner);
  const isAsset = ['property', 'railroad', 'utility'].includes(tile.type);
  const group = COLOR_GROUPS[tile.group?.toUpperCase()];
  const typeLabel = ({ property: 'Thành phố', railroad: 'Ga tàu', utility: 'Tiện ích', go: 'Khởi hành', jail: 'Thăm tù', go_to_jail: 'Vào tù', free_parking: 'Lễ hội & Quỹ thưởng', chance: 'Cơ hội', community_chest: 'Khí vận', tax: 'Thuế' })[tile.type];
  const descriptions = {
    free_parking: 'Nhận Quỹ thưởng nếu được bật. Chọn thành phố của bạn tổ chức Lễ hội x2 tiền thuê; chưa có thành phố thì nhận 500k tài trợ.',
    go: 'Qua hoặc dừng ở Khởi hành nhận 2 triệu đồng.',
    jail: 'Chỉ thăm tù khi đi ngang. Nếu đang bị giam: dùng thẻ, trả phạt hoặc thử đổ đôi.',
    go_to_jail: 'Đi thẳng tới ô tù, không nhận lương Khởi hành.',
    chance: 'Rút một thẻ Cơ hội và thực hiện nội dung trên thẻ.',
    community_chest: 'Rút một thẻ Khí vận và thực hiện nội dung trên thẻ.',
  };
  return {
    tile, prop, owner, isAsset, group, typeLabel,
    status: !isAsset ? typeLabel : !owner ? 'Chưa có chủ' : prop.isMortgaged ? 'Đang thế chấp' : tile.type === 'property' ? getBuildingLabel(prop.houses) : 'Đã sở hữu',
    priceLabel: owner ? 'Tiền thuê hiện tại' : tile.type === 'tax' ? 'Khoản phải nộp' : isAsset ? 'Giá mua' : null,
    amount: owner ? calculateRent(tile, propertiesState, dice[0] + dice[1]) : tile.taxAmount ?? tile.price ?? null,
    description: descriptions[tile.type] || tile.description || (tile.type === 'utility' ? 'Tiền thuê phụ thuộc số tiện ích sở hữu và tổng hai xúc xắc.' : 'Chọn ô trên bàn để xem giá và chủ sở hữu.'),
    buyoutPrice: owner ? calculateBuyoutPrice(tile, prop) : 0,
    rentRows: tile.type === 'property' ? [{ label: 'Đất trống', level: 0 }, ...BUILDING_TIERS.map(t => ({ label: t.title, level: t.level }))].map(row => ({
      ...row,
      amount: prop?.owner ? calculateRent(tile, { ...propertiesState, [tile.id]: { ...prop, houses: row.level } }, dice[0] + dice[1]) : tile.rent[row.level],
    })) : [],
  };
}
export function getTurnPresentation({ state, mode, myId, connected = true, busy = false, rolling = false, hopping = false }) {
  const p = state?.players?.[state.turnIndex];
  const view = (kind, label, hint, action = null, disabled = true) => ({ kind, label, hint, action, disabled });
  if (!p || state.winner) return view('finished', 'Ván đấu kết thúc', 'Xem kết quả hoặc trở về sảnh.');
  if (mode === 'online' && !connected) return view('offline', 'Đang kết nối lại', 'Hành động tạm khóa để giữ ván đấu đồng bộ.');
  if (mode === 'online' && p.id !== myId) return view('waiting', `Chờ ${p.name}`, 'Bạn có thể xem bàn và tài sản trong lúc chờ.');
  if (rolling) return view('rolling', 'Đang lắc xúc xắc', 'Chờ kết quả hai viên xúc xắc.');
  if (hopping) return view('moving', 'Quân cờ đang di chuyển', 'Quyết định tại ô đến sẽ hiện khi quân cờ đáp xuống.');
  if (busy) return view('busy', 'Đang xử lý', 'Đang xác nhận hành động.');
  if (p.isBot) return view('bot', `${p.name} đang chơi`, 'Máy đang chọn hành động cho lượt này.');
  if (p.money < 0) return view('debt', 'Xử lý khoản nợ', `Cần bù ${formatVND(-p.money)} bằng cách bán nhà hoặc thế chấp.`, 'manage', false);
  const decision = state.pendingDecision?.type;
  if (decision) return view('decision', ({ build: BOARD_TILES[state.pendingDecision.tileId]?.type === 'property' ? 'Chọn cấp công trình' : 'Quyết định mua tài sản', buyout: 'Quyết định mua lại', card: 'Xác nhận thẻ', festival: 'Chọn thành phố Lễ hội', jail: 'Chọn cách ra tù', jail_debt: 'Trả phạt để rời tù' })[decision] || 'Xử lý ô đến', 'Hoàn tất hoặc bỏ qua lựa chọn đang mở trước khi đi tiếp.');
  if (state.phase === 'end') {
    const extra = state.dice[0] === state.dice[1] && state.doublesCount > 0 && !p.inJail;
    return view('end', extra ? 'Tiếp tục lượt đôi' : 'Kết thúc lượt', extra ? 'Bạn đổ đôi và được lắc thêm một lần.' : 'Đã xử lý ô đến. Chuyển sang người chơi tiếp theo.', 'end_turn', false);
  }
  return view('roll', p.inJail ? 'Xử lý ra tù' : 'Lắc xúc xắc', p.inJail ? 'Chọn trả phạt, dùng thẻ hoặc thử đổ đôi.' : 'Lắc hai viên xúc xắc để di chuyển quanh bàn.', 'roll', false);
}
