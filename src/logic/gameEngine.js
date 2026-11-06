import { BOARD_TILES, COLOR_GROUPS, JAIL_FINE, GO_REWARD } from '../data/boardData.js';

// Kiểm tra xem người chơi có sở hữu trọn bộ màu (Monopoly) hay không
export function hasMonopoly(propertiesState, playerId, group) {
  if (!group || group === 'railroad' || group === 'utility') return false;
  const groupTiles = BOARD_TILES.filter(t => t.group === group);
  if (groupTiles.length === 0) return false;
  return groupTiles.every(t => propertiesState[t.id]?.owner === playerId);
}

// Kiểm tra xem nhóm màu có bất kỳ ô nào đang bị thế chấp hay không
export function isGroupMortgaged(propertiesState, group) {
  const groupTiles = BOARD_TILES.filter(t => t.group === group);
  return groupTiles.some(t => propertiesState[t.id]?.isMortgaged);
}

// Đếm số lượng bến xe / ga tàu sở hữu
export function countRailroads(propertiesState, playerId) {
  const railroads = BOARD_TILES.filter(t => t.type === 'railroad');
  return railroads.filter(t => propertiesState[t.id]?.owner === playerId).length;
}

// Đếm số công ty tiện ích sở hữu
export function countUtilities(propertiesState, playerId) {
  const utilities = BOARD_TILES.filter(t => t.type === 'utility');
  return utilities.filter(t => propertiesState[t.id]?.owner === playerId).length;
}

// Tính tiền thuê chuẩn theo luật Business Tour (Có nhân đôi Lễ Hội Festival)
export function calculateRent(tile, propertiesState, diceTotal = 7) {
  const prop = propertiesState[tile.id];
  if (!prop || !prop.owner || prop.isMortgaged) return 0;

  let baseRent = 0;

  if (tile.type === 'property') {
    const houses = prop.houses || 0;
    if (houses > 0) {
      // 1: Nhà cấp 1, 2: Nhà cấp 2, 3: Nhà cấp 3, 4: Khách Sạn / Kỳ Quan
      baseRent = tile.rent[houses] || tile.rent[tile.rent.length - 1] || 0;
    } else {
      // Đất trống: Nếu đủ bộ màu thì x2 tiền thuê cơ bản
      const monopoly = hasMonopoly(propertiesState, prop.owner, tile.group);
      baseRent = monopoly ? tile.rent[0] * 2 : tile.rent[0];
    }
  } else if (tile.type === 'railroad') {
    const count = countRailroads(propertiesState, prop.owner);
    // 1 ga: 250k, 2 ga: 500k, 3 ga: 1M, 4 ga: 2M
    if (count <= 0) return 0;
    baseRent = tile.baseRent * Math.pow(2, count - 1);
  } else if (tile.type === 'utility') {
    const count = countUtilities(propertiesState, prop.owner);
    const multiplier = count >= 2 ? 100000 : 40000;
    baseRent = multiplier * diceTotal;
  }

  // NẾU Ô ĐẤT ĐANG TỔ CHỨC LỄ HỘI (FESTIVAL / WORLD CHAMPIONSHIP): NHÂN ĐÔI TIỀN THUÊ (x2)!
  if (prop.isFestival) {
    baseRent = baseRent * 2;
  }

  return baseRent;
}

// Tính chi phí mua / nâng cấp theo 4 cấp bậc chuẩn Business Tour
export function calculateBuildTierCost(tile, currentHouses = 0, targetTier = 1, isNewPurchase = false) {
  if (!tile || targetTier < 1 || targetTier > 4) return 0;
  const housePrice = tile.housePrice || 500000;
  if (isNewPurchase) {
    // Mua mới đất kèm xây dựng:
    // Cấp 1: Giá đất
    // Cấp 2: Giá đất + 1 lần tiền nhà
    // Cấp 3: Giá đất + 2 lần tiền nhà
    // Cấp 4 (Khách sạn/Landmark): Giá đất + 3 lần tiền nhà
    return tile.price + (targetTier - 1) * housePrice;
  } else {
    // Nâng cấp đất đã sở hữu:
    if (targetTier <= currentHouses) return 0;
    return (targetTier - currentHouses) * housePrice;
  }
}

// Kiểm tra điều kiện có thể xây nhà & Landmark trên ô đất chuẩn Business Tour
export function canBuildHouse(tileId, propertiesState, players, playerId) {
  const tile = BOARD_TILES[tileId];
  if (!tile || tile.type !== 'property') return { can: false, reason: 'Không phải ô đất có thể xây dựng' };

  const prop = propertiesState[tileId];
  if (!prop || prop.owner !== playerId) return { can: false, reason: 'Bạn không sở hữu ô đất này' };
  if (prop.isMortgaged) return { can: false, reason: 'Khu đất đang bị thế chấp' };

  const player = players.find(p => p.id === playerId);
  if (!player || player.money < tile.housePrice) return { can: false, reason: 'Không đủ tiền nâng cấp' };

  const currentHouses = prop.houses || 0;
  if (currentHouses >= 4) {
    return { can: false, reason: 'Đã đạt cấp tối đa: Khách Sạn / Kỳ Quan (Bất khả xâm phạm, không thể bị phá hủy hay cướp)' };
  }

  return { can: true, cost: tile.housePrice, nextHouses: currentHouses + 1 };
}

// Tính giá cướp đất (Buyout) chuẩn Business Tour: 2x giá đất + giá công trình hiện tại
export function calculateBuyoutPrice(tile, propState) {
  if (!tile || !propState || !propState.owner) return 0;
  // NẾU ĐÃ LÊN CẤP 4 (KHÁCH SẠN / LANDMARK): BẤT KHẢ XÂM PHẠM, KHÔNG THỂ BỊ PHÁ HỦY HAY CƯỚP ĐẤT!
  if (propState.houses >= 4) return 0;

  const basePrice = tile.price || 0;
  const housesPrice = (propState.houses || 0) * (tile.housePrice || 0);
  return (basePrice + housesPrice) * 2;
}

// Kiểm tra các điều kiện thắng nhanh chuẩn Business Tour
export function checkBusinessTourVictory(propertiesState, players) {
  const survivors = players.filter(p => !p.isBankrupt);
  if (survivors.length === 1) {
    return { winner: survivors[0], reason: 'Tất cả đối thủ đã phá sản! Bạn là người sống sót duy nhất!' };
  }

  for (const player of survivors) {
    // 1. Triple Monopoly (Bộ ba độc quyền): Sở hữu trọn vẹn 3 nhóm màu đất
    const allGroups = ['BROWN', 'LIGHT_BLUE', 'PINK', 'ORANGE', 'RED', 'YELLOW', 'GREEN', 'DARK_BLUE'];
    const ownedGroups = allGroups.filter(g => hasMonopoly(propertiesState, player.id, g.toLowerCase()));
    if (ownedGroups.length >= 3) {
      return { winner: player, reason: 'THẮNG ĐẬM: BỘ BA ĐỘC QUYỀN (Sở hữu trọn vẹn 3 nhóm màu)!' };
    }

    // 2. Line Monopoly (Độc quyền một hàng): Sở hữu tất cả đất trên 1 cạnh bàn cờ
    const sides = [
      [1, 3, 5, 6, 8, 9],               // Cạnh dưới (Bottom)
      [11, 12, 13, 14, 15, 16, 18, 19], // Cạnh trái (Left)
      [21, 23, 24, 25, 26, 27, 28, 29], // Cạnh trên (Top)
      [31, 32, 34, 35, 37, 39],         // Cạnh phải (Right)
    ];
    for (let i = 0; i < sides.length; i++) {
      const sideTiles = sides[i];
      const ownsAll = sideTiles.every(tId => propertiesState[tId]?.owner === player.id);
      if (ownsAll) {
        return { winner: player, reason: 'THẮNG ĐẬM: ĐỘC QUYỀN MỘT HÀNG (Sở hữu toàn bộ đất trên 1 cạnh bàn cờ)!' };
      }
    }

    // 3. Ga Tàu Monopoly: Sở hữu trọn vẹn cả 4 ga tàu
    const railroads = [5, 15, 25, 35];
    const ownsAllRailroads = railroads.every(tId => propertiesState[tId]?.owner === player.id);
    if (ownsAllRailroads) {
      return { winner: player, reason: 'THẮNG ĐẬM: ĐỘC QUYỀN 4 BẾN XE / GA TÀU TOÀN BẢN ĐỒ!' };
    }
  }

  return null;
}

// Kiểm tra điều kiện bán nhà (quy tắc dỡ đồng đều)
export function canSellHouse(tileId, propertiesState, playerId) {
  const tile = BOARD_TILES[tileId];
  if (!tile || tile.type !== 'property') return { can: false, reason: 'Không phải ô đất' };

  const prop = propertiesState[tileId];
  if (!prop || prop.owner !== playerId) return { can: false, reason: 'Bạn không sở hữu ô đất này' };

  const currentHouses = prop.houses || 0;
  if (currentHouses <= 0) return { can: false, reason: 'Không có nhà để bán' };

  // Quy tắc dỡ đồng đều: số nhà ô này không được nhỏ hơn max các ô khác trong nhóm
  const groupTiles = BOARD_TILES.filter(t => t.group === tile.group);
  const houseCounts = groupTiles.map(t => propertiesState[t.id]?.houses || 0);
  const maxHouses = Math.max(...houseCounts);

  if (currentHouses < maxHouses) {
    return { can: false, reason: 'Cần dỡ nhà đồng đều trên tất cả các ô trong nhóm màu' };
  }

  // Bán lại cho ngân hàng với 50% giá mua
  return { can: true, refund: Math.floor(tile.housePrice / 2) };
}

// Kiểm tra điều kiện thế chấp đất
export function canMortgage(tileId, propertiesState, playerId) {
  const tile = BOARD_TILES[tileId];
  if (!tile || (tile.type !== 'property' && tile.type !== 'railroad' && tile.type !== 'utility')) {
    return { can: false, reason: 'Tài sản không thể thế chấp' };
  }

  const prop = propertiesState[tileId];
  if (!prop || prop.owner !== playerId) return { can: false, reason: 'Bạn không sở hữu tài sản này' };
  if (prop.isMortgaged) return { can: false, reason: 'Tài sản đã được thế chấp' };

  // Nếu là ô đất, tất cả nhà trong nhóm màu phải được bán hết trước khi thế chấp
  if (tile.type === 'property') {
    const groupTiles = BOARD_TILES.filter(t => t.group === tile.group);
    const totalHouses = groupTiles.reduce((sum, t) => sum + (propertiesState[t.id]?.houses || 0), 0);
    if (totalHouses > 0) {
      return { can: false, reason: 'Phải bán hết toàn bộ nhà trong nhóm màu trước khi thế chấp' };
    }
  }

  return { can: true, amount: tile.mortgageValue };
}

// Kiểm tra điều kiện chuộc đất (giải chấp: giá thế chấp + 10% lãi)
export function canUnmortgage(tileId, propertiesState, players, playerId) {
  const tile = BOARD_TILES[tileId];
  if (!tile) return { can: false, reason: 'Tài sản không hợp lệ' };

  const prop = propertiesState[tileId];
  if (!prop || prop.owner !== playerId) return { can: false, reason: 'Bạn không sở hữu tài sản này' };
  if (!prop.isMortgaged) return { can: false, reason: 'Tài sản không bị thế chấp' };

  const cost = Math.floor(tile.mortgageValue * 1.1);
  const player = players.find(p => p.id === playerId);
  if (!player || player.money < cost) {
    return { can: false, reason: `Không đủ tiền chuộc (Cần ${formatVND(cost)})`, cost };
  }

  return { can: true, cost };
}

// Tính tổng tài sản ròng (Net Worth) của người chơi
export function calculateNetWorth(player, propertiesState) {
  if (!player) return 0;
  let total = player.money || 0;

  BOARD_TILES.forEach(tile => {
    const prop = propertiesState[tile.id];
    if (prop?.owner === player.id) {
      if (prop.isMortgaged) {
        total += Math.floor((tile.price || 0) / 2);
      } else {
        total += tile.price || 0;
        const houses = prop.houses || 0;
        if (tile.housePrice && houses > 0) {
          total += houses * tile.housePrice;
        }
      }
    }
  });

  return total;
}

// Tính giá trị tài sản có thể thanh lý khẩn cấp (Bán nhà 50% + Thế chấp đất chưa thế chấp)
export function calculateLiquidationValue(player, propertiesState) {
  let value = 0;

  BOARD_TILES.forEach(tile => {
    const prop = propertiesState[tile.id];
    if (prop?.owner === player.id) {
      // Tiền từ bán nhà (50% chi phí xây)
      const houses = prop.houses || 0;
      if (houses > 0 && tile.housePrice) {
        value += houses * Math.floor(tile.housePrice / 2);
      }
      // Tiền từ thế chấp đất nếu chưa thế chấp
      if (!prop.isMortgaged && tile.mortgageValue) {
        value += tile.mortgageValue;
      }
    }
  });

  return value;
}

// Tính số dư ròng tối đa sau khi thanh lý toàn bộ tài sản khẩn cấp (Tiền mặt hiện có + Giá trị thanh lý)
// Nếu kết quả < 0: Người chơi thực sự không còn khả năng trả nợ và PHẢI PHÁ SẢN!
export function calculateMaxLiquidatable(player, propertiesState) {
  const currentCash = player?.money || 0;
  const assetValue = calculateLiquidationValue(player, propertiesState);
  return currentCash + assetValue;
}

// Format tiền tệ Việt Nam hiển thị đẹp mắt
export function formatVND(amount) {
  if (amount === undefined || amount === null) return '0₫';
  if (Math.abs(amount) >= 1000000) {
    const m = (amount / 1000000).toFixed(2).replace(/\.00$/, '');
    return `${m} Triệu ₫`;
  }
  if (Math.abs(amount) >= 1000) {
    const k = (amount / 1000).toFixed(0);
    return `${k}k ₫`;
  }
  return `${amount.toLocaleString('vi-VN')}₫`;
}

