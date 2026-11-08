import React from 'react';
import { TOKENS, BOARD_TILES } from '../data/boardData.js';
import { formatVND } from '../logic/gameEngine.js';

export default function PlayerRoster({ players, activePlayerId, myId, propertiesState, room }) {
  return <ol className="player-roster" aria-label="Danh sách người chơi">
    {players.map((player, index) => {
      const active = player.id === activePlayerId;
      const owned = BOARD_TILES.filter(tile => propertiesState[tile.id]?.owner === player.id);
      const buildings = owned.filter(tile => propertiesState[tile.id]?.houses > 0 && propertiesState[tile.id]?.houses < 4).length;
      const hotels = owned.filter(tile => propertiesState[tile.id]?.houses === 4).length;
      const offline = room?.players.find(p => p.id === player.id)?.connected === false;
      return <li key={player.id} className={`roster-card ${active ? 'is-active' : ''} ${player.isBankrupt ? 'is-bankrupt' : ''}`} style={{ '--player-color': player.color || '#475569' }} aria-current={active ? 'step' : undefined}>
        <span className="roster-avatar" aria-hidden="true">{TOKENS.find(t => t.id === player.token)?.emoji || '🏎️'}</span>
        <div className="roster-body">
          <div className="roster-name"><strong title={player.name}>{player.name}</strong>{player.id === myId && <span className="tiny-tag">Bạn</span>}{player.isBot && <span className="tiny-tag">Bot</span>}</div>
          <div className={`roster-money ${player.money < 0 ? 'is-negative' : ''}`}>{formatVND(player.money)}</div>
          <div className="roster-meta">{owned.length} tài sản{buildings > 0 && ` · ${buildings} công trình`}{hotels > 0 && ` · ${hotels} Landmark`}</div>
        </div>
        <span className={`player-state ${active ? 'is-active' : ''}`}>{player.isBankrupt ? 'Phá sản' : offline ? 'Mất kết nối' : active ? 'Đến lượt' : `#${index + 1}`}</span>
      </li>;
    })}
  </ol>;
}
