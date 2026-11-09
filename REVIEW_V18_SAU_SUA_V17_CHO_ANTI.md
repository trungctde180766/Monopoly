# Review V18 — Sau bản sửa khôi phục phiên V17

Ngày 08/11/2026. Review local chưa commit trên nền HEAD `b5da067`. **Chỉ review, không sửa game, không commit/push/deploy.**

## Kết luận

Hai vấn đề V17 đã được xử lý đúng hướng: có thử nối lại khi namespace bị từ chối, giữ token khi resume timeout/lỗi tạm thời và xóa token theo mã lỗi vĩnh viễn. Tuy nhiên, **chưa chốt được tính năng khôi phục giữa trận** vì phát hiện một lỗi thứ tự sự kiện làm người chơi nhận lại bàn nhưng giữ sai danh tính.

## Kết quả kiểm tra

- **103 test qua:** 23 legacy + 80 Node runner, 0 fail/cancelled/skip.
- Build thành công, còn cảnh báo chunk lớn. Log có PowerShell `NativeCommandError` do bắt stderr cảnh báo của Vite; tiến trình build exit 0 và có thông báo build hoàn tất.
- Probe mới chạy thân hook thật với dependency điều khiển được và backend Socket.IO thật để kiểm chứng thứ tự sự kiện. Không phải kiểm tra GUI trình duyệt đầy đủ.
- Không chạy lại Redis integration trong V18: `server/redisRoomStore.js` giữ nguyên hash so với V17, nơi hai ca Redis thật đã qua. Không cộng hai ca cũ vào 103 test mới.
- Không kiểm tra GUI/mobile hoặc production mới trong lượt này; không tuyên bố đã deploy.

Trong các tệp snapshot V17 theo dõi, `package.json`, `server/index.js`, `src/hooks/useGameController.js` thay đổi; thêm `test/reviewV17.test.js`. Snapshot và bằng chứng ở `docs/review-v18-2026-11-08/`.

## V18-R01 — P1: Resume nhận `room_updated` trước ACK làm mất bước khôi phục danh tính

**Vị trí:** `src/hooks/useGameController.js:198–203`, liên quan dòng 60, 112 và 175.

**Điều kiện:** tải lại trang hoặc mở lại tab có token hợp lệ khi trận đã bắt đầu. Client mới có `gameRef.current === null`, còn ID socket mới khác ID người chơi cũ.

Chuỗi xảy ra:

1. `connect` gán `myId` bằng ID socket mới và gửi `resume_room`; callback giữ giá trị `epoch` hiện tại.
2. Backend thêm socket vào phòng rồi gửi `room_updated` qua `changed()` trước khi trả ACK resume.
3. Handler `room_updated` thấy phòng đang chơi và chưa có game nên gọi `reset()`, tăng `epoch`, dựng bàn và chuyển sang màn chơi.
4. ACK resume trả về đúng `playerId` cũ, nhưng callback bị bỏ qua bởi kiểm tra `generation !== epoch.current`.
5. `myId` còn là socket mới, không phải ID ghế cũ. Các kiểm tra đến lượt và quản lý tài sản không nhận ra người chơi.

**Bằng chứng:** probe với thân hook thật nhận lần lượt `connect → room_updated → resume ACK` cho kết quả:

```json
{
  "screen": "playing",
  "expectedPlayerId": "original-player",
  "actualPlayerId": "replacement-socket",
  "identityRecovered": false
}
```

Phần Socket.IO thật trong cùng probe xác nhận thứ tự server hiện có là **`room_updated` trước `resume ACK`**, ACK thành công và có trả đúng ID cũ. Vì vậy đây không chỉ là thứ tự giả định trong harness. Chưa thử tải lại trên trình duyệt thật trong V18.

**Ảnh hưởng:** người chơi có thể thấy bàn nhưng không thực hiện được lượt của mình sau khi quay lại giữa trận. Trường hợp chỉ đứt kết nối khi game vẫn còn trong bộ nhớ có thể không đi qua nhánh reset này; không quy mọi lần resume đều hỏng.

**Anti cần sửa:** khôi phục danh tính và snapshot thành một luồng nhất quán; `room_updated` trong lúc đang resume không được tự tăng epoch rồi vô hiệu hóa ACK hợp lệ. Có thể giữ snapshot cho đến ACK xác thực playerId, hoặc dùng trạng thái đang khôi phục để phối hợp hai nguồn sự kiện. Giữ kiểm tra epoch cho trường hợp thực sự rời phòng/chuyển phiên. Không chỉ đảo thứ tự phát ACK để che lỗi race phía client.

**Nghiệm thu:**

- Tải lại giữa trận → ID người chơi vẫn là ghế cũ → đến lượt thì roll/build/manage được.
- Test cả hai thứ tự ACK trước snapshot và snapshot trước ACK, kể cả snapshot đến chậm.
- Timeout ACK lần đầu rồi thử lại vẫn nhận đúng danh tính, không nhân đôi người chơi.
- Rời phòng hoặc bị superseded trong lúc resume phải bỏ qua ACK cũ, không tự quay vào trận.

## Đánh giá bản sửa V17

| Hạng mục | Kết luận |
|---|---|
| Retry khi namespace tạm từ chối | Có triển khai backoff, kiểm tra `socket.active` và superseded. Test mạng mới qua, nhưng test đang chép lại logic retry trong file test thay vì chạy trực tiếp hook |
| Giữ token khi timeout/lỗi tạm | Test thân hook xác nhận token được giữ; có timer thử resume lại |
| Xóa token khi server xác nhận hết hạn | Có `EXPIRED_TOKEN`, `ROOM_NOT_FOUND` và test tương ứng |
| Mã lỗi server | Có truyền code trong ACK và `STORE_UNAVAILABLE` ở middleware |
| Toàn luồng resume giữa trận | **Chưa đạt vì V18-R01** |

Không mở lại finding V17 chỉ vì phát hiện lỗi mới. Hướng sửa cũ đúng; cần hoàn thiện phối hợp sự kiện.

## Khoảng trống test và UX cần bổ sung

1. Test phải chạy hook qua toàn chuỗi `connect → room_updated → ACK`, không chỉ gọi callback ACK độc lập. Các ca đơn lẻ hiện qua nhưng bỏ sót việc epoch đổi giữa chừng.
2. Test reconnect nên dùng logic hook thật hoặc phần xử lý đã tách dùng chung; bản test chép lại thuật toán không bảo đảm source sản phẩm được gọi đúng.
3. Có hàm `retryConnect` trong controller, nhưng chưa thấy đưa vào giao diện qua những tệp UI đang theo dõi. Cần nút thử lại/trạng thái khôi phục dễ hiểu và phân biệt kết nối socket với đã khôi phục ghế thành công.
4. Backoff được giới hạn khoảng chờ tối đa 5 giây, nhưng chưa có giới hạn tổng số lần/thời gian khôi phục. Cần chính sách rõ theo thời hạn session; không tự xóa token chỉ vì hết thời gian chờ phía client khi server chưa xác nhận.

## Giao diện và cơ chế nhà

Không có thay đổi hash mới ở Board3D, CornerHUD, GameInterface so với snapshot V17. **Không có cơ sở đánh giá đồ họa đã tốt hơn trong lần sửa này.** Nhận xét hình ảnh gần nhất vẫn ở V16: giá tương phản hơn nhưng chữ khi nhìn toàn bàn còn nhỏ; chưa đạt mức hình ảnh Business Tour mong muốn.

Cơ chế nhà không được viết lại trong đợt này. Ưu tiên sau khi sửa R01 là thử **resume ngay khi đang chọn cấp nhà**, xác nhận preview/ô đang chọn, số dư và quyền xây vẫn đúng; mất ACK không được trừ tiền hai lần. Kế tiếp mới xử lý camera/nhãn, asset công trình cấp 1–4 và ảnh nghiệm thu desktop/mobile.

## Thứ tự Anti làm tiếp

1. Sửa V18-R01 và thêm test thứ tự sự kiện trên hook thật.
2. Kiểm tra lại hai lỗi V17, bao gồm timeout rồi thành công, token hết hạn, rời phòng và superseded.
3. Chạy test/build, sau đó kiểm tra tải lại giữa trận trên trình duyệt và hai thiết bị ở hai mạng.
4. Tiếp tục backlog giao diện V16/V17; giữ Vercel/Redis miễn phí. Chưa cần chuyển hosting.

## Bằng chứng

- [Probe thứ tự resume](docs/review-v18-2026-11-08/resume-order-probe.mjs), [kết quả](docs/review-v18-2026-11-08/resume-order-results.json).
- [Log 103 test](docs/review-v18-2026-11-08/tests.txt), [log build](docs/review-v18-2026-11-08/build.txt).
- [Snapshot hash](docs/review-v18-2026-11-08/validation.json).

Backend thử đã đóng. Source game, tài khoản và cấu hình deploy không được chỉnh trong lượt review này.
