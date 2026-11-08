import React from 'react';
import { Home, Hotel, ShieldAlert, Sparkles, AlertCircle, Coins, Train, Zap, Droplet } from 'lucide-react';
import { BOARD_TILES, COLOR_GROUPS, TOKENS } from '../data/boardData.js';
import { calculateRent, formatVND } from '../logic/gameEngine.js';
import { getBuildingLabel } from '../logic/gamePresentation.js';

// Tọa độ lưới 11x11 cho 40 ô
function getGridPosition(tileId) {
  if (tileId >= 0 && tileId <= 10) {
    // Hàng dưới cùng: từ tile 10 (col 1) đến tile 0 (col 11)
    return { row: 11, col: 11 - tileId };
  } else if (tileId > 10 && tileId <= 20) {
    // Cột bên trái: từ tile 11 (row 10) đến tile 20 (row 1)
    return { row: 21 - tileId, col: 1 };
  } else if (tileId > 20 && tileId <= 30) {
    // Hàng trên cùng: từ tile 21 (col 2) đến tile 30 (col 11)
    return { row: 1, col: tileId - 19 };
  } else {
    // Cột bên phải: từ tile 31 (row 2) đến tile 39 (row 10)
    return { row: tileId - 29, col: 11 };
  }
}

export default function Board({
  propertiesState = {},
  players = [],
  activePlayerId,
  freeParkingPool = 0,
  dice = [1, 1],
  onTileClick,
  centerContent,
}) {
  return (
    <div className="relative w-full max-w-[850px] aspect-square mx-auto p-2 md:p-3 rounded-3xl bg-slate-950 border-4 border-amber-500/40 shadow-board select-none">
      {/* Lưới 11x11 chuẩn bàn cờ Monopoly */}
      <div className="grid grid-cols-11 grid-rows-11 w-full h-full gap-1 p-1 bg-slate-900 rounded-2xl border border-slate-800">
        {/* VÙNG TRUNG TÂM (9x9) */}
        <div
          className="col-start-2 col-end-11 row-start-2 row-end-11 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800/80 p-3 md:p-6 flex flex-col justify-between items-center relative overflow-hidden shadow-inner"
        >
          {centerContent}
        </div>

        {/* 40 Ô BÀN CỜ */}
        {BOARD_TILES.map((tile) => {
          const { row, col } = getGridPosition(tile.id);
          const prop = propertiesState[tile.id] || {};
          const owner = players.find((p) => p.id === prop.owner);
          const group = tile.group ? COLOR_GROUPS[tile.group.toUpperCase()] : null;
          const isCorner = tile.id % 10 === 0;
          const playersHere = players.filter((p) => !p.isBankrupt && p.position === tile.id);

          return (
            <div
              key={tile.id}
              onClick={() => onTileClick && onTileClick(tile)}
              style={{ gridRow: row, gridColumn: col }}
              className={`relative flex flex-col justify-between rounded-md p-0.5 md:p-1 cursor-pointer transition-all duration-200 overflow-hidden ${
                isCorner
                  ? 'bg-slate-950 border border-amber-500/40 shadow'
                  : 'bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-amber-400/60 shadow-sm'
              }`}
            >
              {/* Dải màu bất động sản */}
              {group && (
                <div
                  className="w-full h-1.5 md:h-2.5 rounded-t-sm shrink-0"
                  style={{ backgroundColor: group.color }}
                />
              )}

              {/* Thông tin nhà / khách sạn */}
              {prop.houses > 0 && (
                <div className="absolute top-1 left-0 right-0 flex items-center justify-center gap-0.5 z-10">
                  {prop.houses >= 4 ? (
                    <span className="p-0.5 rounded bg-amber-500 text-slate-950 shadow-sm animate-pulse" title="Khách Sạn (Landmark)">
                      <Hotel size={10} />
                    </span>
                  ) : (
                    <span className="p-0.5 rounded bg-emerald-500 text-slate-950 shadow-sm flex items-center gap-0.5" title={getBuildingLabel(prop.houses)}>
                      <Home size={8} /><small>{prop.houses}</small>
                    </span>
                  )}
                </div>
              )}

              {/* Tên ô đất */}
              <div className="flex-1 flex flex-col items-center justify-center text-center px-0.5 py-0.5">
                {tile.type === 'railroad' && <Train size={12} className="text-slate-400 mb-0.5 hidden md:block" />}
                {tile.type === 'utility' && (
                  tile.id === 12 ? <Zap size={12} className="text-amber-400 mb-0.5 hidden md:block" /> : <Droplet size={12} className="text-sky-400 mb-0.5 hidden md:block" />
                )}
                {tile.type === 'chance' && <Sparkles size={12} className="text-orange-400 mb-0.5 hidden md:block" />}
                {tile.type === 'community_chest' && <Coins size={12} className="text-sky-400 mb-0.5 hidden md:block" />}
                {tile.type === 'jail' && <ShieldAlert size={14} className="text-red-400 mb-0.5" />}

                <span className="text-[7px] md:text-[9px] font-bold text-slate-200 line-clamp-2 leading-tight">
                  {tile.shortName || tile.name}
                </span>

                {/* Giá tiền */}
                {tile.price && (
                  <span className="text-[6px] md:text-[8px] font-extrabold text-amber-400 mt-0.5">
                    {formatVND(owner ? calculateRent(tile, propertiesState, dice[0] + dice[1]) : tile.price)}
                  </span>
                )}
                {tile.taxAmount && (
                  <span className="text-[6px] md:text-[8px] font-extrabold text-red-400 mt-0.5">
                    -{formatVND(tile.taxAmount)}
                  </span>
                )}
              </div>

              {/* Huy hiệu chủ sở hữu */}
              {owner && (
                <div
                  className="w-full h-1 md:h-1.5 rounded-b-sm shrink-0 shadow"
                  style={{ backgroundColor: owner.color }}
                  title={`Chủ sở hữu: ${owner.name}`}
                />
              )}

              {/* Huy hiệu Thế Chấp */}
              {prop.isMortgaged && (
                <div className="absolute inset-0 bg-red-950/80 flex items-center justify-center z-10 backdrop-blur-[1px]">
                  <span className="text-[7px] md:text-[8px] font-black uppercase text-red-400 rotate-[-25deg] border border-red-500 px-0.5 py-0.2 rounded">
                    Thế Chấp
                  </span>
                </div>
              )}

              {/* QUÂN CỜ NGƯỜI CHƠI ĐANG ĐỨNG TẠI Ô NÀY */}
              {playersHere.length > 0 && (
                <div className="absolute inset-0 flex items-center justify-center gap-0.5 z-20 pointer-events-none">
                  {playersHere.map((p) => {
                    const tokenData = TOKENS.find((t) => t.id === p.token) || TOKENS[0];
                    const isActive = p.id === activePlayerId;
                    return (
                      <div
                        key={p.id}
                        className={`relative w-4 h-4 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] md:text-sm font-black shadow-lg transform transition-transform ${
                          isActive ? 'scale-125 z-30 animate-bounce' : 'scale-100 z-20'
                        }`}
                        style={{
                          backgroundColor: p.color,
                          boxShadow: isActive ? '0 0 10px rgba(234, 179, 8, 0.9)' : undefined,
                        }}
                        title={`${p.name} (${tokenData.name})`}
                      >
                        {tokenData.emoji}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

