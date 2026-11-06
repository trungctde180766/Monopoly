import React, { useState } from 'react';
import { soundFX } from '../utils/soundFx.js';

const DICE_DOTS = {
  1: [{ top: '50%', left: '50%' }],
  2: [{ top: '25%', left: '25%' }, { top: '75%', left: '75%' }],
  3: [{ top: '25%', left: '25%' }, { top: '50%', left: '50%' }, { top: '75%', left: '75%' }],
  4: [{ top: '25%', left: '25%' }, { top: '25%', left: '75%' }, { top: '75%', left: '25%' }, { top: '75%', left: '75%' }],
  5: [{ top: '25%', left: '25%' }, { top: '25%', left: '75%' }, { top: '50%', left: '50%' }, { top: '75%', left: '25%' }, { top: '75%', left: '75%' }],
  6: [
    { top: '20%', left: '25%' }, { top: '50%', left: '25%' }, { top: '80%', left: '25%' },
    { top: '20%', left: '75%' }, { top: '50%', left: '75%' }, { top: '80%', left: '75%' }
  ],
};

export default function Dice3D({ dice = [1, 1], isRolling = false, disabled = false, onRoll, doublesCount = 0 }) {
  const [internalRoll, setInternalRoll] = useState(false);

  const handleRoll = () => {
    if (disabled || isRolling || internalRoll) return;
    soundFX.playDiceRoll();
    setInternalRoll(true);
    setTimeout(() => {
      setInternalRoll(false);
      if (onRoll) onRoll();
    }, 600);
  };

  const rolling = isRolling || internalRoll;
  const isDoubles = dice[0] === dice[1];

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {/* Cặp Xúc Xắc */}
      <div className="flex items-center gap-4">
        {[0, 1].map((index) => {
          const val = dice[index] || 1;
          const dots = DICE_DOTS[val] || DICE_DOTS[1];
          return (
            <div
              key={index}
              onClick={handleRoll}
              className={`relative w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-white via-slate-100 to-slate-300 shadow-xl border-2 border-slate-300 cursor-pointer select-none transition-all duration-300 transform ${
                rolling ? 'animate-spin scale-110' : 'hover:scale-105 active:scale-95 shadow-glow-gold'
              }`}
              style={{
                perspective: '600px',
                boxShadow: isDoubles && !rolling ? '0 0 15px rgba(234, 179, 8, 0.7)' : undefined,
              }}
            >
              {dots.map((dot, dIdx) => (
                <div
                  key={dIdx}
                  className="absolute w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-slate-900 shadow-inner transform -translate-x-1/2 -translate-y-1/2"
                  style={{ top: dot.top, left: dot.left }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Thông báo Đổ Đôi hoặc Tổng điểm */}
      <div className="text-center min-h-[28px]">
        {rolling ? (
          <span className="text-sm font-medium text-amber-400 animate-pulse">Đang lắc xúc xắc...</span>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm md:text-base font-bold text-slate-200">
              Tổng điểm: <span className="text-amber-400 text-lg">{dice[0] + dice[1]}</span>
            </span>
            {isDoubles && (
              <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
                Đổ Đôi! (Thêm lượt)
              </span>
            )}
            {doublesCount > 1 && (
              <span className="text-xs font-bold text-red-400">
                (Đôi lần {doublesCount}/3)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Nút Đổ Xúc Xắc */}
      <button
        type="button"
        disabled={disabled || rolling}
        onClick={handleRoll}
        className={`px-6 py-2.5 rounded-xl font-bold text-sm md:text-base tracking-wide uppercase transition-all duration-200 shadow-lg ${
          disabled || rolling
            ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
            : 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 hover:brightness-110 active:scale-95 shadow-glow-gold'
        }`}
      >
        {rolling ? 'Đang Lắc...' : '🎲 Lắc Xúc Xắc'}
      </button>
    </div>
  );
}

