@echo off
title Cờ Tỷ Phú Pro - Monopoly Việt Nam 3D
chcp 65001 >nul
echo ========================================================
echo   🎲 ĐANG KHỞI ĐỘNG GAME CỜ TỶ PHÚ VIỆT NAM PRO 3D 🎲
echo ========================================================
echo.
echo Đang mở trình duyệt tại địa chỉ http://localhost:3001 ...
start http://localhost:3001
echo.
echo Máy chủ đang chạy... Nhấn Ctrl+C để dừng khi chơi xong.
echo.
node server/index.js
pause
