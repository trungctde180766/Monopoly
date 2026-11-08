# Deploy online trên Vercel + Redis

Frontend và API Socket.IO có thể dùng cùng project Vercel. Bản này có Redis TCP/TLS, CAS bằng Lua theo version toàn phòng, pub/sub giữa instance và resume bằng phiên dùng chung.

## Biến môi trường

Trong Vercel → Project → Settings → Environment Variables, đặt:

| Biến | Giá trị |
| --- | --- |
| REDIS_URL | TCP URL do dịch vụ Redis cung cấp: redis://... hoặc rediss://... |
| REDIS_KEY_PREFIX | cotyphu, hoặc prefix riêng cho từng môi trường |
| VITE_SOCKET_URL | Để trống khi frontend và API cùng domain |
| VITE_SOCKET_PATH | /socket.io |

REDIS_URL là bí mật backend. Không dùng tiền tố VITE_ cho nó và không commit mật khẩu. Nhà cung cấp phải cho phép kết nối Redis TCP/TLS, Lua EVAL và PUB/SUB; REST URL/token không thay thế TCP URL. Có thể chọn Redis qua Vercel Marketplace hoặc dịch vụ tương thích đáp ứng các khả năng trên.

Nên dùng database/prefix riêng cho Preview và Production để tránh hai deployment dùng chung phòng ngoài ý muốn. State phòng có TTL 24 giờ, được gia hạn khi cập nhật; thời hạn giữ dữ liệu dài hơn cần đổi rõ trong RedisRoomStore.

Vercel thiếu cấu hình Redis sẽ trả 503 JSON ở health và từ chối kết nối online. Chế độ chơi local/bot ở frontend vẫn dùng được. Local development không có Redis dùng file store; file store chỉ dành cho một máy phát triển.

## Triển khai và nghiệm thu

1. Đưa source và package-lock.json đã cập nhật lên repository, rồi deploy đúng revision. Review V14 chưa commit/push/deploy.
2. Giữ Build Command npm run build và Output Directory dist theo vercel.json. API default export là HTTP server đã gắn Socket.IO; cả /socket.io và /api/realtime/socket.io được chuẩn hóa.
3. Kiểm tra https://YOUR_DOMAIN/api/health. Phải trả JSON với status=ok, protocol=actions-v1 và backend=redis. HTML trang chủ hoặc status=unavailable chưa đạt.
4. Hai thiết bị ở hai mạng khác nhau cùng tạo/vào mã phòng, ready, start, chat, lắc, mua/xây và đổi lượt.
5. Tải lại tab ở phòng chờ và trong ván; giữ cùng logical player và state. Mở phiên thay thế: phiên cũ phải hiện thông báo, khóa thao tác và không loại người ở phiên mới khi rời.
6. Kiểm tra lại sau deployment/restart; dữ liệu đã commit và request result phải khôi phục từ Redis.

WebSocket có thể đóng khi Function hết thời lượng chạy; client phải reconnect/resume. Deadline phiên được lưu trong Redis, có heartbeat khi kết nối còn sống. Nếu process cũ biến mất, lần truy cập phòng kế tiếp xử lý các deadline đã hết. [Vercel WebSockets](https://vercel.com/docs/functions/websockets).

Chỉ có REDIS_URL chưa đủ để tuyên bố nghiệm thu production: vẫn cần kiểm cold deployment, route thực tế, TLS/auth của nhà cung cấp và luồng hai thiết bị nói trên.

## Chạy trên máy

Dùng Node.js 22 trở lên. Có thể build và chạy toàn bộ app:

~~~powershell
rtk npm ci
rtk npm run build
rtk npm start
~~~

Mở http://localhost:3001. Nếu dùng Redis local, đặt REDIS_URL trong môi trường của terminal trước khi chạy. Nếu lưu các biến trong .env.local, chạy:

~~~powershell
rtk proxy node --env-file=.env.local server/index.js
~~~

Vite development trên cổng 5173 đã proxy /socket.io tới backend cổng 3001. Chạy thêm npm run dev trong terminal riêng nếu cần hot reload frontend.

## Kiểm thử

~~~powershell
rtk npm test
~~~

Kiểm thử Redis thật dùng database thử nghiệm riêng:

~~~powershell
$env:REDIS_TEST_URL='redis://127.0.0.1:16389'
rtk npm run test:redis
~~~

Suite Redis tạo prefix ngẫu nhiên của riêng nó, chạy hai backend với thư mục tách biệt, kiểm chat/trade/mua nhà, retry, restart/resume, session fencing và CAS bằng hai process. Chỉ dọn các key thuộc prefix thử nghiệm của chính suite. Không có REDIS_TEST_URL thì các ca tích hợp được đánh dấu skip; skip không phải bằng chứng Redis đã hoạt động.

PersistentStorageAdapter và adapter Map được inject trong các test cũ là fixture local; chúng không phải kho phân tán hoặc phép kiểm Redis production.
