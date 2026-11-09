# Đã triển khai miễn phí — 08/11/2026

- Game: https://monopoly-silk-ten.vercel.app
- Source production: `b5da067` trên `main`, đã push GitHub và Vercel báo Ready.
- Redis Cloud: `monopoly-free`, database `14751351`, subscription `3477855`, Free 30 MB, $0/tháng.
- Vercel: project `monopoly`, tài khoản Hobby. Không nâng cấp gói hoặc thêm thẻ thanh toán.
- `REDIS_URL` đã lưu dưới dạng Secret, chỉ môi trường Production. Tài liệu này không chứa mật khẩu.
- Health public trả HTTP 200 JSON: `status=ok`, `protocol=actions-v1`, `backend=redis`.

Kiểm tra thực tế đã qua: hai kết nối WebSocket, create/join/ready/start, chat, giao dịch đúng số dư, lắc/đổi lượt, resume và chặn phiên bị thay thế. Đây là hai kết nối độc lập từ môi trường kiểm tra; chưa thay thế việc chơi thử bằng Wi-Fi và 4G trên hai thiết bị của bạn.

Phòng thử đã được dọn; health sau kiểm tra báo `activeRooms=0`. Kết quả chi tiết: `docs/deployment-free-2026-11-08/results.json` và script `smoke.mjs`.

Gói Free hiện hiển thị giới hạn 30 kết nối và 100 ops/giây; không có high availability/data persistence. Phù hợp thử nghiệm nhóm nhỏ; không tự nâng cấp khi chạm giới hạn. Các tài liệu review trước đây ghi “chưa deploy” là trạng thái lịch sử trước lần triển khai này.
