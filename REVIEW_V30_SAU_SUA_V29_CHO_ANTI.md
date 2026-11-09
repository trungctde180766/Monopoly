# Review V30 — Sau sửa kiểm chứng browser V29

Ngày 08/11/2026. **Chỉ review; không sửa source game, commit/push hoặc deploy.**

## Kết luận

**Các vấn đề chính V29 đã được xử lý trong source và bằng chứng mới.** Phase fixture đã có ảnh bàn đủ bốn cấp nhà, không còn trang lỗi kết nối. Callback từ chối khi thiếu inject, đọc lại owner/tier và kiểm tra canvas trước khi báo thành công. Báo cáo mua nhà có đối chiếu tiền/tài sản ở hai client.

**128 test thường qua, build thành công.** Chưa phát hiện lỗi sản phẩm mới đủ bằng chứng trong phạm vi vòng này. Có thể chuyển trọng tâm sang độ rõ trên mobile và nghiệm thu chơi trên thiết bị/mạng thật, thay vì tiếp tục viết lại script chỉ để có ảnh.

## Kiểm tra V30

| Kiểm tra | Kết quả và giới hạn |
|---|---|
| `npm test` sau build, yêu cầu artifact production | **128 qua:** 23 legacy + 105 Node runner; 0 fail/cancelled/skip |
| Build | Thành công, còn cảnh báo chunk lớn |
| Kiểm tra JS production | Không có `__CONTROLLER__`, `injectVisualShowcaseState`, `getDevState` trong hai bundle |
| Callback fixture thật trong harness | Thiếu inject trả `success:false`, không còn tự báo đủ bốn cấp |
| Script browser | Qua kiểm tra cú pháp |
| JSON/ảnh browser được cung cấp | `overallSuccess:true`; đã xem ảnh fixture desktop/mobile và đọc kết quả |
| Phiên browser do reviewer tự chạy | Không chạy trong V30; kết quả browser phía trên là bằng chứng được cung cấp |
| Redis/production deploy | Không chạy lại Redis integration hoặc xác nhận bản deploy mới |

So với snapshot V29 ban đầu: hook, test production, script browser thay đổi; script debugPhaseC đã được bỏ. Hook chỉ thêm `getDevState` trong nhánh DEV, không phải thay luật chơi. Engine, server/Redis và component mỹ thuật giữ nguyên trong tập hash đối chiếu.

## Trạng thái V29

| Vấn đề | V30 |
|---|---|
| Vite DEV không sẵn sàng, ảnh lỗi localhost | Có kiểm tra readiness, spawn/exit/stderr và trạng thái trang. Bộ ảnh/JSON mới cho thấy phase fixture thành công |
| Thiếu inject vẫn báo success | Có kiểm tra bắt buộc, probe V30 xác nhận trả lỗi rõ |
| Danh sách cấp nhà ghi cứng chưa đối chiếu | Đọc lại `getDevState`, so houses/owner ở bốn ô, kiểm tra canvas/WebGL |
| Click mua bị đồng nhất với giao dịch đã thành công | Tách `confirmClicked`, `purchaseVerified`, `synchronizedAcrossClients`, ghi tiền/tài sản/log của hai bên |
| Script debug tìm sai tên nút | Script chẩn đoán cũ đã được bỏ, không còn ghi thành vấn đề đang mở |

Không dùng ảnh lỗi hoặc JSON `overallSuccess:false` của V29 trước đó để mô tả bản hiện tại.

## Bằng chứng mua nhà đã tốt hơn

Báo cáo mới ghi nhận dialog cho chọn cấp 1–3, Landmark khóa; sau mua, tiền người mua là 14.000.000₫, một đất/một nhà, phía client còn lại phản ánh cùng số tiền/tài sản. Đây là bằng chứng UI hai client local tốt hơn chỉ chụp sau một cú click.

Vẫn cần giữ giới hạn kết luận: chưa phải nghiệm thu hai thiết bị ở hai mạng; chưa chứng minh mọi cấp nâng nhà, mọi loại giao dịch hoặc mất ACK đều đúng chỉ từ một lần mua. Khi mở rộng test, nên lưu thêm tileId/playerId/revision của action để liên kết dialog, log và state chính xác, nhất là khi hai người cùng tên.

## Đánh giá hình ảnh từ ảnh mới

- Fixture desktop đã có nhà thấp, biệt thự và Landmark cao; các cấp có hình dáng phân biệt, không còn chỉ là ảnh bàn trống.
- Fixture mobile cũng có công trình; các nút công cụ ở hàng trên giúp giảm che bàn.
- **Tên/giá từng ô vẫn nhỏ khi nhìn toàn bàn**, đặc biệt mobile; vẫn có nhiều khoảng trống dọc. Chưa đạt tiêu chí đọc rõ tương đương mong muốn từ ảnh Business Tour.
- Fixture chứng minh mô hình có thể render, không chứng minh tài sản trong cảnh được mua đúng luật. Báo cáo hiện đã tách hai mục đích này, nên giữ cách tách đó.

Không có thay đổi mỹ thuật mới trong source so với V29; phần tiến bộ ở đây chủ yếu là cuối cùng đã có bằng chứng fixture hợp lệ để đánh giá.

## Việc nên giao Anti tiếp theo

1. **Độ đọc mobile:** chạm ô để thấy tên, giá/thuê, chủ và cấp nhà rõ; zoom/camera phù hợp vùng trống sau HUD. Nghiệm thu có bàn phím/chat và modal mua nhà.
2. **Bộ ảnh cố định:** desktop/mobile cùng state, đủ cấp nhà trên cả bốn cạnh, nhiều quân cùng ô; kiểm tra nhà và tooltip không che nhãn/quân.
3. **Trận online hoàn chỉnh:** hai thiết bị, hai mạng; mua/nâng nhà thật, trả thuê, giao dịch, refresh giữa quyết định, mất ACK và superseded. So tiền/owner/tier/revision trên hai bên.
4. **Trước phát hành:** Redis integration thật, build/test release và smoke bản deploy khớp source bàn giao. Giữ Vercel/Redis miễn phí.

Chưa có bằng chứng mới cho thấy cần viết lại engine hoặc chuyển hosting. Ưu tiên nghiệm thu sản phẩm thay vì thêm tiếp các test chỉ lặp lại công thức hay cờ thành công.

## Bằng chứng

- [128 test](docs/review-v30-2026-11-08/tests.txt), [build](docs/review-v30-2026-11-08/build.txt).
- [Probe callback mới](docs/review-v30-2026-11-08/fixture-result-probe.mjs), [kết quả từ chối khi thiếu inject](docs/review-v30-2026-11-08/fixture-result.json).
- [Bản sao báo cáo browser được cung cấp](docs/review-v30-2026-11-08/browser-report-snapshot.json).
- [Snapshot source và kiểm tra bundle](docs/review-v30-2026-11-08/validation.json).
- [Fixture desktop](docs/review-v29-evidence/fixture_showcase_tiers_desktop.png), [fixture mobile](docs/review-v29-evidence/fixture_showcase_tiers_mobile.png).

Không chỉnh source, tài khoản hoặc cấu hình dịch vụ trong lượt review V30.
