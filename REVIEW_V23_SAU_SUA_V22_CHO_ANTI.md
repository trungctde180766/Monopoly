# Review V23 — Sau chỉnh cuộn chat V22

Ngày 08/11/2026. **Chỉ review, không sửa source game, commit/push hoặc deploy.**

## Kết luận

Bản mới chủ yếu cải thiện cuộn chat để người đang đọc lịch sử không bị kéo xuống cuối. Chưa có bằng chứng về regression mới trong engine hoặc resume. Tuy nhiên, chưa nên ghi toàn bộ kiểm thử ổn định: một ca online cũ timeout khi chạy cả suite, dù chạy riêng lại đã qua.

Có một trường hợp cuộn tin dài cần kiểm chứng thêm bằng component/trình duyệt; không coi phép tính minh họa trong báo cáo này là bằng chứng đã tái hiện trên GUI.

## Thay đổi so với V22

- `src/components/GameInterface.jsx`: thêm ref vùng tin nhắn, cuộn khi mở panel, kiểm tra khoảng cách tới đáy trước khi cuộn theo tin mới, cuộn sau khi gửi thành công.
- `package.json`: thêm `test/reviewV22.test.js` vào suite.
- Backend, hook resume, RedisRoomStore, engine và Board3D không đổi trong tập hash đối chiếu.

## Kết quả kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Toàn bộ `npm test` | Exit 1: 23 legacy qua; Node runner 103 qua, 1 cancelled, 0 fail. Không phải toàn suite xanh |
| Ca bị hủy | `test/onlineActions.test.js:7`, test Socket.IO xác thực state/action/trade; `testTimeoutFailure` sau 15 giây |
| Chạy riêng lại file online đó | Qua, exit 0. Chưa xác định nguyên nhân timeout lần đầu |
| Chạy riêng test mới `reviewV22` | 2 qua, không fail/cancel/skip |
| Build | Thành công, còn cảnh báo chunk lớn |
| GUI/Redis thật/production | Không chạy lại trong V23; không có ảnh nghiệm thu mới |

Không kết luận timeout do sửa chat: backend và file online cũ không đổi trong các hash theo dõi. Cũng không bỏ qua lần timeout chỉ vì lần chạy riêng thành công. Ghi nhận để theo dõi độ ổn định test mạng, thêm chẩn đoán bước đang chờ nếu tái diễn; không đơn thuần tăng deadline rồi tuyên bố đã chữa nguyên nhân.

## V23-G01 — P3: Cần kiểm chứng tự cuộn khi tin mới cao hơn ngưỡng 80 px

**Vị trí:** `src/components/GameInterface.jsx:104–117`.

Effect theo `chatMessages.length` đo `scrollHeight - scrollTop - clientHeight` sau khi React đã cập nhật nội dung. Do đó phép đo bao gồm chiều cao tin vừa thêm, thay vì chỉ phản ánh người dùng ở đâu trước khi tin tới.

Ví dụ bố cục có thể xảy ra:

- Trước tin mới: scrollHeight 1000, clientHeight 300, scrollTop 700 — đang ở cuối.
- Tin mới cao thêm 120 px, scrollTop chưa đổi: khoảng cách đo được là 120.
- Điều kiện `<= 80` không đạt, nên không tự cuộn dù người dùng trước đó đang ở cuối.

**Mức bằng chứng:** phản ví dụ bằng số liệu bố cục và đọc vòng đời effect; chưa chạy component hay mạng thật để tái hiện tình huống. Browser scroll anchoring và bố cục cụ thể cần được kiểm tra. Đây là mục UX ưu tiên thấp, không phải finding phá hỏng gameplay.

**Anti nên làm:** theo dõi trạng thái đang bám đáy từ sự kiện scroll trước khi thêm tin, rồi quyết định có tiếp tục bám đáy sau render; khi người dùng cuộn lên thì giữ vị trí và có thể báo tin mới. Tránh luôn cuộn xuống bất kể vị trí người dùng.

**Nghiệm thu:** đang ở cuối + tin ngắn/tin dài/nhiều tin liền vẫn theo đúng tin mới; đang đọc lịch sử thì không nhảy. Thử ở kích thước mobile vì tin xuống nhiều dòng hơn.

## Khoảng trống test mới

Test mạng mới kiểm tra broadcast, senderId và lỗi tin rỗng — có ích. Nhưng tên test nói “preserves input on failure” trong khi thân test không mount UI hoặc đọc ô nhập. Không dùng tên đó để chứng nhận giữ nội dung soạn đã được nghiệm thu.

Test cuộn chỉ tự tính vài bộ số và badge giả, không gọi logic component. Nó không kiểm tra thứ tự render/đo chiều cao hoặc `scrollIntoView`. Nên bổ sung test component dùng logic thật, hoặc bài thử trình duyệt có vị trí cuộn trước/sau. Không cần thêm nhiều test lặp lại cùng phép toán.

## Những điểm vẫn tốt

- Các sửa chat V21/V22 về thời gian, senderId, ACK và giữ input khi gửi thất bại không bị thay đổi trong hook/backend.
- Có ý định giữ vị trí khi đọc tin cũ, cuộn khi mở chat và sau tin tự gửi.
- Không sửa engine mua nhà hoặc backend chỉ để chỉnh cuộn chat.

## Thứ tự làm tiếp cho Anti

1. Theo dõi/chẩn đoán ca online timeout; giữ cả log lần chạy suite và lần chạy riêng.
2. Kiểm chứng trường hợp tin dài và thay test mô phỏng phép tính bằng test hành vi thực tế.
3. Nghiệm thu hai tab và điện thoại: gửi thành công/thất bại, badge, cuộn, bàn phím, panel chồng nhau.
4. Sau đó chuyển trọng tâm sang camera, độ đọc giá/tên ô và công trình cấp 1–4. Board3D không đổi trong V23 nên chưa có cơ sở kết luận bàn giống Business Tour hơn.

Giữ Vercel/Redis ở gói miễn phí. Không cần chuyển hosting để xử lý những mục này.

## Bằng chứng

- [Suite có một timeout](docs/review-v23-2026-11-08/tests.txt).
- [Chạy riêng online lại](docs/review-v23-2026-11-08/online-recheck.txt).
- [Hai test mới](docs/review-v23-2026-11-08/new-tests.txt).
- [Build](docs/review-v23-2026-11-08/build.txt).
- [Phản ví dụ bố cục, không phải GUI replay](docs/review-v23-2026-11-08/scroll-counterexample.json).
- [Snapshot hash](docs/review-v23-2026-11-08/validation.json).

Không chỉnh source, tài khoản hoặc dịch vụ production trong lượt review này.
