# Review V29 — Script browser và bằng chứng mới

Ngày 08/11/2026. **Chỉ review; không sửa source game, commit/push hoặc deploy.**

## Kết luận

Trong các hash V28 theo dõi, **chỉ `test/browserVerificationV27.js` thay đổi**; có thêm `test/debugPhaseC.js`. Source game, luật chơi, resume và giao diện chưa đổi.

Đã có ảnh/JSON mới xuất hiện trong lúc review. Kết quả thực tế của báo cáo được cung cấp là **`overallSuccess: false`**: phase development fixture thất bại, không tìm được controller; ảnh fixture là trang lỗi **`localhost refused to connect`**. Không đủ cơ sở nghiệm thu bốn cấp công trình.

Có tiến bộ ở bằng chứng mua nhà: ảnh dialog hiện cấp 1–3 và Landmark bị khóa; ảnh sau mua thể hiện tiền từ 15M₫ xuống 14M₫, một đất/một nhà. Đây là bằng chứng UI hữu ích, chưa đủ thay thế xác nhận action/server và đồng bộ hai client.

## Kiểm tra vòng này

- Hai script mới/chỉnh sửa **qua `node --check`**, không lỗi cú pháp.
- Đọc source và chạy callback fixture thật trong harness giả lập: thiếu hàm inject vẫn có thể trả `success:true`.
- Đã xem ba ảnh mới và đọc JSON đầu ra được cung cấp; lưu bản sao vào thư mục V29 vì các tệp đầu ra đang được tạo trong lúc review.
- Không tự chạy browser script hoặc thao tác trình duyệt trong V29.
- Không chạy lại suite/build/Redis vì source sản phẩm và script npm không đổi. Không gọi kết quả 128 test lịch sử V27 là lượt chạy mới.

Các thư mục bằng chứng trống khi bắt đầu review, sau đó có ảnh và JSON. Kết luận này dựa trên bản sao cuối đã đọc, không giữ nhận xét “chưa có đầu ra” của V28 cho trạng thái hiện tại.

## R01 — P2: Phase fixture chưa chạy được, ảnh là trang lỗi kết nối

**Bằng chứng mới:** JSON ghi:

```json
{
  "visualShowcaseFixture": {
    "result": {
      "success": false,
      "reason": "window.__CONTROLLER__ not found in DEV mode"
    }
  },
  "overallSuccess": false
}
```

Ảnh `fixture_showcase_tiers_desktop.png` là trang lỗi Edge `ERR_CONNECTION_REFUSED`, không phải bàn game. Không suy từ lỗi localhost thử này rằng Vercel hoặc Redis production đang hỏng.

**Cập nhật cuối vòng:** script tiếp tục được chỉnh trong lúc review; bản đọc cuối đã có `NODE_ENV: development` và vòng kiểm tra Vite readiness, thay cho chỉ sleep cố định. Ghi nhận sửa đúng hướng, **chưa có kết quả chạy mới xác nhận đã khắc phục ảnh lỗi**. Không coi lỗi của lần chạy được chụp là bằng chứng bản script mới nhất vẫn thiếu readiness.

**Anti cần hoàn tất:** bắt lỗi spawn/exit, lưu stderr, kiểm tra URL trang trước khi inject/chụp và chạy lại phase DEV. Khi lỗi, lưu ảnh có nhãn failure và báo phase không đạt.

Không chữa bằng cách bật lại controller debug trên production. Production isolation và fixture development phải tiếp tục tách biệt.

## R02 — P2: Callback fixture có thể báo thành công khi không inject được

**Vị trí:** `test/browserVerificationV27.js`, phần `devFixtureResult`.

Hàm inject chỉ chạy bên trong `if (ctrl.injectVisualShowcaseState)`, nhưng sau đó callback vẫn trả `success:true` và danh sách `injectedTiers`, không xác minh state hay canvas.

Probe V29 chạy đúng callback từ source với controller giả có `startLocal()` nhưng không có inject/state. Kết quả vẫn báo thành công và đủ danh sách bốn cấp. Đây là kiểm tra luồng callback có dependency giả, **không phải phiên browser thật**.

Lần browser được cung cấp hiện thất bại sớm hơn, nên R02 là một lỗi tiềm ẩn riêng trong cách kết luận, không phải nói JSON thực tế đã báo thành công sai lần này.

**Anti cần sửa:** thiếu hàm inject phải fail rõ; sau inject, đọc lại state và so owner/tier ở các ô dự kiến; xác nhận màn chơi/canvas hiện hữu và render xong trước khi chụp. `injectedTiers` nên lấy từ kết quả kiểm tra state, không chỉ là object ghi cứng.

## Q01 — P3: `purchaseConfirmed` chưa xác minh giao dịch thành công

Script tìm/click nút xác nhận nếu có, đợi 2 giây, chụp rồi đặt `purchaseConfirmed = true`. Flag vẫn có thể được gán khi không tìm được nút hoặc request bị từ chối.

Ảnh được cung cấp **có thay đổi HUD phù hợp mua tài sản 1M₫**, nên không khẳng định lần mua đó thất bại. Nhưng script cần kiểm tra ACK hoặc state thực tế: tiền, owner, tier và revision; so trên hai client. Tách `confirmClicked` khỏi `purchaseVerified`.

## Script chẩn đoán còn lệch nhãn UI

`test/debugPhaseC.js` tìm nút chứa “Chơi Đơn Với AI” hoặc “Chơi Với Bot”, trong khi tab Lobby hiện là “Đấu Với AI Bots”. Nếu không tìm thấy, script vẫn tiếp tục kiểm tra bàn dù chưa bắt đầu ván. Nên dùng selector ổn định, thực hiện đủ bước vào ván và dừng ngay nếu không đạt điều kiện. Đây là nhận xét từ source, không tự chạy script.

## Đánh giá logic/giao diện hiện tại

Không có source game mới để kết luận logic hay hình ảnh đã tốt hơn V28. Ảnh dialog mua nhà mới rõ, trình bày giá/số dư/khóa Landmark hợp lý; ảnh sau mua cho thấy đã có tài sản trong HUD. Nhưng ảnh fixture chưa có bàn, nên chưa thể nghiệm thu đủ bốn cấp công trình và mobile nhiều nhà.

## Thứ tự Anti làm tiếp

1. Làm phase DEV chạy được và có readiness/error log; giữ production debug bị loại bỏ.
2. Sửa các cờ thành công để dựa trên trạng thái được xác minh.
3. Xuất JSON/ảnh thật cho production, mua nhà và fixture riêng; không dùng trang lỗi làm ảnh nghiệm thu.
4. Khi có đủ bằng chứng, kiểm tra độ đọc mobile, nhà không che nhãn/quân và giao dịch trên hai thiết bị/hai mạng.

Chưa có lý do để đổi hosting hoặc viết lại engine. Giữ các dịch vụ miễn phí hiện có.

## Bằng chứng V29 đã lưu

- [Bản sao JSON browser](docs/review-v29-2026-11-08/browser-report-snapshot.json).
- [Ảnh fixture lỗi kết nối](docs/review-v29-2026-11-08/fixture_showcase_tiers_desktop.png).
- [Dialog mua](docs/review-v29-2026-11-08/screenshot_build_dialog_live.png), [ảnh sau mua](docs/review-v29-2026-11-08/screenshot_live_gameplay_property_purchased.png).
- [Hash các ảnh đã lưu](docs/review-v29-2026-11-08/image-snapshot.json).
- [Probe callback fixture](docs/review-v29-2026-11-08/fixture-result-probe.mjs), [kết quả](docs/review-v29-2026-11-08/fixture-result.json).
- [Snapshot source ban đầu](docs/review-v29-2026-11-08/validation.json): danh sách ảnh lúc snapshot khác với lúc kết thúc vì output được tạo trong quá trình review; dùng các bản sao phía trên để đối chiếu kết luận. Script được chỉnh thêm readiness trong vòng review, xem cập nhật R01; R02 vẫn có trong bản đọc cuối.

Không chỉnh source, tài khoản hoặc dịch vụ production trong lượt V29.
