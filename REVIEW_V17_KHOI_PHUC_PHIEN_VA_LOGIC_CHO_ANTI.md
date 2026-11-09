# Review V17 — Khôi phục phiên, logic và trạng thái sau V16

Ngày 08/11/2026. Review tiếp bản local chưa commit trên HEAD `b5da067`. **Chỉ review, không sửa source game, không commit/push/deploy.**

## 1. Kết luận cập nhật

**Hai lỗi Redis chính của V16 đã được sửa trong mã mới.** Không tiếp tục coi lỗi bỏ quên endpoint và nuốt SUBSCRIBE là finding đang mở trên snapshot V17.

Tuy nhiên, khả năng tự quay lại phòng vẫn chưa hoàn chỉnh. V17 tái hiện thêm **hai lỗi phía client**: không thử lại sau khi namespace bị từ chối tạm thời, và xóa mã khôi phục ngay khi ACK resume bị timeout.

Mục tiêu của đợt tiếp theo nên là **giữ được phiên khi mạng/server lỗi ngắn**, sau đó mới chốt phần đồ họa. Không cần đổi Redis, chuyển hosting hay nâng gói trả phí để xử lý hai lỗi này.

## 2. Kiểm chứng vòng này

| Kiểm tra | Kết quả |
|---|---|
| `npm test` | **100 ca qua**: 23 legacy + 77 Node runner; 0 fail, 0 cancelled, 0 skipped |
| `npm run test:redis` với Redis thật | **2 ca qua**, không skip. Redis 7.4 disposable tại `127.0.0.1:16392`, tách production |
| Build | Thành công; vẫn có cảnh báo chunk lớn |
| Probe kết nối bị từ chối | Backend Socket.IO thật + client thật: không tự nối khi kho dữ liệu đã hoạt động trở lại; gọi `connect()` rõ ràng thì thành công |
| Probe timeout resume | Chạy thân hook thật trong harness điều khiển hooks/socket/storage: ACK timeout làm mất token và quay về lobby |
| GUI | **Không chạy lại GUI trong V17**. Đánh giá hình ảnh gần nhất ở V16; không dùng kết quả test logic để tuyên bố đồ họa/mobile đã đạt |

So với snapshot V16, thay đổi được ghi nhận ở `package.json`, `server/index.js`, `server/redisRoomStore.js`, `src/App.jsx`; thêm `test/reviewV16.test.js`. Các hash theo dõi không đổi trong lần kiểm tra cuối. Xem `docs/review-v17-2026-11-08/validation.json`.

Hai ca Redis thật kiểm tra chơi/giao dịch/xây, session fencing, backend restart và CAS giữa worker. **Không đồng nghĩa đã kiểm chứng mọi tình huống mất riêng subscriber hoặc gián đoạn mạng.** Test catch-up mới dùng sự kiện mô phỏng trên MemoryRoomStore, chưa thay thế được thử cắt kênh thật giữa hai instance.

## 3. Finding mới cần sửa

### V17-R01 — P2: Server tạm từ chối kết nối thì frontend không tự thử lại

**Vị trí:** `src/hooks/useGameController.js:79–103`; middleware tại `server/index.js`, đoạn `io.use(...)`.

Khi kho dữ liệu tạm chưa sẵn sàng, middleware trả lỗi cho lần kết nối namespace. Client hiện chỉ `setConnected(false)` ở `connect_error`. Cấu hình `reconnectionDelay` không tự giải quyết kiểu từ chối này: Socket.IO client chuyển sang trạng thái không tự reconnect.

**Đã tái hiện:**

1. Backend thử đang chạy nhưng `roomStore.ready()` tạm báo lỗi.
2. Client dùng cùng cấu hình kết nối như hook nhận `connect_error`.
3. Cho `roomStore.ready()` hoạt động lại, chờ 1.8 giây — dài hơn delay khởi đầu 1 giây.
4. Client vẫn không kết nối; trạng thái `active` ngay sau khi bị từ chối là `false`.
5. Gọi rõ ràng `socket.connect()` → kết nối thành công trên cùng backend.

```json
{
  "activeAfterRejection": false,
  "connectedAfterStoreRestored": false,
  "connectedAfterExplicitConnect": true
}
```

**Ảnh hưởng:** người mở game hoặc quay lại đúng lúc server/Redis gián đoạn ngắn có thể mắc ở trạng thái mất kết nối dù dịch vụ đã hồi phục; phải refresh mới thử lại. Nếu đang cần resume trong thời hạn 60 giây, thời gian khôi phục bị lãng phí.

**Anti cần làm:** phân loại lỗi tạm thời và lỗi không nên retry. Khi Socket.IO không còn tự retry (`socket.active === false`) và lỗi có thể hồi phục, thử `connect()` với backoff có giới hạn, có nút thử lại và trạng thái rõ. Dọn timer khi component unmount/rời phiên; không tạo thêm vòng retry chồng lên transport vốn đang tự nối lại.

**Nghiệm thu:** middleware từ chối do dịch vụ tạm lỗi → dịch vụ hồi phục → cùng tab tự vào lại, không refresh. Kiểm tra cả lần mở đầu và đang có session đã lưu. Session đã bị thay thế không được tự giành lại quyền.

### V17-R02 — P2: Timeout khôi phục phiên làm xóa token còn hợp lệ

**Vị trí:** `src/hooks/useGameController.js:87–92`.

Callback `resume_room` gộp hai trường hợp vào cùng nhánh:

- Không nhận ACK trong 5 giây (`failure`).
- Server trả kết quả không thành công (`!response?.success`).

Cả hai đều gọi `saveSession(null)`, xóa state và về lobby. **Timeout không chứng minh token đã hết hạn hoặc người chơi không còn quyền.** Backend có thể đã khôi phục phiên nhưng ACK bị chậm/mất, hoặc lỗi kho dữ liệu chỉ mang tính tạm thời.

**Đã tái hiện với thân hook thật:** thay imports bằng các dependency điều khiển được trong chương trình chẩn đoán, khởi tạo token giả còn trong storage, kích hoạt `connect`, sau đó inject ACK timeout. Không viết lại logic callback.

```json
{
  "tokenPresentBefore": true,
  "tokenPresentAfter": false,
  "screenAfter": "lobby",
  "errorAfter": "Không khôi phục được phiên chơi."
}
```

Đây là kiểm tra hook cô lập, **chưa phải thử mất gói trên trình duyệt thật**. Hành vi xóa token trong callback đã được thực thi và quan sát.

**Ảnh hưởng:** một lần chậm phản hồi có thể khiến người chơi mất đường quay lại ghế cũ từ tab hiện tại. Server vẫn có thể giữ ghế cho đến khi hết lease, trong khi client đã tự bỏ thông tin khôi phục.

**Anti cần làm:** giữ token trên lỗi mạng/timeout và lỗi dịch vụ có thể hồi phục; cho retry resume trong thời hạn hợp lệ. Chỉ xóa token khi người dùng chủ động rời, phiên bị thay thế, hoặc server xác nhận token/phòng đã không còn hợp lệ. Nên trả mã lỗi có cấu trúc từ backend; không phân loại bằng cách so chuỗi thông báo tiếng Việt.

**Nghiệm thu:** resume đã được server xử lý nhưng ACK đầu bị mất → thử lại vẫn vào đúng ghế cũ, không tạo người mới. Token thật sự không hợp lệ phải về lobby với lý do rõ; phiên superseded không được hồi sinh.

## 4. Những sửa V16 được ghi nhận

| Hạng mục | Trạng thái V17 |
|---|---|
| Lưu endpoint trước `_initClients()` | Đã có `this.endpoint = endpoint`; bộ Redis integration thật dùng endpoint riêng thành công |
| Không nuốt lỗi SUBSCRIBE | Đã bỏ nhánh bỏ qua lỗi; có cờ `subscribed`, test inject SUBSCRIBE thất bại vượt qua |
| Catch-up snapshot | Có `store_reconnected` và handler đọc snapshot gửi tới phòng có socket. Test sự kiện mô phỏng vượt qua; cần test gián đoạn kênh thật |
| Khóa thao tác khi offline | `App` đã thêm `isOnlineConnected` vào `canAct`; đây là sửa đúng hướng |
| Ghế hết hạn / reject giao dịch cũ | Các regression test vẫn qua; không có bằng chứng lỗi quay lại trong vòng này |

## 5. Logic mua nhà và giao dịch: nên giữ gì, kiểm tra tiếp gì?

V17 đọc lại reducer, kiểm tra giao dịch, tính tiền thuê và dialog xây nhà. **Chưa có lỗi mới được chứng minh trong cơ chế mua/nâng nhà qua các lượt ghé.** Điều đó không phải chứng nhận mọi tổ hợp luật đều hoàn hảo.

Giữ các quy tắc đã có: cơ hội xây gắn ô đang đứng, một lần xây mỗi lần ghé, Landmark cần Biệt thự từ trước lần ghé đó, không xây trên ga/tiện ích, server xác nhận quyền và revision. Hai ca Redis thật vẫn kiểm tra được mua tài sản qua action mạng.

Các tình huống Anti cần nghiệm thu sau khi sửa khôi phục:

- ACK mua nhà bị mất: đồng bộ lại phải thấy đúng tài sản/tiền đã commit, không mua hai lần.
- Mạng ngắt khi đang preview: nối lại phải mở quyết định hợp lệ hoặc thể hiện quyết định đã hoàn tất; preview không tự thành nhà thật.
- Chủ đất rời khi người khác đang quyết định mua lại: không để modal treo hoặc mua tài sản không còn chủ.
- Giao dịch accept trong lúc revision đổi: không chuyển tiền/đất sai; reject vẫn hoạt động độc lập với revision đề nghị.
- Đề nghị hết hạn/thay thế phải có trạng thái kết thúc rõ ở UI, không chỉ đóng modal khi người chơi gặp lỗi.

## 6. Giao diện và enhance còn lại

**Kết luận hình ảnh giữ như V16:** dải giá tương phản hơn, nhưng chữ khi nhìn toàn bàn vẫn nhỏ; chưa đạt độ rõ và chất lượng công trình như ảnh tham chiếu Business Tour. V17 không có thay đổi mới ở Board3D/CornerHUD/GameInterface trong các hash so sánh với V16.

Thứ tự nên làm:

1. **Trạng thái khôi phục rõ ràng:** đang nối lại, đang khôi phục ghế, còn bao lâu, nút thử lại. Không báo một thông điệp chung rồi xóa phiên.
2. **Đọc được tên/giá:** camera, tỷ lệ nhãn và vùng HUD; so ảnh cùng state/cùng kích thước. Không chỉ tăng vài pixel font trên texture.
3. **Công trình cấp 1–4:** silhouette, màu chủ/nhóm đất, vùng đặt nhà không che nhãn; animation sau ACK thành công.
4. **Chat trong trận:** hiện chat được truyền vào `OnlineRoom` ở phòng chờ, còn `GameInterface` chưa có giao diện chat trong trận. Đây là enhance hữu ích cho game bạn bè; backend/client đã có sự kiện, cần panel gọn và trạng thái gửi thất bại.
5. **Timer lượt/AFK và tiến độ thắng:** vẫn là backlog, chưa thấy triển khai mới. Đồng hồ hiện tại là thời gian đã chơi.

Không đánh dấu mobile hoặc bàn 6 người đã đạt nếu chưa có ảnh và thử trên trình duyệt sạch/thiết bị thật.

## 7. Thứ tự giao việc cho Anti

1. Sửa V17-R01 và V17-R02 cùng luồng lỗi có cấu trúc; không viết lại reducer chỉ để chữa reconnect.
2. Thêm regression test cho cả hai tình huống, gồm thành công sau lần lỗi đầu và session superseded.
3. Kiểm tra Redis thật với cắt command/subscriber, snapshot bù và nhiều instance; hai test Redis hiện có chưa bao phủ hết phần này.
4. Chạy test/build; sau đó nghiệm thu hai thiết bị ở hai mạng thật và luồng nâng nhà.
5. Làm rõ bàn, hoàn thiện asset và ảnh trước/sau theo backlog V16; giữ các dịch vụ ở gói miễn phí.

## 8. Bằng chứng

- [Probe phục hồi](docs/review-v17-2026-11-08/recovery-probe.mjs) và [kết quả](docs/review-v17-2026-11-08/recovery-results.json).
- [100 test thường](docs/review-v17-2026-11-08/tests.txt).
- [2 test Redis thật](docs/review-v17-2026-11-08/redis-tests.txt).
- [Log build](docs/review-v17-2026-11-08/build.txt).
- [Snapshot mã nguồn](docs/review-v17-2026-11-08/validation.json).

Backend và Redis disposable của vòng này đã dừng. Không thay đổi code game, Redis production, cấu hình Vercel hoặc gói dịch vụ. Báo cáo V17 cập nhật trạng thái mới; không dùng finding Redis cũ của V16 để mô tả sai snapshot hiện tại.
