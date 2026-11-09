# Review V21 — Chat trong trận và kiểm thử mới

Ngày 08/11/2026. Review local chưa commit. **Chỉ review; không sửa source, commit/push hoặc deploy.**

## Kết luận

Đã có **chat trong trận**, tiến bộ so với backlog V20. Tuy nhiên, **chưa thể chốt bản mới qua kiểm thử**: test đổi tab đang treo vì chờ nhầm event; test chat riêng thất bại do trường thời gian không khớp giữa backend và frontend.

Các tệp cũ theo snapshot V20 thay đổi: `package.json`, `src/components/GameInterface.jsx`, `src/game.css`; thêm `test/reviewV20.test.js`. Engine, hook resume, Board3D và backend Redis không đổi trong tập hash đối chiếu. Không mở lại lỗi resume đã đóng ở V20 khi chưa có bằng chứng regression.

## Kết quả chạy thật

| Kiểm tra | Kết quả |
|---|---|
| `npm test` | Không hoàn tất: dừng tiến triển ở test đổi tab mới; đã dừng tiến trình của vòng review |
| File test mới, giới hạn 10 giây | Hai ca đầu qua; file kết thúc bằng `testTimeoutFailure`, 1 cancelled |
| Chạy riêng test chat | **Fail** tại `test/reviewV20.test.js:285`: `received.timestamp > 0` không đúng |
| Build | Thành công; còn cảnh báo chunk lớn |
| GUI/mobile | Chưa nghiệm thu bằng trình duyệt; không kết luận layout chat đạt |
| Redis/production | Không chạy lại integration Redis, không deploy hoặc thử production mới |

Không ghi “toàn bộ test xanh” hoặc cộng kết quả V20 cũ vào số ca mới. Test có tên End-to-End ở đây dùng backend Socket.IO + MemoryRoomStore, không chạy React trên trình duyệt hoặc hai thiết bị ở hai mạng.

## V21-R01 — P2: Test đổi tab chờ event nội bộ nên treo suite

**Vị trí:** `test/reviewV20.test.js:215`, đối chiếu `server/index.js:41–44`.

Test chờ `once(hostTab1, 'session_revoked')`. Server dùng `session_revoked` làm sự kiện điều phối nội bộ; trong `deliver()` nó chuyển thành **`session_superseded`** gửi cho socket cũ. Client không nhận event mà test đang chờ.

Test không có deadline cho lần chờ này. `npm test` mới còn chạy tuần tự (`--test-concurrency=1`), nên các file sau bị chặn theo. Chạy riêng file với giới hạn 10 giây xác nhận timeout sau hai ca đầu qua.

**Anti cần sửa:** test phải chờ tên event công khai `session_superseded`, thêm timeout và dọn socket/backend trong mọi nhánh. Sau đó kiểm tra ACK action của tab cũ bị từ chối, tab mới thao tác được. Không đổi giao thức sản phẩm chỉ để khớp event nội bộ trong test.

Đây là lỗi kiểm thử, **không phải bằng chứng cơ chế superseded của sản phẩm đang hỏng**. Assertions sau điểm chờ chưa được thực thi trong lần chạy treo, nên chưa xác nhận chúng đúng.

## V21-R02 — P2: Trường thời gian chat không khớp contract

**Vị trí:** `server/index.js:396–402`, `src/components/GameInterface.jsx` đoạn render `msg.timestamp`, và `test/reviewV20.test.js:285`.

- Server gửi `time`, chuỗi giờ Việt Nam, không gửi `timestamp`.
- Chat mới render giờ bằng `msg.timestamp`; thiếu trường này thì render chuỗi rỗng.
- Test mới đòi `received.timestamp > 0`; chạy riêng thất bại đúng tại assertion đó.

**Ảnh hưởng:** tin nhắn được phát nhưng phần giờ gửi của panel mới không có dữ liệu đúng. Không phải toàn bộ tính năng gửi chat bị hỏng.

**Anti cần sửa:** thống nhất schema giữa server, phòng chờ, chat trong trận và test. Có thể thêm timestamp số từ server, giữ `time` cho client cũ nếu cần, rồi định dạng timezone rõ; hoặc dùng thống nhất trường hiện tại. Không chỉ bỏ assertion để báo xanh trong khi UI vẫn đọc trường không tồn tại.

**Nghiệm thu:** hai client nhận nội dung, ID và thời gian hợp lệ; UI hiện giờ; test tin rỗng vẫn chạy tới và bị từ chối đúng. Kiểm tra phòng chờ vì cùng nguồn message được dùng ở đó.

## Điểm UI cần cải thiện tiếp từ đọc source

Các mục sau chưa được nghiệm thu GUI trong vòng này:

- **Badge chưa đọc:** `lastReadCount` chỉ cập nhật lúc mở panel. Tin tới khi panel đang mở vẫn làm tăng chênh lệch; đóng panel có thể lại hiện badge cho tin vừa xem. Cần xác định trạng thái đã đọc theo lúc panel mở/đóng và vị trí cuộn. Ưu tiên P3.
- **Nhận diện người gửi:** `isMe` so tên với `senderName`; hai người cùng tên đều có thể bị gắn “Bạn”. Nên phát thêm senderId ổn định từ server và dùng ID.
- **Gửi thất bại:** ô nhập xóa ngay sau `sendChat`, wrapper chưa nhận ACK. Khi server từ chối/lỗi, người dùng có thể mất nội dung đang soạn mà không biết. Giữ nội dung tới ACK thành công hoặc có trạng thái gửi thất bại/thử lại; khóa theo cả `isResuming`.
- **Cuộn và mobile:** chưa có tự cuộn theo tin mới trong phần code chat; cần kiểm tra khi lịch sử dài, bàn phím điện thoại mở và các panel khác cùng hiển thị. CSS mới chưa có breakpoint riêng cho chat; chưa đủ cơ sở kết luận tràn màn hình nếu chưa thử.

## Những gì đã làm tốt và nên giữ

- Chat mới chỉ xuất hiện trong online, có nút dock, badge, panel đóng/mở và chặn gửi rỗng khi offline.
- Nội dung được render thành text React, không dùng HTML thô.
- Thêm test server cho resume giữa lượt và mua nhà sau reconnect; hai ca đầu của file mới đã qua, bao gồm replay requestId không trừ tiền lần hai.
- Không thay engine hoặc cơ chế nhà để thêm chat; phạm vi sửa nhỏ và phù hợp.

## Plan cho Anti

1. Sửa V21-R01 và V21-R02; chạy lại file test mới với deadline rồi toàn suite. Ghi pass/fail/cancel rõ.
2. Hoàn thiện ACK gửi chat, senderId và badge đã đọc; thêm test hành vi cần thiết, tránh chỉ kiểm tra chuỗi source.
3. Kiểm tra chat bằng hai tab/trình duyệt: gửi hai chiều, cùng tên, tin tới khi mở/đóng panel, ngắt mạng, resume và tin dài.
4. Chụp desktop/mobile trên trình duyệt sạch, kiểm tra chat không che điều khiển quan trọng.
5. Sau đó tiếp tục nhãn giá/camera và asset công trình. Board3D không đổi trong đợt này nên chưa có cơ sở nói hình ảnh đã giống Business Tour hơn.

Giữ gói Vercel/Redis miễn phí; không cần đổi hosting để chữa các lỗi trên.

## Bằng chứng

- [Log suite chưa hoàn tất](docs/review-v21-2026-11-08/tests.txt).
- [File test mới bị timeout](docs/review-v21-2026-11-08/focused-tests.txt).
- [Test chat thất bại](docs/review-v21-2026-11-08/chat-test.txt).
- [Build](docs/review-v21-2026-11-08/build.txt), [snapshot hash](docs/review-v21-2026-11-08/validation.json).

Không chỉnh source game hoặc dịch vụ production trong lượt này. Các tiến trình review đã được dừng; không kết luận giao diện trực quan đã đạt từ việc build thành công.
