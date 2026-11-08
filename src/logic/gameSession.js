import {
  BOARD_TILES, CHANCE_CARDS, COMMUNITY_CHEST_CARDS, INITIAL_MONEY, GO_REWARD, JAIL_FINE,
} from '../data/boardData.js';
import {
  createBuildOpportunity, applyBuildAction, calculateRent, calculateBuyoutPrice,
  checkBusinessTourVictory, canSellHouse, canMortgage, canUnmortgage,
  calculateMaxLiquidatable, validateTradeOffer, formatVND,
} from './gameEngine.js';

export function createGameSession(room, { allowBots = false } = {}) {
  if (room.players.length < 2 || room.players.length > 6 || new Set(room.players.map(p => p.id)).size !== room.players.length) throw new Error('Cần 2–6 người chơi với mã người chơi riêng biệt');
  return {
    players: room.players.map(p => ({
      id: p.id, name: p.name, token: p.token, color: p.color, isBot: allowBots && !!p.isBot,
      money: INITIAL_MONEY, position: 0, inJail: false, jailTurns: 0,
      outOfJailCards: 0, isBankrupt: false, buildOpportunity: null,
    })),
    propertiesState: {}, turnIndex: 0, dice: [1, 1], hasRolled: false,
    doublesCount: 0, freeParkingPool: 0, totalTurnsCount: 0, winner: null,
    revision: 0, phase: 'roll', pendingDecision: null, startedAt: Date.now(),
    customRules: room.customRules || {}, gameLog: [allowBots ? 'Ván tại máy bắt đầu. Chúc các tỷ phú may mắn!' : 'Trận đấu online bắt đầu. Máy chủ xác nhận mọi hành động.'],
  };
}
const requireRule = (condition, message) => { if (!condition) throw new Error(message); };
const active = s => s.players[s.turnIndex];
const log = (s, message) => { s.gameLog = [message, ...s.gameLog].slice(0, 41); };
function checkWinner(s) {
  const win = checkBusinessTourVictory(s.propertiesState, s.players);
  s.winner = win ? { ...win.winner, winReason: win.reason } : null;
  if (s.winner) { s.pendingDecision = null; s.phase = 'finished'; }
}
function endLanding(s) {
  s.pendingDecision = null;
  s.hasRolled = true;
  s.phase = 'end';
}
function bankrupt(s, p, creditorId) {
  const creditor = s.players.find(x => x.id === creditorId && !x.isBankrupt);
  for (const [id, prop] of Object.entries(s.propertiesState)) {
    if (prop.owner !== p.id) continue;
    if (creditor) prop.owner = creditor.id;
    else delete s.propertiesState[id];
  }
  p.isBankrupt = true; p.money = 0; p.buildOpportunity = null;
  delete p.debtCreditorId; delete p.debtShortfall;
  log(s, `💥 ${p.name} phá sản.`);
}
function settleDebt(s, p) {
  if (p.money < 0) return;
  const creditor = s.players.find(x => x.id === p.debtCreditorId && !x.isBankrupt);
  if (creditor) creditor.money += p.debtShortfall || 0;
  delete p.debtCreditorId; delete p.debtShortfall;
}
function liquidateAbsentDebtor(s, p) {
  // A card can charge players outside their turn. Resolve those debts atomically,
  // so a second creditor cannot overwrite an existing shortfall.
  for (let pass = 0; pass < 100 && p.money < 0; pass++) {
    const tile = BOARD_TILES.find(t => canSellHouse(t.id, s.propertiesState, p.id).can);
    if (!tile) break;
    p.money += canSellHouse(tile.id, s.propertiesState, p.id).refund;
    s.propertiesState[tile.id].houses--;
  }
  for (const tile of BOARD_TILES) {
    if (p.money >= 0) break;
    const check = canMortgage(tile.id, s.propertiesState, p.id);
    if (check.can) { p.money += check.amount; s.propertiesState[tile.id].isMortgaged = true; }
  }
  settleDebt(s, p);
}
function charge(s, p, amount, creditorId = null) {
  requireRule(Number.isSafeInteger(amount) && amount >= 0, 'Khoản thanh toán không hợp lệ');
  const creditor = s.players.find(x => x.id === creditorId && !x.isBankrupt);
  if (creditor) creditor.money += Math.min(amount, Math.max(0, p.money));
  const shortage = Math.max(0, amount - Math.max(0, p.money));
  p.money -= amount;
  if (p.money < 0) {
    p.debtCreditorId = creditor?.id || null;
    p.debtShortfall = shortage;
    if (calculateMaxLiquidatable(p, s.propertiesState) < 0) bankrupt(s, p, creditorId);
    else if (p.id !== active(s).id) liquidateAbsentDebtor(s, p);
  }
}
function move(s, p, steps) {
  if (steps > 0 && p.position + steps >= 40) {
    p.money += GO_REWARD;
    log(s, `💰 ${p.name} qua GO, nhận ${formatVND(GO_REWARD)}.`);
  }
  p.position = (p.position + steps + 40) % 40;
  land(s, p);
}
function sendToJail(s, p) {
  p.position = 10; p.inJail = true; p.jailTurns = 0;
  p.buildOpportunity = null; s.doublesCount = 0;
  endLanding(s);
  log(s, `🚨 ${p.name} vào tù.`);
}
function land(s, p) {
  const tile = BOARD_TILES[p.position];
  p.buildOpportunity = null;
  endLanding(s);
  log(s, `📍 ${p.name} tới ${tile.name}.`);
  if (tile.type === 'go_to_jail') return sendToJail(s, p);
  if (tile.type === 'tax') {
    if (s.customRules.freeParkingJackpot) s.freeParkingPool += tile.taxAmount;
    charge(s, p, tile.taxAmount);
  } else if (['chance', 'community_chest'].includes(tile.type)) {
    const deck = tile.type === 'chance' ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
    s.pendingDecision = { type: 'card', card: deck[Math.floor(s.random() * deck.length)], deckType: tile.type };
  } else if (tile.type === 'free_parking') {
    if (s.customRules.freeParkingJackpot && s.freeParkingPool > 0) {
      const reward = s.freeParkingPool;
      p.money += reward; s.freeParkingPool = 0;
      log(s, `🎁 ${p.name} nhận Quỹ thưởng ${formatVND(reward)}.`);
    }
    const owned = BOARD_TILES.filter(t => t.type === 'property' && s.propertiesState[t.id]?.owner === p.id);
    if (owned.length) s.pendingDecision = { type: 'festival' };
    else { p.money += 500000; log(s, `🎪 ${p.name} nhận tài trợ 500k.`); }
  } else if (['property', 'railroad', 'utility'].includes(tile.type)) {
    const prop = s.propertiesState[tile.id];
    if (!prop?.owner || prop.owner === p.id) {
      p.buildOpportunity = createBuildOpportunity(p, tile.id, s.propertiesState, `landing:${s.revision + 1}:${p.id}:${tile.id}`);
      if (p.buildOpportunity) s.pendingDecision = { type: 'build', tileId: tile.id, opportunityId: p.buildOpportunity.id };
    } else if (!prop.isMortgaged) {
      const rent = calculateRent(tile, s.propertiesState, s.dice[0] + s.dice[1]);
      charge(s, p, rent, prop.owner);
      log(s, `🏠 ${p.name} trả tiền thuê ${formatVND(rent)} tại ${tile.name}.`);
      const price = calculateBuyoutPrice(tile, prop);
      if (!p.isBankrupt && price > 0 && p.money >= price) s.pendingDecision = { type: 'buyout', tileId: tile.id };
    }
  }
  if (s.pendingDecision) s.phase = 'decision';
}
function applyCard(s, p, card) {
  endLanding(s);
  log(s, `🎴 ${p.name}: ${card.title}.`);
  switch (card.action) {
    case 'collect_money': p.money += card.amount; break;
    case 'pay_money': charge(s, p, card.amount); break;
    case 'go_to_jail': sendToJail(s, p); break;
    case 'get_out_of_jail_free': p.outOfJailCards++; break;
    case 'move_relative': move(s, p, card.steps); break;
    case 'move_to': {
      if (card.collectPassGo && p.position > card.targetTile) p.money += GO_REWARD;
      p.position = card.targetTile; land(s, p); break;
    }
    case 'move_nearest_railroad': {
      const destination = [5, 15, 25, 35].find(id => id > p.position) ?? 5;
      if (card.collectPassGo && destination < p.position) p.money += GO_REWARD;
      p.position = destination; land(s, p); break;
    }
    case 'property_repair': {
      const cost = BOARD_TILES.reduce((sum, tile) => {
        const prop = s.propertiesState[tile.id];
        if (tile.type !== 'property' || prop?.owner !== p.id) return sum;
        return sum + (prop.houses >= 4 ? (card.hotelCost || 1000000) : (prop.houses || 0) * (card.houseCost || 250000));
      }, 0);
      charge(s, p, cost); break;
    }
    case 'collect_from_all':
      for (const other of s.players.filter(x => x.id !== p.id && !x.isBankrupt)) charge(s, other, card.amount, p.id);
      break;
    case 'pay_all_players':
      for (const other of s.players.filter(x => x.id !== p.id && !x.isBankrupt)) {
        if (p.isBankrupt) break;
        if (p.money < card.amount && !p.isBankrupt) liquidateAbsentDebtor(s, p);
        charge(s, p, card.amount, other.id);
        if (p.money < 0 && !p.isBankrupt) liquidateAbsentDebtor(s, p);
      }
      break;
    default: throw new Error('Thẻ chưa được hỗ trợ');
  }
}

export function reduceGameAction(state, actorId, action, random = Math.random) {
  requireRule(state && !state.winner, 'Ván đấu đã kết thúc');
  requireRule(action && action.revision === state.revision, 'State đã thay đổi, vui lòng thử lại');
  requireRule(actorId === active(state)?.id, 'Chưa đến lượt của bạn');
  const s = structuredClone(state);
  s.random = random;
  const p = active(s);
  requireRule(!p.isBankrupt || action.type === 'end_turn', 'Người chơi đã phá sản');
  const pending = s.pendingDecision;
  switch (action.type) {
    case 'roll': {
      requireRule(s.phase === 'roll' && !s.hasRolled && p.money >= 0, 'Chưa thể lắc xúc xắc');
      if (p.inJail) { s.pendingDecision = { type: 'jail' }; s.phase = 'decision'; break; }
      s.dice = [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
      s.doublesCount = s.dice[0] === s.dice[1] ? s.doublesCount + 1 : 0;
      if (s.doublesCount >= 3) sendToJail(s, p);
      else move(s, p, s.dice[0] + s.dice[1]);
      break;
    }
    case 'build': {
      requireRule(pending?.type === 'build' && pending.tileId === action.tileId, 'Không có quyền xây tại ô này');
      const built = applyBuildAction(action.tileId, action.targetTier, s.propertiesState, s.players, actorId, action.opportunityId);
      requireRule(action.opportunityId === pending.opportunityId && built.can, built.reason || 'Quyền xây đã hết hạn');
      s.players = built.players; s.propertiesState = built.propertiesState;
      endLanding(s); log(s, `🏗️ ${p.name} mua/nâng ${BOARD_TILES[action.tileId].name}, chi ${formatVND(built.cost)}.`);
      break;
    }
    case 'skip':
      requireRule(['build', 'buyout', 'festival'].includes(pending?.type), 'Không có quyết định để bỏ qua');
      if (p.buildOpportunity) p.buildOpportunity.consumed = true;
      endLanding(s); break;
    case 'buyout': {
      requireRule(pending?.type === 'buyout', 'Không có quyền mua lại');
      const tile = BOARD_TILES[pending.tileId], prop = s.propertiesState[tile.id];
      const price = calculateBuyoutPrice(tile, prop);
      const owner = s.players.find(x => x.id === prop.owner && !x.isBankrupt);
      requireRule(owner && owner.id !== p.id && price > 0 && p.money >= price, 'Không thể mua lại tài sản này');
      p.money -= price; owner.money += price; prop.owner = p.id;
      endLanding(s); log(s, `⚔️ ${p.name} mua lại ${tile.name}.`); break;
    }
    case 'festival':
      requireRule(pending?.type === 'festival' && BOARD_TILES[action.tileId]?.type === 'property' && s.propertiesState[action.tileId]?.owner === p.id, 'Thành phố lễ hội không hợp lệ');
      s.propertiesState[action.tileId].isFestival = true; endLanding(s); break;
    case 'confirm_card':
      requireRule(pending?.type === 'card', 'Không có thẻ để xác nhận');
      applyCard(s, p, pending.card); break;
    case 'jail': {
      requireRule(pending?.type === 'jail' && p.inJail, 'Không có quyết định ra tù');
      if (action.method === 'pay') {
        requireRule(p.money >= JAIL_FINE, 'Không đủ tiền bảo lãnh');
        p.money -= JAIL_FINE; p.inJail = false; p.jailTurns = 0;
        s.pendingDecision = null; s.phase = 'roll';
      } else if (action.method === 'card') {
        requireRule(p.outOfJailCards > 0, 'Không có thẻ đặc xá');
        p.outOfJailCards--; p.inJail = false; p.jailTurns = 0;
        s.pendingDecision = null; s.phase = 'roll';
      } else {
        requireRule(action.method === 'roll', 'Lựa chọn không hợp lệ');
        s.dice = [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
        if (s.dice[0] === s.dice[1] || ++p.jailTurns >= 3) {
          if (s.dice[0] !== s.dice[1]) charge(s, p, JAIL_FINE);
          if (p.isBankrupt) endLanding(s);
          else if (p.money < 0) {
            s.pendingDecision = { type: 'jail_debt', steps: s.dice[0] + s.dice[1] };
            s.phase = 'debt'; s.hasRolled = true;
            log(s, `🔒 ${p.name} cần thanh lý tài sản trả phạt trước khi rời tù.`);
          } else {
            p.inJail = false; p.jailTurns = 0;
            move(s, p, s.dice[0] + s.dice[1]);
          }
        } else endLanding(s);
        s.doublesCount = 0;
      }
      break;
    }
    case 'sell_house': case 'mortgage': case 'unmortgage': {
      const tile = BOARD_TILES[action.tileId];
      const check = action.type === 'sell_house' ? canSellHouse(action.tileId, s.propertiesState, p.id)
        : action.type === 'mortgage' ? canMortgage(action.tileId, s.propertiesState, p.id)
          : canUnmortgage(action.tileId, s.propertiesState, s.players, p.id);
      requireRule(tile && check.can, check.reason || 'Tài sản không hợp lệ');
      if (action.type === 'sell_house') { s.propertiesState[tile.id].houses--; p.money += check.refund; }
      if (action.type === 'mortgage') { s.propertiesState[tile.id].isMortgaged = true; p.money += check.amount; }
      if (action.type === 'unmortgage') { s.propertiesState[tile.id].isMortgaged = false; p.money -= check.cost; }
      settleDebt(s, p);
      if (p.buildOpportunity) p.buildOpportunity.consumed = true;
      if (pending?.type === 'build') endLanding(s);
      if (pending?.type === 'jail_debt' && p.money >= 0) {
        p.inJail = false; p.jailTurns = 0;
        move(s, p, pending.steps);
      }
      log(s, `🏦 ${p.name} quản lý tài sản ${tile.name}.`); break;
    }
    case 'end_turn': {
      requireRule(s.phase === 'end' && !pending && p.money >= 0, 'Cần xử lý quyết định/nợ trước khi kết thúc lượt');
      p.buildOpportunity = null;
      if (!p.isBankrupt && s.dice[0] === s.dice[1] && s.doublesCount > 0 && !p.inJail) {
        s.hasRolled = false; s.phase = 'roll'; break;
      }
      do { s.turnIndex = (s.turnIndex + 1) % s.players.length; } while (active(s).isBankrupt);
      s.hasRolled = false; s.doublesCount = 0; s.phase = 'roll'; s.totalTurnsCount++;
      log(s, `👉 Đến lượt ${active(s).name}.`); break;
    }
    default: throw new Error('Hành động không được hỗ trợ');
  }
  delete s.random;
  s.revision++;
  checkWinner(s);
  if (!s.winner && active(s).isBankrupt) {
    do { s.turnIndex = (s.turnIndex + 1) % s.players.length; } while (active(s).isBankrupt);
    s.pendingDecision = null; s.phase = 'roll'; s.hasRolled = false; s.doublesCount = 0; s.totalTurnsCount++;
    log(s, `👉 Đến lượt ${active(s).name}.`);
  }
  s.lastAction = { type: action.type, method: action.method, actorId, revision: s.revision };
  return s;
}

export function applySessionTrade(state, offer) {
  requireRule(!state.winner, 'Ván đấu đã kết thúc');
  const turnPlayer = state.players[state.turnIndex];
  if (state.pendingDecision && (offer.senderId === turnPlayer?.id || offer.targetId === turnPlayer?.id)) {
    throw new Error('Không thể giao dịch khi người chơi đang có quyết định cần xử lý');
  }
  const valid = validateTradeOffer(offer, state.players, state.propertiesState);
  requireRule(valid.valid, valid.reason);
  const s = structuredClone(state);
  const sender = s.players.find(p => p.id === offer.senderId);
  const target = s.players.find(p => p.id === offer.targetId);
  sender.money += offer.demandMoney - offer.offerMoney;
  target.money += offer.offerMoney - offer.demandMoney;
  for (const id of offer.offerTiles) s.propertiesState[id].owner = target.id;
  for (const id of offer.demandTiles) s.propertiesState[id].owner = sender.id;

  // Clear buildOpportunity only for players involved in the trade
  for (const p of s.players) {
    if (p.id === sender.id || p.id === target.id) p.buildOpportunity = null;
  }

  // Trading only affects landing if the active player was part of the trade
  // or if the landing tile itself was transferred in the trade
  const activePlayer = s.players[s.turnIndex];
  const tradedTileIds = new Set([...(offer.offerTiles || []), ...(offer.demandTiles || [])]);
  const affectsActiveLanding = (activePlayer.id === sender.id || activePlayer.id === target.id) ||
    (s.pendingDecision?.tileId !== undefined && tradedTileIds.has(s.pendingDecision.tileId));

  if (affectsActiveLanding) {
    if (s.pendingDecision?.type === 'build' || s.pendingDecision?.type === 'buyout') endLanding(s);
  }

  s.revision++; log(s, `🤝 ${sender.name} và ${target.name} hoàn tất giao dịch.`);
  s.lastAction = { type: 'trade', actorId: sender.id, revision: s.revision };
  checkWinner(s);
  return s;
}

export function forfeitSessionPlayer(state, playerId) {
  if (!state || state.winner) return state;
  const s = structuredClone(state), p = s.players.find(x => x.id === playerId);
  if (!p || p.isBankrupt) return state;
  bankrupt(s, p, null);
  checkWinner(s);
  if (!s.winner && active(s).id === playerId) {
    do { s.turnIndex = (s.turnIndex + 1) % s.players.length; } while (active(s).isBankrupt);
    s.pendingDecision = null; s.phase = 'roll'; s.hasRolled = false; s.doublesCount = 0;
  }
  // L02 Fix: If an active player was waiting for a buyout on property belonging to this player, dismiss the orphaned decision
  if (!s.winner && s.pendingDecision?.type === 'buyout') {
    const tileId = s.pendingDecision.tileId;
    const prop = s.propertiesState[tileId];
    if (!prop || !prop.owner || prop.owner === playerId) {
      endLanding(s);
    }
  }
  s.revision++;
  return s;
}
