import React, { useState } from 'react';
import { Copy, Check, Users, Play, MessageSquare, Send, Shield, User } from 'lucide-react';
import { TOKENS } from '../data/boardData.js';
import { soundFX } from '../utils/soundFx.js';

export default function OnlineRoom({
  room,
  currentSocketId,
  onToggleReady,
  onStartGame,
  onLeaveRoom,
  onSendChat,
  chatMessages = [],
}) {
  const [copied, setCopied] = useState(false);
  const [chatInput, setChatInput] = useState('');

  if (!room) return null;

  const me = room.players.find((p) => p.id === currentSocketId);
  const isHost = me?.isHost;
  const canStart = room.players.length >= 2 && room.players.every((p) => p.isHost || p.isReady);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between pb-6 border-b border-slate-800">
        <div>
          <span className="text-xs uppercase font-black tracking-widest text-cyan-400">
            PHÒNG CHỜ ONLINE
          </span>
          <h1 className="text-2xl font-black text-white">Trận Đấu Cờ Tỷ Phú Pro</h1>
        </div>
        <button
          onClick={onLeaveRoom}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-300 border border-slate-700 transition"
        >
          Rời Phòng
        </button>
      </div>

      <div className="max-w-4xl mx-auto w-full my-auto py-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cột Trái: Thông tin phòng & Người chơi (2 Cột) */}
        <div className="md:col-span-2 space-y-6">
          {/* Card Mã Phòng */}
          <div className="bg-slate-900/90 border-2 border-cyan-500/50 rounded-3xl p-6 shadow-glow-cyan flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                MÃ PHÒNG (GỬI CHO BẠN BÈ ĐỂ THAM GIA)
              </span>
              <div className="text-4xl font-black tracking-widest text-cyan-400 my-1">
                {room.code}
              </div>
              <p className="text-xs text-slate-400">Tối đa 6 người chơi trong một ván cờ</p>
            </div>

            <button
              onClick={handleCopyCode}
              className="px-5 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 transition active:scale-95 shrink-0"
            >
              {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              {copied ? 'Đã Sao Chép!' : 'Sao Chép Mã Phòng'}
            </button>
          </div>

          {/* Danh sách người chơi trong phòng */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Users size={18} className="text-cyan-400" />
                Danh sách người chơi ({room.players.length}/6)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {room.players.map((p) => {
                const tokenData = TOKENS.find((t) => t.id === p.token) || TOKENS[0];
                return (
                  <div
                    key={p.id}
                    className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-lg shadow"
                        style={{ backgroundColor: p.color }}
                      >
                        {tokenData.emoji}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white flex items-center gap-1.5">
                          {p.name}
                          {p.id === currentSocketId && (
                            <span className="text-[10px] text-cyan-400">(Bạn)</span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">{tokenData.name}</span>
                      </div>
                    </div>

                    <div>
                      {p.isHost ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                          Chủ Phòng
                        </span>
                      ) : p.isReady ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                          Sẵn Sàng
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                          Đang Chờ...
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Nút Sẵn Sàng hoặc Bắt Đầu */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              {isHost ? (
                <button
                  type="button"
                  disabled={!canStart}
                  onClick={() => {
                    soundFX.playCollectMoney();
                    onStartGame();
                  }}
                  className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                    canStart
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:brightness-110 shadow-glow-cyan active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Play size={18} />
                  {room.players.length < 2
                    ? 'Cần Ít Nhất 2 Người Để Bắt Đầu'
                    : canStart
                    ? 'Bắt Đầu Trận Đấu'
                    : 'Chờ Tất Cả Người Chơi Sẵn Sàng'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onToggleReady}
                  className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition active:scale-95 ${
                    me?.isReady
                      ? 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:brightness-110 shadow-glow-emerald'
                  }`}
                >
                  {me?.isReady ? 'Hủy Sẵn Sàng' : 'Tôi Đã Sẵn Sàng!'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cột Phải: Khung Chat Room */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 flex flex-col h-[480px]">
          <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
            <MessageSquare size={16} className="text-cyan-400" /> Trò Chuyện Trong Phòng
          </h3>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {chatMessages.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs italic">
                Hãy gửi lời chào đến các đối thủ!
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-cyan-400">{msg.senderName}</span>
                    <span className="text-[10px] text-slate-500">{msg.time}</span>
                  </div>
                  <div className="text-slate-200">{msg.message}</div>
                </div>
              ))
            )}
          </div>

          {/* Ô nhập chat */}
          <form onSubmit={handleSendMessage} className="mt-3 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Nhập tin nhắn..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

