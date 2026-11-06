import React from 'react';
import { ShieldAlert, Award, DollarSign, Building2, Home, Landmark, Sparkles } from 'lucide-react';
import { TOKENS, BOARD_TILES } from '../data/boardData.js';
import { formatVND, calculateNetWorth } from '../logic/gameEngine.js';

// Banner màu đặc trưng 4 góc chuẩn Business Tour
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
];

export function BusinessTourCard({
  player,
  cornerIndex = 0, // 0: Top-Left, 1: Top-Right, 2: Bottom-Left, 3: Bottom-Right
  isActive,
  propertiesState = {},
  onOpenManage,
  onOpenTrade,
}) {
  if (!player) return null;

  const theme = CORNER_THEMES[cornerIndex] || CORNER_THEMES[0];
  const tokenData = TOKENS.find((t) => t.id === player.token) || TOKENS[0];
  const netWorth = calculateNetWorth(player, propertiesState);
  const ownedTiles = BOARD_TILES.filter((t) => propertiesState[t.id]?.owner === player.id);
  const totalHouses = ownedTiles.reduce(
    (sum, t) => sum + (propertiesState[t.id]?.houses === 5 ? 0 : propertiesState[t.id]?.houses || 0),
    0
  );
  const totalHotels = ownedTiles.filter((t) => propertiesState[t.id]?.houses === 5).length;

  const isTopLeft = cornerIndex === 0;
  const isTopRight = cornerIndex === 1;
  const isBottomLeft = cornerIndex === 2;
  const isBottomRight = cornerIndex === 3;

  // Căn vị trí cố định ở 4 góc màn hình
  const positionClass = isTopLeft
    ? 'top-3 left-3'
    : isTopRight
    ? 'top-3 right-3 flex-row-reverse text-right'
    : isBottomLeft
    ? 'bottom-3 left-3 items-end'
    : 'bottom-3 right-3 flex-row-reverse text-right items-end';

  return (
    <div
      className={`fixed ${positionClass} z-30 flex items-start gap-1.5 transition-all duration-300 pointer-events-auto select-none ${
        player.isBankrupt ? 'opacity-40 grayscale' : ''
      }`}
    >
      {/* Khung Avatar vuông bo tròn lớn đặc trưng Business Tour */}
      <div className="relative shrink-0">
        <div
          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl shadow-xl border-3 transition-all duration-300 ${
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
      <div className="flex flex-col min-w-[130px] sm:min-w-[170px] shadow-xl relative">
        {/* Con dấu đỏ phá sản BANKRUPT đặc trưng Image 1 */}
        {player.isBankrupt && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="border-3 border-red-600 bg-white/95 text-red-600 font-black text-xs sm:text-sm px-2.5 py-0.5 rounded-lg uppercase tracking-widest transform -rotate-12 shadow-2xl">
              BANKRUPT
            </div>
          </div>
        )}

        {/* TOP CARDS: BANNER TÊN Ở TRÊN, TIỀN Ở DƯỚI */}
        {(isTopLeft || isTopRight) && (
          <>
            {/* Banner tên người chơi */}
            <div
              className={`${theme.bgBanner} text-white px-3 py-1 rounded-t-xl text-xs sm:text-sm font-black tracking-wider uppercase truncate flex items-center gap-1 shadow-inner ${
                isTopRight ? 'justify-end' : 'justify-start'
              }`}
            >
              <span>{player.name}</span>
              {player.isBot && <span className="text-[9px] bg-black/20 px-1 rounded">BOT</span>}
            </div>

            {/* Hộp trắng sứ đựng Tiền mặt & Thống kê chuẩn Business Tour */}
            <div className="bg-white/95 text-slate-900 px-3 py-1.5 rounded-b-xl border-x-2 border-b-2 border-white shadow-xl backdrop-blur-md">
              <div
                className={`flex items-center gap-1.5 font-black text-xs sm:text-base tracking-tight ${
                  isTopRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span className="text-sm">🪙</span>
                <span className={player.money < 1000000 ? 'text-red-600 font-black' : 'text-slate-900 font-black'}>
                  {formatVND(player.money)}
                </span>
              </div>

              {/* Tóm tắt đất & nhà */}
              <div
                className={`flex items-center gap-2 text-[10px] font-bold text-slate-500 mt-0.5 ${
                  isTopRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span>🏰 {ownedTiles.length} Đất</span>
                {totalHouses > 0 && <span>🏠 {totalHouses}</span>}
                {totalHotels > 0 && <span className="text-amber-600">🏨 {totalHotels}</span>}
              </div>
            </div>
          </>
        )}

        {/* BOTTOM CARDS: TIỀN Ở TRÊN, BANNER TÊN Ở DƯỚI */}
        {(isBottomLeft || isBottomRight) && (
          <>
            {/* Hộp trắng sứ đựng Tiền mặt */}
            <div className="bg-white/95 text-slate-900 px-3 py-1.5 rounded-t-xl border-x-2 border-t-2 border-white shadow-xl backdrop-blur-md">
              <div
                className={`flex items-center gap-1.5 font-black text-xs sm:text-base tracking-tight ${
                  isBottomRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span className="text-sm">🪙</span>
                <span className={player.money < 1000000 ? 'text-red-600 font-black' : 'text-slate-900 font-black'}>
                  {formatVND(player.money)}
                </span>
              </div>

              {/* Tóm tắt đất & nhà */}
              <div
                className={`flex items-center gap-2 text-[10px] font-bold text-slate-500 mt-0.5 ${
                  isBottomRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span>🏰 {ownedTiles.length} Đất</span>
                {totalHouses > 0 && <span>🏠 {totalHouses}</span>}
                {totalHotels > 0 && <span className="text-amber-600">🏨 {totalHotels}</span>}
              </div>
            </div>

            {/* Banner tên người chơi */}
            <div
              className={`${theme.bgBanner} text-white px-3 py-1 rounded-b-xl text-xs sm:text-sm font-black tracking-wider uppercase truncate flex items-center gap-1 shadow-inner ${
                isBottomRight ? 'justify-end' : 'justify-start'
              }`}
            >
              <span>{player.name}</span>
              {player.isBot && <span className="text-[9px] bg-black/20 px-1 rounded">BOT</span>}
            </div>
          </>
        )}

        {/* Nút hành động nhanh chỉ hiện trên card của người chơi đang đến lượt */}
        {isActive && !player.isBot && !player.isBankrupt && (
          <div className="mt-1 flex items-center gap-1">
            <button
              onClick={onOpenManage}
              className="flex-1 py-1 px-1.5 rounded-lg text-[10px] font-black bg-white/90 text-amber-800 border border-amber-300 shadow hover:bg-amber-50 transition active:scale-95"
            >
              🏛️ Sổ Đỏ
            </button>
            <button
              onClick={onOpenTrade}
              className="flex-1 py-1 px-1.5 rounded-lg text-[10px] font-black bg-white/90 text-sky-800 border border-sky-300 shadow hover:bg-sky-50 transition active:scale-95"
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
  const p1 = players[0];
  const p2 = players[1];
  const p3 = players[2];
  const p4 = players[3];

  return (
    <>
      {/* GÓC TRÊN - TRÁI (Player 1) */}
      {p1 && (
        <BusinessTourCard
          player={p1}
          cornerIndex={0}
          isActive={p1.id === activePlayerId}
          propertiesState={propertiesState}
          onOpenManage={onOpenManage}
          onOpenTrade={onOpenTrade}
        />
      )}

      {/* GÓC TRÊN - PHẢI (Player 2) */}
      {p2 && (
        <BusinessTourCard
          player={p2}
          cornerIndex={1}
          isActive={p2.id === activePlayerId}
          propertiesState={propertiesState}
          onOpenManage={onOpenManage}
          onOpenTrade={onOpenTrade}
        />
      )}

      {/* GÓC DƯỚI - TRÁI (Player 3) */}
      {p3 && (
        <BusinessTourCard
          player={p3}
          cornerIndex={2}
          isActive={p3.id === activePlayerId}
          propertiesState={propertiesState}
          onOpenManage={onOpenManage}
          onOpenTrade={onOpenTrade}
        />
      )}

      {/* GÓC DƯỚI - PHẢI (Player 4 hoặc Nhật Ký Trận Đấu) */}
      {p4 ? (
        <BusinessTourCard
          player={p4}
          cornerIndex={3}
          isActive={p4.id === activePlayerId}
          propertiesState={propertiesState}
          onOpenManage={onOpenManage}
          onOpenTrade={onOpenTrade}
        />
      ) : (
        <div className="fixed bottom-3 right-3 z-30 w-64 sm:w-72 pointer-events-auto">
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
              {gameLog.slice(0, 10).map((log, idx) => (
                <div
                  key={idx}
                  className={`text-[11px] leading-tight p-1.5 rounded-lg ${
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
