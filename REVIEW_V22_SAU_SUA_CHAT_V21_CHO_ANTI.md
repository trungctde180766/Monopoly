# Review V22 — Sau bản sửa chat và test V21

Ngày 08/11/2026. Review source local chưa commit. **Chỉ review, không sửa code game, commit/push hoặc deploy.**

## Kết luận

**Hai finding chính V21 đã được xử lý:** test đổi tab không còn chờ sai event; backend và chat mới đã thống nhất trường thời gian. Toàn bộ bộ test chạy hoàn tất trong vòng này. Chưa phát hiện thêm lỗi mới có bằng chứng trong phạm vi đã kiểm tra.

Bản này đủ cơ sở để chuyển sang nghiệm thu trải nghiệm trên trình duyệt và hai thiết bị thật. Chưa phải chứng nhận giao diện/mobile hoặc bản Vercel đã hoàn tất.

## Kiểm thử thực tế

| Kiểm tra | Kết quả |
|---|---|
| `npm test` | **125 ca qua:** 23 legacy + 102 Node runner; 0 fail/cancelled/skip |
| `npm run test:redis` | **2 ca Redis thật qua**, không skip |
| Build | Thành công, còn cảnh báo chunk lớn |
| GUI desktop/mobile | Chưa kiểm tra trực quan vòng V22 |
| Production | Không deploy hoặc kiểm chứng phiên bản production mới |

Redis thử là container riêng ở `127.0.0.1:16393`, đã dừng sau kiểm thử; không tác động Redis Cloud. Hai ca Redis integration kiểm tra nhiều backend, action/giao dịch/mua tài sản, resume sau backend restart, fencing và CAS. Không suy từ đó rằng mọi kiểu mất mạng đều được bao phủ.

## Trạng thái các vấn đề V21

| Vấn đề | V22 |
|---|---|
| Test chờ `session_revoked` | Đã đổi sang event client `session_superseded`, thêm timeout; suite không còn treo ở ca này |
| Trường giờ chat không khớp | Server gửi `timestamp` số và `time`, ACK có thông tin thời gian; test chat qua |
| Hai người trùng tên | Server bổ sung `senderId`, UI ưu tiên so ID; có test hai người cùng tên |
| Xóa nội dung dù gửi thất bại | `sendChat()` trả Promise kết quả ACK/timeout; panel chỉ xóa khi thành công, có lỗi gửi |
| Gửi lúc đang resume | Input/nút gửi khóa khi `isResuming`; handler cũng kiểm tra |
| Badge tin đã đọc | Có effect cập nhật khi panel mở, badge bằng 0 lúc mở; cần nghiệm thu GUI |
| Cuộn theo tin mới | Có ref và `scrollIntoView`; hành vi thực tế khi người dùng đang đọc tin cũ cần thử |
| Mobile chat | Có breakpoint mới; chưa có ảnh/trải nghiệm thực tế để xác nhận đạt |

Các mục giao diện trong bảng được đánh giá qua source; test server không thay thế thao tác trên component React bằng trình duyệt.

## Thay đổi và phạm vi

So với snapshot V21: `package.json`, `server/index.js`, `src/hooks/useGameController.js`, `src/components/GameInterface.jsx`, `src/game.css`, `test/reviewV20.test.js` thay đổi; thêm `test/reviewV21.test.js`.

Engine mua/nâng nhà, Board3D và RedisRoomStore giữ nguyên trong các hash đối chiếu. Không mở lại các lỗi resume đã được đóng ở V20 nếu chưa có bằng chứng regression. Chạy lại toàn suite lần này vẫn qua các test hook và mua nhà sau resume.

## Việc còn cần làm trước khi chốt cho người chơi

1. **Hai tab/trình duyệt:** gửi chat hai chiều, cùng tên, đóng/mở panel, tin tới khi panel đang mở; kiểm tra giờ và nhãn “Bạn”.
2. **Gửi thất bại:** ngắt mạng/resume, ACK chậm hoặc mất; nội dung soạn còn, thông báo dễ hiểu. Thử lại sau mất ACK có thể tạo tin trùng vì chat chưa có cơ chế requestId như game action; đây là tình huống nghiệm thu thêm, không phải lỗi mới đã tái hiện ở V22.
3. **Desktop/mobile:** bàn phím ảo, tin dài, nhiều tin, panel chat cùng inspector/log; không che nút kết thúc lượt hoặc quyết định mua nhà. Tự cuộn không nên kéo người đang đọc lịch sử về cuối ngoài ý muốn.
4. **Hai thiết bị, hai mạng:** vào phòng, ready/start, refresh giữa lượt và khi đang chọn cấp nhà, mua/nâng nhà, giao dịch, quay lại trước/sau hạn phiên.
5. **Đối chiếu deploy:** chỉ kết luận online production đạt sau khi bản chạy khớp source bàn giao và smoke thực tế thành công. Giữ gói Vercel/Redis miễn phí hiện có.

Đây là bước nghiệm thu còn thiếu, không phải danh sách lỗi đã chứng minh. Không cần viết lại engine chỉ để hoàn thành các bước này.

## Giao diện so với ảnh Business Tour

Đợt này cải thiện **chat và phản hồi khi gửi**, chưa thay đổi mỹ thuật bàn trong snapshot đối chiếu. Không có ảnh mới để kết luận bàn đã rõ hoặc sống động hơn.

Sau nghiệm thu chat/resume, ưu tiên nhãn tên/giá đủ đọc ở góc toàn bàn, camera và vùng an toàn cho HUD, mô hình cấp 1–4 khác biệt rõ, animation mua nhà/trả thuê. Chụp trước/sau cùng state và kích thước. Timer lượt/AFK và tiến độ thắng vẫn là hướng enhance riêng.

## Bằng chứng

- [Log 125 test](docs/review-v22-2026-11-08/tests.txt).
- [Log 2 test Redis thật](docs/review-v22-2026-11-08/redis-tests.txt).
- [Build](docs/review-v22-2026-11-08/build.txt).
- [Snapshot hash](docs/review-v22-2026-11-08/validation.json).

V22 cập nhật trạng thái sửa mới; không dùng log fail/treo V21 làm kết luận cho bản hiện tại. Không chỉnh source hoặc cấu hình dịch vụ production trong lượt này.
