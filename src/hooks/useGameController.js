import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { createGameSession, reduceGameAction, applySessionTrade } from '../logic/gameSession.js';
import { chooseBotAction } from '../logic/botTurn.js';
import { AIEngine } from '../logic/aiEngine.js';
import { soundFX } from '../utils/soundFx.js';

const readSession = () => { try { return JSON.parse(sessionStorage.getItem('monopoly-session') || 'null'); } catch { return null; } };
const saveSession = value => { try { if (value) sessionStorage.setItem('monopoly-session', JSON.stringify(value)); else sessionStorage.removeItem('monopoly-session'); } catch { /* Private browsing can disable storage. */ } };

export function useGameController() {
  const [screen, setScreen] = useState('lobby'), [mode, setMode] = useState('pass_play');
  const [game, setGame] = useState(null), [room, setRoom] = useState(null);
  const [myId, setMyId] = useState(null), [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false), [animation, setAnimation] = useState({ rolling: false, hopping: false });
  const [error, setError] = useState(''), [pendingTrade, setPendingTrade] = useState(null), [chatMessages, setChatMessages] = useState([]);
  const socketRef = useRef(null), gameRef = useRef(null), modeRef = useRef(mode), roomRef = useRef(null), myIdRef = useRef(null);
  const epoch = useRef(0), timers = useRef(new Set()), requestPending = useRef(false), animating = useRef(false);
  const superseded = useRef(false);
  const setIdentity = id => { myIdRef.current = id; setMyId(id); };
  const setRoomState = value => { roomRef.current = value; setRoom(value); };
  const stopAnimation = () => {
    timers.current.forEach(clearTimeout); timers.current.clear();
    animating.current = false; setAnimation({ rolling: false, hopping: false });
  };
  const later = (callback, ms) => {
    const generation = epoch.current;
    const timer = setTimeout(() => { timers.current.delete(timer); if (generation === epoch.current) callback(); }, ms);
    timers.current.add(timer);
  };
  const commit = (next, animate = false, force = false) => {
    const old = gameRef.current;
    if (!force && old && (next.startedAt !== old.startedAt || next.revision < old.revision)) return;
    stopAnimation(); gameRef.current = next;
    setPendingTrade(offer => offer && offer.revision === next.revision ? offer : null);
    const action = next.lastAction;
    const diceAction = animate && action && (action.type === 'roll' && next.pendingDecision?.type !== 'jail' || action.type === 'jail' && action.method === 'roll');
    const moved = next.players.find(p => old?.players.some(before => before.id === p.id && before.position !== p.position));
    const before = old?.players.find(p => p.id === moved?.id);
    const steps = moved && before ? (moved.position - before.position + 40) % 40 : 0;
    const hopMs = steps > 0 && steps <= 12 ? steps * 250 + 120 : 0;
    const showResult = () => {
      setGame(next); setAnimation({ rolling: false, hopping: hopMs > 0 });
      if (hopMs) later(() => { animating.current = false; setAnimation({ rolling: false, hopping: false }); }, hopMs);
      else animating.current = false;
    };
    if (diceAction) {
      animating.current = true; setAnimation({ rolling: true, hopping: false }); soundFX.playDiceRoll(); later(showResult, 650);
    } else {
      animating.current = hopMs > 0; showResult();
    }
    if (action?.type === 'build') soundFX.playBuildHouse();
    if (next.winner && !old?.winner) soundFX.playVictory();
  };
  const reset = () => {
    superseded.current = false;
    epoch.current++; stopAnimation(); gameRef.current = null; setGame(null);
    requestPending.current = false; setBusy(false); setPendingTrade(null); setError(''); setChatMessages([]);
  };
  const leave = () => {
    if (roomRef.current) socketRef.current?.emit('leave_room', {});
    saveSession(null); setRoomState(null); reset(); setScreen('lobby');
    setConnected(!!socketRef.current?.connected);
  };
  const startLocal = (players, rules = {}, gameMode = 'pass_play') => {
    leave(); modeRef.current = gameMode; setMode(gameMode);
    const state = createGameSession({ players, customRules: rules }, { allowBots: true });
    commit(state, false, true); setScreen('playing');
  };
  const acceptRoom = response => {
    if (!response?.success) { setError(response?.message || 'Không thể vào phòng.'); return; }
    reset(); modeRef.current = 'online'; setMode('online');
    setIdentity(response.playerId); setRoomState(response.room);
    saveSession({ roomCode: response.room.code, resumeToken: response.resumeToken });
    setScreen('online_waiting');
  };
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      path: import.meta.env.VITE_SOCKET_PATH || '/socket.io', transports: ['websocket'],
      reconnectionDelay: 1000, reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      if (superseded.current) return;
      setConnected(true); setIdentity(socket.id);
      const saved = readSession(), generation = epoch.current;
      if (saved?.resumeToken) socket.timeout(5000).emit('resume_room', saved, (failure, response) => {
        if (generation !== epoch.current) return;
        if (failure || !response?.success) {
          saveSession(null); reset(); setRoomState(null); setScreen('lobby');
          setError(response?.message || 'Không khôi phục được phiên chơi.'); return;
        }
        modeRef.current = 'online'; setMode('online'); setIdentity(response.playerId); setRoomState(response.room); setError('');
        if (response.gameState) { commit(response.gameState, false, true); setScreen('playing'); }
        else setScreen('online_waiting');
      });
    });
    socket.on('disconnect', () => {
      if (superseded.current) { setConnected(false); setBusy(true); return; }
      setConnected(false); requestPending.current = false; setBusy(false);
      if (modeRef.current === 'online' && gameRef.current) setError('Đang nối lại phiên. Có 60 giây để quay lại ván.');
    });
    socket.on('connect_error', () => setConnected(false));
    socket.on('room_updated', updatedRoom => {
      if (superseded.current) return;
      if (!updatedRoom || (roomRef.current && updatedRoom.code !== roomRef.current.code)) return;
      setRoomState(updatedRoom);
      if (updatedRoom.status === 'playing' && updatedRoom.gameState && (!gameRef.current || modeRef.current !== 'online')) {
        reset(); modeRef.current = 'online'; setMode('online'); commit(updatedRoom.gameState, false, true); setScreen('playing');
      }
    });
    socket.on('session_superseded', payload => {
      superseded.current = true;
      epoch.current++;
      setPendingTrade(null);
      saveSession(null); stopAnimation(); requestPending.current = false;
      setError(payload?.message || 'Phiên kết nối đã được chuyển sang cửa sổ hoặc thiết bị khác.');
      setConnected(false);
      setBusy(true);
    });
    socket.on('game_started', ({ gameState, roomCode, room }) => {
      if (superseded.current) return;
      if (roomCode && roomRef.current?.code && roomRef.current.code !== roomCode) return;
      if (room) setRoomState(room);
      if (modeRef.current === 'online' && gameRef.current && gameState) {
        if (gameState.startedAt === gameRef.current.startedAt && gameState.revision <= gameRef.current.revision) return;
        commit(gameState, gameState.revision > gameRef.current.revision);
        return;
      }
      reset(); modeRef.current = 'online'; setMode('online'); commit(gameState, false, true); setScreen('playing');
    });
    socket.on('game_state_updated', state => {
      if (superseded.current) return;
      if (modeRef.current === 'online' && gameRef.current && state?.players && state.revision > gameRef.current.revision) commit(state, true);
    });
    socket.on('trade_offer_received', offer => { if (!superseded.current && offer?.targetId === myIdRef.current) setPendingTrade(offer); });
    socket.on('trade_offer_responded', () => setPendingTrade(null));
    socket.on('chat_received', message => setChatMessages(list => [...list, message]));
    return () => { epoch.current++; timers.current.forEach(clearTimeout); socket.disconnect(); };
  }, []);

  const dispatch = (type, data = {}) => {
    if (superseded.current) return;
    const current = gameRef.current;
    if (!current || animating.current || requestPending.current) return;
    setError('');
    if (modeRef.current !== 'online') {
      try { commit(reduceGameAction(current, current.players[current.turnIndex].id, { ...data, type, revision: current.revision }), true); }
      catch (failure) { setError(failure.message); }
      return;
    }
    if (!socketRef.current?.connected) { setError('Chưa kết nối máy chủ. Vui lòng chờ nối lại.'); return; }
    requestPending.current = true; setBusy(true); const generation = epoch.current;
    const requestId = data.requestId || `${myId || 'client'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    socketRef.current.timeout(5000).emit('game_action', { ...data, type, revision: current.revision, requestId }, (failure, response) => {
      if (generation !== epoch.current) return;
      requestPending.current = false; setBusy(false);
      if (failure || !response?.success) setError(response?.message || 'Máy chủ chưa phản hồi. Hãy thử lại.');
    });
  };
  useEffect(() => {
    if (screen !== 'playing' || mode === 'online' || busy || animation.rolling || animation.hopping || pendingTrade || !game || game.winner) return;
    const player = game.players[game.turnIndex]; if (!player?.isBot) return;
    const timer = setTimeout(() => {
      try { const action = chooseBotAction(gameRef.current); dispatch(action.type, action); }
      catch (failure) { setError(failure.message); }
    }, 750);
    return () => clearTimeout(timer);
  }, [screen, mode, game, busy, animation, pendingTrade]);

  const createRoom = ({ hostName, hostToken, freeParkingJackpot }) => {
    if (!socketRef.current?.connected) return setError('Máy chủ online chưa kết nối.');
    const generation = epoch.current;
    socketRef.current.timeout(5000).emit('create_room', { hostName, token: hostToken, customRules: { freeParkingJackpot } }, (failure, response) => {
      if (generation !== epoch.current) return;
      if (failure) setError('Máy chủ chưa phản hồi.'); else acceptRoom(response);
    });
  };
  const joinRoom = payload => {
    if (!socketRef.current?.connected) return setError('Máy chủ online chưa kết nối.');
    const generation = epoch.current;
    socketRef.current.timeout(5000).emit('join_room', payload, (failure, response) => {
      if (generation !== epoch.current) return;
      if (failure) setError('Máy chủ chưa phản hồi.'); else acceptRoom(response);
    });
  };
  const startOnline = () => socketRef.current?.timeout(5000).emit('start_game', {}, (failure, response) => {
    if (failure || !response?.success) setError(response?.message || 'Chưa thể bắt đầu ván.');
  });
  const sendTrade = offer => {
    if (modeRef.current === 'online') {
      socketRef.current?.timeout(5000).emit('send_trade_offer', offer, (failure, response) => {
        if (failure || !response?.success) setError(response?.message || 'Không gửi được đề nghị.');
      });
      return;
    }
    const target = gameRef.current.players.find(p => p.id === offer.targetId);
    const proposal = { ...offer, revision: gameRef.current.revision };
    if (target?.isBot) {
      const answer = AIEngine.evaluateTradeOffer(target, offer, gameRef.current.propertiesState, gameRef.current.players);
      if (answer.accept) {
        try { commit(applySessionTrade(gameRef.current, proposal)); } catch (failure) { setError(failure.message); }
      } else setError(`${target.name}: ${answer.reason}`);
    } else setPendingTrade(proposal);
  };
  const respondTrade = accept => {
    if (!pendingTrade) return;
    if (modeRef.current === 'online') socketRef.current?.timeout(5000).emit('respond_trade_offer', { offer: pendingTrade, accept }, (failure, response) => {
      if (failure || !response?.success) setError(response?.message || 'Đề nghị đã hết hạn.');
    });
    else if (accept) {
      try {
        if (pendingTrade.revision !== gameRef.current.revision) throw new Error('Ván đấu đã thay đổi, hãy gửi lại đề nghị.');
        commit(applySessionTrade(gameRef.current, pendingTrade));
      } catch (failure) { setError(failure.message); }
    }
    setPendingTrade(null);
  };
  return {
    screen, mode, game, room, myId, connected, busy, animation, error, pendingTrade, chatMessages,
    clearError: () => superseded.current ? leave() : setError(''), startLocal, leave, dispatch, createRoom, joinRoom, startOnline, sendTrade, respondTrade,
    toggleReady: () => socketRef.current?.emit('toggle_ready'),
    sendChat: message => socketRef.current?.emit('send_chat', { message }),
  };
}
