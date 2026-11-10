# Review V32 — Sau sửa tooltip và chẩn đoán online V31

Ngày **10/11/2026**, source HEAD `7430ba3`. **Chỉ review; không sửa source game, commit/push hoặc deploy.**

## Kết luận

**Tooltip bị cắt ở V31 đã được xử lý đúng hướng:** đo kích thước thực, clamp ngang, chọn phía trên/dưới và tính vùng tránh inspector. Ảnh mới được cung cấp không còn cắt đầu chữ như ảnh V31; JSON có rect trên hai kích thước mobile.

**Test online chưa ổn định:** lần chạy cả suite V32 vẫn fail. Log mới đã thu hẹp lỗi về **chờ IPC khởi động server quá 5 giây**, chưa đến bước kết nối người chơi. Chạy riêng lại qua. Không ghi “toàn bộ test xanh” hoặc “đã loại bỏ hoàn toàn timeout”.

Không có bằng chứng lỗi mới trong luật mua/nâng nhà, giao dịch hoặc resume. Engine/backend không đổi trong tập hash so với V31.

## Kết quả kiểm tra

| Hạng mục | Kết quả |
|---|---|
| Build | Thành công, còn cảnh báo chunk lớn |
| `npm test` sau build, yêu cầu artifact production | 23 legacy qua; Node runner 104 qua, 1 fail, 0 cancelled/skip. Tổng **127 qua, 1 fail**, exit 1 |
| Lỗi cụ thể | `Server IPC timeout after 5000ms`, step history chỉ có `server_spawn` |
| Chạy riêng `test/onlineActions.test.js` | Qua, exit 0 |
| Tooltip trong báo cáo được cung cấp | Các rect được kiểm tra ở 390×844 và 360×800 đều được báo trong biên |
| Hình ảnh | Đã xem ảnh tooltip cạnh trái và fixture 360×800 mới, lưu bản sao vào thư mục V32 |
| Browser do reviewer tự chạy | Không chạy lại trong V32; phân biệt với JSON/ảnh được cung cấp |
| Redis/production deploy | Không chạy lại hoặc xác nhận bản deploy mới |

Source thay đổi so với V31: Board3D, CSS, test online và script browser; báo cáo browser được cập nhật. Những cải thiện dưới đây có phạm vi đúng theo source/ảnh, không phải chứng nhận mọi thiết bị đều đạt.

## 1. G01 V31: Ghi nhận đã sửa

- Không còn pad ngang cố định 75 px để suy ra kích thước bảng.
- Đo `offsetWidth/offsetHeight`, clamp tâm theo nửa chiều rộng, có lề và kiểm tra phía trên/dưới.
- Có tính vùng tránh inspector, tooltip có thể đổi hướng đặt.
- Ảnh mới của Nha Trang Biển Xanh hiện đầy đủ tên, cấp, chủ và tiền thuê; không mất đầu chữ ở mép trái.
- Báo cáo có rect và kết quả `fullyVisible` thay vì chỉ xác nhận nội dung text.

Cần tiếp tục kiểm tra tên/chủ rất dài, xoay/zoom, màn hình thấp/landscape và bàn phím mở. Các vùng an toàn vẫn có một số số đo cố định; trường hợp không đủ khoảng trống nên có phương án thu gọn hoặc ưu tiên inspector. Đây là nghiệm thu thêm, chưa phải lỗi đã tái hiện mới trong V32.

## 2. Test online: Chẩn đoán tốt hơn, nhưng chưa giải quyết xong

**Vị trí:** `test/onlineActions.test.js:7–30`.

Bản sửa đã thêm log từng bước, stderr, xử lý child error/exit và deadline cho IPC/socket/ACK. Đây là cải thiện đúng. Dù tổng timeout tăng từ 15 lên 30 giây, lần suite này fail trước đó tại deadline IPC 5 giây:

```text
step history: server_spawn
error: Server IPC timeout after 5000ms:
```

Lần chạy riêng thành công cho thấy không thể kết luận backend luôn không khởi động. Chưa đủ bằng chứng xác định nguyên nhân là tải máy, môi trường test hay khởi tạo ứng dụng. Không quy lỗi này cho tooltip vì các phần mạng sản phẩm không đổi trong snapshot.

**Anti nên làm tiếp:** ghi thời điểm child bắt đầu module, hoàn tất khởi tạo, gọi listen và gửi IPC; kiểm tra env kế thừa, child exit/signal và thời gian startup khi chạy suite. Đặt ngân sách startup dựa trên số đo, vẫn giữ deadline và cleanup. Không chỉ tăng timeout tổng hoặc bỏ assertion để báo xanh.

## 3. Q02 — P3: Fixture đặt Landmark vào ô tiện ích

**Vị trí:** `test/browserVerificationV27.js`, state fixture cho ô 28 và `verifiedTiers`.

Ô **28 là Sawaco - Cấp Nước, loại `utility`**, nhưng fixture gán `houses:4` và metadata suy thành Royal Landmark theo số houses. Báo cáo tooltip lại hiện đúng loại “Tiện ích”. Đây là state không thể tạo bằng luồng xây hợp lệ của game.

**Phân biệt phạm vi:** chọn ô 28 vẫn kiểm tra được tooltip của cạnh trên, nên không phủ nhận phép kiểm tra hình học bốn cạnh. Nhưng không thể dùng nó để chứng nhận Landmark trên cạnh đó. Đây là lỗi dữ liệu minh họa/test, không phải bằng chứng engine cho phép xây trên tiện ích.

**Anti nên sửa:** dùng ô property hợp lệ ở cạnh trên, chẳng hạn ô 27, cập nhật expected owner/tier và ảnh. Nếu muốn kiểm tra utility thì giữ một case utility riêng, không gán nhà. Kiểm tra loại ô trong fixture để tránh state minh họa sai luật.

## 4. UI nhỏ cần hoàn thiện

Trong ảnh 360×800 mới, thẻ HUD phía trên có nút Sổ Đỏ che một phần vùng thống kê đất. Tên bị truncate là chấp nhận được khi có cách xem đầy đủ; tiền/số tài sản nên có vùng riêng không bị nút đè. Đây là điểm polish từ ảnh, ưu tiên thấp hơn làm test ổn định.

Tooltip mới và inspector đang lặp nhiều thông tin. Trên mobile nên ưu tiên một lớp thông tin chính để còn thấy bàn; không cần loại bỏ thông tin rõ ràng vừa làm tốt.

Ảnh toàn bàn vẫn có chữ nhỏ, nhưng khả năng đọc ô được chọn đã tiến bộ rõ. Chưa chốt chất lượng giống Business Tour chỉ từ việc một bộ rect nằm trong viewport.

## Thứ tự giao Anti

1. Làm rõ và xử lý test startup IPC còn fail; giữ log cả suite và lần chạy riêng.
2. Sửa fixture Landmark trên utility và kiểm tra loại ô trước inject.
3. Thu gọn HUD 360 px, kiểm tra tooltip/inspector/chat/bàn phím trên thiết bị thật.
4. Nghiệm thu trận trên hai thiết bị/hai mạng: mua/nâng nhà, thuê, giao dịch, refresh, mất ACK và superseded; đối chiếu tiền/owner/tier/revision.

Giữ Vercel/Redis miễn phí. Chưa có bằng chứng từ V32 cần chuyển hosting hoặc viết lại engine.

## Bằng chứng

- [Suite fail tại IPC startup](docs/review-v32-2026-11-10/tests.txt), [online chạy riêng qua](docs/review-v32-2026-11-10/online-recheck.txt).
- [Build](docs/review-v32-2026-11-10/build.txt).
- [Snapshot hash, ảnh và loại ô fixture](docs/review-v32-2026-11-10/validation.json).
- [Bản sao báo cáo browser](docs/review-v32-2026-11-10/browser-report-snapshot.json).
- [Tooltip đã sửa ở cạnh trái](docs/review-v32-2026-11-10/screenshot_mobile_tooltip_side1_left.png), [ảnh 360×800](docs/review-v32-2026-11-10/fixture_showcase_tiers_mobile_360x800.png).

Không chỉnh source, tài khoản hoặc cấu hình dịch vụ trong lượt review V32.
