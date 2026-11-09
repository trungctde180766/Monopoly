import React, { lazy, Suspense, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BOARD_TILES } from './data/boardData.js';
import { calculateBuyoutPrice } from './logic/gameEngine.js';
import { useGameController } from './hooks/useGameController.js';
import { soundFX } from './utils/soundFx.js';
import Board from './components/Board.jsx';
import Lobby from './components/Lobby.jsx';
import OnlineRoom from './components/OnlineRoom.jsx';
import GameInterface from './components/GameInterface.jsx';
import DeedModal from './components/DeedModal.jsx';
import BuildDialog from './components/BuildDialog.jsx';
import { BuyoutModal, FestivalModal, CardModal, JailModal, ManagePropertiesModal, TradeModal, TradeConfirmModal, VictoryModal } from './components/ActionModals.jsx';
import './game.css';

const Board3D = lazy(() => import('./components/Board3D.jsx'));
class BoardErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Không dựng được bàn 3D:', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function App() {
  const controller = useGameController();
  const [viewMode, setViewMode] = useState('3d'), [selectedTileId, setSelectedTileId] = useState(null);
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    window.__CONTROLLER__ = controller;
    controller.selectTile = setSelectedTileId;
  }
  const { game, screen, mode, myId, busy, animation } = controller;
  const [deedTile, setDeedTile] = useState(null), [showManage, setShowManage] = useState(false), [showTrade, setShowTrade] = useState(false);
  const [showLog, setShowLog] = useState(false), [buildPreview, setBuildPreview] = useState(null);
  const [isMuted, setIsMuted] = useState(false), [musicPlaying, setMusicPlaying] = useState(false), [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (screen !== 'playing' || game?.winner) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [screen, game?.winner]);
  useEffect(() => {
    setSelectedTileId(null); setShowManage(false); setShowTrade(false); setDeedTile(null); setBuildPreview(null); setShowLog(false);
    setNow(Date.now());
  }, [game?.startedAt]);
  useEffect(() => { setSelectedTileId(null); setShowTrade(false); }, [game?.turnIndex]);
  useEffect(() => { if (buildPreview) setViewMode('3d'); }, [buildPreview]);
  const toggleMute = () => setIsMuted(soundFX.toggleMute());
  const toggleMusic = () => setMusicPlaying(soundFX.toggleBGM());
  const notice = controller.error && (
    <div className="game-notice" role="alert">
      <span>{controller.error}</span>
      {controller.isReconnecting && (
        <button
          type="button"
          onClick={controller.retryConnect}
          className="ml-2 px-2 py-0.5 bg-amber-500/30 hover:bg-amber-500/50 rounded text-xs text-amber-200 border border-amber-400/40 cursor-pointer"
          aria-label="Thử kết nối lại"
        >
          Thử lại
        </button>
      )}
      <button onClick={controller.clearError} aria-label="Đóng thông báo"><X size={18} /></button>
    </div>
  );
  if (screen === 'lobby') return <><Lobby
    onStartPassAndPlay={({ players, customRules }) => controller.startLocal(players, customRules)}
    onStartQuickBot={({ freeParkingJackpot }) => controller.startLocal([
      { id: 'player_user', name: 'Bạn', token: 'car', color: '#dc6040', isBot: false },
      { id: 'bot_1', name: 'Đại gia Hà Thành', token: 'hat', color: '#c29527', isBot: true },
      { id: 'bot_2', name: 'Trùm địa ốc Sài Gòn', token: 'diamond', color: '#427cc9', isBot: true },
      { id: 'bot_3', name: 'Tỷ phú Miền Tây', token: 'jet', color: '#168b79', isBot: true },
    ], { freeParkingJackpot }, 'quick')}
    onStartOnlineHost={controller.createRoom} onStartOnlineJoin={controller.joinRoom}
    isMuted={isMuted} onToggleMute={toggleMute} isSocketConnected={controller.connected}
  />{notice}</>;
  if (screen === 'online_waiting') return <><OnlineRoom room={controller.room} currentSocketId={myId} disabled={busy || !controller.connected || controller.isResuming} onToggleReady={controller.toggleReady} onStartGame={controller.startOnline} onLeaveRoom={controller.leave} onSendChat={controller.sendChat} chatMessages={controller.chatMessages} />{notice}</>;
  if (!game) return notice;
  const player = game.players[game.turnIndex], myTurn = mode !== 'online' || player.id === myId;
  const isOnlineConnected = mode !== 'online' || (controller.connected && !controller.isResuming);
  const canAct = isOnlineConnected && myTurn && !player.isBot && !busy && !animation.rolling && !animation.hopping && !game.winner;
  const canTrade = canAct && player.money >= 0 && !game.pendingDecision && !controller.pendingTrade;
  const decision = canAct && !player.isBot ? game.pendingDecision : null;
  const managedPlayer = mode === 'online' ? game.players.find(p => p.id === myId) : player;
  const elapsed = Math.max(0, Math.floor((now - game.startedAt) / 1000));
  const clock = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;
  const boardProps = { propertiesState: game.propertiesState, players: game.players, activePlayerId: player.id, freeParkingPool: game.freeParkingPool, dice: game.dice, onTileClick: tile => setSelectedTileId(tile.id) };
  const flatBoard = <div className="flat-board"><Board {...boardProps} /></div>;
  const pendingTile = decision?.tileId !== undefined ? BOARD_TILES[decision.tileId] : null;
  return <>
    <GameInterface controller={controller} selectedTileId={selectedTileId} onSelectTile={setSelectedTileId} onDetails={setDeedTile}
      onManage={() => { setShowManage(true); setShowTrade(false); }} onTrade={() => { if (canTrade) { setShowTrade(true); setShowManage(false); } }}
      onToggleLog={() => setShowLog(open => !open)} isLogOpen={showLog} onViewMode={() => setViewMode(view => view === '3d' ? '2d' : '3d')}
      viewMode={viewMode} isMuted={isMuted} onToggleMute={toggleMute} musicPlaying={musicPlaying} onToggleMusic={toggleMusic} elapsed={clock} onLeave={controller.leave}>
      {viewMode === '3d' ? <BoardErrorBoundary fallback={flatBoard}><Suspense fallback={<div className="board-loading" role="status">Đang dựng bàn chơi…</div>}><Board3D {...boardProps} dice={game.dice} isRolling={animation.rolling} selectedTileId={selectedTileId} buildPreview={buildPreview} /></Suspense></BoardErrorBoundary> : flatBoard}
    </GameInterface>
    {notice}
    {deedTile && <DeedModal tile={deedTile} propertiesState={game.propertiesState} players={game.players} dice={game.dice} onClose={() => setDeedTile(null)} />}
    {decision?.type === 'build' && !showManage && !showTrade && !deedTile && <BuildDialog key={decision.opportunityId} tile={pendingTile} player={player} prop={game.propertiesState[pendingTile.id]} busy={busy} onPreviewChange={setBuildPreview}
      onConfirm={targetTier => controller.dispatch('build', { tileId: pendingTile.id, targetTier, opportunityId: decision.opportunityId })} onSkip={() => controller.dispatch('skip')} />}
    {decision?.type === 'buyout' && !showManage && <BuyoutModal tile={pendingTile} owner={game.players.find(p => p.id === game.propertiesState[pendingTile.id]?.owner)} player={player}
      buyoutPrice={calculateBuyoutPrice(pendingTile, game.propertiesState[pendingTile.id])} onBuyout={() => controller.dispatch('buyout')} onSkip={() => controller.dispatch('skip')} />}
    {decision?.type === 'festival' && !showManage && <FestivalModal player={player} ownedTiles={BOARD_TILES.filter(t => t.type === 'property' && game.propertiesState[t.id]?.owner === player.id).map(t => ({ ...t, houses: game.propertiesState[t.id].houses }))} onSelectCity={tileId => controller.dispatch('festival', { tileId })} onClose={() => controller.dispatch('skip')} />}
    {decision?.type === 'card' && !showManage && <CardModal card={decision.card} type={decision.deckType} onClose={() => controller.dispatch('confirm_card')} />}
    {decision?.type === 'jail' && !showManage && <JailModal player={player} onPayFine={() => controller.dispatch('jail', { method: 'pay' })} onUseCard={() => controller.dispatch('jail', { method: 'card' })} onRollDoubles={() => controller.dispatch('jail', { method: 'roll' })} />}
    {showManage && managedPlayer && <ManagePropertiesModal player={managedPlayer} players={game.players} propertiesState={game.propertiesState} readOnly={!canAct || managedPlayer.id !== player.id}
      onBuildHouse={tileId => controller.dispatch('build', { tileId, targetTier: (game.propertiesState[tileId]?.houses || 0) + 1, opportunityId: player.buildOpportunity?.id })}
      onSellHouse={tileId => controller.dispatch('sell_house', { tileId })} onMortgage={tileId => controller.dispatch('mortgage', { tileId })} onUnmortgage={tileId => controller.dispatch('unmortgage', { tileId })} onClose={() => setShowManage(false)} />}
    {showTrade && canAct && <TradeModal activePlayer={player} players={game.players} propertiesState={game.propertiesState} onSendTrade={offer => { setShowTrade(false); controller.sendTrade(offer); }} onClose={() => setShowTrade(false)} />}
    {controller.pendingTrade && <TradeConfirmModal offer={controller.pendingTrade} players={game.players} propertiesState={game.propertiesState} onAccept={() => controller.respondTrade(true)} onReject={() => controller.respondTrade(false)} />}
    {game.winner && <VictoryModal winner={game.winner} onRestart={controller.leave} />}
  </>;
}
