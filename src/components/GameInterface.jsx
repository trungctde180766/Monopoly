import React, { useState } from 'react';
import {
  ArrowRight, Building2, Handshake, History, Volume2, VolumeX, Music2,
  LogOut, ChevronDown, Info, Expand, MapPin, X
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
          onClick={onToggleLog}
          title="Nhật ký ván chơi"
        >
          <History size={16} />
        </button>
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
    </main>
  );
}
