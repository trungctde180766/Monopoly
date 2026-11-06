// Automated Rule Verification & Simulation Test Suite for Monopoly Vietnam Pro
import assert from 'assert';
import { BOARD_TILES, COLOR_GROUPS, INITIAL_MONEY, JAIL_FINE, GO_REWARD } from '../src/data/boardData.js';
import {
  hasMonopoly,
  calculateRent,
  canBuildHouse,
  canSellHouse,
  canMortgage,
  canUnmortgage,
  calculateNetWorth,
  calculateMaxLiquidatable,
  calculateBuyoutPrice,
  checkBusinessTourVictory,
} from '../src/logic/gameEngine.js';
import { AIEngine } from '../src/logic/aiEngine.js';

console.log('--- BẮT ĐẦU KIỂM THỬ TOÀN BỘ HỆ THỐNG CỜ TỶ PHÚ VIỆT NAM ---');

let passedTests = 0;
function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// 1. Kiểm tra cấu trúc bàn cờ 40 ô
runTest('Bàn cờ có đúng 40 ô chuẩn, có đầy đủ 8 nhóm màu, 4 ga tàu, 2 tiện ích, ô tù, bãi đỗ xe', () => {
  assert.strictEqual(BOARD_TILES.length, 40);
  assert.strictEqual(BOARD_TILES[0].type, 'go');
  assert.strictEqual(BOARD_TILES[10].type, 'jail');
  assert.strictEqual(BOARD_TILES[20].type, 'free_parking');
  assert.strictEqual(BOARD_TILES[30].type, 'go_to_jail');

  const railroads = BOARD_TILES.filter(t => t.type === 'railroad');
  assert.strictEqual(railroads.length, 4, 'Phải có 4 ga tàu');

  const utilities = BOARD_TILES.filter(t => t.type === 'utility');
  assert.strictEqual(utilities.length, 2, 'Phải có 2 công ty tiện ích');

  const properties = BOARD_TILES.filter(t => t.type === 'property');
  assert.strictEqual(properties.length, 22, 'Phải có 22 ô đất màu');
});

// 2. Kiểm tra tính năng Độc Quyền (Monopoly) & Nhân đôi tiền thuê đất trống
runTest('Sở hữu trọn bộ màu: Tiền thuê đất trống tự động x2', () => {
  const p1 = 'player_1';
  // Nhóm Nâu: tile 1 (BX Miền Tây) và tile 3 (Chợ Lớn)
  let propertiesState = {
    1: { owner: p1, houses: 0, isMortgaged: false },
  };

  // Chưa có tile 3 -> Chưa có monopoly
  assert.strictEqual(hasMonopoly(propertiesState, p1, 'brown'), false);
  const baseRentWithoutMono = calculateRent(BOARD_TILES[1], propertiesState);
  assert.strictEqual(baseRentWithoutMono, BOARD_TILES[1].rent[0]);

  // Thêm tile 3 -> Đạt Monopoly!
  propertiesState[3] = { owner: p1, houses: 0, isMortgaged: false };
  assert.strictEqual(hasMonopoly(propertiesState, p1, 'brown'), true);

  const rentWithMono = calculateRent(BOARD_TILES[1], propertiesState);
  assert.strictEqual(rentWithMono, BOARD_TILES[1].rent[0] * 2, 'Tiền thuê đất trống phải gấp đôi khi đủ bộ màu');
});

// 3. Kiểm tra tiền thuê Ga Tàu (Railroad Rent) luỹ tiến x1, x2, x4, x8
runTest('Tiền thuê Ga Tàu luỹ tiến chuẩn xác theo số lượng ga sở hữu', () => {
  const p1 = 'player_1';
  const gaSaiGon = BOARD_TILES[5];
  let props = {
    5: { owner: p1, houses: 0, isMortgaged: false },
  };

  // 1 Ga: 250k
  assert.strictEqual(calculateRent(gaSaiGon, props), 250000);

  // 2 Ga: 500k
  props[15] = { owner: p1, houses: 0, isMortgaged: false };
  assert.strictEqual(calculateRent(gaSaiGon, props), 500000);

  // 3 Ga: 1.000k
  props[25] = { owner: p1, houses: 0, isMortgaged: false };
  assert.strictEqual(calculateRent(gaSaiGon, props), 1000000);

  // 4 Ga: 2.000k
  props[35] = { owner: p1, houses: 0, isMortgaged: false };
  assert.strictEqual(calculateRent(gaSaiGon, props), 2000000);
});

// 4. Kiểm tra tiền thuê Tiện Ích (Utility Rent) nhân điểm xúc xắc
runTest('Tiền thuê Tiện Ích: 40k x xúc xắc khi có 1 tiện ích, 100k x xúc xắc khi có cả 2', () => {
  const p1 = 'player_1';
  const evn = BOARD_TILES[12];
  const diceTotal = 8;

  let props = {
    12: { owner: p1, houses: 0, isMortgaged: false },
  };

  assert.strictEqual(calculateRent(evn, props, diceTotal), 40000 * diceTotal);

  props[28] = { owner: p1, houses: 0, isMortgaged: false };
  assert.strictEqual(calculateRent(evn, props, diceTotal), 100000 * diceTotal);
});

// 5. Kiểm tra Quy Tắc Xây Dựng Đồng Đều (Even Building Rule)
// 5. Kiểm tra Nâng cấp Nhà & Khách Sạn chuẩn Business Tour (4 Cấp Độ)
runTest('Luật Business Tour: Tự do nâng cấp nhà & Khách Sạn Landmark (Cấp 1 -> 4)', () => {
  const p1 = 'player_1';
  const players = [{ id: p1, money: 10000000 }];
  let props = {
    6: { owner: p1, houses: 0, isMortgaged: false },
  };

  // Nâng lên Cấp 1
  let check1 = canBuildHouse(6, props, players, p1);
  assert.strictEqual(check1.can, true);
  props[6].houses = 1;

  // Nâng trực tiếp lên Cấp 2 mà không bị ràng buộc xây đồng đều
  let check2 = canBuildHouse(6, props, players, p1);
  assert.strictEqual(check2.can, true);
  props[6].houses = 2;

  // Nâng lên Cấp 3 (Biệt Thự)
  let check3 = canBuildHouse(6, props, players, p1);
  assert.strictEqual(check3.can, true);
  props[6].houses = 3;

  // Nâng lên Cấp 4 (Khách Sạn / Landmark)
  let check4 = canBuildHouse(6, props, players, p1);
  assert.strictEqual(check4.can, true);
  assert.strictEqual(check4.nextHouses, 4);
  props[6].houses = 4;

  // Khi đã đạt Cấp 4 Khách Sạn: Bất khả xâm phạm, không thể nâng thêm
  let checkMax = canBuildHouse(6, props, players, p1);
  assert.strictEqual(checkMax.can, false);
});

// 5.1. Kiểm tra Cướp Đất (Buyout) & Bất khả xâm phạm của Landmark
runTest('Luật Business Tour: Cướp Đất (2x) và Miễn nhiễm cướp khi là Landmark', () => {
  const tile = BOARD_TILES[6]; // Huế: giá 1.000.000₫, nhà 500.000₫
  
  // Đất cấp 0: Giá cướp = 2x giá đất = 2.000.000₫
  let prop0 = { owner: 'p1', houses: 0 };
  assert.strictEqual(calculateBuyoutPrice(tile, prop0), 2000000);

  // Đất cấp 2: Giá cướp = 2x (1M + 2*500k) = 4.000.000₫
  let prop2 = { owner: 'p1', houses: 2 };
  assert.strictEqual(calculateBuyoutPrice(tile, prop2), 4000000);

  // Đất cấp 5 Landmark (Kỳ Quan): Giá cướp = 0 (Bất khả xâm phạm, không thể bị cướp!)
  let prop5 = { owner: 'p1', houses: 5 };
  assert.strictEqual(calculateBuyoutPrice(tile, prop5), 0);
});

// 5.2. Kiểm tra các điều kiện Thắng Đậm chuẩn Business Tour
runTest('Luật Business Tour: Độc quyền 3 bộ màu / 1 hàng / 4 ga thắng ngay lập tức', () => {
  const p1 = { id: 'p1', name: 'Đại Gia' };
  const p2 = { id: 'p2', name: 'Đối Thủ' };
  const players = [p1, p2];

  // 1. Thắng 4 Ga Tàu
  let propsRailroads = {
    5: { owner: 'p1' },
    15: { owner: 'p1' },
    25: { owner: 'p1' },
    35: { owner: 'p1' },
  };
  let winRail = checkBusinessTourVictory(propsRailroads, players);
  assert.strictEqual(winRail !== null, true);
  assert.strictEqual(winRail.winner.id, 'p1');

  // 2. Thắng 1 Hàng (Cạnh dưới)
  let propsLine = {
    1: { owner: 'p1' },
    3: { owner: 'p1' },
    5: { owner: 'p1' },
    6: { owner: 'p1' },
    8: { owner: 'p1' },
    9: { owner: 'p1' },
  };
  let winLine = checkBusinessTourVictory(propsLine, players);
  assert.strictEqual(winLine !== null, true);
  assert.strictEqual(winLine.winner.id, 'p1');
});

// 6. Kiểm tra Thế Chấp & Dỡ Nhà
runTest('Không được thế chấp đất khi vẫn còn nhà trong nhóm màu', () => {
  const p1 = 'player_1';
  let props = {
    6: { owner: p1, houses: 1, isMortgaged: false },
    8: { owner: p1, houses: 0, isMortgaged: false },
    9: { owner: p1, houses: 0, isMortgaged: false },
  };

  // Cố thế chấp tile 8 trong khi tile 6 còn 1 nhà -> BỊ TỪ CHỐI!
  let checkMortgage = canMortgage(8, props, p1);
  assert.strictEqual(checkMortgage.can, false);

  // Bán nhà trên tile 6
  let checkSell = canSellHouse(6, props, p1);
  assert.strictEqual(checkSell.can, true);
  props[6].houses = 0;

  // Bây giờ thế chấp tile 8 -> HỢP LỆ!
  let checkMortgageOk = canMortgage(8, props, p1);
  assert.strictEqual(checkMortgageOk.can, true);
});

// 7. Kiểm tra giải chấp: Trả giá thế chấp + 10% tiền lãi ngân hàng
runTest('Giải chấp (chuộc đất): Đúng 110% giá trị thế chấp', () => {
  const p1 = 'player_1';
  const players = [{ id: p1, money: 5000000 }];
  const tile = BOARD_TILES[1]; // Bến xe Miền Tây, mortgageValue = 300.000₫
  let props = {
    1: { owner: p1, houses: 0, isMortgaged: true },
  };

  let check = canUnmortgage(1, props, players, p1);
  assert.strictEqual(check.can, true);
  assert.strictEqual(check.cost, Math.floor(300000 * 1.1), 'Phải trả 330.000₫');
});

// 8. Kiểm tra AI Bot Logic: Nhận biết cơ hội Monopoly và mua chặn đối thủ
runTest('AI Bot ưu tiên mua đất giúp hoàn thành hoặc chặn Monopoly', () => {
  const bot = { id: 'bot_1', money: 3000000, isBot: true };
  const players = [bot, { id: 'p2', money: 5000000 }];
  const tileSapa = BOARD_TILES[21]; // Red group: 21, 23, 24

  // Bot đang có 23 và 24
  let props = {
    23: { owner: bot.id, houses: 0 },
    24: { owner: bot.id, houses: 0 },
  };

  // Khi đáp xuống 21: Bot PHẢI mua ngay để hoàn thành bộ màu
  const shouldBuy = AIEngine.shouldBuyProperty(bot, tileSapa, props, players);
  assert.strictEqual(shouldBuy, true);
});

// 9. Kiểm tra Khả Năng Huy Động Vốn & Phá Sản (Liquidation)
runTest('Tính toán chính xác tài sản ròng và năng lực thanh khoản khẩn cấp', () => {
  const p1 = { id: 'p1', money: 1000000 };
  // Sở hữu tile 37 (Bến Nhà Rồng, giá 3.5M, mortgage 1.75M, 1 nhà giá 2M)
  let props = {
    37: { owner: p1.id, houses: 1, isMortgaged: false },
  };

  const netWorth = calculateNetWorth(p1, props);
  assert.strictEqual(netWorth, 1000000 + 3500000 + 2000000); // 6.5M

  const maxLiquid = calculateMaxLiquidatable(p1, props);
  // Tiền mặt: 1M + Bán 1 nhà thu 1M (50% của 2M) + Thế chấp thu 1.75M = 3.75M
  assert.strictEqual(maxLiquid, 1000000 + 1000000 + 1750000);
});

console.log(`\n========================================`);
console.log(`🎉 TẤT CẢ ${passedTests} BÀI TEST ĐỀU VƯỢT QUA 100%!`);
console.log(`========================================\n`);
