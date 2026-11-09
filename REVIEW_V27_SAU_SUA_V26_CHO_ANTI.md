# Review V27 — Sau sửa debug production V26

Ngày 08/11/2026. **Chỉ review; không sửa source game, commit/push hoặc deploy.**

## Kết luận

**Finding R01 của V26 đã được sửa theo kiểm tra build mới.** `App` và hook đều dùng `import.meta.env.DEV`; bundle production không còn `__CONTROLLER__` hoặc `injectVisualShowcaseState`.

**128 test thường qua, build thành công.** Chưa phát hiện lỗi sản phẩm mới đủ bằng chứng trong phạm vi kiểm tra này. Nên chuyển sang nghiệm thu thao tác và độ đọc trên thiết bị thật; không cần tiếp tục viết lại cơ chế resume/debug nếu chưa có regression.

## Kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| `npm test` | **128 qua:** 23 legacy + 105 Node runner; 0 fail/cancelled/skip |
| Build | Thành công, còn cảnh báo chunk lớn |
| Kiểm tra JS production | Cả hai bundle không chứa tên controller global hoặc setter minh họa |
| Test production chạy riêng sau build | Qua |
| Hash bundle | Trùng hai hash trong báo cáo trình duyệt được cung cấp |
| Ảnh | Đã xem ảnh mobile mới trong `docs/review-v26-evidence/` |
| Runtime browser | Đã đọc báo cáo được cung cấp; **không tự chạy lại browser script trong V27** |
| Redis/production deploy | Không chạy lại Redis integration hoặc xác nhận bản deploy mới |

Bundle đối chiếu:

- `Board3D-D9HDSj6O.js`: SHA-256 rút gọn `388621508fd70a1d`.
- `index-C_2XOu1A.js`: SHA-256 rút gọn `e56065259c8be049`.

Hash trùng giúp nhận diện build tốt hơn chỉ ghi HEAD khi working tree chưa commit. Báo cáo mới ghi rõ working tree đang có thay đổi. Không suy từ đây rằng Vercel hiện đã chạy build này.

## Những điểm được sửa đúng

- Guard debug đã dùng cờ build Vite ở cả chỗ gắn global và chỗ thêm hàm inject.
- Báo cáo runtime được cung cấp ghi `controllerType: undefined`, `hasInject: false`. Kiểm tra bundle độc lập của V27 phù hợp với kết quả này.
- Fixture không còn được inject vào runtime production; báo cáo ghi `appliedInRuntime: false`.
- Chat dùng đặt `scrollTop` trực tiếp khi cần bám đáy; chưa có bằng chứng regression từ thay đổi này. Các test hiện tại đều qua.

Trong các tệp snapshot V26 theo dõi: hook, GameInterface, App, script browser và các JSON bằng chứng cũ thay đổi. Có thêm test production trong `test/buildAndSession.test.js` và thư mục bằng chứng V26. Engine, backend Redis, Board3D/camera không đổi trong tập hash đối chiếu.

## Q01 — P3: Test “loại debug khỏi production” có thể qua khi chưa có build

**Vị trí:** `test/buildAndSession.test.js`, test mới `Production bundle excludes...`.

Toàn bộ assertion nằm trong `if (fs.existsSync(assetsDir))`. Nếu không có `dist/assets`, test kết thúc thành công mà không kiểm tra gì. Khi có dist cũ, nó cũng không tự chứng minh bundle thuộc source vừa sửa.

**Anti nên làm:** trong job kiểm tra release, build trước rồi chạy test; nếu thiếu artifact bắt buộc thì fail rõ hoặc skip có lý do thay vì pass rỗng. Ghi hash build cần kiểm tra. Không cần tự build lặp lại trong mọi test nhỏ.

V27 đã kiểm tra trên dist vừa build và chạy riêng test sau build, nên **đây không phải bằng chứng kết quả V27 bị pass rỗng**. Đây là điểm cần hoàn thiện để các lần kiểm tra sau đáng tin cậy.

## Đồ họa: chưa thể chốt mọi cấp công trình từ ảnh mới

Ảnh mobile mới có HUD/công cụ gọn hơn các vòng đầu; tiền không còn xuống dòng riêng ký hiệu đồng. Tên/giá từng ô vẫn rất nhỏ ở góc toàn bàn và còn nhiều khoảng trống dọc màn hình.

Ảnh V26 mới thể hiện bàn đang có **0 đất**, không có nhà. Báo cáo cũng ghi fixture không áp dụng trong runtime production. Vì vậy danh sách `appliedTiers` trong metadata chỉ mô tả fixture dự kiến, **không phải bằng chứng tám công trình đó đã có trong ảnh hiện tại**.

Không yêu cầu bật lại debug trên production để có ảnh đẹp. Nên tạo cảnh demo development riêng có nhãn fixture, hoặc mua/nâng nhà qua backend thử rồi chụp state thật. Hai loại bằng chứng cần ghi rõ mục đích.

## Việc tiếp theo cho Anti

1. Hoàn thiện test release không pass rỗng khi thiếu dist.
2. Trên trình duyệt/thiết bị thật: chạm ô, đọc giá/thuê, zoom, chat, bàn phím và modal mua nhà. Chụp lúc có đủ cấp nhà, không chỉ bàn trống.
3. Hai thiết bị/hai mạng: mua/nâng nhà, trả thuê, giao dịch, refresh giữa quyết định, mất ACK và superseded; so tiền/owner/tier/revision của hai bên.
4. Trước chốt phát hành, chạy Redis integration thật và đối chiếu build deploy với bản bàn giao.

Chưa có bằng chứng mới cho thấy cần đổi hosting hoặc viết lại engine. Giữ Vercel/Redis miễn phí hiện có. Chất lượng hình ảnh giống ảnh Business Tour vẫn cần nghiệm thu riêng về độ đọc và mô hình, không suy từ số lượng test xanh.

## Bằng chứng

- [128 test](docs/review-v27-2026-11-08/tests.txt), [build](docs/review-v27-2026-11-08/build.txt).
- [Kiểm tra bundle](docs/review-v27-2026-11-08/production-debug-check.json), [test production sau build](docs/review-v27-2026-11-08/production-test.txt).
- [Snapshot source và hash bundle](docs/review-v27-2026-11-08/validation.json).
- [Báo cáo browser được cung cấp](docs/review-v26-evidence/browser-verification-v26.json), [ảnh mobile được cung cấp](docs/review-v26-evidence/mobile_board_overview_live.png).

Không chỉnh source, tài khoản hoặc dịch vụ production trong lượt review V27.
