# Review V20 — Sau bản sửa V19

Ngày 08/11/2026. Review source local chưa commit. **Chỉ review, không sửa code game, commit/push hoặc deploy.**

## Kết luận

**Finding V19-R01 đã được xử lý trong các kịch bản kiểm tra.** Bộ đệm giữ revision lớn nhất, ACK được so với buffer và game hiện tại, danh tính người chơi vẫn đúng. Chưa phát hiện thêm lỗi có bằng chứng trong phạm vi đợt này.

Có thể chuyển từ vòng sửa lỗi hook sang **nghiệm thu toàn luồng trên trình duyệt và hai thiết bị thật**. Không cần tiếp tục viết lại cơ chế resume nếu chưa có lỗi mới tái hiện được. Đây chưa phải xác nhận toàn bộ production, luật game hoặc giao diện đã hoàn tất.

## Bằng chứng kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `npm test` | **118 ca qua** = 23 legacy + 95 Node runner; 0 fail/cancelled/skip |
| `npm run build` | Thành công, còn cảnh báo chunk lớn |
| Probe độc lập dùng thân hook thật | Nhận 4→5, ACK 3: giữ 5; nhận 5→4, ACK 3: cũng giữ 5 |
| Danh tính trong probe | Cả hai trường hợp nhận đúng playerId gốc, vào màn chơi |
| Regression mới | Có 9 ca cho cập nhật đảo thứ tự, bản trùng, ACK mới/cũ hơn buffer, trận khác, leave, khóa action và không hạ revision đang có |
| GUI/thiết bị thật | Chưa chạy trong vòng V20 |
| Redis integration | Không chạy lại V20; không cộng kết quả Redis thật cũ vào 118 ca mới |
| Production/deploy | Không kiểm chứng bản deploy mới trong vòng này |

So với snapshot V19, các tệp theo dõi thay đổi là `package.json`, `src/hooks/useGameController.js`, `src/App.jsx`; có thêm `test/reviewV19.test.js`. Engine, backend Redis và các component bàn/HUD trong tập hash đối chiếu không đổi.

## Những sửa được ghi nhận

- `bufferSnapshot()` chỉ thay buffer khi candidate mới hơn; không còn đơn thuần lấy bản đến cuối.
- Chọn state giữa buffer, ACK và state đang giữ để tránh lùi revision.
- Có xét `startedAt` khi so state thuộc các trận khác nhau; test tương ứng đã qua. Vẫn cần kiểm tra thông tin phòng/trận trong thử nghiệm tích hợp.
- `App` khóa thao tác khi `isResuming`; phòng chờ cũng dùng trạng thái này để disable.
- `dispatch()` tự chặn action trong lúc resume, giúp bảo vệ cả khi callback được gọi ngoài nút chính.
- Giữ các kiểm tra hủy phiên khi leave/superseded và khôi phục đúng playerId từ ACK.

Không giữ lỗi V19 như finding đang mở trên snapshot mới. Các probe ở V18/V19 có assertion dành cho hành vi lỗi cũ; không chạy nguyên chúng rồi coi việc assertion thất bại sau sửa là regression. Probe V20 đã đổi kỳ vọng sang hành vi đúng.

## Việc tiếp theo cho Anti

### 1. Nghiệm thu resume bằng trình duyệt thật

- Đang tới lượt: refresh → đúng ghế → roll và kết thúc lượt được.
- Đang chọn cấp nhà: refresh → vẫn đúng cơ hội xây, ô đất và số dư; xác nhận mua/nâng chỉ trừ tiền một lần.
- Giả lập ACK chậm/mất → retry vẫn trở lại đúng ghế, không thêm người chơi mới.
- Ngắt mạng ngắn, rồi quay lại trước hạn session → khôi phục được; quá hạn → thông báo rõ.
- Mở cùng phiên ở tab khác → tab cũ bị khóa; không giành lại quyền do retry.
- Rời phòng khi đang resume → ACK cũ không đưa người chơi quay vào trận.

Làm trên hai thiết bị ở hai mạng khác nhau. Đây là phần còn thiếu để đánh giá trải nghiệm online thực tế, không phải finding mới đã chứng minh.

### 2. Kiểm tra Redis/network khi có thay đổi liên quan

Trước khi chốt phát hành, chạy Redis integration thật và thử mất riêng command/subscriber, snapshot bù, hai instance. Bộ test hook có kiểm soát thứ tự không thay thế được các phép thử mạng này. Giữ dịch vụ Vercel/Redis miễn phí hiện có; không cần chuyển hosting chỉ vì đợt review này.

### 3. Chuyển trọng tâm sang giao diện

**Không có thay đổi mỹ thuật bàn mới trong snapshot V20**, nên chưa thể kết luận đã giống ảnh Business Tour hơn. Kết quả hình ảnh gần nhất vẫn ở V16, không phải ảnh nghiệm thu mới.

Ưu tiên: độ đọc tên/giá ở góc nhìn toàn bàn; camera có vùng an toàn cho HUD; công trình cấp 1–4 dễ phân biệt và không che nhãn; ảnh cùng state trên desktop/mobile. Sau đó bổ sung chat trong trận, hướng dẫn luật và tiến độ thắng. Timer lượt/AFK vẫn là backlog nếu chưa có triển khai mới.

Không đánh dấu đồ họa hoặc mobile hoàn tất chỉ vì test logic xanh. Cũng không cần viết lại engine mua nhà khi chưa có lỗi mới tái hiện được.

## Tệp bằng chứng

- [Probe V20](docs/review-v20-2026-11-08/buffer-probe.mjs), [kết quả](docs/review-v20-2026-11-08/buffer-results.json).
- [Log 118 test](docs/review-v20-2026-11-08/tests.txt), [log build](docs/review-v20-2026-11-08/build.txt).
- [Snapshot hash](docs/review-v20-2026-11-08/validation.json).

Probe dùng thân hook thật và dependency giả để điều khiển sự kiện, chưa phải replay trên trình duyệt hoặc production. Không thay đổi source game, tài khoản, cấu hình dịch vụ hoặc gói phí trong lượt review này.
