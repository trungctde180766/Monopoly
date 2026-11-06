import React from 'react';
import { X, Home, Hotel, ShieldCheck, AlertCircle } from 'lucide-react';
import { COLOR_GROUPS } from '../data/boardData.js';
import { formatVND } from '../logic/gameEngine.js';

export default function DeedModal({ tile, propertyState, owner, onClose }) {
  if (!tile) return null;

  const groupInfo = tile.group ? COLOR_GROUPS[tile.group.toUpperCase()] : null;
  const isMortgaged = propertyState?.isMortgaged || false;
  const houses = propertyState?.houses || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-sm bg-slate-900 border-2 border-amber-500/50 rounded-2xl shadow-2xl overflow-hidden p-1 text-slate-100">
        {/* Nút đóng */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
        >
          <X size={18} />
        </button>

        {/* Nội dung Thẻ Sổ Đỏ */}
        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
          {/* Header màu sắc */}
          {groupInfo ? (
            <div
              className="py-3 px-2 rounded-lg text-center mb-4 shadow-md"
              style={{ backgroundColor: groupInfo.color }}
            >
              <span className="text-[10px] tracking-widest uppercase font-black text-white/90 drop-shadow">
                GIẤY CHỨNG NHẬN QUYỀN SỞ HỮU
              </span>
              <h3 className="text-lg font-black text-white drop-shadow-md truncate">
                {tile.name}
              </h3>
            </div>
          ) : (
            <div className="py-3 px-2 rounded-lg text-center mb-4 bg-slate-800 border border-slate-700">
              <span className="text-[10px] tracking-widest uppercase font-bold text-slate-400">
                TÀI SẢN ĐẶC BIỆT
              </span>
              <h3 className="text-lg font-black text-amber-400 truncate">
                {tile.name}
              </h3>
            </div>
          )}

          {/* Chi tiết tiền thuê với Đất thông thường */}
          {tile.type === 'property' && (
            <div className="space-y-2 text-xs md:text-sm">
              <div className="flex justify-between items-center py-1 border-b border-slate-800">
                <span className="text-slate-400">Tiền thuê đất trống:</span>
                <span className="font-bold text-slate-200">{formatVND(tile.rent[0])}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 text-slate-300">
                <span className="flex items-center gap-1">
                  <Home size={14} className="text-emerald-400" /> Với 1 Nhà:
                </span>
                <span className="font-semibold">{formatVND(tile.rent[1])}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 text-slate-300">
                <span className="flex items-center gap-1">
                  <Home size={14} className="text-emerald-400" /> Với 2 Nhà:
                </span>
                <span className="font-semibold">{formatVND(tile.rent[2])}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 text-slate-300">
                <span className="flex items-center gap-1">
                  <Home size={14} className="text-emerald-400" /> Với 3 Nhà:
                </span>
                <span className="font-semibold">{formatVND(tile.rent[3])}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 text-slate-300">
                <span className="flex items-center gap-1">
                  <Home size={14} className="text-emerald-400" /> Với 4 Nhà:
                </span>
                <span className="font-semibold">{formatVND(tile.rent[4])}</span>
              </div>
              <div className="flex justify-between items-center py-1 bg-red-950/40 px-2 rounded border border-red-900/40 text-red-300">
                <span className="flex items-center gap-1 font-bold">
                  <Hotel size={16} className="text-red-400" /> Với Khách Sạn:
                </span>
                <span className="font-black text-red-200">{formatVND(tile.rent[5])}</span>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                <p>• Nếu sở hữu trọn bộ màu chưa xây nhà, tiền thuê đất trống được <strong>nhân đôi</strong>.</p>
                <div className="flex justify-between pt-1">
                  <span>Chi phí xây 1 Nhà:</span>
                  <span className="font-bold text-amber-400">{formatVND(tile.housePrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Chi phí xây Khách Sạn:</span>
                  <span className="font-bold text-amber-400">{formatVND(tile.housePrice)} (+ 4 nhà)</span>
                </div>
                <div className="flex justify-between">
                  <span>Giá trị thế chấp:</span>
                  <span className="font-bold text-slate-300">{formatVND(tile.mortgageValue)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Chi tiết với Ga Tàu */}
          {tile.type === 'railroad' && (
            <div className="space-y-2 text-xs md:text-sm">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Thuê khi sở hữu 1 Ga:</span>
                <span className="font-bold text-slate-200">{formatVND(tile.baseRent)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Thuê khi sở hữu 2 Ga:</span>
                <span className="font-bold text-slate-200">{formatVND(tile.baseRent * 2)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Thuê khi sở hữu 3 Ga:</span>
                <span className="font-bold text-slate-200">{formatVND(tile.baseRent * 4)}</span>
              </div>
              <div className="flex justify-between items-center py-1 bg-amber-500/10 px-2 rounded border border-amber-500/30">
                <span className="text-amber-300 font-bold">Thuê khi sở hữu 4 Ga:</span>
                <span className="font-black text-amber-400">{formatVND(tile.baseRent * 8)}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-400">
                <span>Giá trị thế chấp:</span>
                <span className="font-bold text-slate-300">{formatVND(tile.mortgageValue)}</span>
              </div>
            </div>
          )}

          {/* Chi tiết với Tiện Ích */}
          {tile.type === 'utility' && (
            <div className="space-y-2.5 text-xs md:text-sm">
              <p className="text-slate-300 leading-relaxed">
                Nếu người chơi sở hữu <strong>1 công ty tiện ích</strong>, tiền thuê bằng <strong>40.000₫ x điểm xúc xắc</strong> đổ được.
              </p>
              <p className="text-amber-300 leading-relaxed bg-amber-500/10 p-2 rounded border border-amber-500/30">
                Nếu sở hữu cả <strong>2 công ty tiện ích</strong> (Điện & Nước), tiền thuê bằng <strong>100.000₫ x điểm xúc xắc</strong>.
              </p>
              <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-400">
                <span>Giá trị thế chấp:</span>
                <span className="font-bold text-slate-300">{formatVND(tile.mortgageValue)}</span>
              </div>
            </div>
          )}

          {/* Trạng thái hiện tại của ô đất */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            {owner ? (
              <div className="flex items-center justify-between text-xs bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: owner.color }}
                  />
                  <span className="text-slate-300">Chủ sở hữu:</span>
                  <span className="font-bold text-white">{owner.name}</span>
                </div>
                {isMortgaged ? (
                  <span className="text-red-400 font-bold flex items-center gap-1">
                    <AlertCircle size={14} /> Đang thế chấp
                  </span>
                ) : houses > 0 ? (
                  <span className="text-amber-400 font-bold">
                    {houses >= 4 ? '🏰 Khách Sạn (Landmark)' : `Nhà Cấp ${houses}`}
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <ShieldCheck size={14} /> Bình thường
                  </span>
                )}
              </div>
            ) : (
              <div className="text-center py-2 bg-emerald-950/40 rounded-lg border border-emerald-800/40 text-emerald-300 text-xs font-semibold">
                Đang mở bán: {formatVND(tile.price)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

