import { BOARD_TILES } from '../data/boardData.js';
import { AIEngine } from './aiEngine.js';
import { calculateRent, calculateBuyoutPrice } from './gameEngine.js';
import { getBuildChoices } from './gamePresentation.js';

export function chooseBotAction(state) {
  const bot = state.players[state.turnIndex], pending = state.pendingDecision;
  if (bot.money < 0) {
    const relief = AIEngine.planDebtRelief(bot, -bot.money, state.propertiesState)[0];
    if (!relief) throw new Error('Không tìm thấy hành động thanh lý hợp lệ');
    return { type: relief.type, tileId: relief.tileId };
  }
  if (pending?.type === 'build') {
    const tile = BOARD_TILES[pending.tileId], prop = state.propertiesState[tile.id];
    if (!prop?.owner && !AIEngine.shouldBuyProperty(bot, tile, state.propertiesState, state.players)) return { type: 'skip' };
    const choices = getBuildChoices(tile, bot, prop).filter(t => t.can);
    const best = choices.filter(t => bot.money - t.cost >= 800000).at(-1) || choices[0];
    return best ? { type: 'build', tileId: tile.id, targetTier: best.level, opportunityId: pending.opportunityId } : { type: 'skip' };
  }
  if (pending?.type === 'card') return { type: 'confirm_card' };
  if (pending?.type === 'jail') {
    const choice = AIEngine.decideJailAction(bot, bot.jailTurns, state.propertiesState);
    return { type: 'jail', method: choice === 'use_card' && bot.outOfJailCards > 0 ? 'card' : choice === 'pay_fine' && bot.money >= 500000 ? 'pay' : 'roll' };
  }
  if (pending?.type === 'festival') {
    const best = BOARD_TILES.filter(t => t.type === 'property' && state.propertiesState[t.id]?.owner === bot.id)
      .sort((a, b) => calculateRent(b, state.propertiesState) - calculateRent(a, state.propertiesState))[0];
    return best ? { type: 'festival', tileId: best.id } : { type: 'skip' };
  }
  if (pending?.type === 'buyout') {
    const price = calculateBuyoutPrice(BOARD_TILES[pending.tileId], state.propertiesState[pending.tileId]);
    return { type: price > 0 && bot.money >= price * 1.5 ? 'buyout' : 'skip' };
  }
  return { type: state.phase === 'roll' ? 'roll' : 'end_turn' };
}
