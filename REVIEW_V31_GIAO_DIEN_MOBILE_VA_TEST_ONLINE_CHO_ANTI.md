# Review V31 — Thông tin ô mobile và test online

Ngày **09/11/2026**, source tại HEAD `1185707`. **Chỉ review; không sửa source game, commit/push hoặc deploy.**

## Kết luận

Thông tin ô đã rõ hơn: có tên đầy đủ, cấp nhà, chủ sở hữu, giá/thuê; có ảnh inspector/chat/mua nhà trên mobile. Tuy nhiên, **bảng nổi mới bị cắt khỏi mép trái trong ảnh fixture mobile**. Cần sửa vị trí theo kích thước thật của bảng, không chỉ theo điểm chiếu của ô.

Build thành công, debug vẫn bị loại khỏi production. **Toàn suite chưa xanh:** một test online cũ timeout 15 giây; chạy riêng lại đã qua. Chưa có bằng chứng lỗi mới trong luật mua nhà/resume, nhưng độ ổn định kiểm thử mạng vẫn cần theo dõi.

## Kết quả vòng này

| Kiểm tra | Kết quả |
|---|---|
| Build mới | Thành công, còn cảnh báo chunk lớn |
| `npm test`, yêu cầu có build production | 23 legacy qua; Node runner 104 qua, 1 cancelled, 0 fail. Tổng **127 qua, 1 bị hủy**, exit 1 |
| Ca bị hủy | `test/onlineActions.test.js:7`, `testTimeoutFailure` sau 15 giây |
| Chạy riêng lại file online | Thành công, exit 0; chưa xác định nguyên nhân timeout lần chạy suite |
| Debug trong bundle mới | Không có `__CONTROLLER__`, inject fixture hoặc `getDevState` |
| Hình ảnh/báo cáo browser | Đã xem ảnh và JSON mới được cung cấp; không tự chạy lại browser script trong V31 |
| Redis integration/production đang deploy | Không kiểm chứng lại trong V31 |

So với snapshot V30: thay đổi camera layout, Board3D, CSS, App và script browser/báo cáo. Engine/reducer, hook resume và backend không đổi trong tập hash đối chiếu. Working tree sạch lúc bắt đầu; các tệp V31 là output review mới.

## G01 — P2: Tooltip ô bị cắt ngang mép màn hình mobile

**Vị trí:** `src/components/Board3D.jsx:1251–1260`, `src/game.css:712–730`.

Trong ảnh `fixture_showcase_tiers_mobile.png`, bảng đen của ô Phố Cổ Hội An bị cắt phần bên trái: mất đầu tên, đầu nhãn cấp nhà và đầu dòng tiền thuê. Đây là bằng chứng hình ảnh cụ thể, không chỉ suy từ test toán học. Ảnh được cung cấp là fixture development, không phải phiên browser reviewer tự chạy.

Nguyên nhân phù hợp với source:

- Bảng dùng `transform: translate(-50%, -100%)`.
- Camera clamp tâm bảng với `padX = 75` trên mobile.
- CSS cho bảng rộng tối đa 230 px; nửa chiều rộng có thể lớn hơn 75 px. Tâm nằm trong vùng cho phép vẫn làm cạnh bảng vượt khỏi viewport.
- Container có `overflow-hidden`, nên phần vượt ra bị cắt.

**Anti cần sửa:** đo kích thước thật sau layout, clamp tâm theo `width / 2 + lề`; clamp dọc theo chiều cao bảng và vùng HUD/dock. Khi không đủ chỗ, đổi vị trí hoặc dùng inspector/sheet làm thông tin chính. Kiểm tra cả tên/chủ dài và font/device scale khác nhau, không sửa bằng một con số pad cố định mới.

**Nghiệm thu:** chọn ô trên cả bốn cạnh tại 360×800 và 390×844, đủ cấp nhà và tên dài; toàn bộ rect tooltip nằm trong vùng an toàn, không cắt chữ và không che nút thao tác. Kiểm tra sau xoay/zoom camera và khi mở inspector.

## Q01 — Test online vẫn có timeout không ổn định

Đây là ca từng timeout V23, không phải test camera mới. Lần suite V31 hủy sau 15 giây, lần chạy riêng sau đó qua. Không quy nguyên nhân cho thay đổi UI chỉ dựa trên việc hai sự kiện xảy ra cùng lượt review.

**Anti nên làm:** ghi rõ bước đang chờ, thời gian khởi động child server, kết nối socket, ACK và cleanup; có xử lý child exit/connect_error. Các helper event đã có deadline nhưng chờ IPC/kết nối cũng cần được chẩn đoán. Không chỉ tăng timeout rồi tuyên bố đã chữa nguyên nhân.

Không bỏ qua log hủy và không ghi “128 test xanh” cho lần chạy này. Cũng chưa có cơ sở kết luận multiplayer production đang hỏng.

## Đánh giá cải thiện UI

### Tốt hơn

- Bảng ô mới đưa tên, cấp nhà, chủ và tiền thuê lên cùng một nơi; ít phải suy từ mô hình.
- Inspector mobile có thông tin giá/chủ rõ ràng; panel chat đủ lớn và bố trí hợp lý trong ảnh cung cấp.
- Camera portrait đã điều chỉnh, có fixture Landmark trên bốn phía để xem cảnh có nhiều công trình.
- Dev helper chọn ô vẫn nằm trong nhánh development; bundle kiểm tra không xuất debug global.

### Cần hoàn thiện sau G01

- Trên mobile, tooltip và inspector đang có thể cùng trình bày một nội dung, chiếm nhiều diện tích bàn. Nên chốt một tầng thông tin chính, phần còn lại gọn hơn.
- Ảnh overview vẫn có tên/giá nhỏ. Chạm ô nay rõ hơn, nhưng chưa thể nói mức đọc toàn bàn đã như ảnh Business Tour.
- Báo cáo browser hiện kiểm tra nội dung label, chưa chứng minh label nằm trọn viewport. `overallSuccess:true` không phủ nhận ảnh bị cắt; thêm assertion rect cho tooltip và panel, không chỉ kiểm tra text.
- Có ảnh mobile chat nhưng chưa có bằng chứng bàn phím ảo, thao tác chạm thật hoặc hai mạng độc lập. Đây là nghiệm thu còn thiếu, không phải lỗi đã chứng minh.

## Việc làm tiếp cho Anti

1. Sửa G01 và thêm kiểm tra hình học tooltip trên bốn phía/mobile.
2. Chẩn đoán timeout online nếu lặp lại; lưu cả log suite và lần chạy riêng.
3. Nghiệm thu thao tác chọn ô, giá/thuê, mua/nâng nhà, chat/bàn phím và zoom trên thiết bị thật.
4. Hai thiết bị/hai mạng: mua nhà, trả thuê, giao dịch, refresh giữa quyết định, mất ACK và superseded; đối chiếu tiền/owner/tier/revision.

Giữ Vercel/Redis miễn phí. Chưa có lý do từ V31 để viết lại engine hoặc chuyển hosting.

## Bằng chứng đã lưu

- [Suite có một timeout](docs/review-v31-2026-11-09/tests.txt), [online chạy riêng lại](docs/review-v31-2026-11-09/online-recheck.txt).
- [Build](docs/review-v31-2026-11-09/build.txt), [kiểm tra debug production](docs/review-v31-2026-11-09/production-debug-check.json).
- [Snapshot source và hash ảnh](docs/review-v31-2026-11-09/validation.json).
- [Bản sao báo cáo browser được cung cấp](docs/review-v31-2026-11-09/browser-report-snapshot.json).
- [Ảnh tooltip bị cắt](docs/review-v31-2026-11-09/fixture_showcase_tiers_mobile.png), [inspector mobile](docs/review-v31-2026-11-09/screenshot_mobile_tile_inspection.png), [chat mobile](docs/review-v31-2026-11-09/screenshot_mobile_chat_open.png).

Không chỉnh source game, tài khoản hoặc cấu hình dịch vụ trong lượt review V31.
