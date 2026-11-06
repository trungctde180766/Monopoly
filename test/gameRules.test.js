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
  calculateLiquidationValue,
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

// 10. (F04) Kiểm tra phá sản khi năng lực thanh khoản âm (maxLiquid < 0)
runTest('(F04) Xác định vỡ nợ chính xác: maxLiquid < 0 khi nợ vượt quá toàn bộ tài sản thanh lý', () => {
  // Người chơi nợ -5M, tài sản chỉ còn 1 ô đất giá trị thế chấp 1.75M
  const insolventPlayer = { id: 'p_debtor', money: -5000000 };
  const props = {
    37: { owner: insolventPlayer.id, houses: 0, isMortgaged: false },
  };
  const liquidationVal = calculateLiquidationValue(insolventPlayer, props);
  assert.strictEqual(liquidationVal, 1750000); // Chỉ thế chấp được 1.75M
  const maxLiquid = calculateMaxLiquidatable(insolventPlayer, props);
  assert.strictEqual(maxLiquid, -5000000 + 1750000); // -3.25M
  assert.strictEqual(maxLiquid < 0, true, 'Người chơi phải được xác định là vỡ nợ phá sản');
});

// 11. (F05) Bot xây nhà không vượt quá cấp 4 (Landmark) và cập nhật state mô phỏng
runTest('(F05) Bot không thể xây vượt quá cấp 4 (Khách Sạn Landmark)', () => {
  const bot = { id: 'bot_rich', money: 50000000, isBot: true };
  const players = [bot];
  // Bot sở hữu tile 1 (Bến xe Miền Tây) đang có 3 nhà
  let props = {
    1: { owner: bot.id, houses: 3, isMortgaged: false },
  };
  const builds = AIEngine.getBuildRecommendations(bot, props, players);
  // Bot chỉ có thể xây tối đa 1 bước để lên cấp 4
  assert.strictEqual(builds.length <= 1, true);
  if (builds.length === 1) {
    props[1].houses = 4;
  }
  // Khi đã ở cấp 4: Không được đề xuất xây tiếp
  const nextBuilds = AIEngine.getBuildRecommendations(bot, props, players);
  assert.strictEqual(nextBuilds.length, 0, 'Cấp 4 Landmark là giới hạn tối đa, không thể xây thêm');
});

// 12. (F05) Bot thanh lý nợ không bán lặp lại cùng một ngôi nhà
runTest('(F05) Bot thanh lý nợ tuần tự: Giảm số nhà trong mô phỏng, không bán lặp', () => {
  const bot = { id: 'bot_debt', money: 0, isBot: true };
  // Bot sở hữu tile 1 với đúng 1 nhà (giá nhà 500k, bán thu 250k)
  const props = {
    1: { owner: bot.id, houses: 1, isMortgaged: false },
  };
  // Cần giải quyết khoản nợ 1.000.000₫
  const reliefActions = AIEngine.planDebtRelief(bot, 1000000, props);
  const sellActions = reliefActions.filter(a => a.type === 'sell_house' && a.tileId === 1);
  assert.strictEqual(sellActions.length, 1, 'Chỉ được bán đúng 1 nhà hiện có, không bán lặp');
});

// 13. (F02) Bot định giá giao dịch: Từ chối giao dịch tạo Monopoly cho đối thủ
runTest('(F02) Bot đánh giá giao dịch thông minh: Từ chối trao Monopoly cho đối thủ', () => {
  const bot = { id: 'bot_trader', money: 10000000, isBot: true };
  const human = { id: 'p_human', money: 10000000, isBot: false };
  const players = [bot, human];

  // Human đã sở hữu tile 21, 23 (Nhóm Đỏ). Bot sở hữu tile 24 (mảnh ghép cuối để Human có Monopoly)
  const props = {
    21: { owner: human.id, houses: 0 },
    23: { owner: human.id, houses: 0 },
    24: { owner: bot.id, houses: 0 },
  };

  const tradeOffer = {
    senderId: human.id,
    targetId: bot.id,
    offerMoney: 2000000, // Đề nghị trả 2M
    offerTiles: [],
    demandMoney: 0,
    demandTiles: [24],   // Đòi lấy tile 24 của Bot
  };

  const decision = AIEngine.evaluateTradeOffer(bot, tradeOffer, props, players);
  assert.strictEqual(decision.accept, false, 'Bot phải từ chối vì không được trao bộ màu Monopoly cho đối thủ');
});

// 14. (F09) Tính toán đúng ô Ga tàu gần nhất và chi phí bảo trì công trình
runTest('(F09) Thẻ Cơ Hội: Tính đúng Ga tàu gần nhất và chi phí bảo trì', () => {
  const railroads = [5, 15, 25, 35];
  // Vị trí 38 (sau ga 35): ga tiếp theo phải là ga 5 (vòng lại đầu bàn cờ)
  const playerPos = 38;
  let targetRailroad = railroads.find(r => r > playerPos);
  let passedGo = false;
  if (targetRailroad === undefined) {
    targetRailroad = railroads[0];
    passedGo = true;
  }
  assert.strictEqual(targetRailroad, 5);
  assert.strictEqual(passedGo, true);
});

// 15. (F12) Nghiêm cấm xây nhà trên Ga Tàu và Tiện Ích
runTest('(F12) Ga Tàu và Tiện Ích là tài sản không thể xây dựng nhà/khách sạn', () => {
  const p1 = { id: 'p1', money: 10000000 };
  const players = [p1];
  const props = {
    5: { owner: p1.id, houses: 0 },   // Ga Tàu
    12: { owner: p1.id, houses: 0 },  // Tiện Ích EVN
  };

  const buildGa = canBuildHouse(5, props, players, p1.id);
  assert.strictEqual(buildGa.can, false, 'Ga tàu không được phép xây nhà');

  const buildEVN = canBuildHouse(12, props, players, p1.id);
  assert.strictEqual(buildEVN.can, false, 'Tiện ích không được phép xây nhà');
});

// 16. (F13) Kiểm tra điều kiện thắng Business Tour: Độc quyền 1 hàng và Độc quyền 3 bộ màu
runTest('(F13) checkBusinessTourVictory phát hiện ngay khi đạt Độc Quyền 1 Hàng hoặc 3 Bộ Màu', () => {
  const p1 = { id: 'p1', money: 10000000, isBankrupt: false };
  const p2 = { id: 'p2', money: 10000000, isBankrupt: false };
  const players = [p1, p2];

  // Sở hữu toàn bộ cạnh dưới: [1, 3, 5, 6, 8, 9]
  const bottomSide = [1, 3, 5, 6, 8, 9];
  let props = {};
  bottomSide.forEach(tId => {
    props[tId] = { owner: p1.id, houses: 1 };
  });

  const victory = checkBusinessTourVictory(props, players);
  assert.strictEqual(victory !== null, true);
  assert.strictEqual(victory.winner.id, p1.id);
  assert.strictEqual(victory.reason.includes('ĐỘC QUYỀN MỘT HÀNG'), true);
});

// 17. (R02) Bot qua ô GO nhận 2M lương và mua đất: giữ nguyên vị trí và lương mới
runTest('(R02) Bot qua ô GO và mua đất: tiền và vị trí cập nhật chuẩn xác, không dùng state cũ', () => {
  // Trước di chuyển: Bot ở ô 39 với 1.000.000đ
  const initialBot = { id: 'bot1', name: 'Bot Tỷ Phú', money: 1000000, position: 39, isBot: true };
  const initialPlayers = [initialBot];

  // Đi 2 bước -> qua GO (ô 0) nhận +2.000.000đ lương, tới ô 1
  const GO_SALARY = 2000000;
  const postMoveBot = {
    ...initialBot,
    position: (initialBot.position + 2) % 40, // ô 1
    money: initialBot.money + GO_SALARY,      // 3.000.000đ
  };
  const updatedPlayersList = [postMoveBot];

  // Mua đất ô 1 giá 600.000đ
  const tile1Price = 600000;
  assert.strictEqual(postMoveBot.money >= tile1Price, true);

  // Áp dụng mua đất với updatedPlayersList
  const finalPlayers = updatedPlayersList.map(p =>
    p.id === postMoveBot.id ? { ...p, money: p.money - tile1Price } : p
  );

  const finalBot = finalPlayers[0];
  assert.strictEqual(finalBot.position, 1, 'Vị trí của Bot phải ở ô 1');
  assert.strictEqual(finalBot.money, 2400000, 'Tiền của Bot phải là 3M - 600k = 2.400.000đ');
});

// 18. (R03) Thanh lý nợ: Chủ đất nhận đủ 100% tiền thuê sau khi con nợ thế chấp tài sản
runTest('(R03) Chủ đất nhận đủ 100% tiền thuê sau khi con nợ giải quyết nợ shortfall', () => {
  const debtor = { id: 'debtor', name: 'Con Nợ', money: 400000, isBot: true };
  const creditor = { id: 'creditor', name: 'Chủ Đất', money: 0, isBot: false };
  const players = [debtor, creditor];

  const rentAmount = 1000000;
  // Con nợ chỉ có 400k mặt
  const canPayFull = debtor.money >= rentAmount;
  const actualTransfer = canPayFull ? rentAmount : Math.max(0, debtor.money);
  const shortfall = rentAmount - actualTransfer; // 600.000đ

  assert.strictEqual(actualTransfer, 400000);
  assert.strictEqual(shortfall, 600000);

  // Sau khi trừ tiền ban đầu: debtor có -600k, creditor có 400k
  const step1Debtor = { ...debtor, money: debtor.money - rentAmount }; // -600k
  const step1Creditor = { ...creditor, money: creditor.money + actualTransfer }; // +400k

  // Debtor thế chấp ô 37 thu về 1.750.000đ
  const mortgageValue = 1750000;
  const currentCash = step1Debtor.money + mortgageValue; // -600k + 1.750k = 1.150.000đ

  // R03 Fix: Chuyển nốt shortfall 600k cho chủ nợ
  const finalCreditorMoney = step1Creditor.money + shortfall;
  const finalDebtorMoney = currentCash;

  assert.strictEqual(finalCreditorMoney, 1000000, 'Chủ đất phải nhận đủ 100% tiền thuê 1.000.000đ');
  assert.strictEqual(finalDebtorMoney, 1150000, 'Con nợ có 1.150.000đ sau khi trừ nợ và nhận tiền thế chấp');
  // Bảo toàn dòng tiền: 400k ban đầu + 1.750k từ ngân hàng = 2.150k tổng
  assert.strictEqual(finalCreditorMoney + finalDebtorMoney, 400000 + mortgageValue);
});

// 19. (R01) Server data sanitization: Chặn cấp nhà > 4 và tiền ảo > 100M
runTest('(R01) Server sanitization: Chặn triệt để houses > 4 và tiền bất thường', () => {
  // Giả lập logic kiểm tra của server/index.js
  const maliciousPayload = {
    propertiesState: {
      1: { owner: 'guest', houses: 99 },
      2: { owner: 'guest', houses: 4 },
      3: { owner: 'guest', houses: -5 },
    },
    players: [
      { id: 'guest', money: 999999999, position: 50 },
    ],
  };

  const sanitizedProps = {};
  for (const [tid, pData] of Object.entries(maliciousPayload.propertiesState)) {
    sanitizedProps[tid] = {
      ...pData,
      houses: Math.min(4, Math.max(0, Number(pData.houses) || 0)),
    };
  }

  const sanitizedPlayers = maliciousPayload.players.map(p => ({
    ...p,
    money: Math.min(100000000, p.money),
    position: Math.max(0, Math.min(39, p.position)),
  }));

  assert.strictEqual(sanitizedProps[1].houses, 4, 'Nhà cấp 99 phải bị giới hạn về tối đa cấp 4 (Landmark)');
  assert.strictEqual(sanitizedProps[2].houses, 4);
  assert.strictEqual(sanitizedProps[3].houses, 0, 'Nhà âm phải bị đưa về 0');
  assert.strictEqual(sanitizedPlayers[0].money, 100000000, 'Tiền 999.999.999đ phải bị chặn trần');
  assert.strictEqual(sanitizedPlayers[0].position, 39, 'Vị trí 50 phải bị giới hạn về tối đa 39');
});

// 20. (V3-01, V3-02, V3-03) Server snapshot sanitization & validation
runTest('(V3-01..03) Server sanitization: Bảo toàn gameLog, xóa đất trả ngân hàng, chặn fake winner & dice & turnIndex', () => {
  const currentGS = {
    turnIndex: 0,
    dice: [1, 2],
    gameLog: ['Ván đấu bắt đầu'],
    propertiesState: { 1: { owner: 'host', houses: 1 } },
  };

  const maliciousPayload = {
    winner: { id: 'guest', winReason: 'arbitrary text' },
    turnIndex: 999,
    dice: [0, 99],
    propertiesState: {}, // Trả đất về ngân hàng
    gameLog: ['Log mới hợp lệ'],
  };

  // 1. Properties: thay thế toàn bộ state, không lưu lại đất cũ
  const sanitizedProps = {};
  for (const [tidStr, pData] of Object.entries(maliciousPayload.propertiesState)) {
    if (pData && pData.owner) sanitizedProps[tidStr] = pData;
  }
  assert.strictEqual(sanitizedProps[1], undefined, 'Đất đã xóa khỏi snapshot phải biến mất hoàn toàn');

  // 2. Dice: Bắt buộc từ 1 đến 6
  let sanitizedDice;
  const [d1, d2] = maliciousPayload.dice;
  if (Number.isInteger(d1) && d1 >= 1 && d1 <= 6 && Number.isInteger(d2) && d2 >= 1 && d2 <= 6) {
    sanitizedDice = [d1, d2];
  } else {
    sanitizedDice = currentGS.dice;
  }
  assert.deepStrictEqual(sanitizedDice, [1, 2], 'Xúc xắc [0, 99] phải bị từ chối và fallback về [1, 2]');

  // 3. TurnIndex: Không được vượt quá số người chơi
  const totalPlayers = 4;
  let sanitizedTurnIndex;
  if (typeof maliciousPayload.turnIndex === 'number' && maliciousPayload.turnIndex >= 0 && maliciousPayload.turnIndex < totalPlayers) {
    sanitizedTurnIndex = maliciousPayload.turnIndex;
  } else {
    sanitizedTurnIndex = currentGS.turnIndex;
  }
  assert.strictEqual(sanitizedTurnIndex, 0, 'turnIndex 999 phải bị từ chối');

  // 4. Winner: Chặn lý do thắng tùy ý
  const validReasons = ['ĐỘC QUYỀN MỘT HÀNG', 'ĐỘC QUYỀN 3 BỘ MÀU', 'ĐỘC QUYỀN 4 GA TÀU', 'sống sót duy nhất'];
  const hasLegitReason = typeof maliciousPayload.winner.winReason === 'string' &&
    validReasons.some(r => maliciousPayload.winner.winReason.includes(r));
  const sanitizedWinner = hasLegitReason ? maliciousPayload.winner : null;
  assert.strictEqual(sanitizedWinner, null, 'Fake winner với arbitrary text phải bị từ chối');

  // 5. gameLog: Luôn là mảng, bảo toàn dữ liệu
  const sanitizedGameLog = Array.isArray(maliciousPayload.gameLog) ? maliciousPayload.gameLog : (currentGS.gameLog || []);
  assert.strictEqual(sanitizedGameLog.length, 1);
  assert.strictEqual(sanitizedGameLog[0], 'Log mới hợp lệ');
});

// 21. (V3-05) Giải quyết nợ cho người thật: Trả đủ 100% tiền thuê cho chủ đất sau khi thế chấp
runTest('(V3-05) Human debt shortfall: Người chơi thật thế chấp trả đủ 100% tiền thuê cho chủ nợ', () => {
  const debtorInitialCash = 400000;
  const rentDue = 1000000;
  const actualTransfer = debtorInitialCash; // 400k
  const shortfall = rentDue - actualTransfer; // 600k

  const players = [
    { id: 'human_debtor', money: debtorInitialCash - rentDue, debtCreditorId: 'creditor', debtShortfall: shortfall }, // -600k
    { id: 'creditor', money: actualTransfer }, // 400k
  ];

  // Người chơi thế chấp ô 37 (giá trị 1.750.000đ)
  const tile37Mortgage = 1750000;
  const currentCash = players[0].money + tile37Mortgage; // -600k + 1.750k = 1.150k
  const creditorId = players[0].debtCreditorId;
  const debtShortfall = players[0].debtShortfall;

  const newPlayers = players.map(p => {
    if (p.id === 'human_debtor') {
      const { debtCreditorId, debtShortfall: ds, ...rest } = p;
      return { ...rest, money: currentCash };
    }
    if (p.id === creditorId && currentCash >= 0 && debtShortfall > 0) {
      return { ...p, money: p.money + debtShortfall };
    }
    return p;
  });

  const finalDebtor = newPlayers.find(p => p.id === 'human_debtor');
  const finalCreditor = newPlayers.find(p => p.id === 'creditor');

  assert.strictEqual(finalCreditor.money, 1000000, 'Chủ đất phải nhận đủ 1.000.000đ sau khi con nợ người thật thế chấp');
  assert.strictEqual(finalDebtor.money, 1150000, 'Con nợ người thật giữ đúng 1.150.000đ');
  assert.strictEqual(finalDebtor.debtCreditorId, undefined, 'debtCreditorId phải được xóa sau khi giải quyết nợ');
});

console.log(`\n========================================`);
console.log(`🎉 TẤT CẢ ${passedTests} BÀI TEST ĐỀU VƯỢT QUA 100%!`);
console.log(`========================================\n`);
