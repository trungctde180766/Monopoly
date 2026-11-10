import React from 'react';
import { TOKENS, BOARD_TILES } from '../data/boardData.js';
import { formatVND } from '../logic/gameEngine.js';

export function BusinessTourCard({
  player,
  playerIndex = 0,
  totalPlayers = 4,
  isActive,
  propertiesState = {},
  onOpenManage,
  onOpenTrade,
  canTrade = true,
}) {
  if (!player) return null;

  const playerColor = player.color || '#3b82f6';
  const tokenData = TOKENS.find((t) => t.id === player.token) || TOKENS[0];
  const ownedTiles = BOARD_TILES.filter((t) => propertiesState[t.id]?.owner === player.id);
  const ownedProps = ownedTiles.map((t) => propertiesState[t.id] || {});
  const tier12Count = ownedProps.filter((p) => p.houses === 1 || p.houses === 2).length;
  const villaCount = ownedProps.filter((p) => p.houses === 3).length;
  const landmarkCount = ownedProps.filter((p) => p.houses === 4).length;

  let isTop = false;
  let isRight = false;
  let positionClass = '';

  if (totalPlayers <= 4) {
    // 2-4 Players: 4 góc chuẩn Business Tour
    if (playerIndex === 0) {
      isTop = false;
      isRight = true;
      positionClass = 'bottom-4 right-4 flex-row-reverse text-right items-end';
    } else if (playerIndex === 1) {
      isTop = true;
      isRight = false;
      positionClass = 'top-16 left-4 items-start'; // Thụt xuống dưới camera controls
    } else if (playerIndex === 2) {
      isTop = true;
      isRight = true;
      positionClass = 'top-4 right-4 flex-row-reverse text-right items-start';
    } else {
      isTop = false;
      isRight = false;
      positionClass = 'bottom-4 left-4 items-end';
    }
  } else {
    // 5-6 Players: Bố trí tránh top-center pill và camera controls
    if (playerIndex === 0) {
      isTop = false;
      isRight = true;
      positionClass = 'bottom-4 right-4 flex-row-reverse text-right items-end';
    } else if (playerIndex === 1) {
      isTop = true;
      isRight = false;
      positionClass = 'top-16 left-4 items-start'; // Thụt xuống dưới camera controls
    } else if (playerIndex === 2) {
      isTop = false;
      isRight = false;
      positionClass = 'top-1/2 -translate-y-1/2 left-4 items-start'; // Sườn trái giữa, tránh top-center
    } else if (playerIndex === 3) {
      isTop = true;
      isRight = true;
      positionClass = 'top-4 right-4 flex-row-reverse text-right items-start';
    } else if (playerIndex === 4) {
      isTop = false;
      isRight = true;
      positionClass = 'top-1/2 -translate-y-1/2 right-4 flex-row-reverse text-right items-end'; // Sườn phải giữa
    } else {
      isTop = false;
      isRight = false;
      positionClass = 'bottom-4 left-4 items-end';
    }
  }

  return (
    <div
      className={`fixed ${positionClass} corner-card-desktop z-30 flex items-start gap-1.5 transition-all duration-300 pointer-events-auto select-none ${
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
          style={{ backgroundColor: playerColor }}
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
            {/* Banner tên người chơi - dùng đúng player.color */}
            <div
              className={`text-white px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-t-xl text-[11px] sm:text-sm font-black tracking-wider uppercase truncate flex items-center gap-1 shadow-inner ${
                isRight ? 'justify-end' : 'justify-start'
              }`}
              style={{ backgroundColor: playerColor }}
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

              {/* Tóm tắt đất & phân bổ công trình chuẩn theo cấp bậc */}
              <div
                className={`flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-slate-500 mt-0.5 flex-wrap ${
                  isRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span>🏰 {ownedTiles.length} Đất</span>
                {tier12Count > 0 && <span>🏡 {tier12Count} Nhà</span>}
                {villaCount > 0 && <span>🏛️ {villaCount} Biệt thự</span>}
                {landmarkCount > 0 && <span className="text-amber-600 font-extrabold">🏨 {landmarkCount} Landmark</span>}
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

              {/* Tóm tắt đất & phân bổ công trình */}
              <div
                className={`flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-slate-500 mt-0.5 flex-wrap ${
                  isRight ? 'justify-end' : 'justify-start'
                }`}
              >
                <span>🏰 {ownedTiles.length} Đất</span>
                {tier12Count > 0 && <span>🏡 {tier12Count} Nhà</span>}
                {villaCount > 0 && <span>🏛️ {villaCount} Biệt thự</span>}
                {landmarkCount > 0 && <span className="text-amber-600 font-extrabold">🏨 {landmarkCount} Landmark</span>}
              </div>
            </div>

            {/* Banner tên người chơi - dùng đúng player.color */}
            <div
              className={`text-white px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-b-xl text-[11px] sm:text-sm font-black tracking-wider uppercase truncate flex items-center gap-1 shadow-inner ${
                isRight ? 'justify-end' : 'justify-start'
              }`}
              style={{ backgroundColor: playerColor }}
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
              onClick={canTrade ? onOpenTrade : undefined}
              disabled={!canTrade}
              title={!canTrade ? 'Chưa thể giao dịch lúc này (cần đến lượt, không nợ tiền, không bận)' : 'Giao dịch đổi đất'}
              className={`flex-1 py-0.5 sm:py-1 px-1.5 rounded-lg text-[9px] sm:text-[10px] font-black border shadow transition ${
                canTrade
                  ? 'bg-white/90 text-sky-800 border-sky-300 hover:bg-sky-50 active:scale-95'
                  : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
              }`}
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
  canTrade = true,
  gameLog = [],
  isLogOpen,
  onToggleLog,
}) {
  const activePlayer = players.find((p) => p.id === activePlayerId) || players[0];
  const activeOwnedTiles = BOARD_TILES.filter((t) => propertiesState[t.id]?.owner === activePlayer?.id);
  const activeToken = TOKENS.find((t) => t.id === activePlayer?.token) || TOKENS[0];

  return (
    <>
      {/* 1. DESKTOP VIEW: BỐ TRÍ 4 HOẶC 6 GÓC AN TOÀN, KHÔNG CHỒNG LÊN TOOLBAR & TOP PILL */}
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
          canTrade={canTrade}
        />
      ))}

      {/* 2. MOBILE VIEW (F03 FIX): THANH THÔNG TIN GỌN GÀNG Ở TRÊN, HOÀN TOÀN GIẢI PHÓNG ĐÁY MÀN HÌNH */}
      <div className="mobile-hud-container">
        {activePlayer && (
          <div className="mobile-active-card">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
              <div
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-sm sm:text-base shrink-0 shadow border border-white"
                style={{ backgroundColor: activePlayer.color || '#3b82f6' }}
              >
                {activeToken.emoji}
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-black text-xs text-slate-900 truncate max-w-[85px] sm:max-w-none">{activePlayer.name}</span>
                  {activePlayer.isBot && <span className="text-[8px] bg-slate-200 px-1 rounded font-bold shrink-0">BOT</span>}
                </div>
                <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-black text-emerald-600 truncate">
                  <span className="shrink-0">🪙 {formatVND(activePlayer.money)}</span>
                  <span className="text-slate-300 font-normal shrink-0">|</span>
                  <span className="text-slate-600 text-[9px] sm:text-[10px] font-bold shrink-0">🏰 {activeOwnedTiles.length} Đất</span>
                </div>
              </div>
            </div>

            {/* Nút hành động nhanh trên mobile nếu là lượt người chơi thật */}
            {!activePlayer.isBot && !activePlayer.isBankrupt && (
              <div className="flex items-center gap-1 shrink-0 ml-1.5">
                <button
                  onClick={onOpenManage}
                  className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-300 shadow-sm hover:bg-amber-100 active:scale-95 whitespace-nowrap"
                >
                  🏛️ Sổ Đỏ
                </button>
                <button
                  onClick={canTrade ? onOpenTrade : undefined}
                  disabled={!canTrade}
                  title={!canTrade ? 'Chưa thể giao dịch lúc này' : 'Giao dịch đổi đất'}
                  className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-black border shadow-sm transition whitespace-nowrap ${
                    canTrade
                      ? 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100 active:scale-95'
                      : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                  }`}
                >
                  🤝 Đổi Đất
                </button>
              </div>
            )}
          </div>
        )}

        {/* Khay danh sách đối thủ thu gọn (Opponents tray) */}
        {players.length > 1 && (
          <div className="mobile-opponents-tray">
            {players
              .filter((p) => p.id !== activePlayerId)
              .map((opp) => {
                const oppToken = TOKENS.find((t) => t.id === opp.token) || TOKENS[0];
                return (
                  <div
                    key={opp.id}
                    className={`mobile-opp-chip ${opp.isBankrupt ? 'opacity-40 grayscale' : ''}`}
                    style={{ borderColor: opp.color || '#64748b' }}
                  >
                    <span>{oppToken.emoji}</span>
                    <span className="max-w-[70px] truncate">{opp.name}</span>
                    <span className="text-amber-300 font-black whitespace-nowrap">{formatVND(opp.money)}</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </>
  );
}
