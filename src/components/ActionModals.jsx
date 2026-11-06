import React, { useState, useEffect } from 'react';
import { Home, Hotel, ShieldAlert, Sparkles, Gavel, DollarSign, ArrowLeftRight, Check, X, AlertTriangle, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BOARD_TILES, COLOR_GROUPS, JAIL_FINE } from '../data/boardData.js';
import { formatVND, calculateBuildTierCost, validateBuildAction, canBuildHouse, canSellHouse, canMortgage, canUnmortgage, calculateNetWorth } from '../logic/gameEngine.js';
import { soundFX } from '../utils/soundFx.js';

// 1. MODAL XÂY DỰNG 4 CẤP ĐỘ NHÀ CHUẨN BUSINESS TOUR (MULTI-TIER BUILD MODAL)
export function BusinessTourBuildModal({
  tile,
  player,
  propState = null,
  currentHouses: explicitHouses,
  isNewPurchase: explicitIsNew,
  onConfirmBuild,
  onAuction,
  onClose,
}) {
  if (!tile || !player) return null;

  const currentHouses = explicitHouses !== undefined ? explicitHouses : (propState?.houses || 0);
  const isNewPurchase = explicitIsNew !== undefined ? explicitIsNew : (!propState || !propState.owner);
  const group = tile.group ? COLOR_GROUPS[tile.group.toUpperCase()] : null;

  // F12: Nếu là Ga Tàu hoặc Tiện Ích, hiển thị giao diện mua tài sản chuyên biệt
  if (tile.type !== 'property') {
    const isRailroad = tile.type === 'railroad';
    const canAffordSimple = player.money >= tile.price;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
        <div className="relative w-full max-w-md bg-slate-900 border-2 border-amber-400 rounded-3xl p-6 shadow-2xl text-slate-100">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                {isRailroad ? 'CƠ HỘI ĐẦU TƯ GA TÀU' : 'CƠ HỘI ĐẦU TƯ TIỆN ÍCH'}
              </span>
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                <span>{tile.name}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full text-white font-bold bg-sky-600">
                  {isRailroad ? 'Bến Xe / Ga Tàu' : 'Công Ty Tiện Ích'}
                </span>
              </h2>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase text-slate-400 block font-bold">Số dư</span>
              <span className="text-base font-black text-emerald-400">{formatVND(player.money)}</span>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 mb-5">
            <div className="text-xs text-slate-300 mb-2">
              {isRailroad ? (
                <>
                  <p className="font-bold text-amber-300 mb-1">Quy tắc thu tiền vé Ga Tàu:</p>
                  <p className="text-[11px] text-slate-400">1 Ga: 250k • 2 Ga: 500k • 3 Ga: 1.0M • 4 Ga: 2.0M</p>
                  <p className="text-[10px] text-amber-400 mt-1 font-bold">⭐ Sở hữu toàn bộ 4 Ga tàu sẽ THẮNG NGAY LẬP TỨC!</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-amber-300 mb-1">Quy tắc thu tiền Tiện Ích EVN:</p>
                  <p className="text-[11px] text-slate-400">1 Tiện Ích: 40.000₫ × Điểm xúc xắc</p>
                  <p className="text-[11px] text-slate-400">Cả 2 Tiện Ích: 100.000₫ × Điểm xúc xắc</p>
                </>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Giá mua:</span>
              <span className="text-xl font-black text-amber-400">{formatVND(tile.price)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!canAffordSimple}
              onClick={() => {
                soundFX.playBuyProperty();
                onConfirmBuild(1, tile.price);
              }}
              className={`py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${
                canAffordSimple
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 shadow-glow-gold hover:brightness-110'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <span>{canAffordSimple ? 'Xác Nhận Mua' : 'Không Đủ Tiền'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="py-3.5 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <X size={16} />
              <span>Bỏ Qua (Không Mua)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // H01 Fix: Gate Landmark - Chỉ mở khi đã sở hữu đất ở cấp 3 và ghé lại ô
  const landmarkCheck = validateBuildAction(tile.id, 4, { [tile.id]: propState }, [player], player.id);
  const isLandmarkLocked = !landmarkCheck.can && landmarkCheck.reasonCode !== 'funds';

  // 4 Cấp độ công trình Business Tour
  const tiers = [
    {
      level: 1,
      title: 'Nhà Cấp 1',
      subtitle: 'Nhà 1 tầng mái dốc',
      icon: '🏡',
      rent: tile.rent ? (tile.rent[1] || tile.rent[0] * 2) : 0,
      cost: isNewPurchase
        ? tile.price
        : (1 - currentHouses > 0 ? (1 - currentHouses) * tile.housePrice : 0),
    },
    {
      level: 2,
      title: 'Nhà Cấp 2',
      subtitle: 'Nhà 2 tầng kiên cố',
      icon: '🏘️',
      rent: tile.rent ? (tile.rent[2] || tile.rent[0] * 4) : 0,
      cost: isNewPurchase
        ? tile.price + tile.housePrice
        : (2 - currentHouses > 0 ? (2 - currentHouses) * tile.housePrice : 0),
    },
    {
      level: 3,
      title: 'Biệt Thự',
      subtitle: 'Biệt thự 3 tầng cao cấp',
      icon: '🏛️',
      rent: tile.rent ? (tile.rent[3] || tile.rent[0] * 8) : 0,
      cost: isNewPurchase
        ? tile.price + tile.housePrice * 2
        : (3 - currentHouses > 0 ? (3 - currentHouses) * tile.housePrice : 0),
    },
    {
      level: 4,
      title: 'Khách Sạn (Landmark)',
      subtitle: isLandmarkLocked ? landmarkCheck.reason : 'Kỳ quan bất khả xâm phạm',
      icon: isLandmarkLocked ? '🔒' : '🏰',
      isLandmark: true,
      isLocked: isLandmarkLocked,
      lockReason: isNewPurchase ? 'Cần sở hữu Biệt thự (Cấp 3) trước' : 'Cần đạt Cấp 3 trước',
      rent: tile.rent ? (tile.rent[4] || tile.rent[0] * 15) : 0,
      cost: isNewPurchase
        ? tile.price + tile.housePrice * 3
        : (4 - currentHouses > 0 ? (4 - currentHouses) * tile.housePrice : 0),
    },
  ].map(tier => {
    const check = validateBuildAction(tile.id, tier.level, { [tile.id]: propState }, [player], player.id);
    return {
      ...tier,
      cost: calculateBuildTierCost(tile, currentHouses, tier.level, isNewPurchase),
      isLocked: !check.can && check.reasonCode !== 'funds',
      lockReason: check.reason,
    };
  });

  // Lựa chọn các cấp độ khả dụng: không thể chọn cấp đã xây hoặc bị khóa (H01 Fix)
  const availableTiers = tiers.filter((t) => t.level > currentHouses && !t.isLocked);
  // Mặc định chọn cấp độ cơ bản kế tiếp thay vì nhảy cóc lên cấp đắt nhất
  const defaultTier = availableTiers[0] || tiers[0];
  const [selectedTier, setSelectedTier] = useState(defaultTier ? defaultTier.level : 1);

  const activeTierObj = tiers.find((t) => t.level === selectedTier) || tiers[0];
  const canAfford = player.money >= activeTierObj.cost && activeTierObj.cost > 0 && !activeTierObj.isLocked;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl bg-slate-900 border-2 border-amber-400 rounded-3xl p-6 shadow-2xl text-slate-100">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
              {isNewPurchase ? 'CƠ HỘI ĐẦU TƯ BẤT ĐỘNG SẢN' : 'NÂNG CẤP BẤT ĐỘNG SẢN CỦA BẠN'}
            </span>
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <span>{tile.name}</span>
              {group && (
                <span className="text-xs px-2.5 py-0.5 rounded-full text-white font-bold" style={{ backgroundColor: group.color }}>
                  {group.name}
                </span>
              )}
            </h2>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase text-slate-400 block font-bold">Số dư của bạn</span>
            <span className="text-base font-black text-emerald-400">{formatVND(player.money)}</span>
          </div>
        </div>

        {/* LỰA CHỌN 4 CẤP BẬC CÔNG TRÌNH CHUẨN BUSINESS TOUR */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          {tiers.map((t) => {
            const isAlreadyBuilt = currentHouses >= t.level;
            const isLocked = t.isLocked;
            const isDisabled = isAlreadyBuilt || isLocked;
            const isSelected = selectedTier === t.level;
            const affordable = player.money >= t.cost;

            return (
              <button
                key={t.level}
                type="button"
                disabled={isDisabled}
                onClick={() => !isLocked && setSelectedTier(t.level)}
                className={`p-3 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between min-h-[145px] ${
                  isAlreadyBuilt
                    ? 'opacity-40 bg-slate-950 border-slate-800 cursor-not-allowed'
                    : isLocked
                    ? 'opacity-50 bg-slate-950/60 border-slate-800/80 cursor-not-allowed'
                    : isSelected
                    ? 'bg-amber-500/15 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)] scale-102 ring-2 ring-amber-400/50'
                    : affordable
                    ? 'bg-slate-950/80 border-slate-700/80 hover:border-amber-400/60'
                    : 'bg-slate-950/40 border-slate-800/80 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-2xl">{t.icon}</span>
                    {t.isLocked ? (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-red-950 text-red-300 border border-red-800 rounded">
                        KHÓA
                      </span>
                    ) : t.isLandmark ? (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-amber-500 text-slate-950 rounded">
                        MAX
                      </span>
                    ) : null}
                  </div>
                  <div className="font-black text-xs text-white leading-tight">{t.title}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{t.subtitle}</div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800">
                  <div className="text-[10px] text-slate-400">Tiền thuê:</div>
                  <div className="text-xs font-bold text-emerald-400">{formatVND(t.rent)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Chi phí:</div>
                  <div className="text-xs font-black text-amber-300">
                    {isAlreadyBuilt ? 'Đã xây' : isLocked ? 'Chưa mở' : formatVND(t.cost)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* THÔNG TIN CHI PHÍ & HUY HIỆU LANDMARK BẤT KHẢ XÂM PHẠM */}
        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 mb-5 flex items-center justify-between text-xs">
          <div>
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>Đã chọn:</span>
              <strong className="text-amber-400 text-sm">{activeTierObj.title}</strong>
              {activeTierObj.isLandmark && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center gap-1">
                  🛡️ BẤT KHẢ XÂM PHẠM (Không thể cướp hay phá hủy)
                </span>
              )}
            </div>
            <div className="text-slate-400 mt-0.5">
              Số dư còn lại:{' '}
              <span className={player.money - activeTierObj.cost < 0 ? 'text-red-400 font-bold' : 'text-slate-200'}>
                {formatVND(player.money - activeTierObj.cost)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase text-slate-400 block font-bold">Tổng thanh toán</span>
            <span className="text-xl font-black text-amber-400">{formatVND(activeTierObj.cost)}</span>
          </div>
        </div>

        {/* CÁC NÚT HÀNH ĐỘNG */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!canAfford}
            onClick={() => {
              soundFX.playBuildHouse();
              onConfirmBuild(activeTierObj.level, activeTierObj.cost);
            }}
            className={`py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${
              canAfford
                ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 shadow-glow-gold hover:brightness-110'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <span>🏗️</span>
            <span>{canAfford ? `Xác Nhận Xây (${activeTierObj.title})` : 'Không Đủ Tiền'}</span>
          </button>

          {isNewPurchase ? (
            <button
              type="button"
              onClick={onClose}
              className="py-3.5 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <X size={16} />
              <span>Bỏ Qua (Không Mua)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="py-3.5 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <X size={16} />
              <span>Bỏ Qua (Không Xây)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 1.5. MODAL CƯỚP ĐẤT (BUYOUT MODAL) CHUẨN BUSINESS TOUR
export function BuyoutModal({ tile, owner, player, buyoutPrice, onBuyout, onSkip }) {
  if (!tile || !owner || !player) return null;
  const canAfford = player.money >= buyoutPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border-2 border-red-500 rounded-3xl p-6 shadow-glow-crimson text-slate-100">
        <div className="text-center mb-4">
          <div className="inline-block p-3 rounded-2xl bg-red-500/20 text-red-400 mb-2 border border-red-500/40">
            <span className="text-3xl">⚔️</span>
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-red-400 block">
            CƠ HỘI CƯỚP ĐẤT (BUYOUT)
          </span>
          <h2 className="text-xl font-black text-white mt-1">
            Bạn vừa đáp xuống <span className="text-amber-400">{tile.name}</span> của {owner.name}!
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Khu đất này chưa lên Khách Sạn (Landmark)! Luật Business Tour cho phép bạn chi <strong>gấp 2 lần giá trị</strong> để cướp đứt ngay lập tức!
          </p>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 mb-5 space-y-2 text-sm">
          <div className="flex justify-between items-center py-1 border-b border-slate-800">
            <span className="text-slate-400">Giá cướp đất (2x):</span>
            <span className="text-lg font-black text-amber-400">{formatVND(buyoutPrice)}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-slate-800">
            <span className="text-slate-400">Số dư hiện tại của bạn:</span>
            <span className="font-bold text-emerald-400">{formatVND(player.money)}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-slate-400">Số dư sau khi cướp:</span>
            <span className={`font-bold ${player.money - buyoutPrice < 0 ? 'text-red-400' : 'text-slate-200'}`}>
              {formatVND(player.money - buyoutPrice)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!canAfford}
            onClick={onBuyout}
            className={`py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition active:scale-95 ${
              canAfford
                ? 'bg-gradient-to-r from-red-600 via-rose-500 to-amber-600 hover:brightness-110 text-white shadow-glow-crimson'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <span>⚔️ Cướp Đất (2x)</span>
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
          >
            <span>Bỏ Qua</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// 1.7. MODAL ĐĂNG CAI LỄ HỘI / WORLD CHAMPIONSHIP CHUẨN BUSINESS TOUR
export function FestivalModal({ player, ownedTiles = [], onSelectCity, onClose }) {
  if (!player) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-yellow-400 rounded-3xl p-6 shadow-glow-gold text-slate-100">
        <div className="text-center mb-5">
          <div className="w-14 h-14 mx-auto mb-2 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40 text-3xl shadow-lg animate-bounce">
            🎪
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-amber-400">
            LỄ HỘI THẾ GIỚI (WORLD CHAMPIONSHIPS / JOUST)
          </span>
          <h2 className="text-2xl font-black text-white mt-1 drop-shadow">
            Đăng Cai Lễ Hội (Nhân Đôi Tiền Thuê x2)!
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Chọn 1 thành phố của bạn để tổ chức Lễ Hội. Thành phố đăng cai sẽ được <strong>tăng gấp đôi tiền thuê (x2)</strong> vĩnh viễn!
          </p>
        </div>

        {ownedTiles.length === 0 ? (
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-center mb-5">
            <p className="text-xs text-slate-400">
              Bạn chưa sở hữu thành phố nào để đăng cai Lễ hội! Nhận quà tài trợ cổ vũ <strong>500.000₫</strong> từ ban tổ chức!
            </p>
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-2 mb-5 pr-1">
            {ownedTiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => onSelectCity(tile.id)}
                className="w-full p-3 rounded-2xl bg-slate-950/80 hover:bg-amber-500/15 border border-slate-800 hover:border-amber-400 text-left transition flex items-center justify-between group active:scale-98"
              >
                <div>
                  <div className="font-bold text-sm text-white group-hover:text-amber-300">
                    {tile.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Cấp công trình: {tile.houses === 4 ? 'Khách Sạn' : `Nhà Cấp ${tile.houses || 1}`}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-amber-400 block font-bold">Sau lễ hội:</span>
                  <span className="text-xs font-black text-emerald-400">x2 Tiền Thuê 🔥</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
        >
          {ownedTiles.length === 0 ? 'Nhận Quà & Tiếp Tục' : 'Đóng'}
        </button>
      </div>
    </div>
  );
}

// 2. MODAL ĐẤU GIÁ (AUCTION MODAL)
export function AuctionModal({ tile, players, auctionState, onPlaceBid, onPass }) {
  if (!tile || !auctionState) return null;
  const currentBidder = players.find(p => p.id === auctionState.highestBidderId);
  const activeBidder = players.find(p => p.id === auctionState.currentTurnPlayerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-amber-500 rounded-3xl p-6 shadow-glow-gold text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <Gavel size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">SÀN ĐẤU GIÁ TỰ DO</h2>
              <p className="text-xs text-slate-400">Tài sản: <strong className="text-amber-400">{tile.name}</strong></p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Giá khởi điểm</span>
            <div className="text-sm font-bold text-slate-300">{formatVND(tile.price)}</div>
          </div>
        </div>

        {/* Khối giá cao nhất hiện tại */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-amber-500/30 text-center mb-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Giá Đang Trả Cao Nhất
          </span>
          <div className="text-3xl md:text-4xl font-black text-amber-400 my-1 drop-shadow">
            {formatVND(auctionState.currentBid)}
          </div>
          <div className="text-xs text-slate-300">
            Bởi:{' '}
            {currentBidder ? (
              <span className="font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                {currentBidder.name}
              </span>
            ) : (
              <span className="text-slate-500 italic">Chưa có ai trả giá</span>
            )}
          </div>
        </div>

        {/* Lượt trả giá hiện tại */}
        {activeBidder && (
          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-3.5 h-3.5 rounded-full ring-2 ring-white/50"
                style={{ backgroundColor: activeBidder.color }}
              />
              <span className="text-xs text-slate-300">Đang đến lượt trả giá:</span>
              <strong className="text-sm text-white">{activeBidder.name}</strong>
              {activeBidder.isBot && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-amber-400">BOT</span>}
            </div>
            <div className="text-xs font-bold text-emerald-400">
              Ví: {formatVND(activeBidder.money)}
            </div>
          </div>
        )}

        {/* Nút trả giá cho người chơi thực */}
        {activeBidder && !activeBidder.isBot ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[100000, 500000, 1000000].map((inc) => {
                const nextVal = auctionState.currentBid + inc;
                const canAfford = activeBidder.money >= nextVal;
                return (
                  <button
                    key={inc}
                    type="button"
                    disabled={!canAfford}
                    onClick={() => {
                      soundFX.playGavel();
                      onPlaceBid(nextVal);
                    }}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition active:scale-95 ${
                      canAfford
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/50'
                        : 'bg-slate-800 text-slate-600 border-slate-800 cursor-not-allowed'
                    }`}
                  >
                    +{formatVND(inc)}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onPass}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
            >
              Rút lui (Bỏ qua đấu giá)
            </button>
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-slate-400 italic">
            Đang chờ đối thủ suy nghĩ mức giá...
          </div>
        )}
      </div>
    </div>
  );
}

// 3. MODAL THẺ CƠ HỘI / KHÍ VẬN (CARD MODAL 3D HOLOGRAPHIC)
export function CardModal({ card, type, onClose }) {
  if (!card) return null;
  const isChance = type === 'chance';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className={`relative w-full max-w-sm rounded-3xl p-6 shadow-2xl text-slate-100 border-2 transform transition-all hover:scale-105 duration-300 ${
        isChance
          ? 'bg-gradient-to-b from-orange-950 via-slate-900 to-slate-950 border-orange-400 shadow-glow-gold'
          : 'bg-gradient-to-b from-sky-950 via-slate-900 to-slate-950 border-sky-400 shadow-glow-cyan'
      }`}>
        {/* Lớp phản quang Hologram */}
        <div className="absolute inset-0 rounded-3xl holo-card-shine pointer-events-none opacity-40" />

        <div className="text-center mb-4 relative z-10">
          <div className="inline-flex p-3 rounded-2xl bg-white/10 mb-2 shadow-inner">
            <Sparkles size={32} className={isChance ? 'text-amber-400 animate-spin' : 'text-sky-400 animate-pulse'} />
          </div>
          <span className={`text-[12px] font-black uppercase tracking-widest ${isChance ? 'text-amber-400' : 'text-sky-400'}`}>
            {isChance ? 'THẺ CƠ HỘI ĐẶC BIỆT' : 'THẺ KHÍ VẬN HOÀNG GIA'}
          </span>
          <h3 className="text-2xl font-black text-white mt-1 drop-shadow-md">{card.title}</h3>
        </div>

        <div className="bg-slate-950/90 p-4 rounded-2xl border border-white/15 text-center mb-6 min-h-[96px] flex items-center justify-center relative z-10 shadow-inner">
          <p className="text-sm font-semibold text-slate-100 leading-relaxed">
            {card.desc}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            soundFX.playCardDraw();
            onClose();
          }}
          className={`relative z-10 w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider text-slate-950 transition active:scale-95 shadow-lg ${
            isChance
              ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-400 hover:brightness-110 shadow-glow-gold'
              : 'bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400 hover:brightness-110 shadow-glow-cyan'
          }`}
        >
          Xác Nhận & Tiếp Tục
        </button>
      </div>
    </div>
  );
}

// 4. MODAL NHÀ TÙ (JAIL MODAL)
export function JailModal({ player, onPayFine, onRollDoubles, onUseCard }) {
  if (!player) return null;
  const canAffordFine = player.money >= JAIL_FINE;
  const hasCard = player.outOfJailCards > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border-2 border-red-500/70 rounded-3xl p-6 shadow-2xl text-slate-100">
        <div className="text-center mb-5">
          <div className="inline-flex p-3 rounded-2xl bg-red-500/20 text-red-400 mb-2 border border-red-500/40">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-2xl font-black text-white">BẠN ĐANG Ở TRONG TÙ</h2>
          <p className="text-xs text-slate-400 mt-1">
            Đã thụ án: <strong className="text-amber-400">{player.jailTurns || 0}/3 lượt</strong>
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {/* Nộp phạt 500k */}
          <button
            type="button"
            disabled={!canAffordFine}
            onClick={() => {
              soundFX.playCollectMoney();
              onPayFine();
            }}
            className={`w-full p-3.5 rounded-xl border flex items-center justify-between text-left transition ${
              canAffordFine
                ? 'bg-slate-800/90 hover:bg-slate-800 border-emerald-500/40 hover:border-emerald-400'
                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            <div>
              <div className="font-bold text-sm text-slate-100">Nộp tiền bảo lãnh ra tù</div>
              <div className="text-xs text-slate-400">Trả {formatVND(JAIL_FINE)} và được xúc xắc đi ngay</div>
            </div>
            <span className="font-black text-emerald-400 text-sm">
              {formatVND(JAIL_FINE)}
            </span>
          </button>

          {/* Dùng Thẻ Ra Tù Miễn Phí */}
          <button
            type="button"
            disabled={!hasCard}
            onClick={() => {
              soundFX.playCollectMoney();
              onUseCard();
            }}
            className={`w-full p-3.5 rounded-xl border flex items-center justify-between text-left transition ${
              hasCard
                ? 'bg-amber-950/40 hover:bg-amber-900/40 border-amber-500/60'
                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            <div>
              <div className="font-bold text-sm text-amber-300">Dùng Thẻ Miễn Vào Tù</div>
              <div className="text-xs text-slate-400">Bạn đang sở hữu {player.outOfJailCards || 0} thẻ đặc xá</div>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded bg-amber-500/20 text-amber-400">
              Miễn Phí
            </span>
          </button>

          {/* Thử vận may đổ xúc xắc đôi */}
          <button
            type="button"
            onClick={onRollDoubles}
            className="w-full p-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 flex items-center justify-between text-left transition"
          >
            <div>
              <div className="font-bold text-sm text-sky-400">Thử vận may đổ xúc xắc đôi</div>
              <div className="text-xs text-slate-400">Nếu đổ 2 viên bằng nhau, bạn được tự do ngay!</div>
            </div>
            <span className="text-lg">🎲🎲</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// 5. MODAL QUẢN LÝ BẤT ĐỘNG SẢN & THẾ CHẤP (MANAGE PROPERTIES MODAL)
export function ManagePropertiesModal({ player, players, propertiesState, onBuildHouse, onSellHouse, onMortgage, onUnmortgage, onClose }) {
  if (!player) return null;

  const playerProperties = BOARD_TILES.filter(t => propertiesState[t.id]?.owner === player.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 shadow-2xl text-slate-100 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div>
            <h2 className="text-xl font-black text-white">SỔ TÀI SẢN & ĐẦU TƯ</h2>
            <p className="text-xs text-slate-400">
              Chủ sở hữu: <strong className="text-amber-400">{player.name}</strong> • Số dư ví: <strong className="text-emerald-400">{formatVND(player.money)}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Danh sách bất động sản */}
        <div className="overflow-y-auto space-y-3 pr-1 flex-1">
          {playerProperties.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              Bạn chưa sở hữu bất động sản nào. Hãy tiếp tục di chuyển và mua đất!
            </div>
          ) : (
            playerProperties.map((tile) => {
              const prop = propertiesState[tile.id] || {};
              const group = tile.group ? COLOR_GROUPS[tile.group.toUpperCase()] : null;
              const houses = prop.houses || 0;
              const isMort = prop.isMortgaged;

              const buildCheck = canBuildHouse(tile.id, propertiesState, players, player.id);
              const sellCheck = canSellHouse(tile.id, propertiesState, player.id);
              const mortCheck = canMortgage(tile.id, propertiesState, player.id);
              const unmortCheck = canUnmortgage(tile.id, propertiesState, players, player.id);

              return (
                <div
                  key={tile.id}
                  className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3.5 h-10 rounded-md"
                      style={{ backgroundColor: group?.color || '#64748b' }}
                    />
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-2">
                        {tile.name}
                        {isMort && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
                            Đang Thế Chấp
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {tile.type === 'property' ? (
                          <span>
                            {houses >= 4 ? '🏰 1 Khách Sạn (Landmark)' : houses > 0 ? `🟢 Nhà Cấp ${houses}` : 'Đất Trống'}
                          </span>
                        ) : (
                          <span>Tài sản tiện ích/bến bãi</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cụm nút hành động */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                    {/* Nút xây nhà */}
                    {tile.type === 'property' && (
                      <button
                        type="button"
                        disabled={!buildCheck.can}
                        title={buildCheck.reason}
                        onClick={() => {
                          soundFX.playBuildHouse();
                          onBuildHouse(tile.id);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                          buildCheck.can
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        <Home size={14} /> +Xây ({formatVND(tile.housePrice)})
                      </button>
                    )}

                    {/* Nút bán nhà */}
                    {tile.type === 'property' && houses > 0 && (
                      <button
                        type="button"
                        disabled={!sellCheck.can}
                        title={sellCheck.reason}
                        onClick={() => onSellHouse(tile.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-900/60 hover:bg-amber-800/80 text-amber-300 border border-amber-700/60"
                      >
                        -Bán Nhà (+{formatVND(sellCheck.refund || 0)})
                      </button>
                    )}

                    {/* Nút thế chấp */}
                    {!isMort ? (
                      <button
                        type="button"
                        disabled={!mortCheck.can}
                        title={mortCheck.reason}
                        onClick={() => onMortgage(tile.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          mortCheck.can
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600'
                            : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                        }`}
                      >
                        Thế Chấp (+{formatVND(tile.mortgageValue)})
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!unmortCheck.can}
                        title={unmortCheck.reason}
                        onClick={() => onUnmortgage(tile.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          unmortCheck.can
                            ? 'bg-cyan-700 hover:bg-cyan-600 text-white'
                            : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                        }`}
                      >
                        Chuộc Đất (-{formatVND(unmortCheck.cost || 0)})
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// 6. MODAL THƯƠNG LƯỢNG & TRAO ĐỔI (TRADE MODAL)
export function TradeModal({ activePlayer, players, propertiesState, onSendTrade, onClose }) {
  if (!activePlayer) return null;
  const opponents = players.filter(p => p.id !== activePlayer.id && !p.isBankrupt);
  const [targetId, setTargetId] = useState(opponents[0]?.id || null);

  const [myCash, setMyCash] = useState(0);
  const [myTileIds, setMyTileIds] = useState([]);
  const [theirCash, setTheirCash] = useState(0);
  const [theirTileIds, setTheirTileIds] = useState([]);

  const targetPlayer = opponents.find(p => p.id === targetId);

  const myProperties = BOARD_TILES.filter(t => propertiesState[t.id]?.owner === activePlayer.id);
  const theirProperties = targetPlayer ? BOARD_TILES.filter(t => propertiesState[t.id]?.owner === targetPlayer.id) : [];

  const handleToggleMyTile = (id) => {
    setMyTileIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleToggleTheirTile = (id) => {
    setTheirTileIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePropose = () => {
    onSendTrade({
      senderId: activePlayer.id,
      targetId,
      offerMoney: Number(myCash) || 0,
      offerTiles: myTileIds,
      demandMoney: Number(theirCash) || 0,
      demandTiles: theirTileIds,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-slate-900 border-2 border-amber-500 rounded-3xl p-6 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="text-amber-400" size={24} />
            <h2 className="text-xl font-black text-white">ĐÀM PHÁN THƯƠNG MẠI</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Chọn đối thủ thương lượng */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 uppercase font-bold block mb-1">
            Chọn đối thủ muốn trao đổi:
          </label>
          <div className="flex flex-wrap gap-2">
            {opponents.map((opp) => (
              <button
                key={opp.id}
                type="button"
                onClick={() => {
                  setTargetId(opp.id);
                  setTheirTileIds([]);
                  setTheirCash(0);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                  targetId === opp.id
                    ? 'bg-amber-500 text-slate-950 shadow-glow-gold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: opp.color }} />
                {opp.name} ({formatVND(opp.money)})
              </button>
            ))}
          </div>
        </div>

        {/* 2 Cột trao đổi */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto pr-1">
          {/* Cột Bạn Đưa Ra */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <h3 className="font-bold text-sm text-emerald-400 mb-2">
              Bạn đưa ra ({activePlayer.name})
            </h3>
            <div className="mb-3">
              <label className="text-xs text-slate-400 block mb-1">Tiền mặt các thêm (VNĐ):</label>
              <input
                type="number"
                min="0"
                max={activePlayer.money}
                step="100000"
                value={myCash}
                onChange={(e) => setMyCash(Math.min(activePlayer.money, Math.max(0, Number(e.target.value))))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs text-slate-400 block">Chọn sổ đỏ đưa ra:</span>
              {myProperties.map(t => (
                <label
                  key={t.id}
                  className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border ${
                    myTileIds.includes(t.id) ? 'bg-emerald-950/60 border-emerald-500' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={myTileIds.includes(t.id)}
                    onChange={() => handleToggleMyTile(t.id)}
                    className="accent-emerald-500"
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Cột Bạn Yêu Cầu Nhận Lại */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <h3 className="font-bold text-sm text-amber-400 mb-2">
              Bạn muốn nhận lại từ {targetPlayer?.name}
            </h3>
            <div className="mb-3">
              <label className="text-xs text-slate-400 block mb-1">Tiền mặt đòi thêm (VNĐ):</label>
              <input
                type="number"
                min="0"
                max={targetPlayer?.money || 0}
                step="100000"
                value={theirCash}
                onChange={(e) => setTheirCash(Math.min(targetPlayer?.money || 0, Math.max(0, Number(e.target.value))))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs text-slate-400 block">Chọn sổ đỏ muốn lấy:</span>
              {theirProperties.map(t => (
                <label
                  key={t.id}
                  className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border ${
                    theirTileIds.includes(t.id) ? 'bg-amber-950/60 border-amber-500' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={theirTileIds.includes(t.id)}
                    onChange={() => handleToggleTheirTile(t.id)}
                    className="accent-amber-500"
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Nút gửi đề xuất */}
        <div className="pt-4 border-t border-slate-800 mt-4">
          <button
            type="button"
            onClick={handlePropose}
            className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 hover:brightness-110 shadow-glow-gold active:scale-95 transition"
          >
            Gửi Lời Đề Nghị Giao Dịch
          </button>
        </div>
      </div>
    </div>
  );
}

// 6.5. MODAL XÁC NHẬN GIAO DỊCH (TRADE CONFIRM MODAL - F02 FIX)
export function TradeConfirmModal({ offer, players, propertiesState, onAccept, onReject }) {
  if (!offer) return null;
  const sender = players.find((p) => p.id === offer.senderId);
  const target = players.find((p) => p.id === offer.targetId);
  if (!sender || !target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-amber-400 rounded-3xl p-6 shadow-glow-gold text-slate-100 flex flex-col">
        <div className="text-center mb-4">
          <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40 text-2xl">
            🤝
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-amber-400">
            LỜI ĐỀ NGHỊ GIAO DỊCH TỪ ĐỐI THỦ
          </span>
          <h2 className="text-xl font-black text-white mt-1">
            {sender.name} muốn trao đổi tài sản với bạn ({target.name})!
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5 text-xs">
          {/* Đối phương đưa bạn */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-emerald-500/40">
            <span className="font-black text-emerald-400 block mb-1.5 uppercase tracking-wide">
              🎁 Bạn sẽ nhận được:
            </span>
            {offer.offerMoney > 0 && (
              <div className="text-sm font-black text-emerald-300 mb-1">
                + {formatVND(offer.offerMoney)}
              </div>
            )}
            {offer.offerTiles.length > 0 ? (
              <div className="space-y-1">
                {offer.offerTiles.map((id) => (
                  <div key={id} className="p-1.5 rounded-lg bg-slate-900 text-slate-200 font-bold border border-slate-800">
                    📜 {BOARD_TILES[id]?.name}
                  </div>
                ))}
              </div>
            ) : offer.offerMoney === 0 ? (
              <span className="text-slate-500 italic">Không có tài sản kèm theo</span>
            ) : null}
          </div>

          {/* Bạn phải đưa đối phương */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-rose-500/40">
            <span className="font-black text-rose-400 block mb-1.5 uppercase tracking-wide">
              📤 Bạn phải chuyển nhượng:
            </span>
            {offer.demandMoney > 0 && (
              <div className="text-sm font-black text-rose-300 mb-1">
                - {formatVND(offer.demandMoney)}
              </div>
            )}
            {offer.demandTiles.length > 0 ? (
              <div className="space-y-1">
                {offer.demandTiles.map((id) => (
                  <div key={id} className="p-1.5 rounded-lg bg-slate-900 text-slate-200 font-bold border border-slate-800">
                    📜 {BOARD_TILES[id]?.name}
                  </div>
                ))}
              </div>
            ) : offer.demandMoney === 0 ? (
              <span className="text-slate-500 italic">Không đòi hỏi tài sản</span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:brightness-110 active:scale-95 transition"
          >
            ✅ Đồng Ý Giao Dịch
          </button>
          <button
            type="button"
            onClick={onReject}
            className="py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 active:scale-95 transition"
          >
            ❌ Từ Chối
          </button>
        </div>
      </div>
    </div>
  );
}

// 7. MODAL MÀN HÌNH CHIẾN THẮNG (VICTORY MODAL)
export function VictoryModal({ winner, onRestart }) {
  if (!winner) return null;

  useEffect(() => {
    soundFX.playVictory();
    const duration = 4 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
      });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg animate-fadeIn">
      <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-2 border-amber-400 rounded-3xl p-8 shadow-glow-gold text-slate-100 text-center">
        <div className="inline-flex p-4 rounded-3xl bg-amber-500/20 text-amber-400 mb-4 border border-amber-500/50 shadow-glow-gold">
          <Trophy size={48} />
        </div>
        <span className="text-xs uppercase font-black tracking-widest text-amber-400 block mb-1">
          QUÁN QUÂN CỜ TỶ PHÚ VIỆT NAM
        </span>
        <h1 className="text-3xl font-black text-white drop-shadow-md mb-2">
          {winner.name}
        </h1>
        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          {winner.winReason || 'Đã xuất sắc thâu tóm toàn bộ bất động sản đắt giá nhất và đánh bại mọi đối thủ trên bàn cờ!'}
        </p>

        <button
          type="button"
          onClick={onRestart}
          className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 hover:brightness-110 shadow-glow-gold active:scale-95 transition"
        >
          Chơi Ván Mới
        </button>
      </div>
    </div>
  );
}

