# Đưa bản đã sửa lên online

Frontend hiện tại: https://monopoly-silk-ten.vercel.app. Các thay đổi trong workspace chưa tự cập nhật URL này.

## Phương án phù hợp code hiện tại

Giữ frontend trên Vercel và chạy backend Node/Socket.IO bằng một dịch vụ Node chạy liên tục.

1. Deploy **toàn bộ repository**, không chỉ thư mục `server`: backend còn import engine và dữ liệu từ `src`.
2. Build: `npm ci` rồi `npm run build`. Start: `npm start`. Nền tảng cấp `PORT`; server tự đọc biến này.
3. Kiểm tra `https://<backend>/api/health`: phải trả JSON có `status: "ok"` và `protocol: "actions-v1"`.
4. Trong Environment Variables của project Vercel, đặt `VITE_SOCKET_URL=https://<backend>` và `VITE_SOCKET_PATH=/socket.io`.
5. Rebuild/redeploy frontend. Vite nhúng các biến này lúc build, thay biến xong cần deploy lại.
6. Dùng script dưới kiểm tra URL frontend và backend thực tế.

```powershell
node docs/review-v5-2026-11-06/check-online.mjs https://monopoly-silk-ten.vercel.app https://<backend>
```

Script chỉ kiểm tra kết nối, không tạo phòng. Sau đó mở hai thiết bị: một Wi-Fi, một 4G; tạo/vào phòng, sẵn sàng, lắc, mua, đổi lượt, tải lại trang để thử nối lại.

## Hành vi của bản mới

- Client gửi `game_action` kèm revision; server tính xúc xắc, tiền, tài sản và chiến thắng. `sync_game_state` từ client bị từ chối.
- Có 60 giây để nối lại phiên nếu mất kết nối. Token khôi phục nằm trong sessionStorage của tab; không gửi token cho bạn bè. Hết thời gian, hoặc bấm Rời Bàn, người đó rời ván và tài sản về ngân hàng.
- Chạy **một instance backend** với code hiện tại. State và token vẫn ở RAM; restart/deploy backend sẽ mất phòng. Muốn nhiều instance hoặc lưu ván cần kho state/pub-sub và lưu phiên dùng chung.
- Frontend và backend phải deploy cùng phiên bản giao thức. Frontend cũ dùng snapshot sẽ không điều khiển được server mới.

## Nếu muốn chỉ dùng Vercel

Tài liệu hiện hành cho phép WebSocket trên Vercel Functions, nên không có kết luận “Vercel không hỗ trợ WebSocket”. Tuy nhiên repo này chưa được chuyển thành Functions với state phân tán. Cần triển khai endpoint/export HTTP server đúng chuẩn, cấu hình Socket.IO path/transport, kho state dùng chung và khôi phục qua instance. Xem [Vercel WebSockets](https://vercel.com/docs/functions/websockets), [ví dụ Socket.IO](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections).

Không chỉ đổi rewrite về `index.html` rồi coi backend đã hoạt động. Không triển khai bản `rooms = new Map()` trực tiếp qua nhiều Function instance rồi kỳ vọng mọi người thấy cùng phòng.

## Tình trạng lần thực hiện này

- Backend và hai client đã được kiểm tra ở localhost; có test Socket.IO thật và kiểm tra UI.
- Chưa có URL backend công khai được cung cấp.
- Lệnh `vercel whoami` báo token không hợp lệ; workspace cũng chưa có liên kết `.vercel/project.json`. Vì vậy chưa thể xác thực/deploy project hiện tại bằng CLI trong phiên này.
- Không có thay đổi trên production được tuyên bố là đã triển khai.
