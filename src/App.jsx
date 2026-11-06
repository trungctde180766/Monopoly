import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Volume2, VolumeX, ShieldAlert, Coins, History, ArrowRight, RotateCcw, Home, Gavel, DollarSign, Music } from 'lucide-react';
import { BOARD_TILES, CHANCE_CARDS, COMMUNITY_CHEST_CARDS, INITIAL_MONEY, JAIL_FINE, GO_REWARD, TOKENS } from './data/boardData.js';
import { calculateRent, canBuildHouse, canSellHouse, canMortgage, canUnmortgage, calculateNetWorth, formatVND, calculateMaxLiquidatable, calculateBuyoutPrice, checkBusinessTourVictory } from './logic/gameEngine.js';
import { AIEngine } from './logic/aiEngine.js';
import { soundFX } from './utils/soundFx.js';

import Board from './components/Board.jsx';
import Board3D from './components/Board3D.jsx';
import Dice3D from './components/Dice3D.jsx';
import PlayerHUD from './components/PlayerHUD.jsx';
import CornerHUD from './components/CornerHUD.jsx';
import Lobby from './components/Lobby.jsx';
import OnlineRoom from './components/OnlineRoom.jsx';
import DeedModal from './components/DeedModal.jsx';
import {
  BusinessTourBuildModal,
  BuyoutModal,
  FestivalModal,
  AuctionModal,
  CardModal,
  JailModal,
  ManagePropertiesModal,
  TradeModal,
  TradeConfirmModal,
  VictoryModal,
} from './components/ActionModals.jsx';

class BoardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Board3D Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default function App() {
  // Trạng thái màn hình: 'lobby' | 'online_waiting' | 'playing'
  const [screen, setScreen] = useState('lobby');
  const [gameMode, setGameMode] = useState('pass_play'); // pass_play | online | quick

  // Trạng thái trò chơi
  const [players, setPlayers] = useState([]);
  const [propertiesState, setPropertiesState] = useState({});
  const [turnIndex, setTurnIndex] = useState(0);
  const [dice, setDice] = useState([1, 1]);
  const [isRolling, setIsRolling] = useState(false);
  const [isHopping, setIsHopping] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);
  const [doublesCount, setDoublesCount] = useState(0);
  const [freeParkingPool, setFreeParkingPool] = useState(0);
  const [customRules, setCustomRules] = useState({ freeParkingJackpot: true });
  const [gameLog, setGameLog] = useState(['Chào mừng bạn đến với Cờ Tỷ Phú Việt Nam!']);
  const [viewMode, setViewMode] = useState('3d'); // '3d' (Three.js) hoặc '2d' (Classic)
  const [constructionAlert, setConstructionAlert] = useState(null);
  const [floatingNumbers, setFloatingNumbers] = useState([]);
  const [screenShake, setScreenShake] = useState(false);
  const [isBGMPlaying, setIsBGMPlaying] = useState(false);

  // Modals chuẩn Business Tour
  const [viewDeedTile, setViewDeedTile] = useState(null);
  const [buildModalTile, setBuildModalTile] = useState(null);
  const [festivalModal, setFestivalModal] = useState(null);
  const [buyoutState, setBuyoutState] = useState(null);
  const [auctionState, setAuctionState] = useState(null);
  const [activeCard, setActiveCard] = useState(null);
  const [showJailModal, setShowJailModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [pendingTradeOffer, setPendingTradeOffer] = useState(null);
  const [totalTurnsCount, setTotalTurnsCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [winner, setWinner] = useState(null);
  const [isMuted, setIsMuted] = useState(false);

  // Đồng hồ tính giờ trận đấu trực tiếp
  useEffect(() => {
    if (screen !== 'playing' || winner) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [screen, winner]);

  const formatMatchTime = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Online Multiplayer State
  const socketRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);

  const [socketConnected, setSocketConnected] = useState(false);

  // Khởi tạo Socket.io
  useEffect(() => {
    const socketServerUrl = import.meta.env.VITE_SOCKET_URL || undefined;
    const socket = io(socketServerUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketId(socket.id);
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('connect_error', () => {
      setSocketConnected(false);
    });

    socket.on('room_updated', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on('game_started', ({ gameState }) => {
      setPlayers(gameState.players);
      setPropertiesState(gameState.propertiesState);
      setTurnIndex(gameState.turnIndex);
      setFreeParkingPool(gameState.freeParkingPool);
      setScreen('playing');
      setGameMode('online');
    });

    socket.on('game_state_updated', (incomingState) => {
      if (!incomingState || typeof incomingState !== 'object') return;
      if (Array.isArray(incomingState.players)) setPlayers(incomingState.players);
      if (incomingState.propertiesState && typeof incomingState.propertiesState === 'object') {
        setPropertiesState(incomingState.propertiesState);
      }
      if (typeof incomingState.turnIndex === 'number') setTurnIndex(incomingState.turnIndex);
      if (Array.isArray(incomingState.dice)) setDice(incomingState.dice);
      if (typeof incomingState.hasRolled === 'boolean') setHasRolled(incomingState.hasRolled);
      if (typeof incomingState.freeParkingPool === 'number') setFreeParkingPool(incomingState.freeParkingPool);
      // V3-01 Fix: gameLog luôn cập nhật nếu có, không bao giờ gán undefined gây crash UI
      if (Array.isArray(incomingState.gameLog)) setGameLog(incomingState.gameLog);
      if (incomingState.winner !== undefined) setWinner(incomingState.winner);
    });

    // R05 Fix: Nhận lời đề nghị giao dịch trực tuyến từ người chơi khác
    socket.on('trade_offer_received', (offer) => {
      if (offer && offer.targetId === socket.id) {
        setPendingTradeOffer(offer);
        soundFX.playCardDraw();
      }
    });

    // R05 & V3-04 Fix: Nhận kết quả phản hồi giao dịch trực tuyến (dùng executeTradeRef để không bị closure cũ)
    socket.on('trade_offer_responded', ({ offer, accept }) => {
      if (accept) {
        if (executeTradeRef.current) executeTradeRef.current(offer);
        addLog(`🤝 Giao dịch trực tuyến đã được chấp thuận và thực hiện thành công!`);
      } else {
        const target = (playersRef.current || players).find((p) => p.id === offer.targetId);
        addLog(`❌ ${target?.name || 'Đối thủ'} đã từ chối lời đề nghị giao dịch trực tuyến.`);
      }
      setPendingTradeOffer(null);
    });

    socket.on('chat_received', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    return () => socket.disconnect();
  }, []);

  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const currentPlayer = players[turnIndex] || null;

  const addLog = (msg) => {
    setGameLog((prev) => [msg, ...(Array.isArray(prev) ? prev.slice(0, 40) : [])]);
  };

  const toggleMute = () => {
    const muted = soundFX.toggleMute();
    setIsMuted(muted);
  };

  const toggleBGM = () => {
    const active = soundFX.toggleBGM();
    setIsBGMPlaying(active);
  };

  const triggerScreenShake = () => {
    setScreenShake(true);
    setTimeout(() => setScreenShake(false), 380);
  };

  const triggerFloatingMoney = (amount, isGain) => {
    if (!amount) return;
    const id = Date.now() + Math.random();
    setFloatingNumbers((prev) => [
      ...prev,
      {
        id,
        amount: Math.abs(amount),
        isGain,
      },
    ]);
    if (isGain) {
      soundFX.playMoneyGain();
    } else {
      soundFX.playPayRent();
    }
    setTimeout(() => {
      setFloatingNumbers((prev) => prev.filter((item) => item.id !== id));
    }, 2000);
  };

  // Đồng bộ trạng thái sang socket (nếu ở chế độ Online)
  const syncOnlineState = (updated) => {
    if (gameMode === 'online' && socketRef.current && room) {
      socketRef.current.emit('sync_game_state', {
        players: updated.players || players,
        propertiesState: updated.propertiesState || propertiesState,
        turnIndex: updated.turnIndex !== undefined ? updated.turnIndex : turnIndex,
        dice: updated.dice || dice,
        hasRolled: updated.hasRolled !== undefined ? updated.hasRolled : hasRolled,
        freeParkingPool: updated.freeParkingPool !== undefined ? updated.freeParkingPool : freeParkingPool,
        gameLog: updated.gameLog || gameLog,
        winner: updated.winner || winner,
      });
    }
  };

  // 1. BẮT ĐẦU CHƠI PASS & PLAY
  const handleStartPassAndPlay = ({ players: activePlayers, customRules: rules }) => {
    setPlayers(activePlayers);
    setCustomRules(rules);
    setGameMode('pass_play');
    setScreen('playing');
    setTurnIndex(0);
    setHasRolled(false);
    setDoublesCount(0);
    setFreeParkingPool(0);
    setPropertiesState({});
    setWinner(null);
    setGameLog([`Trận đấu Pass & Play bắt đầu với ${activePlayers.length} người chơi!`]);
  };

  // 2. BẮT ĐẦU CHƠI NHANH VỚI BOTS
  const handleStartQuickBot = ({ freeParkingJackpot }) => {
    const defaultPlayers = [
      {
        id: 'player_user',
        name: 'Bạn (Tỷ Phú)',
        token: 'car',
        color: '#ef4444',
        isBot: false,
        money: INITIAL_MONEY,
        position: 0,
        inJail: false,
        jailTurns: 0,
        outOfJailCards: 0,
        isBankrupt: false,
      },
      {
        id: 'bot_1',
        name: 'Đại Gia Hà Thành',
        token: 'hat',
        color: '#eab308',
        isBot: true,
        money: INITIAL_MONEY,
        position: 0,
        inJail: false,
        jailTurns: 0,
        outOfJailCards: 0,
        isBankrupt: false,
      },
      {
        id: 'bot_2',
        name: 'Trùm Địa Ốc Sài Gòn',
        token: 'diamond',
        color: '#3b82f6',
        isBot: true,
        money: INITIAL_MONEY,
        position: 0,
        inJail: false,
        jailTurns: 0,
        outOfJailCards: 0,
        isBankrupt: false,
      },
      {
        id: 'bot_3',
        name: 'Tỷ Phú Miền Tây',
        token: 'jet',
        color: '#10b981',
        isBot: true,
        money: INITIAL_MONEY,
        position: 0,
        inJail: false,
        jailTurns: 0,
        outOfJailCards: 0,
        isBankrupt: false,
      },
    ];

    setPlayers(defaultPlayers);
    setCustomRules({ freeParkingJackpot });
    setGameMode('quick');
    setScreen('playing');
    setTurnIndex(0);
    setHasRolled(false);
    setDoublesCount(0);
    setFreeParkingPool(0);
    setPropertiesState({});
    setWinner(null);
    setGameLog(['Trận đấu cùng 3 Bot thông minh chính thức bắt đầu!']);
  };

  // 3. TẠO PHÒNG ONLINE
  const handleStartOnlineHost = ({ hostName, hostToken, freeParkingJackpot }) => {
    if (!socketRef.current) return;
    socketRef.current.emit(
      'create_room',
      { hostName, token: hostToken, customRules: { freeParkingJackpot } },
      (res) => {
        if (res.success) {
          setRoom(res.room);
          setScreen('online_waiting');
        }
      }
    );
  };

  // 4. VÀO PHÒNG ONLINE
  const handleStartOnlineJoin = ({ roomCode, playerName, token }) => {
    if (!socketRef.current) return;
    socketRef.current.emit('join_room', { roomCode, playerName, token }, (res) => {
      if (res.success) {
        setRoom(res.room);
        setScreen('online_waiting');
      } else {
        alert(res.message || 'Không thể vào phòng!');
      }
    });
  };

  // 5. CHỦ PHÒNG BẮT ĐẦU GAME ONLINE
  const handleHostStartGame = () => {
    if (!socketRef.current || !room) return;
    const initialPlayers = room.players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      token: p.token,
      color: p.color,
      isBot: false,
      money: INITIAL_MONEY,
      position: 0,
      inJail: false,
      jailTurns: 0,
      outOfJailCards: 0,
      isBankrupt: false,
    }));

    const initialGameState = {
      players: initialPlayers,
      propertiesState: {},
      turnIndex: 0,
      freeParkingPool: 0,
    };

    socketRef.current.emit('start_game', initialGameState);
  };

  // HÀNH ĐỘNG: ĐỔ XÚC XẮC
  const handleRollDice = () => {
    if (isRolling || isHopping || hasRolled || !currentPlayer || currentPlayer.isBankrupt) return;

    // Kiểm tra nếu đang ở trong tù
    if (currentPlayer.inJail) {
      if (!currentPlayer.isBot) {
        setShowJailModal(true);
      }
      return;
    }

    setIsRolling(true);
    soundFX.playDiceRoll();

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2;
    const isDoubles = d1 === d2;

    setTimeout(() => {
      setDice([d1, d2]);
      setIsRolling(false);

      let newDoubles = isDoubles ? doublesCount + 1 : 0;
      setDoublesCount(newDoubles);

      // Quy tắc: Đổ đôi 3 lần liên tiếp thì BỊ BẮT VÀO TÙ
      if (newDoubles === 3) {
        soundFX.playGoToJail();
        addLog(`🚨 ${currentPlayer.name} đổ đôi 3 lần liên tiếp! Bị bắt giam vào tù vì quá tốc độ!`);
        const updatedPlayers = players.map((p) =>
          p.id === currentPlayer.id
            ? { ...p, inJail: true, jailTurns: 0, position: 10 }
            : p
        );
        setPlayers(updatedPlayers);
        setHasRolled(true);
        syncOnlineState({ players: updatedPlayers, dice: [d1, d2], hasRolled: true });
        return;
      }

      // Di chuyển quân cờ từng ô một với hoạt ảnh nhảy 3D
      movePlayer(currentPlayer.id, total, isDoubles);
    }, 900);
  };

  // DI CHUYỂN QUÂN CỜ VỚI HOẠT ẢNH STEP-BY-STEP
  const movePlayer = (playerId, steps, isDoubles, currentPlayersList = players) => {
    const p = currentPlayersList.find((x) => x.id === playerId);
    if (!p) return;

    const oldPos = p.position;
    const newPos = (oldPos + steps) % 40;
    const passedGo = oldPos + steps >= 40;

    let updatedMoney = p.money;
    if (passedGo) {
      updatedMoney += GO_REWARD;
      triggerFloatingMoney(GO_REWARD, true);
      addLog(`💰 ${p.name} đi qua ô Khởi Hành (GO), nhận lương ${formatVND(GO_REWARD)}!`);
    }

    const updatedPlayers = currentPlayersList.map((x) =>
      x.id === playerId ? { ...x, position: newPos, money: updatedMoney } : x
    );
    setPlayers(updatedPlayers);
    setIsHopping(true);

    // Thời gian quân cờ nhảy từng bước (mỗi ô khoảng 240ms)
    const hopDuration = Math.max(400, steps * 250);
    setTimeout(() => {
      setIsHopping(false);
      // Xử lý ô đáp xuống sau khi nhảy xong
      handleTileLanding(newPos, { ...p, position: newPos, money: updatedMoney }, isDoubles, updatedPlayers);
    }, hopDuration);
  };

  // XỬ LÝ KHI DỪNG CHÂN Ở Ô
  const handleTileLanding = (tileId, player, isDoubles, currentPlayersList) => {
    const tile = BOARD_TILES[tileId];
    if (!tile) return;

    addLog(`📍 ${player.name} đặt chân tới: ${tile.name}`);

    // 1. Ô Vào Tù Ngay (Go to Jail)
    if (tile.type === 'go_to_jail') {
      soundFX.playGoToJail();
      triggerScreenShake();
      addLog(`🚨 ${player.name} bị tống giam vào nhà tù ngay lập tức!`);
      const updated = currentPlayersList.map((p) =>
        p.id === player.id ? { ...p, inJail: true, jailTurns: 0, position: 10 } : p
      );
      setPlayers(updated);
      setHasRolled(true);
      syncOnlineState({ players: updated, hasRolled: true });
      return;
    }

    // 2. Ô Thuế (Income / Luxury Tax)
    if (tile.type === 'tax') {
      const tax = tile.taxAmount;
      triggerFloatingMoney(tax, false);
      triggerScreenShake();
      addLog(`💸 ${player.name} nộp thuế ${formatVND(tax)} vào ngân khố.`);
      let pool = freeParkingPool;
      if (customRules.freeParkingJackpot) {
        pool += tax;
        setFreeParkingPool(pool);
      }
      deductMoney(player.id, tax, null, currentPlayersList, pool);
      setHasRolled(true);
      return;
    }

    // 3. Ô Lễ Hội / World Championship (Joust)
    if (tile.type === 'free_parking' || tile.id === 20) {
      const owned = BOARD_TILES.filter(
        (t) => propertiesState[t.id]?.owner === player.id && t.type === 'property'
      ).map((t) => ({
        ...t,
        houses: propertiesState[t.id]?.houses || 1,
      }));

      if (owned.length > 0) {
        if (player.isBot) {
          const best = [...owned].sort(
            (a, b) => (b.rent[b.houses] || 0) - (a.rent[a.houses] || 0)
          )[0];
          setPropertiesState((prev) => ({
            ...prev,
            [best.id]: { ...prev[best.id], isFestival: true },
          }));
          addLog(`🎪 ${player.name} chọn thành phố ${best.name} để tổ chức Lễ Hội (x2 tiền thuê)!`);
          setHasRolled(true);
        } else {
          setFestivalModal({ player, ownedTiles: owned });
          return;
        }
      } else {
        const bonus = 500000;
        triggerFloatingMoney(bonus, true);
        addLog(`🎪 ${player.name} đến Đại Hội Thể Thao / Lễ Hội, nhận 500.000₫ tiền tài trợ!`);
        const updated = currentPlayersList.map((p) =>
          p.id === player.id ? { ...p, money: p.money + bonus } : p
        );
        setPlayers(updated);
        setHasRolled(true);
      }
      return;
    }

    // 4. Ô Cơ Hội (Chance) & Khí Vận (Community Chest)
    if (tile.type === 'chance' || tile.type === 'community_chest') {
      soundFX.playCardDraw();
      const deck = tile.type === 'chance' ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
      const card = deck[Math.floor(Math.random() * deck.length)];
      setActiveCard({ card, type: tile.type, player });
      return;
    }

    // 5. Ô Bất Động Sản / Ga Tàu / Tiện Ích
    if (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') {
      const prop = propertiesState[tile.id];

      // Nếu ô chưa có chủ: Mua và xây dựng theo 4 cấp bậc
      if (!prop || !prop.owner) {
        // F12: Nếu là Ga Tàu hoặc Tiện Ích, mua đứt không xây nhà
        if (tile.type !== 'property') {
          if (player.isBot) {
            const wantBuy = AIEngine.shouldBuyProperty(player, tile, propertiesState, currentPlayersList);
            if (wantBuy && player.money >= tile.price) {
              buyProperty(player.id, tile.id, tile.price, currentPlayersList);
            } else {
              addLog(`⏩ ${player.name} quyết định không mua ${tile.name}.`);
              setHasRolled(true);
            }
          } else {
            setBuildModalTile({ tile, player, propState: null, isNewPurchase: true });
          }
          return;
        }

        if (player.isBot) {
          const wantBuy = AIEngine.shouldBuyProperty(player, tile, propertiesState, currentPlayersList);
          if (wantBuy) {
            let bestTier = 1;
            const hPrice = tile.housePrice || 500000;
            // H01 Fix: Mua mới lần đầu tối đa là cấp 3 (Biệt thự), Landmark yêu cầu ghé lại khi đã có cấp 3
            if (player.money >= tile.price + hPrice * 2) bestTier = 3;
            else if (player.money >= tile.price + hPrice) bestTier = 2;

            const cost = tile.price + (bestTier - 1) * hPrice;
            handleConfirmBuildTier(tile.id, bestTier, cost, player, currentPlayersList);
          } else {
            addLog(`⏩ ${player.name} quyết định không mua ${tile.name}.`);
            setHasRolled(true);
          }
        } else {
          setBuildModalTile({ tile, player, propState: null, isNewPurchase: true });
        }
        return;
      }

      // Nếu ô thuộc sở hữu của người chơi khác
      if (prop.owner !== player.id) {
        const owner = currentPlayersList.find((p) => p.id === prop.owner);
        if (owner && !owner.isBankrupt && !prop.isMortgaged) {
          const rent = calculateRent(tile, propertiesState, dice[0] + dice[1]);
          triggerFloatingMoney(rent, false);
          addLog(
            `🏠 ${player.name} trả tiền thuê ${formatVND(rent)} cho ${owner.name} tại ${tile.name}${
              prop.isFestival ? ' (Đang có Lễ Hội x2 🔥)' : ''
            }.`
          );
          const playersAfterRent = transferMoney(player.id, owner.id, rent, currentPlayersList) || currentPlayersList;

          // CƯỚP ĐẤT (BUYOUT) CHUẨN BUSINESS TOUR:
          // Nếu ô đất đã đạt Cấp 4 (Khách Sạn / Landmark): BẤT KHẢ XÂM PHẠM, KHÔNG THỂ BỊ CƯỚP!
          if (prop.houses >= 4) {
            addLog(`🛡️ ${tile.name} đã là Khách Sạn (Landmark) - Bất khả xâm phạm, đối thủ không thể cướp đất!`);
            setHasRolled(true);
            return;
          }

          const buyoutPrice = calculateBuyoutPrice(tile, prop);
          const buyer = playersAfterRent.find((x) => x.id === player.id);
          if (buyoutPrice > 0 && buyer && buyer.money >= buyoutPrice && !buyer.isBankrupt) {
            if (player.isBot) {
              if (buyer.money >= buyoutPrice * 1.5) {
                executeBuyout(player.id, owner.id, tile.id, buyoutPrice, playersAfterRent);
              } else {
                setHasRolled(true);
              }
            } else {
              setBuyoutState({ tile, owner, player: buyer, buyoutPrice });
            }
            return;
          }
        } else if (prop.isMortgaged) {
          addLog(`🛡️ ${tile.name} đang bị thế chấp nên ${player.name} được miễn tiền thuê.`);
        }
      } else {
        // ĐẶT CHÂN LÊN ĐẤT CỦA CHÍNH MÌNH: NÂNG CẤP NHÀ THEO 4 CẤP BẬC CHUẨN BUSINESS TOUR
        if (tile.type !== 'property') {
          addLog(`🚂 ${player.name} ghé thăm ${tile.name} của mình!`);
          setHasRolled(true);
          return;
        }
        if (prop.houses >= 4) {
          addLog(`🏰 ${player.name} ghé thăm Khách Sạn (Landmark) của mình tại ${tile.name}!`);
          setHasRolled(true);
        } else {
          if (player.isBot) {
            const nextTier = Math.min(4, (prop.houses || 0) + 1);
            const cost = (nextTier - (prop.houses || 0)) * (tile.housePrice || 500000);
            if (player.money >= cost) {
              handleConfirmBuildTier(tile.id, nextTier, cost, player, currentPlayersList);
            } else {
              setHasRolled(true);
            }
          } else {
            setBuildModalTile({ tile, player, propState: prop, isNewPurchase: false });
            return;
          }
        }
      }
      setHasRolled(true);
    } else {
      setHasRolled(true);
    }
  };

  // XÁC NHẬN XÂY DỰNG / NÂNG CẤP THEO 4 CẤP BẬC CHUẨN BUSINESS TOUR (F03 & F12 FIX)
  const handleConfirmBuildTier = (tileId, targetTier, totalCost, activeP = currentPlayer, playersList = players) => {
    const tile = BOARD_TILES[tileId];
    if (!tile || !activeP) return;

    // F12 Fix: Ga tàu và Tiện ích mua đứt không xây nhà
    if (tile.type !== 'property') {
      buyProperty(activeP.id, tileId, tile.price, playersList);
      return;
    }

    const prop = propertiesState[tileId];
    const isNew = !prop?.owner;
    const currentHouses = prop?.houses || 0;

    // F03 & H01 Fix: Không cho phép hạ cấp, vượt quá cấp 4, hoặc mua thẳng Landmark lần đầu
    if (targetTier <= currentHouses || targetTier > 4) return;
    if (isNew && targetTier > 3) return; // Mua mới lần đầu chỉ được tối đa cấp 3
    if (!isNew && currentHouses < 3 && targetTier === 4) return; // Landmark bắt buộc phải từ cấp 3 nâng lên
    if (prop?.isMortgaged) return; // Không thể xây trên đất đang thế chấp

    // Tính lại chi phí chuẩn xác từ engine, không phụ thuộc giá do UI truyền
    const hPrice = tile.housePrice || 500000;
    const neededUpgrade = isNew ? targetTier - 1 : targetTier - currentHouses;
    const calculatedCost = (isNew ? tile.price : 0) + Math.max(0, neededUpgrade) * hPrice;

    if (activeP.money < calculatedCost) return;

    const isLandmark = targetTier >= 4;

    const updatedPlayers = playersList.map((p) =>
      p.id === activeP.id ? { ...p, money: p.money - calculatedCost } : p
    );

    const updatedProps = {
      ...propertiesState,
      [tileId]: {
        ...propertiesState[tileId],
        owner: activeP.id,
        houses: targetTier,
        isMortgaged: false,
      },
    };

    setPlayers(updatedPlayers);
    setPropertiesState(updatedProps);
    setBuildModalTile(null);
    setHasRolled(true);

    soundFX.playBuildHouse();
    addLog(
      `🏗️ ${activeP.name} ${isNew ? 'mua và xây' : 'nâng cấp'} ${tile.name} lên ${
        isLandmark ? '🏰 KHÁCH SẠN (LANDMARK - BẤT KHẢ XÂM PHẠM)' : `Nhà Cấp ${targetTier}`
      } (Chi ${formatVND(calculatedCost)})!`
    );
    setConstructionAlert({
      player: activeP.name,
      tileName: tile.name,
      type: isLandmark ? 'hotel' : 'house',
    });
    setTimeout(() => setConstructionAlert(null), 3500);

    const victory = checkBusinessTourVictory(updatedProps, updatedPlayers);
    if (victory) {
      setWinner({ ...victory.winner, winReason: victory.reason });
      syncOnlineState({
        players: updatedPlayers,
        propertiesState: updatedProps,
        winner: { ...victory.winner, winReason: victory.reason },
      });
    } else {
      syncOnlineState({ players: updatedPlayers, propertiesState: updatedProps, hasRolled: true });
    }
  };

  // ĐĂNG CAI LỄ HỘI / WORLD CHAMPIONSHIP
  const handleSelectFestivalCity = (tileId) => {
    const tile = BOARD_TILES[tileId];
    const updatedProps = {
      ...propertiesState,
      [tileId]: {
        ...propertiesState[tileId],
        isFestival: true,
      },
    };
    setPropertiesState(updatedProps);
    soundFX.playVictory();
    addLog(`🎪 ${currentPlayer?.name} chính thức tổ chức LỄ HỘI THẾ GIỚI tại ${tile?.name}! Tiền thuê tại đây được NHÂN ĐÔI (x2)!`);
    setFestivalModal(null);
    setHasRolled(true);
    syncOnlineState({ propertiesState: updatedProps, hasRolled: true });
  };

  // CƯỚP ĐẤT (BUYOUT) CHUẨN BUSINESS TOUR
  const executeBuyout = (buyerId, ownerId, tileId, price, currentList = players) => {
    const buyer = currentList.find((p) => p.id === buyerId);
    const owner = currentList.find((p) => p.id === ownerId);
    const tile = BOARD_TILES[tileId];
    if (!buyer || !owner || !tile || buyer.money < price) return;

    soundFX.playCollectMoney();
    addLog(`⚔️ ${buyer.name} chi ${formatVND(price)} CƯỚP ĐỨT khu đất ${tile.name} của ${owner.name}!`);

    const updatedPlayers = currentList.map((p) => {
      if (p.id === buyerId) return { ...p, money: p.money - price };
      if (p.id === ownerId) return { ...p, money: p.money + price };
      return p;
    });

    const updatedProps = {
      ...propertiesState,
      [tileId]: {
        ...propertiesState[tileId],
        owner: buyerId,
      },
    };

    setPlayers(updatedPlayers);
    setPropertiesState(updatedProps);
    setBuyoutState(null);
    setHasRolled(true);

    // Kiểm tra điều kiện thắng nhanh Business Tour
    const victory = checkBusinessTourVictory(updatedProps, updatedPlayers);
    if (victory) {
      setWinner({ ...victory.winner, winReason: victory.reason });
      syncOnlineState({ players: updatedPlayers, propertiesState: updatedProps, winner: { ...victory.winner, winReason: victory.reason } });
    } else {
      syncOnlineState({ players: updatedPlayers, propertiesState: updatedProps, hasRolled: true });
    }
  };

  // MUA ĐẤT (R02 Fix: nhận currentList để không dùng closure cũ sau GO)
  const buyProperty = (playerId, tileId, price, currentList = players) => {
    const p = currentList.find((x) => x.id === playerId);
    const tile = BOARD_TILES[tileId];
    if (!p || !tile || p.money < price) return;

    soundFX.playBuyProperty();
    addLog(`📜 ${p.name} đã mua thành công: ${tile.name} với giá ${formatVND(price)}!`);

    const updatedPlayers = currentList.map((x) =>
      x.id === playerId ? { ...x, money: x.money - price } : x
    );
    const updatedProps = {
      ...propertiesState,
      [tileId]: { owner: playerId, houses: 0, isMortgaged: false },
    };

    setPlayers(updatedPlayers);
    setPropertiesState(updatedProps);
    setBuildModalTile(null);
    setHasRolled(true);

    // Kiểm tra điều kiện thắng nhanh Business Tour
    const victory = checkBusinessTourVictory(updatedProps, updatedPlayers);
    if (victory) {
      setWinner({ ...victory.winner, winReason: victory.reason });
      syncOnlineState({ players: updatedPlayers, propertiesState: updatedProps, winner: { ...victory.winner, winReason: victory.reason } });
    } else {
      syncOnlineState({ players: updatedPlayers, propertiesState: updatedProps, hasRolled: true });
    }
  };

  // KHỞI ĐỘNG ĐẤU GIÁ (AUCTION)
  const startAuction = (tile, currentPlayersList = players) => {
    setBuildModalTile(null);
    const eligibleBidders = currentPlayersList.filter((p) => !p.isBankrupt);
    if (eligibleBidders.length === 0) return;

    soundFX.playGavel();
    addLog(`📢 Mở phiên đấu giá cho khu đất: ${tile.name}!`);

    const initialBid = Math.floor(tile.price * 0.5);
    setAuctionState({
      tile,
      currentBid: initialBid,
      highestBidderId: null,
      currentTurnPlayerId: eligibleBidders[0].id,
      activeBidders: eligibleBidders.map((p) => p.id),
      turnIdx: 0,
    });
  };

  // TRẢ GIÁ ĐẤU GIÁ
  const handlePlaceBid = (bidAmount) => {
    if (!auctionState) return;
    const bidder = players.find((p) => p.id === auctionState.currentTurnPlayerId);
    if (!bidder || bidder.money < bidAmount) return;

    soundFX.playGavel();
    addLog(`🔨 ${bidder.name} trả giá: ${formatVND(bidAmount)}`);

    advanceAuctionTurn(bidAmount, bidder.id, auctionState.activeBidders, false);
  };

  // BỎ QUA ĐẤU GIÁ
  const handlePassBid = () => {
    if (!auctionState) return;
    const remaining = auctionState.activeBidders.filter(
      (id) => id !== auctionState.currentTurnPlayerId
    );
    advanceAuctionTurn(auctionState.currentBid, auctionState.highestBidderId, remaining, true);
  };

  const advanceAuctionTurn = (currentBid, highestBidderId, activeBidders, didPass = false) => {
    // Nếu chỉ còn 1 người tham gia và đã có người trả giá: Người đó thắng đấu giá!
    if (activeBidders.length === 1 && highestBidderId) {
      const winnerPlayer = players.find((p) => p.id === highestBidderId);
      const tile = auctionState.tile;
      if (winnerPlayer && tile) {
        soundFX.playBuyProperty();
        addLog(`🏆 ${winnerPlayer.name} thắng đấu giá ${tile.name} với mức giá ${formatVND(currentBid)}!`);
        buyProperty(winnerPlayer.id, tile.id, currentBid);
      }
      setAuctionState(null);
      return;
    }

    // Nếu tất cả cùng bỏ cuộc mà chưa ai trả giá: Hủy đấu giá
    if (activeBidders.length === 0) {
      addLog(`❌ Phiên đấu giá kết thúc mà không có ai mua.`);
      setAuctionState(null);
      setHasRolled(true);
      return;
    }

    // F08: Tính index kế tiếp chính xác: nếu người trước vừa bỏ cuộc (didPass), giữ nguyên index modulo độ dài mới; nếu vừa ra giá, index + 1
    const currentIdx = auctionState.turnIdx || 0;
    const nextIdx = didPass ? (currentIdx % activeBidders.length) : ((currentIdx + 1) % activeBidders.length);
    const nextBidderId = activeBidders[nextIdx];
    const nextBidder = players.find((p) => p.id === nextBidderId);

    const updatedAuction = {
      ...auctionState,
      currentBid,
      highestBidderId,
      activeBidders,
      currentTurnPlayerId: nextBidderId,
      turnIdx: nextIdx,
    };
    setAuctionState(updatedAuction);

    // Nếu người kế tiếp là BOT, tự động tính toán
    if (nextBidder && nextBidder.isBot) {
      setTimeout(() => {
        const botBid = AIEngine.getAuctionBid(nextBidder, auctionState.tile, currentBid, propertiesState, players);
        if (botBid) {
          handlePlaceBid(botBid);
        } else {
          handlePassBid();
        }
      }, 700);
    }
  };

  // XỬ LÝ KHI XÁC NHẬN THẺ CƠ HỘI / KHÍ VẬN
  const handleConfirmCard = () => {
    if (!activeCard) return;
    const { card, player } = activeCard;
    setActiveCard(null);

    let updatedPlayers = [...players];

    switch (card.action) {
      case 'collect_money':
        triggerFloatingMoney(card.amount, true);
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === player.id ? { ...p, money: p.money + card.amount } : p
        );
        addLog(`🎁 ${player.name} nhận được ${formatVND(card.amount)}.`);
        break;

      case 'pay_money':
        triggerFloatingMoney(card.amount, false);
        setHasRolled(true);
        deductMoney(player.id, card.amount, null, updatedPlayers);
        return;

      case 'move_nearest_railroad': {
        const railroads = [5, 15, 25, 35];
        let targetRailroad = railroads.find((r) => r > player.position);
        let passed = false;
        if (targetRailroad === undefined) {
          targetRailroad = railroads[0];
          passed = true;
        }
        let cash = player.money + (passed && card.collectPassGo ? GO_REWARD : 0);
        if (passed && card.collectPassGo) {
          soundFX.playCollectMoney();
          addLog(`💰 ${player.name} đi qua GO tới Ga gần nhất, nhận ${formatVND(GO_REWARD)}.`);
        }
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === player.id ? { ...p, position: targetRailroad, money: cash } : p
        );
        setPlayers(updatedPlayers);
        handleTileLanding(targetRailroad, { ...player, position: targetRailroad, money: cash }, false, updatedPlayers);
        return;
      }

      case 'property_repair': {
        let repairCost = 0;
        BOARD_TILES.forEach((t) => {
          if (t.type === 'property' && propertiesState[t.id]?.owner === player.id) {
            const h = propertiesState[t.id]?.houses || 0;
            if (h === 4) {
              repairCost += (card.hotelCost || 1000000);
            } else if (h > 0) {
              repairCost += h * (card.houseCost || 250000);
            }
          }
        });
        if (repairCost > 0) {
          triggerFloatingMoney(repairCost, false);
          addLog(`🛠️ ${player.name} chi ${formatVND(repairCost)} bảo trì toàn bộ công trình.`);
          setHasRolled(true);
          deductMoney(player.id, repairCost, null, updatedPlayers);
        } else {
          addLog(`🛠️ ${player.name} không có bất động sản nào cần bảo trì.`);
          setPlayers(updatedPlayers);
          setHasRolled(true);
        }
        return;
      }

      case 'move_to':
        const targetTile = card.targetTile;
        const passed = card.collectPassGo && player.position > targetTile;
        let cash = player.money + (passed ? GO_REWARD : 0);
        if (passed) {
          soundFX.playCollectMoney();
          addLog(`💰 ${player.name} đi qua GO, nhận ${formatVND(GO_REWARD)}.`);
        }
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === player.id ? { ...p, position: targetTile, money: cash } : p
        );
        setPlayers(updatedPlayers);
        handleTileLanding(targetTile, { ...player, position: targetTile, money: cash }, false, updatedPlayers);
        return;

      case 'move_relative':
        const relPos = (player.position + card.steps + 40) % 40;
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === player.id ? { ...p, position: relPos } : p
        );
        setPlayers(updatedPlayers);
        handleTileLanding(relPos, { ...player, position: relPos }, false, updatedPlayers);
        return;

      case 'go_to_jail':
        soundFX.playGoToJail();
        triggerScreenShake();
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === player.id ? { ...p, inJail: true, jailTurns: 0, position: 10 } : p
        );
        addLog(`🚨 ${player.name} bị áp giải vào tù!`);
        break;

      case 'get_out_of_jail_free':
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === player.id ? { ...p, outOfJailCards: (p.outOfJailCards || 0) + 1 } : p
        );
        addLog(`🎟️ ${player.name} nhận được Thẻ Miễn Vào Tù!`);
        break;

      case 'collect_from_all':
        let totalCollected = 0;
        updatedPlayers = updatedPlayers.map((p) => {
          if (p.id !== player.id && !p.isBankrupt) {
            totalCollected += card.amount;
            return { ...p, money: p.money - card.amount };
          }
          return p;
        });
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === player.id ? { ...p, money: p.money + totalCollected } : p
        );
        triggerFloatingMoney(totalCollected, true);
        addLog(`🎂 Mỗi người chơi tặng ${player.name} ${formatVND(card.amount)}!`);
        break;

      case 'pay_all_players':
        const totalPaid = card.amount * (players.filter(p => p.id !== player.id && !p.isBankrupt).length);
        triggerFloatingMoney(totalPaid, false);
        updatedPlayers = updatedPlayers.map((p) => {
          if (p.id !== player.id && !p.isBankrupt) {
            return { ...p, money: p.money + card.amount };
          } else if (p.id === player.id) {
            return { ...p, money: p.money - totalPaid };
          }
          return p;
        });
        addLog(`🍾 ${player.name} khao mỗi người chơi ${formatVND(card.amount)}.`);
        break;

      default:
        break;
    }

    setPlayers(updatedPlayers);
    setHasRolled(true);
    syncOnlineState({ players: updatedPlayers, hasRolled: true });
  };

  // THỰC THI GIAO DỊCH SAU KHI ĐỒNG THUẬN (F02, F13 & V3-04 Fix)
  const executeTrade = (tradeOffer, playersList = players) => {
    const { senderId, targetId, offerMoney = 0, offerTiles = [], demandMoney = 0, demandTiles = [] } = tradeOffer;
    const baseList = playersList && playersList.length > 0
      ? playersList
      : (players && players.length > 0 ? players : [{ id: senderId, name: 'Người Gửi', money: 15000000 }, { id: targetId, name: 'Người Nhận', money: 15000000 }]);
    const sender = baseList.find((p) => p.id === senderId);
    const target = baseList.find((p) => p.id === targetId);
    if (!sender || !target) return;

    if (sender.money < offerMoney || target.money < demandMoney) {
      addLog(`❌ Giao dịch thất bại: Một trong hai bên không còn đủ tiền mặt!`);
      return;
    }
    const currentProps = propertiesState || {};
    const senderOwnsAll = offerTiles.every((id) => currentProps[id]?.owner === senderId);
    const targetOwnsAll = demandTiles.every((id) => currentProps[id]?.owner === targetId);
    if (!senderOwnsAll || !targetOwnsAll) {
      addLog(`❌ Giao dịch thất bại: Quyền sở hữu tài sản đã bị thay đổi!`);
      return;
    }

    soundFX.playBuyProperty();
    addLog(`🤝 Giao dịch hoàn tất thành công giữa ${sender.name} và ${target.name}!`);

    let propsCopy = { ...currentProps };
    offerTiles.forEach((id) => {
      propsCopy[id] = { ...propsCopy[id], owner: targetId };
    });
    demandTiles.forEach((id) => {
      propsCopy[id] = { ...propsCopy[id], owner: senderId };
    });

    const updatedPlayers = baseList.map((p) => {
      if (p.id === senderId) {
        return { ...p, money: p.money - offerMoney + demandMoney };
      }
      if (p.id === targetId) {
        return { ...p, money: p.money - demandMoney + offerMoney };
      }
      return p;
    });

    setPlayers(updatedPlayers);
    setPropertiesState(propsCopy);

    // F13: Kiểm tra điều kiện thắng Business Tour ngay sau giao dịch
    const victory = checkBusinessTourVictory(propsCopy, updatedPlayers);
    if (victory && victory.winner) {
      setWinner({ ...victory.winner, winReason: victory.reason });
      syncOnlineState({
        players: updatedPlayers,
        propertiesState: propsCopy,
        winner: { ...victory.winner, winReason: victory.reason },
      });
      return;
    }

    syncOnlineState({ players: updatedPlayers, propertiesState: propsCopy });
  };

  const executeTradeRef = useRef(executeTrade);
  useEffect(() => {
    executeTradeRef.current = executeTrade;
  }, [executeTrade]);

  // CHUYỂN TIỀN GIỮA 2 NGƯỜI CHƠI (R03 Fix: Theo dõi shortfall để chủ nợ nhận đủ 100% tiền thuê sau thanh lý)
  const transferMoney = (fromId, toId, amount, currentPlayersList = players) => {
    const fromPlayer = currentPlayersList.find((p) => p.id === fromId);
    if (!fromPlayer) return currentPlayersList;

    // F07: Con nợ chỉ có thể trả tối đa số tiền mặt đang có nếu phá sản (hoặc đủ trả amount)
    const canPayFull = fromPlayer.money >= amount;
    const actualTransfer = canPayFull ? amount : Math.max(0, fromPlayer.money);
    const shortfall = amount - actualTransfer;

    let updated = currentPlayersList.map((p) => {
      if (p.id === fromId) return { ...p, money: p.money - amount };
      if (p.id === toId) return { ...p, money: p.money + actualTransfer };
      return p;
    });

    const debtor = updated.find((p) => p.id === fromId);
    if (debtor && debtor.money < 0) {
      handleDebtCrisis(debtor, toId, updated, shortfall);
      return updated;
    }

    setPlayers(updated);
    syncOnlineState({ players: updated });
    return updated;
  };

  // TRỪ TIỀN VÀO NGÂN KHỐ (THUẾ / PHẠT)
  const deductMoney = (playerId, amount, creditorId = null, currentPlayersList = players, poolVal = freeParkingPool) => {
    let updated = currentPlayersList.map((p) =>
      p.id === playerId ? { ...p, money: p.money - amount } : p
    );

    const debtor = updated.find((p) => p.id === playerId);
    if (debtor && debtor.money < 0) {
      const shortfall = Math.abs(debtor.money);
      handleDebtCrisis(debtor, creditorId, updated, shortfall);
      return;
    }

    setPlayers(updated);
    setHasRolled(true);
    syncOnlineState({ players: updated, freeParkingPool: poolVal, hasRolled: true });
  };

  // XỬ LÝ KHỦNG HOẢNG NỢ / PHÁ SẢN (BANKRUPTCY CHECK - R03 Fix)
  const handleDebtCrisis = (debtor, creditorId, currentPlayersList, shortfall = 0) => {
    const maxLiquid = calculateMaxLiquidatable(debtor, propertiesState);

    // F04: calculateMaxLiquidatable đã bao gồm tiền mặt hiện có.
    // Nếu maxLiquid < 0: ngay cả khi bán hết toàn bộ nhà và thế chấp mọi đất đai vẫn không đủ bù nợ -> PHÁ SẢN!
    if (maxLiquid < 0) {
      declareBankruptcy(debtor.id, creditorId, currentPlayersList);
    } else {
      // Nếu là Bot: tự động bán nhà và thế chấp để cứu nguy
      if (debtor.isBot) {
        const debtNeeded = Math.abs(debtor.money);
        const reliefActions = AIEngine.planDebtRelief(debtor, debtNeeded, propertiesState);
        let currentCash = debtor.money;
        let propsCopy = { ...propertiesState };

        reliefActions.forEach((act) => {
          if (act.type === 'sell_house') {
            propsCopy[act.tileId].houses = Math.max(0, (propsCopy[act.tileId].houses || 0) - 1);
            currentCash += act.amount;
          } else if (act.type === 'mortgage') {
            propsCopy[act.tileId].isMortgaged = true;
            currentCash += act.amount;
          }
        });

        // R03 Fix: Sau khi bot thanh lý xong, chuyển nốt phần nợ shortfall còn thiếu cho chủ nợ
        const updated = currentPlayersList.map((p) => {
          if (p.id === debtor.id) return { ...p, money: currentCash };
          if (creditorId && p.id === creditorId && shortfall > 0) return { ...p, money: p.money + shortfall };
          return p;
        });

        setPlayers(updated);
        setPropertiesState(propsCopy);
        const creditor = currentPlayersList.find((p) => p.id === creditorId);
        addLog(
          `⚠️ ${debtor.name} đã thế chấp tài sản trả xong nợ${
            creditor && shortfall > 0 ? ` (Thanh toán đủ ${formatVND(shortfall)} còn thiếu cho ${creditor.name})` : ''
          }!`
        );
        syncOnlineState({ players: updated, propertiesState: propsCopy });
      } else {
        // Người chơi thật: hiển thị thông báo mở Modal Sổ đỏ để thanh lý (R03 & V3-05 Fix: lưu debtCreditorId & shortfall)
        addLog(`⚠️ Cảnh báo: ${debtor.name} đang bị âm tiền! Hãy vào Sổ Đỏ để bán nhà hoặc thế chấp!`);
        const withDebtInfo = currentPlayersList.map((p) =>
          p.id === debtor.id ? { ...p, debtCreditorId: creditorId, debtShortfall: shortfall } : p
        );
        setPlayers(withDebtInfo);
        setShowManageModal(true);
      }
    }
  };

  // TUYÊN BỐ PHÁ SẢN
  const declareBankruptcy = (bankruptId, creditorId, currentPlayersList = players) => {
    soundFX.playBankruptcy();
    const bankruptPlayer = currentPlayersList.find((p) => p.id === bankruptId);
    const creditor = currentPlayersList.find((p) => p.id === creditorId);

    addLog(`💥 ${bankruptPlayer?.name} chính thức TUYÊN BỐ PHÁ SẢN! Rời khỏi cuộc chơi!`);

    let updatedProps = { ...propertiesState };

    // Chuyển giao tài sản cho chủ nợ hoặc trả lại ngân hàng
    BOARD_TILES.forEach((tile) => {
      if (updatedProps[tile.id]?.owner === bankruptId) {
        if (creditor) {
          updatedProps[tile.id] = { ...updatedProps[tile.id], owner: creditor.id };
        } else {
          // Trả về ngân hàng
          delete updatedProps[tile.id];
        }
      }
    });

    const updatedPlayers = currentPlayersList.map((p) =>
      p.id === bankruptId ? { ...p, isBankrupt: true, money: 0 } : p
    );

    setPlayers(updatedPlayers);
    setPropertiesState(updatedProps);

    // Kiểm tra người chiến thắng cuối cùng
    const survivors = updatedPlayers.filter((p) => !p.isBankrupt);
    if (survivors.length === 1) {
      setWinner({ ...survivors[0], winReason: 'Tất cả đối thủ đã phá sản! Bạn là người sống sót duy nhất!' });
      syncOnlineState({ players: updatedPlayers, propertiesState: updatedProps, winner: survivors[0] });
      return;
    }

    // F13: Nếu tài sản được chuyển cho chủ nợ, kiểm tra xem chủ nợ có đạt chiến thắng Business Tour ngay không!
    if (creditor) {
      const victory = checkBusinessTourVictory(updatedProps, updatedPlayers);
      if (victory && victory.winner) {
        setWinner({ ...victory.winner, winReason: victory.reason });
        syncOnlineState({ players: updatedPlayers, propertiesState: updatedProps, winner: victory.winner });
        return;
      }
    }

    syncOnlineState({ players: updatedPlayers, propertiesState: updatedProps });
  };

  // KẾT THÚC LƯỢT ĐI
  const handleEndTurn = () => {
    if (!currentPlayer) return;

    if (currentPlayer.money < 0) {
      addLog(`⚠️ ${currentPlayer.name} đang bị âm tiền (${formatVND(currentPlayer.money)})! Phải thanh lý tài sản hoặc phá sản trước khi kết thúc lượt!`);
      setShowManageModal(true);
      return;
    }

    // Nếu đổ xúc xắc đôi (và không bị vào tù), được đi tiếp thêm lượt!
    const isDoubles = dice[0] === dice[1];
    if (isDoubles && !currentPlayer.inJail && doublesCount < 3) {
      setHasRolled(false);
      addLog(`🎲 ${currentPlayer.name} được đi tiếp nhờ đổ xúc xắc đôi!`);
      return;
    }

    // Chuyển lượt sang người chơi tiếp theo còn sống
    let nextIdx = (turnIndex + 1) % players.length;
    let loopGuard = 0;
    while (players[nextIdx].isBankrupt && loopGuard < players.length) {
      nextIdx = (nextIdx + 1) % players.length;
      loopGuard++;
    }

    setTurnIndex(nextIdx);
    setHasRolled(false);
    setDoublesCount(0);
    setTotalTurnsCount((prev) => prev + 1);

    const nextPlayer = players[nextIdx];
    addLog(`👉 Đến lượt của: ${nextPlayer.name}`);
    syncOnlineState({ turnIndex: nextIdx, hasRolled: false, doublesCount: 0 });
  };

  // BOT AUTOMATION HOOK
  useEffect(() => {
    if (screen !== 'playing' || !currentPlayer || !currentPlayer.isBot || currentPlayer.isBankrupt) {
      return;
    }

    // 0. Nếu Bot đang có thẻ Cơ Hội / Khí Vận cần xác nhận
    if (activeCard && activeCard.player.id === currentPlayer.id) {
      const timer = setTimeout(() => {
        handleConfirmCard();
      }, 1200);
      return () => clearTimeout(timer);
    }

    // 1. Nếu Bot đang trong tù
    if (currentPlayer.inJail && !hasRolled) {
      const timer = setTimeout(() => {
        const action = AIEngine.decideJailAction(currentPlayer, currentPlayer.jailTurns || 0, propertiesState);
        if (action === 'use_card') {
          soundFX.playCollectMoney();
          addLog(`🎟️ ${currentPlayer.name} dùng Thẻ Đặc Xá để ra tù!`);
          const updated = players.map((p) =>
            p.id === currentPlayer.id
              ? { ...p, inJail: false, jailTurns: 0, outOfJailCards: p.outOfJailCards - 1 }
              : p
          );
          setPlayers(updated);
        } else if (action === 'pay_fine') {
          soundFX.playCollectMoney();
          addLog(`💰 ${currentPlayer.name} nộp ${formatVND(JAIL_FINE)} tiền bảo lãnh ra tù!`);
          const updated = players.map((p) =>
            p.id === currentPlayer.id
              ? { ...p, inJail: false, jailTurns: 0, money: p.money - JAIL_FINE }
              : p
          );
          setPlayers(updated);
        } else {
          // Thử đổ đôi trong tù
          const d1 = Math.floor(Math.random() * 6) + 1;
          const d2 = Math.floor(Math.random() * 6) + 1;
          setDice([d1, d2]);
          if (d1 === d2) {
            soundFX.playCollectMoney();
            addLog(`🎉 ${currentPlayer.name} đổ đôi [${d1}-${d2}], được tha bổng ngay lập tức!`);
            const updated = players.map((p) =>
              p.id === currentPlayer.id ? { ...p, inJail: false, jailTurns: 0 } : p
            );
            setPlayers(updated);
            movePlayer(currentPlayer.id, d1 + d2, false, updated);
          } else {
            soundFX.playPayRent();
            const turns = (currentPlayer.jailTurns || 0) + 1;
            if (turns >= 3) {
              addLog(`⏳ ${currentPlayer.name} đã ở tù đủ 3 lượt, nộp ${formatVND(JAIL_FINE)} ra tù.`);
              const updated = players.map((p) =>
                p.id === currentPlayer.id
                  ? { ...p, inJail: false, jailTurns: 0, money: p.money - JAIL_FINE }
                  : p
              );
              setPlayers(updated);
              movePlayer(currentPlayer.id, d1 + d2, false, updated);
            } else {
              addLog(`🔒 ${currentPlayer.name} đổ [${d1}-${d2}], tiếp tục ngồi tù (${turns}/3).`);
              const updated = players.map((p) =>
                p.id === currentPlayer.id ? { ...p, jailTurns: turns } : p
              );
              setPlayers(updated);
              setHasRolled(true);
            }
          }
          return;
        }
      }, 1000);
      return () => clearTimeout(timer);
    }

    // 2. Bot tự động đổ xúc xắc
    if (!hasRolled && !isRolling && !isHopping && !buildModalTile && !auctionState && !activeCard) {
      const timer = setTimeout(() => {
        handleRollDice();
      }, 1200);
      return () => clearTimeout(timer);
    }

    // 3. Bot tự động kết thúc lượt (H03 Fix: Bot tuân thủ cùng luật như người chơi, không xây từ xa cuối lượt)
    if (hasRolled && !isRolling && !isHopping && !buildModalTile && !auctionState && !activeCard) {
      const timer = setTimeout(() => {
        handleEndTurn();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, hasRolled, isRolling, buildModalTile, auctionState, activeCard, screen]);

  // NẾU ĐANG Ở MÀN HÌNH LOBBY
  if (screen === 'lobby') {
    return (
      <Lobby
        onStartPassAndPlay={handleStartPassAndPlay}
        onStartQuickBot={handleStartQuickBot}
        onStartOnlineHost={handleStartOnlineHost}
        onStartOnlineJoin={handleStartOnlineJoin}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        isSocketConnected={socketConnected}
      />
    );
  }

  // NẾU ĐANG Ở PHÒNG CHỜ ONLINE
  if (screen === 'online_waiting') {
    return (
      <OnlineRoom
        room={room}
        currentSocketId={socketId}
        onToggleReady={() => socketRef.current?.emit('toggle_ready')}
        onStartGame={handleHostStartGame}
        onLeaveRoom={() => {
          socketRef.current?.disconnect();
          setScreen('lobby');
        }}
        onSendChat={(msg) => {
          socketRef.current?.emit('send_chat', {
            message: msg,
            senderName: room?.players.find((p) => p.id === socketId)?.name || 'Bạn',
            token: room?.players.find((p) => p.id === socketId)?.token || 'car',
          });
        }}
        chatMessages={chatMessages}
      />
    );
  }

  // MÀN HÌNH CHƠI GAME CHÍNH (FULL SCREEN 3D BUSINESS TOUR CLONE 1:1)
  return (
    <div
      className={`fixed inset-0 w-screen h-screen overflow-hidden bg-[#c2e2fa] text-slate-800 select-none transition-all ${
        screenShake ? 'animate-screen-shake' : ''
      }`}
    >
      {/* Floating Money Numbers (+/- VNĐ) */}
      <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
        {floatingNumbers.map((fn) => (
          <div
            key={fn.id}
            className={`text-2xl md:text-4xl font-black px-5 py-2.5 rounded-2xl shadow-2xl border-2 animate-float-number backdrop-blur-md ${
              fn.isGain
                ? 'bg-emerald-600/95 text-white border-white shadow-lg'
                : 'bg-rose-600/95 text-white border-white shadow-lg'
            }`}
          >
            {fn.isGain ? `+${formatVND(fn.amount)}` : `-${formatVND(fn.amount)}`}
          </div>
        ))}
      </div>

      {/* Thông báo công trình 3D vừa hoàn thành */}
      {constructionAlert && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 px-6 py-2 rounded-2xl shadow-2xl border-2 border-white font-black text-xs sm:text-sm flex items-center gap-2 animate-bounce">
          <span className="text-xl">{constructionAlert.type === 'hotel' ? '🏰' : '🏡'}</span>
          <span>
            {constructionAlert.player} vừa xây dựng {constructionAlert.type === 'hotel' ? 'KHÁCH SẠN (LANDMARK)' : 'CÔNG TRÌNH 3D'} tại {constructionAlert.tileName}!
          </span>
        </div>
      )}

      {/* KHUNG BÀN CỜ FULL-SCREEN 3D VIEWPORT */}
      <div className="absolute inset-0 w-full h-full z-0">
        {viewMode === '3d' ? (
          <BoardErrorBoundary
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-[#c2e2fa] p-4">
                <div className="w-full max-w-[700px]">
                  <Board
                    propertiesState={propertiesState}
                    players={players}
                    activePlayerId={currentPlayer?.id}
                    freeParkingPool={freeParkingPool}
                    onTileClick={(tile) => setViewDeedTile(tile)}
                  />
                </div>
              </div>
            }
          >
            <Board3D
              propertiesState={propertiesState}
              players={players}
              activePlayerId={currentPlayer?.id}
              freeParkingPool={freeParkingPool}
              onTileClick={(tile) => setViewDeedTile(tile)}
              dice={dice}
              isRolling={isRolling}
            />
          </BoardErrorBoundary>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 bg-[#c2e2fa] overflow-auto">
            <div className="w-full max-w-[700px]">
              <Board
                propertiesState={propertiesState}
                players={players}
                activePlayerId={currentPlayer?.id}
                freeParkingPool={freeParkingPool}
                onTileClick={(tile) => setViewDeedTile(tile)}
              />
            </div>
          </div>
        )}
      </div>

      {/* BẢNG ĐIỂM / LƯỢT ĐI TRÊN KHÔNG GIAN BÀN CỜ (ROUND CAPSULE CHUẨN BUSINESS TOUR) */}
      <div className="fixed top-3 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
        <div className="bg-white/95 text-slate-800 border-2 border-slate-200 px-4 py-1 rounded-full text-xs font-black tracking-widest shadow-md flex items-center gap-2 backdrop-blur-md">
          <span className="text-amber-600">VÒNG {Math.floor(totalTurnsCount / Math.max(1, players.length)) + 1}</span>
          <span className="text-slate-400">•</span>
          <span className="text-emerald-600">LƯỢT #{totalTurnsCount + 1}</span>
        </div>
      </div>

      {/* DIGITAL TIMER & JACKPOT CỦA SÂN CỎ CHUẨN BUSINESS TOUR */}
      <div className="fixed top-[24%] sm:top-[26%] left-1/2 transform -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
        {/* Hộp đồng hồ kỹ thuật số LED màu đen 2 chân đế */}
        <div className="bg-[#2b3543] text-white font-mono text-xs sm:text-sm font-black px-4 py-1 rounded border border-[#1b222c] shadow-xl tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{formatMatchTime(elapsedSeconds)}</span>
        </div>
        {/* Số tiền Jackpot trắng phát sáng trên thảm cỏ */}
        <div className="mt-1.5 text-white font-black text-xl sm:text-2xl tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
          {freeParkingPool > 0 ? formatVND(freeParkingPool) : '0 ₫'}
        </div>
      </div>

      {/* BÓNG THOẠI HOẠT HÌNH TRÊN BÀN CỜ CHUẨN BUSINESS TOUR */}
      {(isRolling || isHopping || buildModalTile) && (
        <div className="fixed top-[32%] left-[45%] transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none animate-bounce">
          <div className="bg-white text-slate-800 border-2 border-slate-300 px-4 py-1.5 rounded-2xl text-xs font-bold shadow-xl relative flex items-center gap-1.5">
            <span>
              {isRolling ? 'Rolling dice...' : isHopping ? 'Moving...' : 'Buying...'}
            </span>
            <div className="w-3 h-3 bg-white border-r-2 border-b-2 border-slate-300 transform rotate-45 absolute -bottom-1.5 left-4" />
          </div>
        </div>
      )}

      {/* 4 GÓC: AVATAR + TIỀN + TÀI SẢN 4 NGƯỜI CHƠI (CORNER HUD BUSINESS TOUR) */}
      <CornerHUD
        players={players}
        activePlayerId={currentPlayer?.id}
        propertiesState={propertiesState}
        onOpenManage={() => setShowManageModal(true)}
        onOpenTrade={() => setShowTradeModal(true)}
        gameLog={gameLog}
        isLogOpen={isLogOpen}
        onToggleLog={() => setIsLogOpen(!isLogOpen)}
      />

      {/* NÚT TIỆN ÍCH TRÒN BÊN CẠNH PHẢI MÀN HÌNH CHUẨN BUSINESS TOUR */}
      <div className="fixed right-3.5 top-1/2 transform -translate-y-1/2 z-30 flex flex-col gap-3 pointer-events-auto">
        <button
          onClick={toggleBGM}
          className={`w-11 h-11 rounded-full border-2 shadow-lg flex items-center justify-center transition active:scale-95 ${
            isBGMPlaying
              ? 'bg-amber-400 text-slate-900 border-amber-300 shadow-glow-gold'
              : 'bg-white/95 text-slate-700 border-white hover:bg-slate-50 hover:text-slate-900'
          }`}
          title="Nhạc Nền Jazz Tycoon"
        >
          <Music size={18} className={isBGMPlaying ? 'animate-bounce' : ''} />
        </button>

        <button
          onClick={toggleMute}
          className="w-11 h-11 rounded-full bg-white/95 text-slate-700 border-2 border-white shadow-lg flex items-center justify-center hover:bg-slate-50 hover:text-slate-900 transition active:scale-95"
          title={isMuted ? 'Bật âm thanh SFX' : 'Tắt âm thanh SFX'}
        >
          {isMuted ? <VolumeX size={18} className="text-red-500" /> : <Volume2 size={18} className="text-emerald-600" />}
        </button>

        <button
          onClick={() => setViewMode(viewMode === '3d' ? '2d' : '3d')}
          className="w-11 h-11 rounded-full bg-sky-500 text-white border-2 border-sky-300 shadow-lg flex items-center justify-center hover:bg-sky-600 transition active:scale-95 text-xs font-black"
          title="Đổi góc 3D / 2D"
        >
          {viewMode === '3d' ? '2D' : '3D'}
        </button>

        <button
          onClick={() => setScreen('lobby')}
          className="w-11 h-11 rounded-full bg-white/95 text-slate-600 hover:text-red-600 border-2 border-white shadow-lg flex items-center justify-center hover:bg-slate-50 transition active:scale-95 text-sm font-black"
          title="Rời Bàn"
        >
          🚪
        </button>
      </div>

      {/* THÔNG TIN BÀN & CƯỢC Ở ĐÁY MÀN HÌNH CHUẨN BUSINESS TOUR */}
      <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none text-center">
        <span className="text-[12px] font-bold text-slate-600 tracking-wide drop-shadow-sm">
          Cờ Tỷ Phú Việt Nam • Bàn #VN-2026 • Hũ Jackpot: {formatVND(freeParkingPool)}
        </span>
      </div>

      {/* FLOATING ACTION DOCK Ở ĐÁY MÀN HÌNH (G06 Fix: max-w-[calc(100vw-16px)], ẩn nút phụ trên mobile để không tràn 390px) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex items-center gap-1.5 sm:gap-3 bg-white/95 backdrop-blur-xl border-2 border-white/90 p-1.5 sm:p-2.5 rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] text-slate-800 max-w-[calc(100vw-16px)]">
        {/* Thông tin người đang đến lượt */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 bg-slate-100/90 rounded-2xl border border-slate-200 shrink-0">
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-base sm:text-lg shadow-md shrink-0 border border-white"
            style={{ backgroundColor: currentPlayer?.color || '#ef4444' }}
          >
            {TOKENS.find(t => t.id === currentPlayer?.token)?.emoji || '🏎️'}
          </div>
          <div className="hidden sm:block">
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 block leading-tight">
              Đang Đến Lượt
            </span>
            <span className="text-xs font-black text-slate-800 truncate max-w-[90px] block leading-tight">
              {currentPlayer?.name}
            </span>
          </div>
        </div>

        {/* Xúc xắc & Tổng điểm */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 bg-slate-100/90 rounded-2xl border border-slate-200 shrink-0">
          <div className="flex items-center gap-1">
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-red-600 text-white font-black text-xs sm:text-sm flex items-center justify-center shadow border-2 border-red-400 ${isRolling ? 'animate-spin' : ''}`}>
              {dice[0]}
            </div>
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-red-600 text-white font-black text-xs sm:text-sm flex items-center justify-center shadow border-2 border-red-400 ${isRolling ? 'animate-spin' : ''}`}>
              {dice[1]}
            </div>
          </div>
          <div className="text-left hidden xs:block">
            <span className="text-[9px] text-slate-500 block font-semibold leading-tight">Điểm</span>
            <span className="text-xs font-black text-slate-800 block leading-tight">
              {dice[0] + dice[1]} {dice[0] === dice[1] ? '🔥 ĐÔI!' : ''}
            </span>
          </div>
        </div>

        {/* Nút hành động chính: Lắc Xúc Xắc hoặc Kết Thúc Lượt */}
        <div className="shrink-0">
          {currentPlayer?.isBot ? (
            <div className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-sky-50 border border-sky-300 text-sky-800 text-xs font-black flex items-center gap-1.5 sm:gap-2 animate-pulse shadow-sm">
              <span className="animate-spin">🤖</span>
              <span>{isHopping ? 'Đang đi...' : isRolling ? 'Đang lắc...' : 'Xử lý...'}</span>
            </div>
          ) : !hasRolled ? (
            <button
              type="button"
              disabled={isRolling || isHopping}
              onClick={handleRollDice}
              className={`px-4 sm:px-8 py-2 sm:py-3 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 sm:gap-2 shadow-xl active:scale-95 ${
                isRolling || isHopping
                  ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 text-slate-950 shadow-[0_4px_15px_rgba(245,158,11,0.4)] hover:brightness-105 hover:scale-105 border-2 border-white animate-pulse'
              }`}
            >
              <span className="text-sm sm:text-lg">🎲</span>
              <span>{isRolling ? 'Đang Lắc...' : isHopping ? 'Đang Đi...' : 'Lắc Xúc Xắc'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isHopping}
              onClick={handleEndTurn}
              className="px-4 sm:px-8 py-2 sm:py-3 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-xl hover:brightness-105 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 sm:gap-2 border-2 border-white"
            >
              <span>Xong Lượt</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>

        {/* Nút thao tác nhanh - chỉ hiện trên desktop/tablet để dock mobile không tràn (trên mobile bấm qua CornerHUD) */}
        {!currentPlayer?.isBot && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowManageModal(true)}
              className="py-2 px-2.5 sm:px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-amber-700 border border-amber-300 transition shadow-sm"
              title="Quản lý bất động sản & thế chấp"
            >
              <Home size={14} className="inline mr-1" />
              <span>Sổ Đỏ</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTradeModal(true)}
              className="py-2 px-2.5 sm:px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-sky-700 border border-sky-300 transition shadow-sm"
              title="Thương lượng đổi đất với đối thủ"
            >
              <Gavel size={14} className="inline mr-1" />
              <span>Đổi Đất</span>
            </button>
          </div>
        )}

        {/* Nút mở Nhật Ký Trận Đấu */}
        <button
          type="button"
          onClick={() => setIsLogOpen(!isLogOpen)}
          className={`p-2 rounded-xl text-xs font-bold border transition ${
            isLogOpen
              ? 'bg-amber-100 text-amber-800 border-amber-400'
              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
          }`}
          title="Bật/Tắt Nhật Ký Trận Đấu"
        >
          <History size={15} />
        </button>
      </div>

      {/* KHUNG NHẬT KÝ CHI TIẾT TRẬN ĐẤU KHI MỞ RỘNG */}
      {isLogOpen && (
        <div className="fixed bottom-20 right-4 z-40 w-80 sm:w-96 max-h-80 bg-white/95 backdrop-blur-xl border-2 border-slate-300 rounded-2xl shadow-2xl p-3 flex flex-col text-slate-800">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
            <span className="text-xs font-black text-amber-600 flex items-center gap-1.5 uppercase tracking-wide">
              <History size={14} /> Nhật Ký Trận Đấu
            </span>
            <button
              onClick={() => setIsLogOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-700 px-2 py-0.5 rounded-lg bg-slate-100"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {(Array.isArray(gameLog) ? gameLog : []).map((log, idx) => (
              <div
                key={idx}
                className={`p-2 rounded-xl border leading-relaxed ${
                  idx === 0
                    ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* MODALS */}
      {viewDeedTile && (
        <DeedModal
          tile={viewDeedTile}
          propertyState={propertiesState[viewDeedTile.id]}
          owner={players.find((p) => p.id === propertiesState[viewDeedTile.id]?.owner)}
          onClose={() => setViewDeedTile(null)}
        />
      )}

      {buyoutState && (
        <BuyoutModal
          tile={buyoutState.tile}
          owner={buyoutState.owner}
          player={buyoutState.player}
          buyoutPrice={buyoutState.buyoutPrice}
          onBuyout={() => {
            executeBuyout(buyoutState.player.id, buyoutState.owner.id, buyoutState.tile.id, buyoutState.buyoutPrice);
            setBuyoutState(null);
            setHasRolled(true);
          }}
          onSkip={() => {
            setBuyoutState(null);
            setHasRolled(true);
          }}
        />
      )}

      {/* MODAL MUA & NÂNG CẤP NHÀ 4 CẤP BẬC CHUẨN BUSINESS TOUR */}
      {buildModalTile && (
        <BusinessTourBuildModal
          tile={buildModalTile.tile}
          player={buildModalTile.player}
          propState={buildModalTile.propState}
          currentHouses={buildModalTile.propState ? buildModalTile.propState.houses || 0 : 0}
          isNewPurchase={buildModalTile.isNewPurchase}
          onConfirmBuild={(targetTier, cost) =>
            handleConfirmBuildTier(buildModalTile.tile.id, targetTier, cost, buildModalTile.player)
          }
          onClose={() => {
            addLog(`⏩ ${buildModalTile.player.name} không mua/xây tại ${buildModalTile.tile.name}.`);
            setBuildModalTile(null);
            setHasRolled(true);
          }}
        />
      )}

      {/* MODAL ĐĂNG CAI LỄ HỘI THẾ GIỚI CHUẨN BUSINESS TOUR */}
      {festivalModal && (
        <FestivalModal
          player={festivalModal.player}
          ownedTiles={festivalModal.ownedTiles}
          onSelectCity={(tileId) => handleSelectFestivalCity(tileId)}
          onClose={() => {
            setFestivalModal(null);
            setHasRolled(true);
          }}
        />
      )}

      {activeCard && (
        <CardModal
          card={activeCard.card}
          type={activeCard.type}
          onClose={handleConfirmCard}
        />
      )}

      {showJailModal && currentPlayer && (
        <JailModal
          player={currentPlayer}
          onPayFine={() => {
            setShowJailModal(false);
            const updated = players.map((p) =>
              p.id === currentPlayer.id
                ? { ...p, inJail: false, jailTurns: 0, money: p.money - JAIL_FINE }
                : p
            );
            setPlayers(updated);
            addLog(`💰 ${currentPlayer.name} nộp bảo lãnh ${formatVND(JAIL_FINE)} ra tù!`);
          }}
          onUseCard={() => {
            setShowJailModal(false);
            const updated = players.map((p) =>
              p.id === currentPlayer.id
                ? { ...p, inJail: false, jailTurns: 0, outOfJailCards: p.outOfJailCards - 1 }
                : p
            );
            setPlayers(updated);
            addLog(`🎟️ ${currentPlayer.name} dùng Thẻ Miễn Vào Tù để được tự do!`);
          }}
          onRollDoubles={() => {
            setShowJailModal(false);
            const d1 = Math.floor(Math.random() * 6) + 1;
            const d2 = Math.floor(Math.random() * 6) + 1;
            setDice([d1, d2]);
            if (d1 === d2) {
              soundFX.playCollectMoney();
              addLog(`🎉 ${currentPlayer.name} đổ đôi [${d1}-${d2}], được tha bổng ngay lập tức!`);
              const updated = players.map((p) =>
                p.id === currentPlayer.id ? { ...p, inJail: false, jailTurns: 0 } : p
              );
              setPlayers(updated);
              movePlayer(currentPlayer.id, d1 + d2, false, updated);
            } else {
              soundFX.playPayRent();
              const turns = (currentPlayer.jailTurns || 0) + 1;
              if (turns >= 3) {
                addLog(`⏳ ${currentPlayer.name} đã ở tù đủ 3 lượt, buộc phải nộp ${formatVND(JAIL_FINE)} để ra tù!`);
                const updated = players.map((p) =>
                  p.id === currentPlayer.id
                    ? { ...p, inJail: false, jailTurns: 0, money: p.money - JAIL_FINE }
                    : p
                );
                setPlayers(updated);
                movePlayer(currentPlayer.id, d1 + d2, false, updated);
              } else {
                addLog(`🔒 ${currentPlayer.name} đổ thất bại [${d1}-${d2}], tiếp tục ngồi tù (Lượt ${turns}/3).`);
                const updated = players.map((p) =>
                  p.id === currentPlayer.id ? { ...p, jailTurns: turns } : p
                );
                setPlayers(updated);
                setHasRolled(true);
              }
            }
          }}
        />
      )}

      {showManageModal && currentPlayer && (
        <ManagePropertiesModal
          player={currentPlayer}
          players={players}
          propertiesState={propertiesState}
          onBuildHouse={(tileId) => {
            const tile = BOARD_TILES[tileId];
            const nextHouses = Math.min(4, (propertiesState[tileId]?.houses || 0) + 1);
            const newProps = {
              ...propertiesState,
              [tileId]: { ...propertiesState[tileId], houses: nextHouses },
            };
            const newPlayers = players.map((p) =>
              p.id === currentPlayer.id ? { ...p, money: p.money - tile.housePrice } : p
            );
            setPropertiesState(newProps);
            setPlayers(newPlayers);
            soundFX.playBuildHouse();
            addLog(`🏠 ${currentPlayer.name} xây thêm nhà tại ${tile.name}.`);
            setConstructionAlert({
              player: currentPlayer.name,
              tileName: tile.name,
              type: nextHouses >= 4 ? 'hotel' : 'house'
            });
            setTimeout(() => setConstructionAlert(null), 3500);
            syncOnlineState({ players: newPlayers, propertiesState: newProps });
          }}
          onSellHouse={(tileId) => {
            const tile = BOARD_TILES[tileId];
            const refund = Math.floor(tile.housePrice / 2);
            const newProps = {
              ...propertiesState,
              [tileId]: { ...propertiesState[tileId], houses: Math.max(0, (propertiesState[tileId]?.houses || 0) - 1) },
            };
            const creditorId = currentPlayer?.debtCreditorId;
            const shortfall = currentPlayer?.debtShortfall || 0;
            const targetCash = (currentPlayer?.money || 0) + refund;

            const newPlayers = players.map((p) => {
              if (p.id === currentPlayer?.id) {
                if (targetCash >= 0 && creditorId && shortfall > 0) {
                  const { debtCreditorId, debtShortfall, ...rest } = p;
                  return { ...rest, money: targetCash };
                }
                return { ...p, money: targetCash };
              }
              if (creditorId && p.id === creditorId && targetCash >= 0 && shortfall > 0) {
                return { ...p, money: p.money + shortfall };
              }
              return p;
            });
            setPropertiesState(newProps);
            setPlayers(newPlayers);
            addLog(`💸 ${currentPlayer.name} bán bớt 1 nhà tại ${tile.name}, thu hồi ${formatVND(refund)}.`);
            syncOnlineState({ players: newPlayers, propertiesState: newProps });
          }}
          onMortgage={(tileId) => {
            const tile = BOARD_TILES[tileId];
            const newProps = {
              ...propertiesState,
              [tileId]: { ...propertiesState[tileId], isMortgaged: true },
            };
            const creditorId = currentPlayer?.debtCreditorId;
            const shortfall = currentPlayer?.debtShortfall || 0;
            const targetCash = (currentPlayer?.money || 0) + tile.mortgageValue;

            const newPlayers = players.map((p) => {
              if (p.id === currentPlayer?.id) {
                if (targetCash >= 0 && creditorId && shortfall > 0) {
                  const { debtCreditorId, debtShortfall, ...rest } = p;
                  return { ...rest, money: targetCash };
                }
                return { ...p, money: targetCash };
              }
              if (creditorId && p.id === creditorId && targetCash >= 0 && shortfall > 0) {
                return { ...p, money: p.money + shortfall };
              }
              return p;
            });
            setPropertiesState(newProps);
            setPlayers(newPlayers);
            addLog(`🏦 ${currentPlayer.name} thế chấp ${tile.name}, nhận ${formatVND(tile.mortgageValue)}.`);
            syncOnlineState({ players: newPlayers, propertiesState: newProps });
          }}
          onUnmortgage={(tileId) => {
            const tile = BOARD_TILES[tileId];
            const cost = Math.floor(tile.mortgageValue * 1.1);
            const newProps = {
              ...propertiesState,
              [tileId]: { ...propertiesState[tileId], isMortgaged: false },
            };
            const newPlayers = players.map((p) =>
              p.id === currentPlayer.id ? { ...p, money: p.money - cost } : p
            );
            setPropertiesState(newProps);
            setPlayers(newPlayers);
            addLog(`🔓 ${currentPlayer.name} chuộc lại ${tile.name} với chi phí ${formatVND(cost)}.`);
            syncOnlineState({ players: newPlayers, propertiesState: newProps });
          }}
          onClose={() => setShowManageModal(false)}
        />
      )}

      {showTradeModal && currentPlayer && (
        <TradeModal
          activePlayer={currentPlayer}
          players={players}
          propertiesState={propertiesState}
          onSendTrade={(offer) => {
            setShowTradeModal(false);
            const { targetId } = offer;
            const target = players.find((p) => p.id === targetId);
            if (!target) return;

            if (target.isBot) {
              const decision = AIEngine.evaluateTradeOffer(target, offer, propertiesState, players);
              if (decision.accept) {
                executeTrade(offer);
                addLog(`🤖 ${target.name}: "${decision.reason}"`);
              } else {
                soundFX.playPayRent();
                addLog(`🤖 ${target.name} từ chối giao dịch: "${decision.reason}"`);
              }
            } else {
              // R05 Fix: Gửi đề nghị giao dịch online qua socket hoặc mở modal nội bộ Pass & Play
              if (gameMode === 'online' && socketRef.current) {
                socketRef.current.emit('send_trade_offer', offer);
                addLog(`📜 Đã gửi đề nghị giao dịch tới ${target.name}! Đang chờ phản hồi...`);
              } else {
                setPendingTradeOffer(offer);
              }
            }
          }}
          onClose={() => setShowTradeModal(false)}
        />
      )}

      {pendingTradeOffer && (
        <TradeConfirmModal
          offer={pendingTradeOffer}
          players={players}
          propertiesState={propertiesState}
          onAccept={() => {
            if (gameMode === 'online' && socketRef.current) {
              socketRef.current.emit('respond_trade_offer', { offer: pendingTradeOffer, accept: true });
            } else {
              executeTrade(pendingTradeOffer);
            }
            setPendingTradeOffer(null);
          }}
          onReject={() => {
            if (gameMode === 'online' && socketRef.current) {
              socketRef.current.emit('respond_trade_offer', { offer: pendingTradeOffer, accept: false });
            } else {
              const target = players.find((p) => p.id === pendingTradeOffer.targetId);
              addLog(`❌ ${target?.name || 'Đối thủ'} đã từ chối lời đề nghị giao dịch.`);
            }
            setPendingTradeOffer(null);
          }}
        />
      )}

      {winner && (
        <VictoryModal
          winner={winner}
          onRestart={() => setScreen('lobby')}
        />
      )}
    </div>
  );
}
