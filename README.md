# 🎲 CỜ TỶ PHÚ PRO (VIETNAMESE MONOPOLY MASTER EDITION)

Một tựa game **Cờ Tỷ Phú** hoàn chỉnh được thiết kế riêng cho người chơi Việt Nam với địa danh quen thuộc (Hà Nội, Sài Gòn, Đà Nẵng, Hạ Long...), giao diện sang trọng hiện đại phong cách Luxury Tycoon, âm thanh sống động và dùng ruleset Arcade lấy cảm hứng từ Monopoly và Business Tour.

---

## 🌟 TÍNH NĂNG NỔI BẬT

### 1. Đồ Họa & Trải Nghiệm Cao Cấp
- **Bàn cờ 40 ô chuẩn quốc tế**: Nền trời sáng, bàn trắng, công trình hướng tâm bàn và lane quân cờ riêng.
- **Xúc xắc 3D sống động**: Hiệu ứng lắc, đổ đôi có thông báo và thưởng lượt.
- **Quân cờ đại diện độc đáo**: Siêu xe 🏎️, Chuyên cơ ✈️, Du thuyền 🛥️, Mũ tỷ phú 🎩, Kim cương 💎, Corgi hoàng gia 🐕.
- **Hệ thống âm thanh Web Audio tự động**: Không phụ thuộc file ngoài, tự sinh âm thanh xúc xắc, keng keng tiền vàng, còi cảnh sát, tiếng búa gõ đấu giá, tiếng nâng cấp nhà và nhạc khải hoàn chiến thắng.
- **Hiệu ứng pháo hoa Confetti**: Bùng nổ khi tìm ra người chiến thắng cuối cùng.

### 2. Ruleset Arcade của dự án
- **Ô Khởi Hành (GO)**: Nhận lương 2.000.000₫ khi đi qua hoặc dừng lại.
- **22 Ô Đất thuộc 8 Nhóm Màu**: Nhân đôi tiền thuê khi đủ bộ màu chưa xây nhà.
- **Quyền xây theo lần ghé**: Mua mới cấp 1–3. Landmark cần đã có cấp 3 từ trước lần ghé hiện tại. Mỗi lần ghé chỉ xác nhận một lần; không cần đủ bộ màu.
- **4 Bến Xe & Ga Tàu**: Tiền thuê tính theo số ga sở hữu: 250k (1 ga), 500k (2 ga), 1M (3 ga), 2M (4 ga).
- **2 Công Ty Tiện Ích (Điện & Nước)**: Tiền thuê tính theo điểm xúc xắc x 40.000₫ (1 tiện ích) hoặc x 100.000₫ (2 tiện ích).
- **Đổ Đôi (Doubles)**: Được đi tiếp thêm 1 lượt. Đổ đôi 3 lần liên tiếp bị bắt vào tù vì chạy quá tốc độ!
- **Nhà Tù (Jail)**: Nộp 500k tiền bảo lãnh, dùng Thẻ Đặc Xá, hoặc thử vận may đổ đôi trong tối đa 3 lượt.
- **Bỏ qua mua đất**: Kết thúc quyết định mua, không mở đấu giá trong ruleset hiện tại.
- **Đàm Phán & Giao Dịch (Trade)**: Trao đổi sổ đỏ, các thêm tiền mặt giữa 2 người chơi.
- **Thế Chấp (Mortgage)**: Thu về 50% giá trị đất khi thiếu tiền. Chuộc lại đất với 10% tiền lãi.
- **Phá Sản (Bankruptcy)**: Tự động tính toán khả năng thanh khoản (bán nhà + thế chấp) trước khi tuyên bố vỡ nợ và chuyển giao tài sản cho chủ nợ.
- **Bãi Đỗ Xe Miễn Phí (Free Parking)**: Tùy chọn gom toàn bộ tiền phạt và thuế nộp vào hũ Jackpot trao cho người may mắn đặt chân tới!

### 3. Đa Dạng Chế Độ Chơi
1. **Chơi Chung 1 Máy (Pass & Play)**: Hỗ trợ 2 đến 6 người chơi, có thể bật/tắt Bot AI cho từng vị trí.
2. **Chơi Online Qua Mã Phòng (Multiplayer)**:
   - Tạo phòng nhận mã gồm 6 ký tự để gửi cho bạn bè.
   - Bạn bè nhập mã Code để vào phòng từ máy tính hoặc điện thoại trên cùng mạng Wi-Fi/LAN hoặc qua Internet.
   - Hỗ trợ phòng chờ, trạng thái sẵn sàng, chat trò chuyện trực tiếp trong game.
3. **Chơi Nhanh Với 3 AI Bots (Quick Solo)**: 1-click vào trận ngay với 3 Bot máy thông minh (biết mua đất và nâng cấp khi có quyền xây hợp lệ).

---

## 🚀 HƯỚNG DẪN KHỞI CHẠY NHANH

### Cách 1: Khởi chạy 1 chạm bằng file `start.bat`
Chỉ cần nhấp đúp vào file `start.bat` trên màn hình:
1. Trình duyệt web sẽ tự động mở tại `http://localhost:3001`.
2. Máy chủ cờ tỷ phú tự động khởi chạy và bạn có thể chơi ngay lập tức!

### Cách 2: Khởi chạy bằng lệnh Terminal
```bash
# Cài đặt thư viện (nếu cần)
npm install

# Build mã nguồn
npm run build

# Khởi động máy chủ chơi game
npm run server
```
Truy cập: `http://localhost:3001`

### Cách 3: Chế độ phát triển (Development Mode)
```bash
npm run dev
```

---

## 🌐 DEPLOY ONLINE TRÊN VERCEL

Frontend và API Socket.IO có thể dùng chung project Vercel; phòng chơi online lưu trên Redis TCP/TLS với CAS theo version và pub/sub giữa instance. Cấu hình `REDIS_URL` ở backend, giữ `VITE_SOCKET_URL` trống khi cùng domain và dùng `VITE_SOCKET_PATH=/socket.io`.

Xem [DEPLOY_ONLINE.md](DEPLOY_ONLINE.md) để thiết lập, kiểm health JSON, cold deployment và thử hai thiết bị. Vercel thiếu Redis trả 503 cho online; file store local không phải kho chung giữa các instance.

Dùng `npm run test:redis` cùng `REDIS_TEST_URL` của database thử nghiệm để kiểm hai backend độc lập, restart/resume và CAS thật. Bản sửa tại máy chưa tự cập nhật lên link public.

---

## 🧪 KIỂM THỬ HỆ THỐNG
Dự án có test hồi quy, engine xây nhà, layout, mô phỏng ván dài và Socket.IO thực tế:
```bash
npm test
```
Kết quả và giới hạn của lần kiểm tra mới: [REVIEW_V6_GIAO_DIEN_VA_LOGIC.md](REVIEW_V6_GIAO_DIEN_VA_LOGIC.md).

V6 dùng chung bộ xử lý phiên `src/logic/gameSession.js` cho local/bot và server. Giao diện mới tách vùng bàn, người chơi, thông tin ô và thanh lượt; cửa sổ mua có preview công trình. Online public vẫn cần cấu hình backend theo [DEPLOY_ONLINE.md](DEPLOY_ONLINE.md).
