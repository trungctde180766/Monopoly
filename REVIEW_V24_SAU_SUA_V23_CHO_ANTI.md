# Review V24 — Sau sửa cuộn chat và test online

Ngày 08/11/2026. **Chỉ review; không sửa source game, commit/push hoặc deploy.**

## Kết luận

Phần xử lý cuộn tin dài đã sửa đúng hướng và qua probe dùng handler/effect thật từ source. Toàn suite lần này hoàn tất, không lặp lại timeout ở `onlineActions.test.js`.

**Chưa phát hiện finding mới đủ bằng chứng trong phạm vi vòng này.** Có thể chuyển trọng tâm sang nghiệm thu trình duyệt/mobile và hoàn thiện bàn chơi, thay vì tiếp tục sửa nhỏ chat mà chưa kiểm chứng trải nghiệm thực tế.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `npm test` | **127 ca qua:** 23 legacy + 104 Node runner; 0 fail/cancelled/skip |
| Test online từng timeout ở V23 | Qua trong lần chạy toàn suite này |
| Build | Thành công, còn cảnh báo chunk lớn |
| Probe cuộn dùng source thật | Tin dài khi đang ở cuối có gọi cuộn; đang đọc lịch sử không gọi thêm; handler đã được nối vào `onScroll` |
| GUI/mobile | Chưa kiểm tra trên trình duyệt trong vòng V24 |
| Redis thật/production | Không chạy lại và không deploy trong vòng V24 |

Không coi một lần suite xanh là chứng minh timeout V23 không bao giờ tái diễn. Test online nay có helper chờ event kèm tên bước và deadline để dễ xác định chỗ treo; vẫn cần giữ log nếu lặp lại.

## Những thay đổi được ghi nhận

- `GameInterface` lưu trạng thái bám đáy trong ref, cập nhật theo `onScroll` trước khi tin mới được render. Effect nhận tin không còn dùng chiều cao sau khi thêm tin để suy ra vị trí trước đó.
- Khi mở chat hoặc gửi thành công, trạng thái được đưa về bám đáy.
- Trong các tệp hash của V23, thay đổi là `src/components/GameInterface.jsx` và `test/reviewV22.test.js`.
- `test/onlineActions.test.js` hiện cũng đã được chỉnh helper chờ event. Tệp này chưa có hash trong snapshot V23 nên V24 ghi nhận riêng, không suy ra chính xác thời điểm thay đổi chỉ bằng đối chiếu hash.
- Engine, backend Redis, hook resume và Board3D không đổi trong tập hash đối chiếu. Không có bằng chứng mới để mở lại các lỗi resume đã đóng.

## Giới hạn bằng chứng về cuộn chat

Probe V24 lấy trực tiếp handler và effect từ `GameInterface.jsx`, kiểm tra với kích thước vùng chat điều khiển được:

1. Đang ở cuối, thêm tin cao 120 px → có yêu cầu cuộn.
2. Cuộn lên đọc lịch sử, thêm tin tiếp → không yêu cầu cuộn thêm.

Đây mạnh hơn phép thử chỉ chép lại công thức, nhưng **chưa mount component React hoặc chạy trình duyệt**. Chưa chứng minh hành vi smooth scroll, scroll anchoring và bàn phím điện thoại đều đúng.

Test `reviewV22` trong repo vẫn mô phỏng handler và gửi chat bằng hàm mock riêng. Các assertion đó không thay thế được việc chạy component thật. Không cần thêm nhiều test mô phỏng tương tự để tăng số lượng; nên làm test hành vi hoặc nghiệm thu GUI.

## Việc Anti nên làm tiếp

### 1. Nghiệm thu chat trên trình duyệt

- Hai client gửi hai chiều, cùng tên, gửi lỗi rồi thử lại; đúng senderId, giờ và nội dung soạn.
- Đang bám cuối + tin dài/nhiều tin liên tiếp; đang cuộn đọc lịch sử; cuộn mượt chưa xong đã có tin khác.
- Đóng/mở panel, resize, bàn phím mobile; badge và vị trí cuộn đúng mong đợi.
- Panel chat cùng inspector/log không che nút hành động quan trọng.

### 2. Nghiệm thu vòng chơi online hoàn chỉnh

Hai thiết bị ở hai mạng: tạo/join/ready/start, mua/nâng nhà, trả thuê, giao dịch, refresh giữa lượt/giữa quyết định xây, ngắt mạng ngắn và session superseded. Mất ACK không được trừ tiền hoặc chuyển tài sản hai lần.

Các test hiện tại có kiểm tra nhiều hành vi server/hook, nhưng chưa thay thế được trải nghiệm trên hai thiết bị thật. Khi chốt phát hành, chạy Redis integration thật và đối chiếu bản deploy với source bàn giao.

### 3. Chuyển sang phần bàn chơi theo yêu cầu ban đầu

V24 **không có thay đổi mỹ thuật Board3D** và không có ảnh mới; chưa thể kết luận bàn đã giống Business Tour hơn. Ưu tiên tiếp theo:

- Tên/giá đọc rõ ở góc nhìn toàn bàn và vùng an toàn cho HUD.
- Công trình cấp 1–4 khác biệt, không che tên/giá/quân cờ.
- Chất liệu, bóng tiếp xúc và animation mua nhà/trả thuê ngắn, rõ.
- Ảnh trước/sau cùng state ở desktop/mobile, gồm bàn nhiều nhà và nhiều người.

Timer lượt/AFK, tiến độ thắng và hướng dẫn luật là enhance riêng. Không cần viết lại engine hay chuyển hosting nếu chưa có lỗi/tải thực tế đòi hỏi. Giữ Vercel/Redis miễn phí hiện có.

## Bằng chứng

- [Log 127 test](docs/review-v24-2026-11-08/tests.txt), [build](docs/review-v24-2026-11-08/build.txt).
- [Probe lấy logic từ source](docs/review-v24-2026-11-08/scroll-source-probe.mjs), [kết quả](docs/review-v24-2026-11-08/scroll-source-results.json).
- [Snapshot hash](docs/review-v24-2026-11-08/validation.json).

Không chỉnh source game, tài khoản hoặc cấu hình dịch vụ production trong lượt này.
