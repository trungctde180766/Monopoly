import React, { useState } from 'react';
import { Users, Globe, Bot, Play, Sparkles, Copy, Check, Volume2, VolumeX, Shield, RefreshCw } from 'lucide-react';
import { TOKENS, INITIAL_MONEY } from '../data/boardData.js';
import { soundFX } from '../utils/soundFx.js';

export default function Lobby({
  onStartPassAndPlay,
  onStartOnlineHost,
  onStartOnlineJoin,
  onStartQuickBot,
  isMuted,
  onToggleMute,
}) {
  const [tab, setTab] = useState('pass_play'); // pass_play, online, quick

  // Cấu hình Pass & Play
  const [playerCount, setPlayerCount] = useState(3);
  const [players, setPlayers] = useState([
    { name: 'Người Chơi 1', token: 'car', color: '#ef4444', isBot: false },
    { name: 'Người Chơi 2', token: 'jet', color: '#3b82f6', isBot: false },
    { name: 'Bot Tỷ Phú', token: 'hat', color: '#eab308', isBot: true },
    { name: 'Bot Đại Gia', token: 'diamond', color: '#ec4899', isBot: true },
    { name: 'Người Chơi 5', token: 'yacht', color: '#06b6d4', isBot: false },
    { name: 'Người Chơi 6', token: 'dog', color: '#10b981', isBot: false },
  ]);

  // Cấu hình Online
  const [onlineTab, setOnlineTab] = useState('create'); // create, join
  const [hostName, setHostName] = useState('Chủ Phòng');
  const [hostToken, setHostToken] = useState('car');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('Bạn Bè');
  const [joinToken, setJoinToken] = useState('jet');

  // Luật tuỳ biến
  const [freeParkingJackpot, setFreeParkingJackpot] = useState(true);

  const handleUpdatePlayer = (index, field, value) => {
    setPlayers((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleStartPassAndPlay = () => {
    soundFX.playCollectMoney();
    const activePlayers = players.slice(0, playerCount).map((p, idx) => ({
      id: `player_${idx + 1}`,
      name: p.name.trim() || `Người chơi ${idx + 1}`,
      token: p.token,
      color: p.color,
      isBot: p.isBot,
      money: INITIAL_MONEY,
      position: 0,
      inJail: false,
      jailTurns: 0,
      outOfJailCards: 0,
      isBankrupt: false,
    }));

    onStartPassAndPlay({
      players: activePlayers,
      customRules: { freeParkingJackpot },
    });
  };

  const handleQuickPlay = () => {
    soundFX.playCollectMoney();
    onStartQuickBot({
      freeParkingJackpot,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <header className="flex items-center justify-between max-w-5xl mx-auto w-full pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-300 flex items-center justify-center text-slate-950 shadow-glow-gold">
            <span className="text-2xl font-black">₫</span>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              CỜ TỶ PHÚ <span className="text-amber-400">PRO</span>
            </h1>
            <p className="text-xs text-slate-400">Bản Đồ Bất Động Sản Việt Nam 40 Ô Chuẩn Quốc Tế</p>
          </div>
        </div>

        <button
          onClick={onToggleMute}
          className="p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition"
          title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
        >
          {isMuted ? <VolumeX size={20} className="text-red-400" /> : <Volume2 size={20} className="text-emerald-400" />}
        </button>
      </header>

      {/* Main Mode Selection & Settings */}
      <main className="max-w-4xl mx-auto w-full my-auto py-6">
        {/* Navigation Tabs */}
        <div className="flex rounded-2xl bg-slate-900/90 p-1.5 border border-slate-800 mb-8 max-w-xl mx-auto">
          <button
            type="button"
            onClick={() => setTab('pass_play')}
            className={`flex-1 py-3 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all ${
              tab === 'pass_play'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-glow-gold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users size={18} /> Chơi Chung 1 Máy
          </button>

          <button
            type="button"
            onClick={() => setTab('online')}
            className={`flex-1 py-3 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all ${
              tab === 'online'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-glow-cyan'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe size={18} /> Chơi Online Bạn Bè
          </button>

          <button
            type="button"
            onClick={() => setTab('quick')}
            className={`flex-1 py-3 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all ${
              tab === 'quick'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-glow-emerald'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bot size={18} /> Đấu Với AI Bots
          </button>
        </div>

        {/* TAB 1: PASS & PLAY */}
        {tab === 'pass_play' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 backdrop-blur-sm shadow-2xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
              <div>
                <h2 className="text-xl font-black text-white">Chế Độ Pass & Play (Chơi Quây Quần)</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Chơi cùng bạn bè trên cùng màn hình máy tính, laptop hoặc tablet.
                </p>
              </div>

              {/* Chọn số người chơi (2-6) */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">Số người chơi:</span>
                <div className="flex gap-1.5">
                  {[2, 3, 4, 5, 6].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setPlayerCount(count)}
                      className={`w-9 h-9 rounded-xl font-bold text-sm transition ${
                        playerCount === count
                          ? 'bg-amber-500 text-slate-950 shadow-glow-gold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Danh sách người chơi */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {players.slice(0, playerCount).map((p, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">Người chơi #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleUpdatePlayer(idx, 'isBot', !p.isBot)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition ${
                        p.isBot
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {p.isBot ? '🤖 Máy (AI Bot)' : '👤 Người Thật'}
                    </button>
                  </div>

                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => handleUpdatePlayer(idx, 'name', e.target.value)}
                    placeholder={`Tên người chơi ${idx + 1}`}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />

                  {/* Chọn quân cờ */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Quân cờ:</span>
                    <div className="flex gap-1">
                      {TOKENS.map((token) => (
                        <button
                          key={token.id}
                          type="button"
                          onClick={() => handleUpdatePlayer(idx, 'token', token.id)}
                          className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition ${
                            p.token === token.id
                              ? 'bg-amber-500 text-slate-950 scale-110 shadow'
                              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                          }`}
                          title={token.name}
                        >
                          {token.emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Luật chơi bổ sung */}
            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 mb-6 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-200">Hũ Thưởng Bãi Đỗ Xe (Free Parking Jackpot)</span>
                <p className="text-xs text-slate-400">
                  Gom toàn bộ tiền phạt và thuế nộp vào quỹ. Người dừng chân ở Đỗ Xe Miễn Phí nhận trọn quỹ!
                </p>
              </div>
              <input
                type="checkbox"
                checked={freeParkingJackpot}
                onChange={(e) => setFreeParkingJackpot(e.target.checked)}
                className="w-5 h-5 accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Nút Bắt Đầu Trận Đấu */}
            <button
              type="button"
              onClick={handleStartPassAndPlay}
              className="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-slate-950 hover:brightness-110 shadow-glow-gold active:scale-95 transition flex items-center justify-center gap-2"
            >
              <Play size={20} /> Bắt Đầu Trận Đấu Ngay
            </button>
          </div>
        )}

        {/* TAB 2: ONLINE MULTIPLAYER */}
        {tab === 'online' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 backdrop-blur-sm shadow-2xl">
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 max-w-xs mx-auto mb-6">
              <button
                type="button"
                onClick={() => setOnlineTab('create')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                  onlineTab === 'create' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                Tạo Phòng Mới
              </button>
              <button
                type="button"
                onClick={() => setOnlineTab('join')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                  onlineTab === 'join' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                Vào Bằng Mã Code
              </button>
            </div>

            {onlineTab === 'create' ? (
              <div className="max-w-md mx-auto space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tên của bạn:</label>
                  <input
                    type="text"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Chọn quân cờ:</label>
                  <div className="flex gap-2">
                    {TOKENS.map((token) => (
                      <button
                        key={token.id}
                        type="button"
                        onClick={() => setHostToken(token.id)}
                        className={`flex-1 py-2.5 rounded-xl text-lg flex items-center justify-center border transition ${
                          hostToken === token.id
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 scale-105'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        {token.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartOnlineHost({ hostName, hostToken, freeParkingJackpot })}
                  className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:brightness-110 shadow-glow-cyan active:scale-95 transition mt-4"
                >
                  Tạo Phòng & Lấy Mã Mời
                </button>
              </div>
            ) : (
              <div className="max-w-md mx-auto space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Mã Phòng (5 Chữ Cái):</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="VD: TYPHU"
                    className="w-full bg-slate-950 border-2 border-cyan-500/50 rounded-xl px-4 py-3 text-lg font-black tracking-widest text-center text-cyan-400 uppercase"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tên hiển thị:</label>
                  <input
                    type="text"
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Chọn quân cờ:</label>
                  <div className="flex gap-2">
                    {TOKENS.map((token) => (
                      <button
                        key={token.id}
                        type="button"
                        onClick={() => setJoinToken(token.id)}
                        className={`flex-1 py-2.5 rounded-xl text-lg flex items-center justify-center border transition ${
                          joinToken === token.id
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 scale-105'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        {token.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartOnlineJoin({ roomCode: joinCode, playerName: joinName, token: joinToken })}
                  className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:brightness-110 shadow-glow-cyan active:scale-95 transition mt-4"
                >
                  Tham Gia Phòng
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: QUICK SOLO VS BOTS */}
        {tab === 'quick' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 backdrop-blur-sm shadow-2xl max-w-lg mx-auto text-center">
            <div className="inline-flex p-4 rounded-2xl bg-emerald-500/20 text-emerald-400 mb-3 border border-emerald-500/30">
              <Bot size={36} />
            </div>
            <h2 className="text-xl font-black text-white">Chơi Đơn Nhanh Cùng 3 AI Bots</h2>
            <p className="text-xs text-slate-400 mt-2 mb-6 leading-relaxed">
              Vào trận ngay lập tức mà không cần cài đặt. Bạn sẽ đấu trí cùng 3 cao thủ AI thông minh:
              Đại Gia Hà Thành, Trùm Địa Ốc Sài Gòn, và Tỷ Phú Miền Tây!
            </p>

            <button
              type="button"
              onClick={handleQuickPlay}
              className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 text-slate-950 hover:brightness-110 shadow-glow-emerald active:scale-95 transition flex items-center justify-center gap-2"
            >
              <Play size={18} /> Vào Trận Ngay
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 max-w-md mx-auto w-full pt-4 border-t border-slate-800/80">
        Luật chơi Monopoly nguyên bản quốc tế • Thiết kế riêng cho bạn bè và gia đình Việt Nam
      </footer>
    </div>
  );
}

