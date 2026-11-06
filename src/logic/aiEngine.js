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

  // Tự động xây nhà khi có cơ hội (H02 & H03 Fix: Bot chỉ có thể xây dựng khi đang đứng trên ô đất đó)
  static getBuildRecommendations(bot, propertiesState, players) {
    if (!bot || !Number.isInteger(bot.position) || bot.money < 1000000) return [];
    const tile = BOARD_TILES[bot.position];
    const check = canBuildHouse(bot.position, propertiesState, players, bot.id);
    return check.can && bot.money - check.cost >= 800000 ? [tile.id] : [];
  }

  // Cứu nguy khẩn cấp khi thiếu tiền trả nợ (Mô phỏng chính xác, không bán lặp 1 nhà)
  static planDebtRelief(bot, debtNeeded, propertiesState) {
    let raised = 0;
    const actions = []; // { type: 'sell_house' | 'mortgage', tileId, amount }

    // Deep copy state để mô phỏng chính xác từng bước thanh lý
    const simProps = JSON.parse(JSON.stringify(propertiesState || {}));

    // Bước 1: Bán nhà (những ô có nhà ít quan trọng hơn trước)
    let keepSelling = true;
    while (keepSelling && raised < debtNeeded) {
      keepSelling = false;
      const ownedPropertiesWithHouses = BOARD_TILES.filter(t => 
        t.type === 'property' && simProps[t.id]?.owner === bot.id && (simProps[t.id]?.houses || 0) > 0
      );

      for (const tile of ownedPropertiesWithHouses) {
        const check = canSellHouse(tile.id, simProps, bot.id);
        if (check.can) {
          actions.push({ type: 'sell_house', tileId: tile.id, amount: check.refund });
          raised += check.refund;
          // Cập nhật state mô phỏng: giảm đúng 1 nhà
          simProps[tile.id] = {
            ...simProps[tile.id],
            houses: Math.max(0, (simProps[tile.id]?.houses || 0) - 1),
          };
          keepSelling = true;
          if (raised >= debtNeeded) break;
        }
      }
    }

    if (raised >= debtNeeded) return actions;

    // Bước 2: Thế chấp đất (ưu tiên thế chấp đất đơn lẻ không thuộc bộ màu trước)
    const ownedProperties = BOARD_TILES.filter(t => 
      (t.type === 'property' || t.type === 'railroad' || t.type === 'utility') &&
      simProps[t.id]?.owner === bot.id &&
      !simProps[t.id]?.isMortgaged
    ).sort((a, b) => {
      const monoA = hasMonopoly(simProps, bot.id, a.group) ? 1 : 0;
      const monoB = hasMonopoly(simProps, bot.id, b.group) ? 1 : 0;
      return monoA - monoB;
    });

    for (const tile of ownedProperties) {
      const check = canMortgage(tile.id, simProps, bot.id);
      if (check.can) {
        actions.push({ type: 'mortgage', tileId: tile.id, amount: check.amount });
        raised += check.amount;
        simProps[tile.id] = {
          ...simProps[tile.id],
          isMortgaged: true,
        };
        if (raised >= debtNeeded) break;
      }
    }

    return actions;
  }

  // Đánh giá đề nghị giao dịch từ người chơi khác (F02 Fix)
  static evaluateTradeOffer(bot, offer, propertiesState, players) {
    if (!bot || !offer) return { accept: false, reason: 'Dữ liệu không hợp lệ' };

    const { offerMoney = 0, offerTiles = [], demandMoney = 0, demandTiles = [] } = offer;

    // Nếu đối phương đòi nhiều tiền hơn tiền họ đưa mà không bù đất giá trị cao: TỪ CHỐI
    if (demandMoney > bot.money) {
      return { accept: false, reason: 'Bot không có đủ tiền mặt theo yêu cầu' };
    }

    // Tính giá trị bot nhận được (Gồm tiền mặt + giá đất đối phương đưa)
    let valueReceived = offerMoney;
    for (const tileId of offerTiles) {
      const t = BOARD_TILES[tileId];
      if (t) {
        let tileVal = t.price || 0;
        // Nếu ô đất này giúp bot hoàn thành Monopoly: định giá x2.5!
        const testProps = { ...propertiesState, [tileId]: { owner: bot.id, houses: 0 } };
        if (t.group && hasMonopoly(testProps, bot.id, t.group)) {
          tileVal *= 2.5;
        }
        valueReceived += tileVal;
      }
    }

    // Tính giá trị bot phải bỏ ra (Tiền mặt + giá đất bot phải trao)
    let valueGiven = demandMoney;
    for (const tileId of demandTiles) {
      const t = BOARD_TILES[tileId];
      if (t) {
        let tileVal = t.price || 0;
        // Nếu mất ô này làm bot mất Monopoly: định giá x3.0 (rất đắt)!
        if (t.group && hasMonopoly(propertiesState, bot.id, t.group)) {
          tileVal *= 3.0;
        }
        valueGiven += tileVal;
      }
    }

    // Bot chỉ chấp thuận nếu giá trị nhận được lớn hơn hoặc bằng ít nhất 95% giá trị bỏ ra
    if (valueReceived >= valueGiven * 0.95 && (valueReceived > 0 || valueGiven > 0)) {
      return { accept: true, reason: 'Giao dịch hợp lý và có lợi cho cả hai' };
    }

    return { accept: false, reason: 'Giao dịch bất lợi hoặc làm mất vị thế độc quyền của Bot' };
  }
}

