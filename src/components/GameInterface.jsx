import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight, Building2, Handshake, History, Volume2, VolumeX, Music2,
  LogOut, ChevronDown, Info, Expand, MapPin, X, MessageSquare, Send
} from 'lucide-react';
import { BOARD_TILES, TOKENS } from '../data/boardData.js';
import { formatVND } from '../logic/gameEngine.js';
import { getTileDetails, getTurnPresentation } from '../logic/gamePresentation.js';
import CornerHUD from './CornerHUD.jsx';
import PlayerRoster from './PlayerRoster.jsx';

function TileInspectorDrawer({ tile, state, onSelect, onDetails, onClose }) {
  if (!tile) return null;
  const details = getTileDetails(tile, state.propertiesState, state.players, state.dice);
  return (
    <aside className="tile-inspector-drawer" aria-labelledby="inspector-title">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <span className="tile-color" style={{ background: details.owner?.color || details.group?.color || '#8b9cb3' }} />
          <h2 id="inspector-title" className="text-base font-black text-slate-800">
            {tile.type === 'free_parking' ? 'Lễ hội & Quỹ thưởng' : tile.name}
          </h2>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Đóng bảng thông tin">
          <X size={18} />
        </button>
      </div>

      <div className="inspector-content">
        <div className="inspector-status-badge">
          <span>#{tile.id.toString().padStart(2, '0')}</span>
          <span className="font-bold">{details.status}</span>
        </div>

        {details.amount !== null && (
          <div className="inspector-price">
            <span>{details.priceLabel}</span>
            <strong>{formatVND(details.amount)}</strong>
          </div>
        )}

        {details.owner && (
          <div className="inspector-owner">
            <span>Chủ sở hữu:</span>
            <strong style={{ borderColor: details.owner.color }}>
              {details.owner.name}
            </strong>
            {details.prop?.isFestival && <span className="festival-badge">🎪 Lễ hội ×2</span>}
          </div>
        )}

        {!details.isAsset && <p className="inspector-description">{details.description}</p>}
        {tile.type === 'utility' && (
          <p className="inspector-description">Tiền thuê theo tổng 2 xúc xắc: {state.dice[0] + state.dice[1]}.</p>
        )}

        {details.isAsset && (
          <button className="primary-game-button w-full mt-3 text-xs" onClick={() => onDetails(tile)}>
            <Info size={15} /> Xem Bảng Giá Chi Tiết <ArrowRight size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}

export default function GameInterface({
  controller, children, selectedTileId, onSelectTile, onDetails,
  onManage, onTrade, onToggleLog, isLogOpen, onViewMode, viewMode,
  isMuted, onToggleMute, musicPlaying, onToggleMusic, elapsed, onLeave
}) {
  const { game: state, mode, myId, connected, busy, animation, room, pendingTrade } = controller;
  const player = state.players[state.turnIndex];
  let turn = getTurnPresentation({ state, mode, myId, connected, busy, rolling: animation.rolling, hopping: animation.hopping });
  if (pendingTrade && !turn.disabled) turn = { ...turn, disabled: true, hint: 'Xác nhận hoặc từ chối đề nghị giao dịch đang mở.' };
  const canTrade = !player.isBot && player.money >= 0 && (mode !== 'online' || (player.id === myId && connected)) &&
    !busy && !animation.rolling && !animation.hopping && !state.winner && !state.pendingDecision && !pendingTrade;

  const inspectedTile = selectedTileId !== null ? BOARD_TILES[selectedTileId] : null;
  const modeLabel = mode === 'online' ? 'Online' : mode === 'quick' ? 'AI Bots' : 'Pass & Play';
  const mainAction = () => turn.action === 'manage' ? onManage() : controller.dispatch(turn.action);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [lastReadCount, setLastReadCount] = useState(0);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatSendError, setChatSendError] = useState('');
  const chatMessages = controller.chatMessages || [];
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);

  // Monitor user scrolling: when user is within 30px of bottom, mark as pinned to bottom.
  // When user scrolls up to read history, unpin so incoming messages don't interrupt reading.
  const handleChatScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom <= 30;
  };

  // When drawer opens, reset to bottom and scroll to newest messages
  useEffect(() => {
    if (isChatOpen) {
      isAtBottomRef.current = true;
      setLastReadCount(chatMessages.length);
      const timer = setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isChatOpen]);

  // When new messages arrive while chat is open:
  // If user was already pinned to bottom before the new message rendered,
  // continue pinning them to the bottom regardless of how tall the new message is!
  useEffect(() => {
    if (isChatOpen) {
      setLastReadCount(chatMessages.length);
      if (isAtBottomRef.current) {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
    }
  }, [chatMessages.length, isChatOpen]);

  const unreadCount = isChatOpen ? 0 : Math.max(0, chatMessages.length - lastReadCount);

  const handleSendChat = async (e) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || !connected || controller.isResuming || isSendingChat) return;
    setIsSendingChat(true);
    setChatSendError('');
    try {
      const res = await controller.sendChat?.(trimmed);
      if (res?.success !== false) {
        setChatInput('');
        isAtBottomRef.current = true;
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }, 50);
      } else {
        setChatSendError(res?.message || 'Không thể gửi tin nhắn.');
      }
    } catch {
      setChatSendError('Lỗi kết nối khi gửi.');
    } finally {
      setIsSendingChat(false);
    }
  };

  return (
    <main className="game-shell">
      {/* 1. SÂN KHẤU BÀN CHƠI CHÍNH (FULL VIEWPORT ARENA) */}
      <div className="board-stage">
        {children}
      </div>

      {/* 2. HUD 4 GÓC ĐẶC TRƯNG BUSINESS TOUR */}
      <CornerHUD
        players={state.players}
        activePlayerId={player.id}
        propertiesState={state.propertiesState}
        onOpenManage={onManage}
        onOpenTrade={onTrade}
        canTrade={canTrade}
        gameLog={state.gameLog}
        isLogOpen={isLogOpen}
        onToggleLog={onToggleLog}
      />

      {/* 3. FLOATING TOP PILL (Thông số trận đấu) */}
      <div className="arena-top-pill">
        <div className="arena-brand">
          <span className="brand-dot">🎲</span>
          <strong>CỜ TỶ PHÚ</strong>
          <span className="arena-mode-tag">{modeLabel}</span>
          {mode === 'online' && room?.code && <span className="room-code-tag">{room.code}</span>}
        </div>
        <div className="arena-clock">⏱️ {elapsed}</div>
        {state.customRules?.freeParkingJackpot && (
          <div className="arena-jackpot">
            <span>Quỹ thưởng:</span>
            <strong>{formatVND(state.freeParkingPool)}</strong>
          </div>
        )}
      </div>

      {/* 4. FLOATING RIGHT UTILITY DOCK */}
      <div className="arena-tools-dock">
        <button
          className="tool-btn"
          onClick={onViewMode}
          title={viewMode === '3d' ? 'Chuyển sang Bản đồ 2D' : 'Chuyển sang Bàn 3D'}
        >
          <Expand size={16} />
          <span>{viewMode === '3d' ? '2D' : '3D'}</span>
        </button>
        <button
          className={`tool-btn ${musicPlaying ? 'is-active' : ''}`}
          onClick={onToggleMusic}
          title={musicPlaying ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
        >
          <Music2 size={16} />
        </button>
        <button
          className="tool-btn"
          onClick={onToggleMute}
          title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button
          className={`tool-btn ${isLogOpen ? 'is-active' : ''}`}
          onClick={() => {
            if (!isLogOpen && isChatOpen) setIsChatOpen(false);
            onToggleLog();
          }}
          title="Nhật ký ván chơi"
        >
          <History size={16} />
        </button>
        {mode === 'online' && (
          <button
            className={`tool-btn ${isChatOpen ? 'is-active' : ''} relative`}
            onClick={() => {
              setIsChatOpen(open => {
                if (!open) {
                  setLastReadCount(chatMessages.length);
                  if (isLogOpen) onToggleLog();
                }
                return !open;
              });
            }}
            title="Trò chuyện trong ván"
            aria-label="Trò chuyện trong ván"
          >
            <MessageSquare size={16} />
            {unreadCount > 0 && !isChatOpen && (
              <span className="chat-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
        )}
        <button
          className="tool-btn"
          onClick={onManage}
          title="Quản lý bất động sản"
        >
          <Building2 size={16} />
        </button>
        <button
          className="tool-btn leave-tool"
          onClick={onLeave}
          title="Rời ván chơi"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* 5. FLOATING BOTTOM-CENTER ACTION DOCK */}
      <footer className="turn-panel" aria-label="Điều khiển lượt chơi">
        <div className="arena-dock-inner">
          {/* Cụm Xúc Xắc 3D */}
          <div
            className={`dice-result ${animation.rolling ? 'is-rolling' : ''}`}
            aria-label={`Xúc xắc ${state.dice[0]} và ${state.dice[1]}`}
          >
            <span>{state.dice[0]}</span>
            <span>{state.dice[1]}</span>
            <small>Σ {state.dice[0] + state.dice[1]}</small>
          </div>

          {/* Nút hành động chính (Lắc xúc xắc / Kết thúc lượt / Quyết định) */}
          <div className="dock-action-wrapper">
            <div className="dock-hint truncate">{turn.hint}</div>
            <button
              className="primary-game-button"
              data-testid="turn-action"
              disabled={turn.disabled}
              onClick={mainAction}
            >
              <span>{turn.action === 'roll' ? '🎲' : turn.action === 'end_turn' ? '✅' : '⚡'}</span>
              <span>{turn.label}</span>
              {!turn.disabled && <ArrowRight size={17} />}
            </button>
          </div>

          {/* Nút giao dịch nếu có thể */}
          {canTrade && (
            <button className="secondary-game-button dock-trade-btn" onClick={onTrade}>
              <Handshake size={16} />
              <span>Giao dịch</span>
            </button>
          )}
        </div>
      </footer>

      {/* 6. ON-DEMAND TILE INSPECTOR DRAWER */}
      {selectedTileId !== null && (
        <TileInspectorDrawer
          tile={inspectedTile}
          state={state}
          onSelect={onSelectTile}
          onDetails={onDetails}
          onClose={() => onSelectTile(null)}
        />
      )}

      {/* 7. MATCH LOG DRAWER */}
      {isLogOpen && (
        <section className="game-log-panel" role="dialog" aria-label="Nhật ký trận đấu">
          <div className="panel-heading">
            <h2>📜 Nhật ký trận đấu</h2>
            <button className="text-button" onClick={onToggleLog}>Đóng</button>
          </div>
          <ol>
            {state.gameLog.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ol>
        </section>
      )}
      {/* 8. IN-GAME CHAT DRAWER */}
      {mode === 'online' && isChatOpen && (
        <aside className="in-game-chat-drawer" aria-label="Khung trò chuyện trong ván">
          <div className="chat-drawer-header">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-cyan-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Trò chuyện trong ván</h3>
            </div>
            <button
              onClick={() => setIsChatOpen(false)}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 transition"
              aria-label="Đóng chat"
            >
              <X size={15} />
            </button>
          </div>
          <div ref={chatContainerRef} onScroll={handleChatScroll} className="chat-drawer-messages">
            {chatMessages.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs italic">
                Chưa có tin nhắn nào trong trận.
              </div>
            ) : (
              chatMessages.map(msg => {
                const isMe = (msg.senderId && msg.senderId === myId) || (!msg.senderId && state.players.find(p => p.id === myId)?.name === msg.senderName);
                const timeStr = msg.time || (msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');
                return (
                  <div key={msg.id} className="chat-msg-bubble">
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <strong className={isMe ? 'text-cyan-400' : 'text-amber-400'}>
                        {msg.senderName} {isMe ? '(Bạn)' : ''}
                      </strong>
                      <span className="text-[10px] text-slate-500">
                        {timeStr}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 break-words">{msg.message}</p>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          {chatSendError && (
            <div className="text-[11px] text-rose-400 px-3 py-1 bg-rose-950/60 border-t border-rose-900/40">
              {chatSendError}
            </div>
          )}
          <form onSubmit={handleSendChat} className="chat-drawer-input">
            <input
              type="text"
              value={chatInput}
              onChange={e => { setChatInput(e.target.value); setChatSendError(''); }}
              placeholder={controller.isResuming ? 'Đang đồng bộ...' : 'Nhập tin nhắn...'}
              maxLength={120}
              disabled={!connected || controller.isResuming || isSendingChat}
              className="chat-input-field"
            />
            <button
              type="submit"
              disabled={!connected || controller.isResuming || isSendingChat || !chatInput.trim()}
              className="chat-send-btn"
              aria-label="Gửi tin nhắn"
            >
              <Send size={14} />
            </button>
          </form>
        </aside>
      )}
    </main>
  );
}
