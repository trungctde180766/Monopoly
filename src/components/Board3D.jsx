import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BOARD_TILES, COLOR_GROUPS, TOKENS } from '../data/boardData.js';
import { formatVND } from '../logic/gameEngine.js';
import { soundFX } from '../utils/soundFx.js';
import { Eye, RotateCcw, Sparkles } from 'lucide-react';

// Toạ độ 3D (X, Z) và góc quay của 40 ô
export function getTile3DTransform(tileId) {
  const halfSize = 10.5;
  const edgeTileWidth = 1.9;

  if (tileId === 0) {
    return { x: halfSize, z: halfSize, rotY: -Math.PI / 4, isCorner: true, side: 'bottom' };
  } else if (tileId > 0 && tileId < 10) {
    const idx = tileId - 1;
    const x = halfSize - 2.5 - idx * edgeTileWidth;
    return { x, z: halfSize, rotY: 0, isCorner: false, side: 'bottom' };
  } else if (tileId === 10) {
    return { x: -halfSize, z: halfSize, rotY: Math.PI / 4, isCorner: true, side: 'left' };
  } else if (tileId > 10 && tileId < 20) {
    const idx = tileId - 11;
    const z = halfSize - 2.5 - idx * edgeTileWidth;
    return { x: -halfSize, z, rotY: Math.PI / 2, isCorner: false, side: 'left' };
  } else if (tileId === 20) {
    return { x: -halfSize, z: -halfSize, rotY: (3 * Math.PI) / 4, isCorner: true, side: 'top' };
  } else if (tileId > 20 && tileId < 30) {
    const idx = tileId - 21;
    const x = -halfSize + 2.5 + idx * edgeTileWidth;
    return { x, z: -halfSize, rotY: Math.PI, isCorner: false, side: 'top' };
  } else if (tileId === 30) {
    return { x: halfSize, z: -halfSize, rotY: -(3 * Math.PI) / 4, isCorner: true, side: 'right' };
  } else {
    const idx = tileId - 31;
    const z = -halfSize + 2.5 + idx * edgeTileWidth;
    return { x: halfSize, z, rotY: -Math.PI / 2, isCorner: false, side: 'right' };
  }
}

// Định dạng giá ngắn gọn chuẩn Business Tour (ví dụ: 200K, 495K, 2.4M)
function formatShortPrice(num) {
  if (!num) return '';
  if (num >= 1000000) {
    const m = num / 1000000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1).replace('.0', '')}M`;
  }
  if (num >= 1000) {
    return `${Math.round(num / 1000)}K`;
  }
  return `${num}`;
}

// Tạo texture chất lượng cao chuẩn Business Tour (G02: 512x760, chữ giá to 64px, tương phản cao)
function createTileTexture(tile, isMortgaged, ownerColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = tile.id % 10 === 0 ? 512 : 760;
  const ctx = canvas.getContext('2d');

  // Nền đá cẩm thạch trắng sứ đặc trưng Business Tour
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Viền ô đất: Viền người sở hữu hoặc viền kim loại sáng
  ctx.strokeStyle = ownerColor || (isMortgaged ? '#ef4444' : '#cbd5e1');
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  const groupInfo = tile.group ? COLOR_GROUPS[tile.group.toUpperCase()] : null;

  if (tile.id % 10 === 0) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(16, 16, canvas.width - 32, canvas.height - 32);

    let title = (tile.shortName || tile.name).toUpperCase();
    let icon = '🏁';
    let bannerColor = '#10b981';

    if (tile.id === 0) {
      title = 'START';
      icon = '🏁';
      bannerColor = '#16a34a';
    } else if (tile.id === 10) {
      title = 'ĐẢO HOANG (TÙ)';
      icon = '🏝️';
      bannerColor = '#f59e0b';
    } else if (tile.id === 20) {
      title = 'LỄ HỘI (JOUST)';
      icon = '🎪';
      bannerColor = '#e11d48';
    } else if (tile.id === 30) {
      // R07 Fix: Ô 30 là Vào Tù theo đúng logic boardData & App.jsx
      title = 'VÀO TÙ (BỊ BẮT)';
      icon = '🚨';
      bannerColor = '#dc2626';
    }

    ctx.fillStyle = bannerColor;
    ctx.fillRect(16, 16, canvas.width - 32, 95);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, canvas.width / 2, 75);

    ctx.font = '140px sans-serif';
    ctx.fillText(icon, canvas.width / 2, 300);

    if (tile.salary) {
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(`+${formatShortPrice(tile.salary)}₫`, canvas.width / 2, 450);
    } else if (tile.id === 30) {
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('BỊ BẮT GIAM', canvas.width / 2, 450);
    }
  } else {
    // Dải màu nhóm đất ở trên cùng chuẩn Business Tour
    if (groupInfo) {
      ctx.fillStyle = groupInfo.color;
      ctx.fillRect(16, 16, canvas.width - 32, 140);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(groupInfo.name.toUpperCase(), canvas.width / 2, 98);
    } else {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(16, 16, canvas.width - 32, 140);

      ctx.fillStyle = '#334155';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tile.type.toUpperCase(), canvas.width / 2, 98);
    }

    // Tên đường / thành phố (Chữ đen đậm rõ nét kích thước lớn)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';

    const words = (tile.shortName || tile.name).split(' ');
    if (words.length > 2) {
      ctx.fillText(words.slice(0, 2).join(' '), canvas.width / 2, 240);
      ctx.fillText(words.slice(2).join(' '), canvas.width / 2, 295);
    } else {
      ctx.fillText(tile.shortName || tile.name, canvas.width / 2, 260);
    }

    if (tile.type === 'railroad') {
      ctx.font = '100px sans-serif';
      ctx.fillText('🚂', canvas.width / 2, 470);
    } else if (tile.type === 'utility') {
      ctx.font = '100px sans-serif';
      ctx.fillText(tile.id === 12 ? '⚡' : '💧', canvas.width / 2, 470);
    } else if (tile.type === 'chance') {
      ctx.font = '100px sans-serif';
      ctx.fillText('❓', canvas.width / 2, 470);
    } else if (tile.type === 'community_chest') {
      ctx.font = '100px sans-serif';
      ctx.fillText('🎁', canvas.width / 2, 470);
    } else if (tile.type === 'tax') {
      ctx.font = '100px sans-serif';
      ctx.fillText('💸', canvas.width / 2, 470);
    }

    // Giá tiền ô đất ở mép ngoài (Chữ đen đậm cực lớn chuẩn Image 1: 200K, 495K, 2.4M)
    if (tile.price) {
      ctx.fillStyle = '#000000';
      ctx.font = '900 64px sans-serif';
      ctx.fillText(formatShortPrice(tile.price), canvas.width / 2, 700);
    } else if (tile.taxAmount) {
      ctx.fillStyle = '#dc2626';
      ctx.font = '900 56px sans-serif';
      ctx.fillText(`-${formatShortPrice(tile.taxAmount)}`, canvas.width / 2, 700);
    }

    if (isMortgaged) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.92)';
      ctx.fillRect(16, 280, canvas.width - 32, 120);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText('THẾ CHẤP', canvas.width / 2, 355);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Tạo texture thảm cỏ xanh sân vận động Business Tour
function createGrassLawnTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Nền cỏ xanh mượt sân vận động
  ctx.fillStyle = '#6fa828';
  ctx.fillRect(0, 0, 512, 512);

  // Sọc cỏ sáng tối cắt tỉa chuẩn golf/bóng đá
  ctx.fillStyle = '#7dbb34';
  const stripeWidth = 64;
  for (let i = 0; i < 512; i += stripeWidth * 2) {
    ctx.fillRect(i, 0, stripeWidth, 512);
  }

  // Vạch kẻ sân thể thao màu trắng phấn
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 8;
  ctx.strokeRect(24, 24, 464, 464);

  // Vòng tròn trung tâm
  ctx.beginPath();
  ctx.arc(256, 256, 115, 0, Math.PI * 2);
  ctx.stroke();

  // Chấm phát bóng trung tâm
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.arc(256, 256, 12, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Tạo cọc tiền đô la xếp ngoài 4 cạnh bàn cờ như Business Tour
function createCashStackMesh() {
  const group = new THREE.Group();

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#86efac';
  ctx.fillRect(0, 0, 128, 64);

  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 122, 58);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(44, 0, 40, 64);

  ctx.fillStyle = '#166534';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('$', 64, 42);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const billGeo = new THREE.BoxGeometry(2.2, 0.26, 1.2);
  const billMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.45,
  });

  const layerPositions = [
    { x: 0, y: 0.13, z: 0, rotY: 0 },
    { x: 0.2, y: 0.39, z: 0.1, rotY: 0.12 },
    { x: -0.15, y: 0.65, z: -0.05, rotY: -0.08 },
    { x: 0.05, y: 0.91, z: 0.05, rotY: 0.04 },
    { x: 1.25, y: 0.13, z: 0.4, rotY: 0.28 },
    { x: 1.15, y: 0.39, z: 0.35, rotY: 0.22 },
  ];

  layerPositions.forEach(pos => {
    const bill = new THREE.Mesh(billGeo, billMat);
    bill.position.set(pos.x, pos.y, pos.z);
    bill.rotation.y = pos.rotY;
    bill.castShadow = true;
    bill.receiveShadow = true;
    group.add(bill);
  });

  return group;
}

// Tạo texture cho 6 mặt của viên xúc xắc ĐỎ SON chuẩn Business Tour
function createDiceFaceTexture(value) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Nền đỏ son casino Business Tour
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 128, 128);

  // Viền đỏ tươi nổi khối
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 122);

  // Chấm tròn trắng tinh
  ctx.fillStyle = '#ffffff';
  const dotRadius = value === 1 ? 22 : 13;

  const dotPositions = {
    1: [[64, 64]],
    2: [[34, 34], [94, 94]],
    3: [[34, 34], [64, 64], [94, 94]],
    4: [[34, 34], [94, 34], [34, 94], [94, 94]],
    5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]],
    6: [[34, 30], [94, 30], [34, 64], [94, 64], [34, 98], [94, 98]],
  };

  const dots = dotPositions[value] || [[64, 64]];
  dots.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Tạo vật liệu 6 mặt xúc xắc theo đúng giá trị
function createDiceMaterials(topValue) {
  // Sắp xếp mặt trên hiển thị đúng số xúc xắc
  const faceValues = [2, 5, topValue, 7 - topValue, 3, 4];
  return faceValues.map(val => new THREE.MeshStandardMaterial({
    map: createDiceFaceTexture(val),
    roughness: 0.15,
    metalness: 0.1,
  }));
}

// G04: MÔ HÌNH NHÀ CẤP 1 (Cottage 1 tầng mái dốc ấm cúng + ống khói gạch)
function createTier1CottageMesh(roofColor = 0xef4444) {
  const group = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(0.48, 0.36, 0.44);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.3,
    metalness: 0.05,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.18;
  body.castShadow = true;
  group.add(body);

  const roofGeo = new THREE.ConeGeometry(0.42, 0.3, 4);
  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.25,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 0.36 + 0.15;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  const chimneyGeo = new THREE.BoxGeometry(0.09, 0.22, 0.09);
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 });
  const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
  chimney.position.set(0.14, 0.44, 0.12);
  chimney.castShadow = true;
  group.add(chimney);

  return group;
}

// G04: MÔ HÌNH NHÀ CẤP 2 (Nhà Phố 2 Tầng cao ráo + ban công phía trước)
function createTier2TownhouseMesh(roofColor = 0xef4444) {
  const group = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(0.56, 0.68, 0.5);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.25,
    metalness: 0.1,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.34;
  body.castShadow = true;
  group.add(body);

  // Ban công tầng 2
  const balconyGeo = new THREE.BoxGeometry(0.44, 0.07, 0.12);
  const balconyMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3 });
  const balcony = new THREE.Mesh(balconyGeo, balconyMat);
  balcony.position.set(0, 0.42, 0.28);
  balcony.castShadow = true;
  group.add(balcony);

  // Mái dốc cao phong cách nhà phố
  const roofGeo = new THREE.ConeGeometry(0.48, 0.35, 4);
  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.2,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 0.68 + 0.175;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  return group;
}

// G04: MÔ HÌNH NHÀ CẤP 3 (Biệt Thự Sang Trọng + Cặp cột sảnh hiên đá cẩm thạch)
function createTier3VillaMesh(roofColor = 0xef4444) {
  const group = new THREE.Group();

  // Khối nhà biệt thự bề thế
  const bodyGeo = new THREE.BoxGeometry(0.82, 0.55, 0.65);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.08,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.275;
  body.castShadow = true;
  group.add(body);

  // 2 Cột trụ sảnh hiên đá cẩm thạch
  [-0.28, 0.28].forEach(x => {
    const colGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.52, 12);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2 });
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(x, 0.26, 0.35);
    col.castShadow = true;
    group.add(col);
  });

  // Mái hiên sảnh
  const porchGeo = new THREE.BoxGeometry(0.72, 0.06, 0.22);
  const porchMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.25 });
  const porch = new THREE.Mesh(porchGeo, porchMat);
  porch.position.set(0, 0.54, 0.35);
  porch.castShadow = true;
  group.add(porch);

  // Mái chính biệt thự
  const roofGeo = new THREE.ConeGeometry(0.68, 0.42, 4);
  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.2,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 0.55 + 0.21;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  return group;
}

// Mô hình Khách Sạn / Kỳ Quan Cấp 4 (Landmark Castle Bất Khả Xâm Phạm chuẩn Business Tour)
function createLandmarkMesh(roofColor = 0x3b82f6) {
  const group = new THREE.Group();

  // Đế vàng phát sáng báo hiệu đất Landmark
  const baseGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.1, 16);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.9,
    roughness: 0.1,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.05;
  group.add(base);

  // Thân lâu đài / khách sạn trắng sứ
  const bodyGeo = new THREE.BoxGeometry(0.95, 0.72, 0.7);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.1,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.41;
  body.castShadow = true;
  group.add(body);

  // 2 Tháp trụ tròn bên hông
  [-0.42, 0.42].forEach(x => {
    const towerGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.95, 12);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(x, 0.48, 0);
    tower.castShadow = true;
    group.add(tower);

    const coneGeo = new THREE.ConeGeometry(0.24, 0.35, 12);
    const coneMat = new THREE.MeshStandardMaterial({ color: roofColor, metalness: 0.5, roughness: 0.2 });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, 0.95 + 0.17, 0);
    cone.castShadow = true;
    group.add(cone);
  });

  // Tháp trung tâm mạ vàng hoàng gia
  const centerSpireGeo = new THREE.CylinderGeometry(0.24, 0.28, 1.15, 16);
  const centerSpireMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const centerSpire = new THREE.Mesh(centerSpireGeo, centerSpireMat);
  centerSpire.position.set(0, 0.62, 0);
  centerSpire.castShadow = true;
  group.add(centerSpire);

  // Mái vòm vàng & Đỉnh kim cương Landmark
  const domeGeo = new THREE.ConeGeometry(0.35, 0.45, 16);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.1 });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.set(0, 1.2 + 0.2, 0);
  dome.castShadow = true;
  group.add(dome);

  return group;
}

// Cờ & Biểu tượng Lễ Hội / World Championship (Joust)
function createFestivalBannerMesh() {
  const group = new THREE.Group();

  const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8 });
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.set(0.48, 0.8, -0.48);
  group.add(pole);

  const flagGeo = new THREE.BoxGeometry(0.42, 0.26, 0.02);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.2 });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.48 + 0.21, 1.45, -0.48);
  group.add(flag);

  return group;
}

// Chồng tiền xu đồng / vàng chuẩn Image 1
function createCoinStackMesh(isGold = false) {
  const group = new THREE.Group();
  const coinColor = isGold ? 0xf59e0b : 0xd97706;
  const coinMat = new THREE.MeshStandardMaterial({
    color: coinColor,
    metalness: 0.9,
    roughness: 0.2,
  });
  const coinGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.09, 16);

  const heights = [0.05, 0.14, 0.23, 0.32, 0.41, 0.5];
  heights.forEach(y => {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.position.y = y;
    coin.castShadow = true;
    group.add(coin);
  });
  return group;
}

// Mô hình Quân Cờ 3D (Tokens)
function createTokenMesh(tokenType, colorHex) {
  const group = new THREE.Group();
  const color = new THREE.Color(colorHex || '#ef4444');

  const baseGeo = new THREE.CylinderGeometry(0.46, 0.52, 0.12, 24);
  const baseMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
    roughness: 0.15,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.06;
  group.add(base);

  if (tokenType === 'car') {
    const carBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.38),
      new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.2 })
    );
    carBody.position.y = 0.2;
    carBody.castShadow = true;
    group.add(carBody);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1 })
    );
    cabin.position.set(-0.06, 0.35, 0);
    group.add(cabin);
  } else if (tokenType === 'jet') {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.75, 16),
      new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.3 })
    );
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.26;
    group.add(body);

    const wings = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.04, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6 })
    );
    wings.position.set(0, 0.26, 0);
    group.add(wings);
  } else if (tokenType === 'diamond') {
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35, 0),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.5,
        roughness: 0.1,
        metalness: 0.85,
      })
    );
    gem.position.y = 0.38;
    group.add(gem);
  } else if (tokenType === 'hat') {
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.05, 20),
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 })
    );
    brim.position.y = 0.13;
    group.add(brim);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.38, 20),
      new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.6, roughness: 0.3 })
    );
    top.position.y = 0.32;
    group.add(top);
  } else {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.28, 0.32),
      new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.3 })
    );
    hull.position.y = 0.22;
    group.add(hull);
  }

  return group;
}

export default function Board3D({
  propertiesState = {},
  players = [],
  activePlayerId,
  freeParkingPool = 0,
  onTileClick,
  dice = [1, 1],
  isRolling = false,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const tilesMeshesRef = useRef({});
  const playerTokensRef = useRef({});
  const buildingsGroupRef = useRef(null);
  const die1MeshRef = useRef(null);
  const die2MeshRef = useRef(null);
  const animationFrameRef = useRef(null);
  const particleSystemRef = useRef(null);

  // Trạng thái nhảy hoạt họa từng ô (Step-by-step hopping)
  const hoppingStateRef = useRef({});
  const lastRecordedPositionsRef = useRef({});

  // Camera Orbit (G01 Fix: góc chuẩn radius 36, phi Math.PI/3.4 bao quát trọn vẹn 4 góc bàn cờ)
  const isDraggingRef = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const cameraAnglesRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3.4, radius: 36 });

  // G05 Fix: Giữ ref isRolling thời gian thực cho vòng render loop
  const isRollingRef = useRef(isRolling);
  useEffect(() => {
    isRollingRef.current = isRolling;
  }, [isRolling]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    // Bầu không gian trời xanh tươi sáng chuẩn Business Tour (Image 1)
    scene.background = new THREE.Color(0xc2e2fa);
    // G03 Fix: Tắt hoàn toàn fog trên bàn cờ để chữ và màu sắc không bị mờ nhạt
    scene.fog = null;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 120);
    cameraRef.current = camera;
    updateCameraPosition();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    // G03 Fix: Khai báo sRGB color space cho renderer
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    container.replaceChildren(renderer.domElement);

    // Ánh sáng ban ngày tươi tắn chuẩn Business Tour
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.set(18, 32, 18);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.0005;
    // G03 Fix: Cấu hình shadow frustum [-20, 20] bao phủ toàn bộ 40 ô bàn cờ 26x26
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 90;
    scene.add(sunLight);

    // Các khối đa diện lập phương / bát diện 3D bán trong suốt lơ lửng trên bầu trời (chuẩn Image 1)
    const skyShapesGroup = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const isBox = i % 2 === 0;
      const geo = isBox ? new THREE.BoxGeometry(1.6, 1.6, 1.6) : new THREE.OctahedronGeometry(1.4);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 75,
        10 + Math.random() * 24,
        (Math.random() - 0.5) * 75
      );
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      skyShapesGroup.add(mesh);
    }
    scene.add(skyShapesGroup);
    particleSystemRef.current = skyShapesGroup;

    // Bàn cờ đá cẩm thạch trắng viền xám đen mun Business Tour
    const tableGeo = new THREE.BoxGeometry(26, 1.2, 26);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Mặt vát xám đen nổi bật
      roughness: 0.35,
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -0.65;
    table.receiveShadow = true;
    scene.add(table);

    const borderGeo = new THREE.BoxGeometry(25.4, 0.2, 25.4);
    const borderMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // Viền trắng sứ tinh tế
      metalness: 0.1,
      roughness: 0.2,
    });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.y = -0.05;
    scene.add(border);

    // Thảm Cỏ Xanh Sân Thể Thao Trung Tâm chuẩn Business Tour
    const centerGeo = new THREE.PlaneGeometry(18.5, 18.5);
    const centerMat = new THREE.MeshStandardMaterial({
      map: createGrassLawnTexture(),
      roughness: 0.65,
    });
    const centerFelt = new THREE.Mesh(centerGeo, centerMat);
    centerFelt.rotation.x = -Math.PI / 2;
    centerFelt.position.y = 0.07;
    centerFelt.receiveShadow = true;
    scene.add(centerFelt);

    // Cọc Tiền Đô La xếp ngoài 4 cạnh bàn cờ như Business Tour
    const cashStackPositions = [
      { x: -5.8, z: -15.5, rot: 0.15 },
      { x: 5.8, z: -15.5, rot: -0.12 },
      { x: -5.8, z: 15.5, rot: 0.22 },
      { x: 5.8, z: 15.5, rot: -0.18 },
      { x: -15.5, z: -5.8, rot: Math.PI / 2 + 0.1 },
      { x: -15.5, z: 5.8, rot: Math.PI / 2 - 0.1 },
      { x: 15.5, z: -5.8, rot: -Math.PI / 2 + 0.15 },
      { x: 15.5, z: 5.8, rot: -Math.PI / 2 - 0.2 },
    ];
    cashStackPositions.forEach((pos) => {
      const cash = createCashStackMesh();
      cash.position.set(pos.x, -0.65, pos.z);
      cash.rotation.y = pos.rot;
      scene.add(cash);
    });

    // Các xấp tiền xu đồng / vàng chuẩn Image 1 ngoài mép bàn cờ
    const coinStackPositions = [
      { x: -15.5, z: -1.2, isGold: false },
      { x: -15.5, z: 0.4, isGold: true },
      { x: 15.5, z: -1.2, isGold: true },
      { x: 15.5, z: 0.4, isGold: false },
    ];
    coinStackPositions.forEach((pos) => {
      const coins = createCoinStackMesh(pos.isGold);
      coins.position.set(pos.x, -0.05, pos.z);
      scene.add(coins);
    });

    const buildingsGroup = new THREE.Group();
    buildingsGroupRef.current = buildingsGroup;
    scene.add(buildingsGroup);

    // 40 Ô Bàn Cờ 3D Trắng Sứ
    const tilesMeshes = {};
    BOARD_TILES.forEach((tile) => {
      const transform = getTile3DTransform(tile.id);
      const isCorner = tile.id % 10 === 0;

      const width = isCorner ? 2.8 : 1.8;
      const length = isCorner ? 2.8 : 2.7;

      const tileGeo = new THREE.BoxGeometry(width, 0.15, length);
      const texture = createTileTexture(tile, false, null);

      const topMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.3,
        metalness: 0.05,
      });
      const sideMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.4,
      });

      const materials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
      const tileMesh = new THREE.Mesh(tileGeo, materials);

      tileMesh.position.set(transform.x, 0.08, transform.z);
      tileMesh.rotation.y = transform.rotY;
      tileMesh.receiveShadow = true;
      tileMesh.castShadow = true;
      tileMesh.userData = { tileId: tile.id, tileData: tile };

      scene.add(tileMesh);
      tilesMeshes[tile.id] = tileMesh;
    });
    tilesMeshesRef.current = tilesMeshes;

    // Hai viên xúc xắc 3D kích thước lớn có chấm chuẩn casino
    const diceGeo = new THREE.BoxGeometry(1.65, 1.65, 1.65);

    const die1 = new THREE.Mesh(diceGeo, createDiceMaterials(dice[0] || 1));
    die1.position.set(-1.3, 0.825, 0);
    die1.castShadow = true;
    scene.add(die1);
    die1MeshRef.current = die1;

    const die2 = new THREE.Mesh(diceGeo, createDiceMaterials(dice[1] || 1));
    die2.position.set(1.3, 0.825, 0);
    die2.castShadow = true;
    scene.add(die2);
    die2MeshRef.current = die2;

    // Tương tác chuột quay camera
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (e) => {
      isDraggingRef.current = true;
      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - previousMousePosition.current.x;
      const deltaY = e.clientY - previousMousePosition.current.y;

      cameraAnglesRef.current.theta -= deltaX * 0.006;
      cameraAnglesRef.current.phi = Math.max(
        0.2,
        Math.min(Math.PI / 2.2, cameraAnglesRef.current.phi - deltaY * 0.006)
      );

      previousMousePosition.current = { x: e.clientX, y: e.clientY };
      updateCameraPosition();
    };

    const handlePointerUp = (e) => {
      const movedX = Math.abs(e.clientX - previousMousePosition.current.x);
      const movedY = Math.abs(e.clientY - previousMousePosition.current.y);

      if (movedX < 5 && movedY < 5) {
        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const tileMeshesArray = Object.values(tilesMeshesRef.current);
        const intersects = raycaster.intersectObjects(tileMeshesArray);

        if (intersects.length > 0) {
          const clickedTileData = intersects[0].object.userData.tileData;
          if (clickedTileData && onTileClick) {
            soundFX.playCardDraw();
            onTileClick(clickedTileData);
          }
        }
      }

      isDraggingRef.current = false;
    };

    const handleWheel = (e) => {
      e.preventDefault();
      cameraAnglesRef.current.radius = Math.max(
        22,
        Math.min(48, cameraAnglesRef.current.radius + e.deltaY * 0.02)
      );
      updateCameraPosition();
    };

    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('wheel', handleWheel, { passive: false });

    // VÒNG LẶP RENDER HOẠT HỌA 60 FPS
    let clock = new THREE.Clock();
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Hạt tinh thể vàng bay
      if (particleSystemRef.current) {
        particleSystemRef.current.rotation.y = elapsed * 0.03;
      }

      // XÚC XẮC XOAY XOAY XOAY VẬT LÝ (G05 Fix: đọc từ isRollingRef)
      if (die1MeshRef.current && die2MeshRef.current) {
        if (isRollingRef.current) {
          // Xoay tít mù nhiều trục & nảy lên cao
          die1MeshRef.current.rotation.x += delta * 24;
          die1MeshRef.current.rotation.y += delta * 32;
          die1MeshRef.current.rotation.z += delta * 18;
          die1MeshRef.current.position.y = 2.2 + Math.abs(Math.sin(elapsed * 24)) * 1.6;

          die2MeshRef.current.rotation.x -= delta * 22;
          die2MeshRef.current.rotation.y += delta * 30;
          die2MeshRef.current.rotation.z -= delta * 20;
          die2MeshRef.current.position.y = 2.2 + Math.abs(Math.cos(elapsed * 24)) * 1.6;
        } else {
          // Đáp xuống thảm nhung phẳng phiu với mặt hiển thị số xúc xắc
          die1MeshRef.current.position.y = THREE.MathUtils.lerp(die1MeshRef.current.position.y, 0.825, 0.15);
          die1MeshRef.current.rotation.x = THREE.MathUtils.lerp(die1MeshRef.current.rotation.x, 0, 0.15);
          die1MeshRef.current.rotation.y = THREE.MathUtils.lerp(die1MeshRef.current.rotation.y, 0, 0.15);
          die1MeshRef.current.rotation.z = THREE.MathUtils.lerp(die1MeshRef.current.rotation.z, 0, 0.15);

          die2MeshRef.current.position.y = THREE.MathUtils.lerp(die2MeshRef.current.position.y, 0.825, 0.15);
          die2MeshRef.current.rotation.x = THREE.MathUtils.lerp(die2MeshRef.current.rotation.x, 0, 0.15);
          die2MeshRef.current.rotation.y = THREE.MathUtils.lerp(die2MeshRef.current.rotation.y, 0, 0.15);
          die2MeshRef.current.rotation.z = THREE.MathUtils.lerp(die2MeshRef.current.rotation.z, 0, 0.15);
        }
      }

      // HOẠT ẢNH QUÂN CỜ NHẢY TỪNG Ô (STEP-BY-STEP ARC HOPPING)
      Object.entries(hoppingStateRef.current).forEach(([playerId, hopData]) => {
        const tokenMesh = playerTokensRef.current[playerId];
        if (!tokenMesh || hopData.currentStep >= hopData.totalSteps) return;

        hopData.t += delta * 4.2; // Tốc độ bước nhảy

        if (hopData.t >= 1) {
          hopData.currentStep++;
          hopData.t = 0;
          soundFX.playStepHop(hopData.currentStep);

          if (hopData.currentStep >= hopData.totalSteps) {
            delete hoppingStateRef.current[playerId];
            return;
          }
        }

        const fromTileId = (hopData.fromPos + hopData.currentStep) % 40;
        const toTileId = (hopData.fromPos + hopData.currentStep + 1) % 40;
        const fromTransform = getTile3DTransform(fromTileId);
        const toTransform = getTile3DTransform(toTileId);

        const progress = Math.min(1, Math.max(0, hopData.t));
        const offX = hopData.offX || 0;
        const offZ = hopData.offZ || 0;
        tokenMesh.position.x = THREE.MathUtils.lerp(fromTransform.x, toTransform.x, progress) + offX;
        tokenMesh.position.z = THREE.MathUtils.lerp(fromTransform.z, toTransform.z, progress) + offZ;

        // Xoay hướng mặt nhân vật theo chiều di chuyển
        const dx = toTransform.x - fromTransform.x;
        const dz = toTransform.z - fromTransform.z;
        if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
          tokenMesh.rotation.y = Math.atan2(dx, dz);
        }

        // Đường cung Parabol nảy lên cao
        const arcHeight = 1.45;
        tokenMesh.position.y = 0.25 + 4 * arcHeight * progress * (1 - progress);

        // Hiệu ứng Squash & Stretch
        if (progress < 0.2) {
          tokenMesh.scale.set(0.82, 1.3, 0.82);
        } else if (progress > 0.8) {
          tokenMesh.scale.set(1.25, 0.72, 1.25);
        } else {
          tokenMesh.scale.set(1, 1, 1);
        }
      });

      // Nhịp đập phát sáng của quân cờ đang chờ đến lượt
      Object.entries(playerTokensRef.current).forEach(([playerId, tokenMesh]) => {
        if (!hoppingStateRef.current[playerId]) {
          tokenMesh.scale.set(1, 1, 1);
          if (playerId === activePlayerId) {
            tokenMesh.position.y = 0.25 + Math.abs(Math.sin(elapsed * 6)) * 0.35;
            tokenMesh.rotation.y += delta * 2;
          } else {
            tokenMesh.position.y = 0.25;
          }
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || window.innerWidth;
      const newHeight = container.clientHeight || window.innerHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  function updateCameraPosition() {
    if (!cameraRef.current) return;
    const { theta, phi, radius } = cameraAnglesRef.current;
    cameraRef.current.position.x = radius * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.position.y = radius * Math.cos(phi);
    cameraRef.current.position.z = radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.lookAt(0, 0, 0);
  }

  // Cập nhật mặt xúc xắc khi đổ xong
  useEffect(() => {
    if (die1MeshRef.current && dice[0]) {
      die1MeshRef.current.material = createDiceMaterials(dice[0]);
    }
    if (die2MeshRef.current && dice[1]) {
      die2MeshRef.current.material = createDiceMaterials(dice[1]);
    }
  }, [dice]);

  // Cập nhật Nhà và Khách Sạn 3D theo 4 cấp bậc chuẩn Business Tour
  useEffect(() => {
    if (!buildingsGroupRef.current) return;
    const group = buildingsGroupRef.current;
    group.clear();

    BOARD_TILES.forEach((tile) => {
      const prop = propertiesState[tile.id];
      if (!prop || !prop.owner) return;

      const transform = getTile3DTransform(tile.id);
      const houses = prop.houses || 0;
      const owner = players.find((p) => p.id === prop.owner);
      const roofColor = owner?.color || '#ef4444';

      if (houses >= 4) {
        // G04 Cấp 4: Khách Sạn / Kỳ Quan Landmark Bất Khả Xâm Phạm
        const landmark = createLandmarkMesh(roofColor);
        landmark.position.set(transform.x, 0.16, transform.z);
        landmark.rotation.y = transform.rotY;
        group.add(landmark);
      } else if (houses === 3) {
        // G04 Cấp 3: Biệt Thự Sang Trọng
        const villa = createTier3VillaMesh(roofColor);
        villa.position.set(transform.x, 0.16, transform.z);
        villa.rotation.y = transform.rotY;
        group.add(villa);
      } else if (houses === 2) {
        // G04 Cấp 2: Nhà Phố 2 Tầng
        const townhouse = createTier2TownhouseMesh(roofColor);
        townhouse.position.set(transform.x, 0.16, transform.z);
        townhouse.rotation.y = transform.rotY;
        group.add(townhouse);
      } else if (houses === 1) {
        // G04 Cấp 1: Nhà Mái Dốc Ấm Cúng
        const cottage = createTier1CottageMesh(roofColor);
        cottage.position.set(transform.x, 0.16, transform.z);
        cottage.rotation.y = transform.rotY;
        group.add(cottage);
      }

      // Nếu ô đất đang đăng cai LỄ HỘI (World Championship / Joust): Cắm cờ Lễ Hội
      if (prop.isFestival) {
        const fest = createFestivalBannerMesh();
        fest.position.set(transform.x, 0.16, transform.z);
        fest.rotation.y = transform.rotY;
        group.add(fest);
      }
    });
  }, [propertiesState, players]);

  // Cập nhật vị trí và kích hoạt bước nhảy Step-by-Step
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    players.forEach((p) => {
      if (p.isBankrupt) {
        if (playerTokensRef.current[p.id]) {
          scene.remove(playerTokensRef.current[p.id]);
          delete playerTokensRef.current[p.id];
        }
        return;
      }

      let tokenMesh = playerTokensRef.current[p.id];
      if (!tokenMesh) {
        tokenMesh = createTokenMesh(p.token, p.color);
        scene.add(tokenMesh);
        playerTokensRef.current[p.id] = tokenMesh;
      }

      const prevPos = lastRecordedPositionsRef.current[p.id];
      const newPos = p.position || 0;

      // Độ lệch toạ độ để nhiều người chơi cùng đứng 1 ô không bị đè lên nhau
      const pIdx = players.findIndex((x) => x.id === p.id);
      const angle = (pIdx * Math.PI) / 2;
      const offX = Math.cos(angle) * 0.42;
      const offZ = Math.sin(angle) * 0.42;

      if (prevPos !== undefined && prevPos !== newPos) {
        let steps = (newPos - prevPos + 40) % 40;
        if (steps > 0 && steps <= 12) {
          hoppingStateRef.current[p.id] = {
            fromPos: prevPos,
            toPos: newPos,
            currentStep: 0,
            totalSteps: steps,
            t: 0,
            offX,
            offZ,
          };
        } else {
          const transform = getTile3DTransform(newPos);
          tokenMesh.position.set(transform.x + offX, 0.25, transform.z + offZ);
        }
      } else if (prevPos === undefined) {
        const transform = getTile3DTransform(newPos);
        tokenMesh.position.set(transform.x + offX, 0.25, transform.z + offZ);
      }

      lastRecordedPositionsRef.current[p.id] = newPos;
    });
  }, [players, activePlayerId]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#c2e2fa]">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating Controls (Đặt dưới Card người chơi góc trên bên trái, tránh chồng lấn G01) */}
      <div className="absolute top-[125px] left-4 z-20 flex items-center gap-2 bg-white/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-300 shadow-lg">
        <button
          onClick={() => {
            cameraAnglesRef.current = { theta: Math.PI / 4, phi: Math.PI / 3.4, radius: 36 };
            updateCameraPosition();
          }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          title="Về góc nhìn chuẩn bao quát 4 góc bàn cờ"
        >
          <RotateCcw size={14} /> Góc Chuẩn (3D)
        </button>
        <button
          onClick={() => {
            cameraAnglesRef.current = { theta: 0, phi: 0.05, radius: 36 };
            updateCameraPosition();
          }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          title="Góc nhìn thẳng từ trên xuống"
        >
          <Eye size={14} /> Nhìn Thẳng
        </button>
      </div>

      <div className="absolute bottom-24 right-4 z-20 pointer-events-none hidden sm:block">
        <span className="text-[11px] font-medium text-slate-700 bg-white/80 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1.5 shadow-sm">
          <Sparkles size={13} className="text-amber-500" /> Kéo chuột để xoay 360° • Lăn chuột để phóng to
        </span>
      </div>
    </div>
  );
}
