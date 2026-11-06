# Đánh giá Cờ Tỷ Phú Việt Nam và kế hoạch nâng cấp cho Antigravity

Ngày đánh giá: **06/11/2026** (giờ Việt Nam). Mã commit tại thời điểm xem: **b64bf11**.

## 1. Kết luận cần đọc trước

**Game đã có nền tảng prototype khá tốt, nhưng chưa đạt mức hoàn thiện của một game Monopoly thương mại trên Steam.** Điểm giống rõ nhất là bàn cờ 3D, mua đất, thu tiền thuê, xúc xắc, tù và các màn hình giao dịch. Điểm chưa đạt nằm ở tính đúng của luật, độ tin cậy của trạng thái ván chơi, AI, khả năng dùng trên điện thoại và online.

Quan trọng hơn: **dự án đang pha luật Monopoly cổ điển với các cơ chế lấy cảm hứng Business Tour.** README và màn hình lobby quảng bá Monopoly nguyên bản, nhưng engine cho xây không cần đủ bộ màu, có mua cưỡng chế đất, Landmark bất khả xâm phạm và thắng ngay khi đủ một số tập tài sản. Đây là khác biệt về thiết kế trò chơi, không chỉ là khác giao diện.

**Ưu tiên đề xuất:** chốt bộ luật → sửa tính tiền và lượt → sửa bot và giao dịch → làm online có máy chủ kiểm soát → hoàn thiện giao diện → nâng chất lượng đồ họa. Thêm hiệu ứng lúc này không giải quyết được các lỗi có thể làm sai kết quả cả ván.

---

## 2. Danh Sách Lỗi Kỹ Thuật (F01 -> F17)

### F01 — P0: Server cho client ghi đè toàn bộ ván
- **Vấn đề**: `server/index.js` nhận `sync_game_state` từ client và phát lại toàn bộ mà không kiểm tra tính hợp lệ.
- **Giải pháp**: Chuyển sang kiến trúc Server-Authoritative (Action-based).

### F02 — P1: “Gửi lời đề nghị” lập tức lấy tiền/đất của đối thủ
- **Vấn đề**: `onSendTrade` chuyển tiền/đất ngay lập tức không qua xác nhận của đối thủ.
- **Giải pháp**: Xây dựng luồng `TradeOffer` với trạng thái Pending, Accept, Reject, Cancel. Bot định giá giao dịch hợp lý.

### F03 — P1: Modal nâng cấp nhận sai props và có thể coi đất cũ là mua mới
- **Vấn đề**: `BusinessTourBuildModal` bị lệch hợp đồng props giữa `App.jsx` và `ActionModals.jsx`.
- **Giải pháp**: Thống nhất props, engine kiểm tra và xác thực chi phí/cấp độ đích.

### F04 — P1: Tính khả năng trả nợ cộng số dư âm hai lần
- **Vấn đề**: `calculateMaxLiquidatable` đã gồm tiền mặt nhưng `App.jsx` lại tính `debtor.money + maxLiquid < 0`.
- **Giải pháp**: Sửa điều kiện so sánh `maxLiquid < 0` chuẩn xác.

### F05 — P1: Bot xây vượt cấp và bán một căn nhà nhiều lần
- **Vấn đề**: `aiEngine.js` không cập nhật state mô phỏng sau mỗi hành động, làm bot xây từ cấp 3 lên 8 hoặc bán 1 nhà 8 lần.
- **Giải pháp**: Mô phỏng tuần tự trên bản sao deep copy và validate qua reducer chung.

### F06 — P1: Callback dùng state cũ làm mất lương GO hoặc quay lại trạng thái tù
- **Vấn đề**: Chuỗi `setState` lồng nhau trong `movePlayer` đọc `players` cũ.
- **Giải pháp**: Xử lý một transition bằng state mới xuyên suốt, truyền `nextPlayers` vào callbacks.

### F07 — P1: Pha giải quyết nợ chưa khóa được lượt và tiền thuê có thể tạo tiền
- **Vấn đề**: Cộng tiền cho chủ nợ trước khi biết con nợ có đủ thanh toán không; nếu phá sản thì tiền âm bị xóa thành 0 -> sinh tiền ảo.
- **Giải pháp**: Thêm `debtContext`, khóa lượt đến khi thanh lý xong hoặc phá sản chuyển giao tài sản.

### F08 — P1: Đấu giá có lỗi chuyển người và callback cũ
- **Vấn đề**: Index người chơi bị lệch khi có người bỏ cuộc (`activeBidders.filter`).
- **Giải pháp**: Đưa đấu giá thành state machine với revision và xử lý tuần tự.

### F09 — P1: Thẻ có action chưa triển khai; thẻ trả tiền bỏ sót trạng thái lượt
- **Vấn đề**: Action `move_nearest_railroad`, `property_repair` bị bỏ quên trong switch-case; `deductMoney` return trước `setHasRolled(true)`.
- **Giải pháp**: Triển khai đầy đủ handler cho toàn bộ action thẻ và bộ bài có trạng thái rút/trả.

### F10 — P1: Bot cần người thật bấm hộ khi có thẻ/trong tù
- **Vấn đề**: Bot dừng khi `activeCard` mở hoặc mở modal thay vì tự đổ đôi trong tù.
- **Giải pháp**: Bot tự động giải quyết thẻ và lựa chọn trong tù theo phase.

### F11 — P1: Online thiếu dữ liệu đồng bộ và khả năng nối lại
- **Vấn đề**: `doublesCount` và các modal phase không đồng bộ; mất kết nối làm mất phòng.
- **Giải pháp**: Đồng bộ đầy đủ snapshot và phiên người chơi.

### F12 — P1: Loại tài sản và cấp công trình đang bị dùng lẫn
- **Vấn đề**: Ga tàu và tiện ích bị gán cấp nhà/Landmark; xung đột quy ước cấp 4 vs cấp 5.
- **Giải pháp**: Tách biệt `AssetType` và chuẩn hóa hệ thống 4 cấp công trình (Cấp 4 = Khách Sạn Landmark tối đa).

### F13 — P1: Điều kiện thắng chưa kiểm tra sau mọi thay đổi sở hữu
- **Vấn đề**: Trade và phá sản không kiểm tra `checkBusinessTourVictory`.
- **Giải pháp**: Kiểm tra sau mỗi lần thay đổi quyền sở hữu bất động sản.

### F14 — P2: Thông tin HUD có dữ liệu giả và thiếu người chơi
- **Vấn đề**: Chỉ hiển thị tối đa 4 người (khi chơi 6 người thì mất người 5, 6); số vòng tính sai; đồng hồ và jackpot có chuỗi cố định.
- **Giải pháp**: Render linh hoạt theo số người chơi thực tế; đồng hồ tính giờ trận đấu thực; jackpot 0 hiện đúng 0đ.

### F15 — P2: Responsive và khả năng đọc trên điện thoại
- **Vấn đề**: Dock nút bị tràn ngang trên màn hình mobile (390px).
- **Giải pháp**: Tối ưu dock co giãn, thanh thu gọn người chơi.

### F16 — P2: Scene 3D quản lý tài nguyên và raycast
- **Vấn đề**: `group.clear()` không dispose geometry/texture; raycast sai khi resize.
- **Giải pháp**: Quản lý dispose sạch sẽ và cập nhật rect khi raycast.

### F17 — P2: Kiến trúc và test coverage
- **Vấn đề**: `App.jsx` quá lớn, cần tách module engine rõ ràng và bổ sung unit test hồi quy.
