import React from 'react';
import { ShieldAlert, Award, DollarSign, Building2, Home, Landmark, Sparkles } from 'lucide-react';
import { TOKENS, BOARD_TILES } from '../data/boardData.js';
import { formatVND, calculateNetWorth } from '../logic/gameEngine.js';

// Banner màu đặc trưng 6 người chơi chuẩn Business Tour
const CORNER_THEMES = [
  {
    bgBanner: 'bg-[#65a30d]', // Player 1: Xanh lá tươi (Lime Green)
    border: 'border-[#65a30d]',
    shadow: 'shadow-[#65a30d]/40',
    avatarBg: '#4d7c0f',
  },
  {
    bgBanner: 'bg-[#e11d48]', // Player 2: Đỏ hồng cánh sen (Magenta Rose)
    border: 'border-[#e11d48]',
    shadow: 'shadow-[#e11d48]/40',
    avatarBg: '#be123c',
  },
  {
    bgBanner: 'bg-[#ca8a04]', // Player 3: Vàng hoàng gia (Golden Yellow)
    border: 'border-[#ca8a04]',
    shadow: 'shadow-[#ca8a04]/40',
    avatarBg: '#a16207',
  },
  {
    bgBanner: 'bg-[#0284c7]', // Player 4: Xanh ngọc biển (Sky Cyan)
    border: 'border-[#0284c7]',
    shadow: 'shadow-[#0284c7]/40',
    avatarBg: '#0369a1',
  },
  {
    bgBanner: 'bg-[#7c3aed]', // Player 5: Tím hoàng gia (Royal Purple)
    border: 'border-[#7c3aed]',
    shadow: 'shadow-[#7c3aed]/40',
    avatarBg: '#6d28d9',
  },
  {
    bgBanner: 'bg-[#ea580c]', // Player 6: Cam nhiệt đới (Deep Orange)
    border: 'border-[#ea580c]',
    shadow: 'shadow-[#ea580c]/40',
    avatarBg: '#c2410c',
  },
];

export function BusinessTourCard({
  player,
  playerIndex = 0,
  totalPlayers = 4,
  isActive,
  propertiesState = {},
  onOpenManage,
  onOpenTrade,
}) {
  if (!player) return null;

  const theme = CORNER_THEMES[playerIndex % CORNER_THEMES.length];
  const tokenData = TOKENS.find((t) => t.id === player.token) || TOKENS[0];
  const ownedTiles = BOARD_TILES.filter((t) => propertiesState[t.id]?.owner === player.id);
  const totalHouses = ownedTiles.reduce(
    (sum, t) => sum + (propertiesState[t.id]?.houses === 4 ? 0 : propertiesState[t.id]?.houses || 0),
    0
  );
  const totalHotels = ownedTiles.filter((t) => propertiesState[t.id]?.houses === 4).length;

  let isTop = false;
  let isRight = false;
  let positionClass = '';

  if (totalPlayers <= 4) {
    // 2-4 Players: 4 góc chuẩn
    if (playerIndex === 0) {
      isTop = true;
      isRight = false;
      positionClass = 'top-3 left-3';
    } else if (playerIndex === 1) {
      isTop = true;
      isRight = true;
      positionClass = 'top-3 right-3 flex-row-reverse text-right';
    } else if (playerIndex === 2) {
      isTop = false;
      isRight = false;
      positionClass = 'bottom-3 left-3 items-end';
    } else {
      isTop = false;
      isRight = true;
      positionClass = 'bottom-3 right-3 flex-row-reverse text-right items-end';
    }
  } else {
    // 5-6 Players: Bố cục 6 vị trí linh hoạt
    if (playerIndex === 0) {
      isTop = true;
      isRight = false;
      positionClass = 'top-2 left-2';
    } else if (playerIndex === 1) {
      isTop = true;
      isRight = true;
      positionClass = 'top-2 right-2 flex-row-reverse text-right';
    } else if (playerIndex === 2) {
      isTop = true;
      isRight = false;
      positionClass = 'top-[36%] -translate-y-1/2 left-2';
    } else if (playerIndex === 3) {
      isTop = true;
      isRight = true;
      positionClass = 'top-[36%] -translate-y-1/2 right-2 flex-row-reverse text-right';
    } else if (playerIndex === 4) {
      isTop = false;
      isRight = false;
      positionClass = 'bottom-3 left-2 items-end';
    } else {
      isTop = false;
      isRight = true;
      positionClass = 'bottom-3 right-2 flex-row-reverse text-right items-end';
    }
  }

  return (
    <div
      className={`fixed ${positionClass} z-30 flex items-start gap-1.5 transition-all duration-300 pointer-events-auto select-none ${
        player.isBankrupt ? 'opacity-40 grayscale' : ''
      }`}
    >
      {/* Khung Avatar vuông bo tròn lớn đặc trưng Business Tour */}
      <div className="relative shrink-0">
        <div
          className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-2xl sm:text-4xl shadow-xl border-3 transition-all duration-300 ${
            isActive
              ? 'border-amber-300 ring-4 ring-amber-400/60 scale-105 shadow-[0_0_20px_rgba(251,191,36,0.6)]'
              : 'border-white/90 shadow-md'
          }`}
          style={{ backgroundColor: player.color || theme.avatarBg }}
        >
          {tokenData.emoji}
        </div>

        {/* Chấm tròn trạng thái hoạt động */}
        {isActive && !player.isBankrupt && (
          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 border-2 border-white rounded-full animate-ping" />
        )}
      </div>

      {/* Cụm thẻ: Tên (Banner màu) + Tiền mặt (Hộp trắng sứ chuẩn Business Tour) */}
      <div className="flex flex-col min-w-[115px] sm:min-w-[160px] shadow-xl relative">
        {/* Con dấu đỏ phá sản BANKRUPT */}
        {player.isBankrupt && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="border-3 border-red-600 bg-white/95 text-red-600 font-black text-xs sm:text-sm px-2.5 py-0.5 rounded-lg uppercase tracking-widest transform -rotate-12 shadow-2xl">
              BANKRUPT
            </div>
          </div>
        )}

        {/* TOP CARDS: BANNER TÊN Ở TRÊN, TIỀN Ở DƯỚI */}
        {isTop ? (
          <>
            {/* Banner tên người chơi */}
            <div
              className={`${theme.bgBanner} text-white px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-t-xl text-[11px] sm:text-sm font-black tracking-wider uppercase truncate flex items-center gap-1 shadow-inner ${
                isRight ? 'justify-end' : 'justify-start'
              }`}
            >
              <span className="truncate max-w-[95px] sm:max-w-[130px]">{player.name}</span>
              {player.isBot && <span className="text-[8px] sm:text-[9px] bg-black/20 px-1 rounded">BOT</span>}
            </div>

            {/* Hộp trắng sứ đựng Tiền mặt & Thống kê */}
            <div className="bg-white/95 text-slate-900 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-b-xl border-x-2 border-b-2 border-white shadow-xl backdrop-blur-md">
              <div
                className={`flex items-center gap-1 font-black text-xs sm:text-base tracking-tight ${
                  isRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span className="text-xs sm:text-sm">🪙</span>
                <span className={player.money < 1000000 ? 'text-red-600 font-black' : 'text-slate-900 font-black'}>
                  {formatVND(player.money)}
                </span>
              </div>

              {/* Tóm tắt đất & nhà */}
              <div
                className={`flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-slate-500 mt-0.5 ${
                  isRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span>🏰 {ownedTiles.length} Đất</span>
                {totalHouses > 0 && <span>🏠 {totalHouses}</span>}
                {totalHotels > 0 && <span className="text-amber-600">🏨 {totalHotels}</span>}
              </div>
            </div>
          </>
        ) : (
          /* BOTTOM CARDS: TIỀN Ở TRÊN, BANNER TÊN Ở DƯỚI */
          <>
            {/* Hộp trắng sứ đựng Tiền mặt */}
            <div className="bg-white/95 text-slate-900 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-t-xl border-x-2 border-t-2 border-white shadow-xl backdrop-blur-md">
              <div
                className={`flex items-center gap-1 font-black text-xs sm:text-base tracking-tight ${
                  isRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span className="text-xs sm:text-sm">🪙</span>
                <span className={player.money < 1000000 ? 'text-red-600 font-black' : 'text-slate-900 font-black'}>
                  {formatVND(player.money)}
                </span>
              </div>

              {/* Tóm tắt đất & nhà */}
              <div
                className={`flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-slate-500 mt-0.5 ${
                  isRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span>🏰 {ownedTiles.length} Đất</span>
                {totalHouses > 0 && <span>🏠 {totalHouses}</span>}
                {totalHotels > 0 && <span className="text-amber-600">🏨 {totalHotels}</span>}
              </div>
            </div>

            {/* Banner tên người chơi */}
            <div
              className={`${theme.bgBanner} text-white px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-b-xl text-[11px] sm:text-sm font-black tracking-wider uppercase truncate flex items-center gap-1 shadow-inner ${
                isRight ? 'justify-end' : 'justify-start'
              }`}
            >
              <span className="truncate max-w-[95px] sm:max-w-[130px]">{player.name}</span>
              {player.isBot && <span className="text-[8px] sm:text-[9px] bg-black/20 px-1 rounded">BOT</span>}
            </div>
          </>
        )}

        {/* Nút hành động nhanh chỉ hiện trên card của người chơi đang đến lượt */}
        {isActive && !player.isBot && !player.isBankrupt && (
          <div className="mt-1 flex items-center gap-1">
            <button
              onClick={onOpenManage}
              className="flex-1 py-0.5 sm:py-1 px-1.5 rounded-lg text-[9px] sm:text-[10px] font-black bg-white/90 text-amber-800 border border-amber-300 shadow hover:bg-amber-50 transition active:scale-95"
            >
              🏛️ Sổ Đỏ
            </button>
            <button
              onClick={onOpenTrade}
              className="flex-1 py-0.5 sm:py-1 px-1.5 rounded-lg text-[9px] sm:text-[10px] font-black bg-white/90 text-sky-800 border border-sky-300 shadow hover:bg-sky-50 transition active:scale-95"
            >
              🤝 Đổi Đất
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CornerHUD({
  players = [],
  activePlayerId,
  propertiesState = {},
  onOpenManage,
  onOpenTrade,
  gameLog = [],
  isLogOpen,
  onToggleLog,
}) {
  return (
    <>
      {/* RENDER TOÀN BỘ NGƯỜI CHƠI (TỪ 2 ĐẾN 6 NGƯỜI CHƠI) */}
      {players.map((player, idx) => (
        <BusinessTourCard
          key={player.id}
          player={player}
          playerIndex={idx}
          totalPlayers={players.length}
          isActive={player.id === activePlayerId}
          propertiesState={propertiesState}
          onOpenManage={onOpenManage}
          onOpenTrade={onOpenTrade}
        />
      ))}

      {/* NHẬT KÝ TRẬN ĐẤU (NẾU ÍT HƠN 4 NGƯỜI CHƠI, GẮN CỐ ĐỊNH Ở GÓC PHẢI DƯỚI) */}
      {players.length <= 3 && (
        <div className="fixed bottom-3 right-3 z-30 w-60 sm:w-72 pointer-events-auto hidden md:block">
          <div className="bg-slate-900/90 backdrop-blur-xl border-2 border-slate-700/80 rounded-2xl p-2.5 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
              <span className="text-[11px] font-black text-amber-400 uppercase tracking-wide flex items-center gap-1">
                📜 Nhật Ký Trận Đấu
              </span>
              <button
                onClick={onToggleLog}
                className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800"
              >
                {isLogOpen ? 'Thu gọn' : 'Mở rộng'}
              </button>
            </div>
            <div className={`overflow-y-auto space-y-1 pr-1 ${isLogOpen ? 'max-h-56' : 'max-h-20'}`}>
              {gameLog.slice(0, 8).map((log, idx) => (
                <div
                  key={idx}
                  className={`text-[10px] leading-tight p-1.5 rounded-lg ${
                    idx === 0
                      ? 'bg-amber-500/15 text-amber-200 font-bold border border-amber-500/30'
                      : 'text-slate-300 bg-slate-950/60'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
