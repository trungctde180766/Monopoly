# Review V19 — Sau bản sửa V18

Ngày 08/11/2026. Review source local chưa commit. **Chỉ review, không sửa code game, commit/push hoặc deploy.**

## Kết luận

**Lỗi danh tính V18 đã được sửa trong kịch bản kiểm tra:** client giữ snapshot trong lúc resume, nhận playerId từ ACK rồi mới dựng bàn. Không còn ghi nhận giữ nhầm ID socket trong probe thứ tự thông thường.

Còn **một lỗi P2 trong bộ đệm khôi phục:** snapshot cũ đến sau có thể thay thế snapshot mới đã nhận. Nên sửa gọn phần lựa chọn state và thêm regression test trước khi chốt resume.

## Kiểm tra vòng này

- **109 ca test qua:** 23 legacy + 86 Node runner; 0 fail/cancelled/skip.
- Build thành công, còn cảnh báo kích thước chunk.
- Probe chạy thân hook thật với hooks/socket/storage được điều khiển để kiểm tra thứ tự snapshot và ACK.
- Không kiểm tra GUI/mobile, không deploy và không chạy lại Redis integration trong V19. Không dùng test logic để kết luận đồ họa đã đạt.
- Theo snapshot V18: thay đổi `package.json`, `src/hooks/useGameController.js`, `src/App.jsx`; thêm `test/reviewV18.test.js`. Các phần engine mua nhà, Board3D và backend Redis không đổi trong tập hash đối chiếu.

## V19-R01 — P2: Bộ đệm resume dùng snapshot đến cuối thay vì revision cao nhất

**Vị trí:** `src/hooks/useGameController.js`, các handler `room_updated`, `game_started`, `game_state_updated` khi `resumingRef.current` và đoạn chọn `finalState` trong ACK resume.

Cả ba handler gán trực tiếp `bufferedGameState.current = state` mà không so revision với bản đang giữ. Khi ACK tới, code chỉ so bản đệm cuối cùng với state trong ACK. Một revision lớn hơn đã nhận trước đó bị quên.

**Tái hiện bằng thân hook thật:**

| Snapshot nhận trong lúc resume | Revision ACK | Revision cần giữ | Kết quả |
|---|---:|---:|---:|
| 4 → 5 | 3 | 5 | 5, đúng |
| 5 → 4 | 3 | 5 | **4, sai** |

Cả hai trường hợp vẫn nhận đúng playerId gốc và vào màn chơi. Đây là lỗi khác với sai danh tính ở V18.

**Giới hạn bằng chứng:** thứ tự cập nhật được inject trong harness; chưa tái hiện reorder trên Redis/production hoặc trình duyệt thật. Không khẳng định TCP tự đảo gói. Tình huống cần phòng vệ là nhiều nguồn/các worker phát snapshot sau commit với độ trễ khác nhau. Luồng bình thường ngoài resume hiện đã có kiểm tra revision, nhưng bộ đệm mới lại bỏ qua nguyên tắc đó.

**Ảnh hưởng nếu gặp:** tiền, vị trí, tài sản hoặc quyết định có thể hiển thị cũ sau khi resume dù client đã nhận state mới hơn. Action tiếp theo có thể bị từ chối vì revision cũ; không có bằng chứng server ghi đè dữ liệu mới trong probe này.

**Anti cần sửa:**

1. Dùng chung một hàm nhận snapshot vào buffer, chỉ thay khi state hợp lệ và mới hơn trong cùng trận.
2. So cả định danh trận (`startedAt`) và phòng đang khôi phục; không chọn state chỉ dựa trên revision giữa hai trận khác nhau.
3. Khi ACK thành công, chọn state hợp lệ mới nhất trong ACK và buffer; không dùng `force` để vô tình hạ revision của cùng trận đang có.
4. Giữ nguyên việc xác thực playerId từ ACK và vô hiệu hóa phản hồi sau leave/superseded.

**Test cần có:** revision 5→4, 4→5, bản trùng, ACK cũ hơn/mới hơn buffer, snapshot khác trận, rời phòng trong lúc chờ. Mỗi trường hợp kiểm tra cả playerId và state cuối, không chỉ kiểm tra vào được màn chơi.

## Những điểm đã cải thiện

- `connect` không thay ID ghế đang cần resume bằng ID socket mới.
- Có `resumingRef`/`isResuming`, tách việc nhận snapshot khỏi bước chấp nhận danh tính từ ACK.
- Có test hook cho chuỗi snapshot trước ACK và các tình huống resume khác.
- `App` đã có nút Thử lại trong thông báo khi `isReconnecting`; đây là cải thiện UX từ đọc source, chưa nghiệm thu thao tác bằng GUI trong V19.
- Hai lỗi V17 và finding danh tính V18 không được giữ nguyên như lỗi chưa sửa chỉ vì còn V19-R01.

## Việc còn cần nghiệm thu trước khi chốt

1. Sửa buffer và chạy các regression test nói trên.
2. Trên trình duyệt thật: tải lại giữa trận → đúng ghế → roll, quản lý tài sản, mua/nâng nhà được.
3. Mất ACK mua nhà rồi resume phải giữ đúng số dư/tài sản, không trừ tiền hai lần.
4. Hai thiết bị, hai mạng: ngắt rồi quay lại; test cả đang chờ phòng, đang chọn cấp nhà và đang đến lượt.
5. Kiểm tra trạng thái UI khi socket đã nối nhưng ghế chưa resume xong. Hành động nên khóa theo trạng thái xác thực phiên, không chỉ theo `connected`.

## Giao diện và enhance

Đợt sửa này cải thiện **thông báo và điều khiển khôi phục**, chưa có thay đổi mỹ thuật Board3D trong snapshot đối chiếu. Đánh giá hình ảnh gần nhất vẫn ở V16: dải giá tốt hơn nhưng chữ toàn bàn còn nhỏ; công trình/asset chưa đạt mong muốn từ ảnh Business Tour. V19 không có ảnh mới để kết luận khác.

Sau khi ổn định resume: ưu tiên độ đọc nhãn/camera, công trình cấp 1–4 không che thông tin, ảnh desktop/mobile cùng state, rồi chat trong trận và timer lượt. Giữ engine hiện có và gói Vercel/Redis miễn phí; không cần đổi hosting để sửa finding này.

## Bằng chứng

- [Probe bộ đệm](docs/review-v19-2026-11-08/buffer-probe.mjs), [kết quả](docs/review-v19-2026-11-08/buffer-results.json).
- [Log 109 test](docs/review-v19-2026-11-08/tests.txt), [build](docs/review-v19-2026-11-08/build.txt).
- [Snapshot hash](docs/review-v19-2026-11-08/validation.json).

Không chỉnh source game, tài khoản, cấu hình hoặc dịch vụ production trong lượt này.
