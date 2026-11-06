import { BOARD_TILES } from '../data/boardData.js';
import { hasMonopoly, canBuildHouse, canSellHouse, canMortgage, canUnmortgage } from './gameEngine.js';

export class AIEngine {
  // Quyết định mua đất khi hạ cánh xuống ô chưa có chủ
  static shouldBuyProperty(bot, tile, propertiesState, players) {
    if (!tile || !tile.price || bot.money < tile.price) return false;

    // Giữ lại một khoản tiền an toàn dự phòng rủi ro
    const safetyBuffer = 500000;
    const remainingCash = bot.money - tile.price;

    // Nếu mua ô này giúp hoàn thành bộ màu (Monopoly): MUA NGAY LẬP TỨC
    if (tile.group && tile.group !== 'railroad' && tile.group !== 'utility') {
      const groupTiles = BOARD_TILES.filter(t => t.group === tile.group);
      const ownedByBot = groupTiles.filter(t => propertiesState[t.id]?.owner === bot.id).length;
      if (ownedByBot === groupTiles.length - 1) {
        return true; // Ô cuối cùng để đủ bộ màu!
      }

      // Kiểm tra chặn đối thủ: Nếu có đối thủ sắp hoàn thành bộ màu này thì mua để chặn
      for (const p of players) {
        if (p.id !== bot.id && !p.isBankrupt) {
          const ownedByOpponent = groupTiles.filter(t => propertiesState[t.id]?.owner === p.id).length;
          if (ownedByOpponent === groupTiles.length - 1) {
            return true; // Mua để phá thế độc quyền của đối thủ!
          }
        }
      }
    }

    // Với ô bình thường: mua nếu số tiền còn lại sau khi mua lớn hơn khoản dự phòng
    return remainingCash >= safetyBuffer;
  }

  // Quyết định trả giá khi có Đấu Giá (Auction)
  static getAuctionBid(bot, tile, currentBid, propertiesState, players) {
    if (!tile || bot.money <= currentBid) return null; // Bỏ qua

    // Xác định giá trị tối đa mà Bot sẵn sàng trả
    let valuation = tile.price || 1000000;

    // Tăng giá trị nếu giúp hoàn thành bộ màu
    if (tile.group && tile.group !== 'railroad' && tile.group !== 'utility') {
      const groupTiles = BOARD_TILES.filter(t => t.group === tile.group);
      const ownedByBot = groupTiles.filter(t => propertiesState[t.id]?.owner === bot.id).length;
      if (ownedByBot === groupTiles.length - 1) {
        valuation = Math.floor(tile.price * 1.4); // Sẵn sàng trả đến 140% giá gốc
      }
    }

    // Giới hạn bởi số tiền hiện có trừ khoản đệm an toàn
    const maxAffordable = bot.money - 300000;
    const maxWilling = Math.min(valuation, maxAffordable);

    const step = 100000;
    const nextBid = currentBid + step;

    if (nextBid <= maxWilling) {
      return nextBid;
    }
    return null; // Bỏ qua nếu giá đã vượt quá mức sẵn sàng chi
  }

  // Quyết định hành động khi ở trong tù
  static decideJailAction(bot, turnInJail, propertiesState) {
    // 1. Nếu có Thẻ Ra Tù Miễn Phí: Dùng luôn
    if (bot.outOfJailCards > 0) {
      return 'use_card';
    }

    // 2. Đầu hoặc giữa trận: Ra tù sớm để tranh mua đất
    const unownedPropertiesCount = BOARD_TILES.filter(t => 
      (t.type === 'property' || t.type === 'railroad' || t.type === 'utility') && !propertiesState[t.id]?.owner
    ).length;

    if (unownedPropertiesCount > 5 && bot.money >= 1000000) {
      return 'pay_fine';
    }

    // 3. Cuối trận (nhiều khách sạn nguy hiểm trên bàn): Ở lại tù an toàn hơn
    if (turnInJail < 2) {
      return 'roll_doubles'; // Thử vận may đổ đôi
    }

    // Nếu đã ở tù 3 lượt không đổ được đôi: bắt buộc nộp phạt ra ngoài
    return 'pay_fine';
  }

  // Tự động xây nhà khi có cơ hội
  static getBuildRecommendations(bot, propertiesState, players) {
    const actions = [];
    if (bot.money < 1000000) return actions; // Cần giữ tiền mặt

    // Tìm các nhóm màu bot sở hữu trọn bộ
    const ownedGroups = new Set();
    BOARD_TILES.forEach(tile => {
      if (tile.type === 'property' && propertiesState[tile.id]?.owner === bot.id) {
        if (hasMonopoly(propertiesState, bot.id, tile.group)) {
          ownedGroups.add(tile.group);
        }
      }
    });

    let currentCash = bot.money;
    for (const group of ownedGroups) {
      const groupTiles = BOARD_TILES.filter(t => t.group === group);
      // Lặp qua để xây dựng đồng đều
      for (let level = 0; level < 5; level++) {
        for (const tile of groupTiles) {
          const check = canBuildHouse(tile.id, propertiesState, [{ ...bot, money: currentCash }], bot.id);
          if (check.can && currentCash - tile.housePrice >= 800000) {
            actions.push(tile.id);
            currentCash -= tile.housePrice;
          }
        }
      }
    }

    return actions;
  }

  // Cứu nguy khẩn cấp khi thiếu tiền trả nợ (Emergency Liquidation)
  static planDebtRelief(bot, debtNeeded, propertiesState) {
    let raised = 0;
    const actions = []; // { type: 'sell_house' | 'mortgage', tileId }

    // Bước 1: Bán nhà (những ô có nhà ít quan trọng hơn trước)
    const ownedPropertiesWithHouses = BOARD_TILES.filter(t => 
      t.type === 'property' && propertiesState[t.id]?.owner === bot.id && (propertiesState[t.id]?.houses || 0) > 0
    );

    // Lặp bán nhà
    let keepSelling = true;
    while (keepSelling && raised < debtNeeded) {
      keepSelling = false;
      for (const tile of ownedPropertiesWithHouses) {
        const check = canSellHouse(tile.id, propertiesState, bot.id);
        if (check.can) {
          actions.push({ type: 'sell_house', tileId: tile.id, amount: check.refund });
          raised += check.refund;
          keepSelling = true;
          if (raised >= debtNeeded) break;
        }
      }
    }

    if (raised >= debtNeeded) return actions;

    // Bước 2: Thế chấp đất (ưu tiên thế chấp đất đơn lẻ không thuộc bộ màu trước)
    const ownedProperties = BOARD_TILES.filter(t => 
      (t.type === 'property' || t.type === 'railroad' || t.type === 'utility') &&
      propertiesState[t.id]?.owner === bot.id &&
      !propertiesState[t.id]?.isMortgaged
    ).sort((a, b) => {
      // Ưu tiên đất không monopoly trước
      const monoA = hasMonopoly(propertiesState, bot.id, a.group) ? 1 : 0;
      const monoB = hasMonopoly(propertiesState, bot.id, b.group) ? 1 : 0;
      return monoA - monoB;
    });

    for (const tile of ownedProperties) {
      const check = canMortgage(tile.id, propertiesState, bot.id);
      if (check.can) {
        actions.push({ type: 'mortgage', tileId: tile.id, amount: check.amount });
        raised += check.amount;
        if (raised >= debtNeeded) break;
      }
    }

    return actions;
  }
}

