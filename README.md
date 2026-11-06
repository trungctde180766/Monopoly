# 🎲 CỜ TỶ PHÚ PRO (VIETNAMESE MONOPOLY MASTER EDITION)

Một tựa game **Cờ Tỷ Phú** hoàn chỉnh được thiết kế riêng cho người chơi Việt Nam với địa danh quen thuộc (Hà Nội, Sài Gòn, Đà Nẵng, Hạ Long...), giao diện sang trọng hiện đại phong cách Luxury Tycoon, âm thanh sống động và bám sát **100% logic luật cờ tỷ phú quốc tế**.

---

## 🌟 TÍNH NĂNG NỔI BẬT

### 1. Đồ Họa & Trải Nghiệm Cao Cấp
- **Bàn cờ 40 ô chuẩn quốc tế**: Tông màu tối sang trọng Slate 900 / Navy viền vàng ánh kim (Gold).
- **Xúc xắc 3D sống động**: Hiệu ứng lắc, đổ đôi có thông báo và thưởng lượt.
- **Quân cờ đại diện độc đáo**: Siêu xe 🏎️, Chuyên cơ ✈️, Du thuyền 🛥️, Mũ tỷ phú 🎩, Kim cương 💎, Corgi hoàng gia 🐕.
- **Hệ thống âm thanh Web Audio tự động**: Không phụ thuộc file ngoài, tự sinh âm thanh xúc xắc, keng keng tiền vàng, còi cảnh sát, tiếng búa gõ đấu giá, tiếng nâng cấp nhà và nhạc khải hoàn chiến thắng.
- **Hiệu ứng pháo hoa Confetti**: Bùng nổ khi tìm ra người chiến thắng cuối cùng.

### 2. Chuẩn 100% Luật Cờ Tỷ Phú Thực Tế
- **Ô Khởi Hành (GO)**: Nhận lương 2.000.000₫ khi đi qua hoặc dừng lại.
- **22 Ô Đất thuộc 8 Nhóm Màu**: Nhân đôi tiền thuê khi đủ bộ màu chưa xây nhà.
- **Quy tắc xây nhà đồng đều**: Không được xây vượt cấp nếu các ô cùng màu chưa có nhà. Tối đa 4 Nhà -> Nâng cấp lên Khách Sạn (Hotel).
- **4 Bến Xe & Ga Tàu**: Tiền thuê tính theo số ga sở hữu: 250k (1 ga), 500k (2 ga), 1M (3 ga), 2M (4 ga).
- **2 Công Ty Tiện Ích (Điện & Nước)**: Tiền thuê tính theo điểm xúc xắc x 40.000₫ (1 tiện ích) hoặc x 100.000₫ (2 tiện ích).
- **Đổ Đôi (Doubles)**: Được đi tiếp thêm 1 lượt. Đổ đôi 3 lần liên tiếp bị bắt vào tù vì chạy quá tốc độ!
- **Nhà Tù (Jail)**: Nộp 500k tiền bảo lãnh, dùng Thẻ Đặc Xá, hoặc thử vận may đổ đôi trong tối đa 3 lượt.
- **Đấu Giá Tự Do (Auction)**: Khi người chơi bỏ qua không mua một khu đất, sàn đấu giá tự động mở ra cho tất cả người chơi trả giá từ mức khởi điểm hấp dẫn.
- **Đàm Phán & Giao Dịch (Trade)**: Trao đổi sổ đỏ, các thêm tiền mặt giữa 2 người chơi.
- **Thế Chấp (Mortgage)**: Thu về 50% giá trị đất khi thiếu tiền. Chuộc lại đất với 10% tiền lãi.
- **Phá Sản (Bankruptcy)**: Tự động tính toán khả năng thanh khoản (bán nhà + thế chấp) trước khi tuyên bố vỡ nợ và chuyển giao tài sản cho chủ nợ.
- **Bãi Đỗ Xe Miễn Phí (Free Parking)**: Tùy chọn gom toàn bộ tiền phạt và thuế nộp vào hũ Jackpot trao cho người may mắn đặt chân tới!

### 3. Đa Dạng Chế Độ Chơi
1. **Chơi Chung 1 Máy (Pass & Play)**: Hỗ trợ 2 đến 6 người chơi, có thể bật/tắt Bot AI cho từng vị trí.
2. **Chơi Online Qua Mã Phòng (Multiplayer)**:
   - Tạo phòng nhận mã Code 5 chữ cái (VD: `TYPHU`).
   - Bạn bè nhập mã Code để vào phòng từ máy tính hoặc điện thoại trên cùng mạng Wi-Fi/LAN hoặc qua Internet.
   - Hỗ trợ phòng chờ, trạng thái sẵn sàng, chat trò chuyện trực tiếp trong game.
3. **Chơi Nhanh Với 3 AI Bots (Quick Solo)**: 1-click vào trận ngay với 3 Bot máy thông minh (biết mua đất, nâng cấp nhà, tham gia đấu giá).

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

## 🌐 HƯỚNG DẪN DEPLOY LÊN VERCEL & RENDER

### 1. Deploy Frontend Lên Vercel (Miễn phí 100%)
- **Hỗ trợ tuyệt vời**: Chơi Pass & Play (chung 1 máy) và Chơi với 3 AI Bots với đồ họa 3D Three.js mượt mà.
- **Cách deploy**:
  1. Đẩy mã nguồn lên GitHub: `git push -u origin main`.
  2. Truy cập [vercel.com](https://vercel.com) -> Chọn **Add New Project** -> Chọn repository `Monopoly`.
  3. Vercel sẽ tự động nhận diện cấu hình trong `vercel.json` và build tự động (`npm run build`, output: `dist`).
  4. Nhấn **Deploy** -> Sau 30 giây bạn sẽ có link web công khai `https://monopoly-xyz.vercel.app`!

### 2. Hỗ trợ Chế Độ Chơi Online Nhiều Máy (Multiplayer Socket.io)
- Vì Vercel là kiến trúc Serverless (không duy trì kết nối WebSocket liên tục), để chơi phòng Online giữa nhiều máy qua Internet:
  - Bạn có thể deploy thư mục backend lên [Render.com](https://render.com) hoặc [Railway.app](https://railway.app) (Web Service Node.js miễn phí, chạy lệnh `npm start`).
  - Sau đó vào Vercel Dashboard -> **Settings** -> **Environment Variables** -> Thêm biến:
    ```
    VITE_SOCKET_URL = https://your-server-on-render.onrender.com
    ```
  - Hoặc deploy toàn bộ dự án trực tiếp lên Render/Railway (hỗ trợ cả frontend lẫn WebSocket trọn gói).
```bash
npm run start
```
Frontend chạy tại `http://localhost:5173` và Backend chạy tại `http://localhost:3001`.

---

## 🧪 KIỂM THỬ HỆ THỐNG
Dự án đi kèm bộ test tự động kiểm tra toàn bộ 9 bài test về logic cờ tỷ phú và máy chủ:
```bash
node test/gameRules.test.js
```
Kết quả kiểm thử: **100% Passed**.
