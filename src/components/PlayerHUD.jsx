import React from 'react';
import { ShieldAlert, Award, DollarSign, Home, Building2, User } from 'lucide-react';
import { TOKENS, BOARD_TILES } from '../data/boardData.js';
import { formatVND, calculateNetWorth } from '../logic/gameEngine.js';

export default function PlayerHUD({
  players = [],
  activePlayerId,
  propertiesState = {},
  onOpenManage,
  onOpenTrade,
}) {
  return (
    <div className="w-full grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3 p-2">
      {players.map((player) => {
        const isActive = player.id === activePlayerId;
        const tokenData = TOKENS.find((t) => t.id === player.token) || TOKENS[0];
        const netWorth = calculateNetWorth(player, propertiesState);
        const ownedTiles = BOARD_TILES.filter((t) => propertiesState[t.id]?.owner === player.id);
        const totalHouses = ownedTiles.reduce(
          (sum, t) => sum + (propertiesState[t.id]?.houses || 0),
          0
        );

        return (
          <div
            key={player.id}
            className={`relative rounded-2xl p-2.5 md:p-3 transition-all duration-300 border ${
              player.isBankrupt
                ? 'bg-slate-950/60 border-slate-800 opacity-40'
                : isActive
                ? 'bg-gradient-to-b from-slate-850 to-slate-900 border-amber-400 shadow-glow-gold scale-[1.02]'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
            }`}
          >
            {/* Lượt đi hiện tại */}
            {isActive && !player.isBankrupt && (
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-amber-500 text-slate-950 text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow tracking-wider animate-pulse whitespace-nowrap">
                Lượt Của Bạn
              </div>
            )}

            {/* Header người chơi */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-sm md:text-base shrink-0 border border-white/20 shadow"
                style={{ backgroundColor: player.color }}
              >
                {tokenData.emoji}
              </div>
              <div className="overflow-hidden flex-1">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-xs md:text-sm text-white truncate">
                    {player.name}
                  </span>
                  {player.isBot && (
                    <span className="text-[9px] font-bold px-1 rounded bg-slate-800 text-amber-400 shrink-0">
                      BOT
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  {player.isBankrupt ? (
                    <span className="text-red-400 font-bold uppercase">Phá Sản</span>
                  ) : player.inJail ? (
                    <span className="text-red-400 font-semibold flex items-center gap-0.5">
                      <ShieldAlert size={10} /> Trong Tù ({player.jailTurns}/3)
                    </span>
                  ) : (
                    <span>Bình thường</span>
                  )}
                </div>
              </div>
            </div>

            {/* Số dư tiền mặt & Tài sản ròng */}
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                  <DollarSign size={12} className="text-emerald-400" /> Tiền mặt:
                </span>
                <span className="font-black text-emerald-400">
                  {formatVND(player.money)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Award size={12} className="text-amber-400" /> Tổng TS:
                </span>
                <span className="font-semibold text-slate-300">
                  {formatVND(netWorth)}
                </span>
              </div>
            </div>

            {/* Tài sản sở hữu */}
            <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <Building2 size={11} className="text-sky-400" /> {ownedTiles.length} Đất
              </span>
              <span className="flex items-center gap-1">
                <Home size={11} className="text-emerald-400" /> {totalHouses} Nhà
              </span>
            </div>

            {/* Nút hành động nhanh cho người chơi đang đến lượt */}
            {isActive && !player.isBankrupt && !player.isBot && (
              <div className="grid grid-cols-2 gap-1 mt-2.5">
                <button
                  type="button"
                  onClick={() => onOpenManage && onOpenManage(player)}
                  className="py-1 px-1.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-center transition"
                >
                  Sổ Đỏ
                </button>
                <button
                  type="button"
                  onClick={() => onOpenTrade && onOpenTrade(player)}
                  className="py-1 px-1.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 text-center transition"
                >
                  Thương Lượng
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

