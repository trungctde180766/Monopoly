# Review V28 — Sau sửa test production V27

Ngày 08/11/2026. **Chỉ review; không sửa source game, commit/push hoặc deploy.**

## Kết luận

**Q01 của V27 đã sửa đúng:** test production không còn pass rỗng khi thiếu `dist/assets`. Không phát hiện lỗi sản phẩm mới có bằng chứng trong phạm vi thay đổi này.

Trong các tệp hash V27 theo dõi, **chỉ `test/buildAndSession.test.js` thay đổi**. Source game, logic mua nhà/resume và giao diện giữ nguyên. Vì vậy không coi lần sửa này là một đợt cải thiện đồ họa hoặc gameplay mới.

## Kiểm tra thực tế V28

| Kiểm tra | Kết quả |
|---|---|
| Build mới | Thành công, còn cảnh báo chunk lớn |
| Test production sau build, `REQUIRE_PRODUCTION_BUILD=1` | 1 test qua, không skip |
| Không có dist, kiểm tra thông thường | Test báo skip rõ, exit 0; không còn pass rỗng |
| Không có dist, yêu cầu build bắt buộc | Test fail đúng thông báo thiếu build, exit 1 như mong đợi |
| Kiểm tra các bundle JS mới | Không có `__CONTROLLER__` hoặc `injectVisualShowcaseState` |
| Toàn bộ suite/Redis | Không chạy lại V28 vì thay đổi được kiểm tra là test build; kết quả 128 test ở V27 là lịch sử, không ghi thành lượt chạy mới |
| GUI và production deploy | Không kiểm tra lại trong V28 |

Hai trường hợp thiếu dist được chạy trong thư mục tạm rỗng riêng; không di chuyển/xóa dist của workspace. Exit 1 của trường hợp bắt buộc có build là **kết quả mong đợi để kiểm tra nhánh fail**, không phải bug mới của sản phẩm.

## Đánh giá bản sửa

- Có phân biệt rõ test development thông thường và yêu cầu release bắt buộc có artifact.
- Có kiểm tra danh sách JS không rỗng và ghi hash bundle vào thông báo assertion.
- Kiểm tra sau build vẫn xác nhận debug production V26 đã được loại bỏ.
- Test chưa tự chứng minh dist luôn khớp source hiện tại; quy trình release vẫn cần build trước rồi test, không dùng dist cũ. V28 đã thực hiện đúng thứ tự đó.

## Script và bằng chứng hình ảnh mới

Có thêm `test/browserVerificationV27.js`. Đọc source cho thấy script dự định tách server production và Vite development để kiểm tra release isolation riêng với cảnh demo công trình. Đây là hướng phù hợp, không cần bật lại debug trong production.

**Tại thời điểm ghi snapshot V28, `docs/review-v27-evidence/` còn trống.** V28 chưa có JSON/ảnh đầu ra mới để đánh giá script đã chạy thành công hay các công trình đã được chụp đầy đủ. Reviewer không tự chạy script browser này trong vòng V28.

Không lấy việc có script mới làm bằng chứng nghiệm thu GUI. Khi có đầu ra, cần ghi rõ:

- Cảnh nào là production thật, cảnh nào là development fixture.
- Hash bundle/source, viewport và DPR của từng cảnh.
- Nhà cấp 1–4 có thực sự xuất hiện trong ảnh và có che tên/giá/quân cờ không.
- Nếu xác nhận giao dịch mua/nâng nhà, phải có action server, tiền/owner/tier/revision của hai client; fixture mỹ thuật không thay thế phần đó.

## Việc tiếp theo cho Anti

1. Trong quy trình release: build → test production với `REQUIRE_PRODUCTION_BUILD=1` → test suite/Redis và smoke phù hợp. Không chỉ đặt biến môi trường mà bỏ qua bước build.
2. Hoàn tất chạy script browser mới và bàn giao JSON/ảnh thực tế, giữ tách biệt production với cảnh minh họa development.
3. Nghiệm thu mobile: chạm ô đọc giá/thuê, zoom, chat/bàn phím và quyết định mua nhà. Nhận xét hình ảnh V27 chưa được cập nhật bởi bản sửa test này.
4. Hai thiết bị/hai mạng: mua/nâng nhà thật, mất ACK, resume và superseded trước khi chốt phát hành.

Chưa có lý do từ V28 để viết lại engine hoặc đổi hosting. Giữ Vercel/Redis miễn phí hiện có.

## Bằng chứng

- [Build](docs/review-v28-2026-11-08/build.txt), [test production sau build](docs/review-v28-2026-11-08/production-test.txt).
- [Probe thiếu build](docs/review-v28-2026-11-08/missing-build-probe.mjs), [kết quả](docs/review-v28-2026-11-08/missing-build-results.json).
- [Thiếu build thông thường: skip](docs/review-v28-2026-11-08/optional-build-missing.txt), [bắt buộc có build: fail đúng](docs/review-v28-2026-11-08/required-build-missing.txt).
- [Snapshot hash và bundle](docs/review-v28-2026-11-08/validation.json).

Không chỉnh source game, tài khoản hoặc cấu hình dịch vụ trong lượt review V28.
