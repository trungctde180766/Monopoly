# Review V9 — kiểm tra bản vừa sửa sau V8

Ngày 07/11/2026. Review workspace trên nền `b9b9621`, gồm các thay đổi chưa commit. Lượt này chỉ review/tạo bằng chứng, không sửa source game, không commit/push/deploy.

## 1. Kết luận

**Phần lớn sửa giao diện và luật kiểm soát thao tác của V8 đã có tác dụng. Hai blocker online vẫn chưa được giải quyết: lưu phòng giữa các tiến trình và entry nhận WebSocket ngay từ kết nối đầu.**

Chạy lại **69/69 bài kiểm tra qua**, build thành công. Đã kiểm tra UI 6 người, mobile 390×844 và 320×740, bấm lắc, xem trước và mua Biệt thự Hội An. Có tiến bộ thật, nhưng chưa đủ kết luận online public hoàn tất hoặc giống Business Tour đầy đủ.

## 2. Những lỗi còn lại theo mức ưu tiên

### R01 — P1: SharedRoomStore vẫn không chia sẻ phòng giữa các tiến trình/instance

**Vị trí:** `server/roomStore.js:3–4`, `:75–83`.

`GLOBAL_ROOMS_MAP` và `PROCESSED_REQUESTS` là biến ở cấp module. `SharedRoomStore` trỏ tới hai Map đó nên các object trong **cùng một JavaScript runtime** thấy nhau. Một tiến trình Node hoặc Function instance khác có bộ Map riêng. Tên SharedRoomStore chưa biến nó thành kho lưu trữ phân tán/bền vững.

**Đã tái hiện bằng hai tiến trình Node thật, đều dùng defaultRoomStore mới:** A tạo phòng; B vào đúng mã bị trả `Phòng không tồn tại!`. Không dùng hai MemoryRoomStore tự tạo để suy luận lỗi này. Kết quả ở [audit-results.json](docs/review-v9-2026-11-07/audit-results.json), mục R01.

**Cần làm:** triển khai kho dùng chung thực sự cho room/lobby/game/session/trade/deadline; thêm truyền sự kiện liên instance. Chỉ giữ Map làm cache. Các phép thay đổi state cần đọc/ghi nguyên tử theo room và revision; reconnect/presence phải kiểm tra qua kho chung, không chỉ `io.sockets.sockets` của instance hiện tại. Restart không được mất phiên đã lưu.

Vercel có thể đưa kết nối mới hoặc reconnect đến instance khác; trạng thái phòng và phối hợp giữa instance cần nằm ngoài biến RAM cục bộ. [Tài liệu chính thức](https://vercel.com/docs/functions/websockets#manage-persistent-state).

**Nghiệm thu:** hai tiến trình/instance dùng cùng store nhìn cùng mã, broadcast được qua lại; restart vẫn resume đúng ván. Đây phải là bài integration, không chỉ test hai object SharedRoomStore trong một process.

### R02 — P1: getSharedApp vẫn chạy bên trong HTTP handler, chưa sửa cold WebSocket

**Vị trí:** `api/realtime.js:5–9`, `:18–27`.

App được cache sau lần gọi handler đầu tiên, nhưng `io.attach(res.socket.server)` vẫn chỉ xảy ra khi HTTP handler được chạy. Client mặc định ưu tiên WebSocket từ đầu nên chưa có upgrade handler trước lần HTTP bootstrap.

**Đã chạy lại entry mới trong Node HTTP wrapper cô lập:**

| Tình huống | Kết quả |
| --- | --- |
| WebSocket `/socket.io` ngay từ cold start, chưa gọi HTTP | Thất bại, `websocket error`. |
| Sau một HTTP GET khởi tạo handler, WebSocket `/socket.io` | Thành công. |
| Sau warm-up, WebSocket ở path thay thế `/api/realtime/socket.io` | Thất bại trong wrapper. Việc đổi `req.url` ở HTTP handler không tự áp dụng cho upgrade. |

Wrapper này không mô phỏng edge rewrites của Vercel, nên không dùng nó để khẳng định chính xác mọi tình huống routing production. Nó chứng minh vấn đề bootstrap ở entry vẫn còn.

**Cần làm:** export server đã đăng ký xử lý Socket.IO/upgrade ngay khi module được khởi tạo, theo ví dụ Vercel hiện hành; giữ entry standalone riêng cho local. Chọn một path thật dùng xuyên client/server/rewrite, cấu hình transport phù hợp. Đừng coi việc di chuyển đoạn khởi tạo vào `getSharedApp()` nhưng vẫn gọi trong handler là đã hoàn tất. [Ví dụ Socket.IO của Vercel](https://vercel.com/docs/functions/websockets#set-up-a-websocket-endpoint).

**Nghiệm thu:** deploy mới/cold instance, client WebSocket kết nối ngay không cần health/GET làm nóng; reconnect sau thay instance vẫn lấy được state R01.

### R03 — P2: atomicUpdate và bộ nhớ requestId mới chưa được dùng trong luồng chơi

**Vị trí:** `server/roomStore.js:38–69`, `server/index.js:258–267`, `src/hooks/useGameController.js` hàm dispatch.

Đã thêm `atomicUpdate`, `hasProcessed`, `recordProcessed`, nhưng không thấy handler gọi các hàm này. Client cũng chưa gửi requestId. `game_action` vẫn trực tiếp gán kết quả reducer vào `room.gameState` như trước.

Probe gửi `skip` thành công rồi phát lại **cùng requestId, cùng payload/revision**: lần hai nhận lỗi state đã đổi; `hasProcessed(requestId)` vẫn false. Revision hiện vẫn chặn lệnh trùng làm biến đổi state lần nữa — **không phát hiện trừ tiền hai lần trong probe này**. Tuy nhiên chưa có cơ chế trả lại kết quả đã xử lý cho retry sau khi mất acknowledgement, và các helper mới chưa bảo vệ luồng thật.

**Cần làm:** đưa requestId vào hợp đồng client/server; xác thực, kiểm tra replay, commit state và ghi kết quả request theo cùng giao dịch nguyên tử với phạm vi room/game/actor. Nếu cùng ID nhưng payload khác thì trả lỗi rõ. Không dựa CAS đồng bộ trên Map để coi đã có lock phân tán.

### R04 — P2: màn 320px còn chật và pill trên che camera controls

**Vị trí:** `src/game.css` `.arena-top-pill`, `.arena-dock-inner`, `.dock-action-wrapper`, media mobile; controls trong Board3D.

P1 nút lắc bị card người chơi che đã hết ở 390px. Tuy nhiên ở 320×740, pill trên rộng khoảng **343,7px**, tọa độ x≈−11,9 đến 331,9, nên bị cắt hai mép màn hình. Nó cũng chồng lên vùng nút Góc 3D. Nút chính lúc kết thúc lượt bị ép còn khoảng **48px** chiều rộng dù dock có cả xúc xắc và nút Giao dịch.

**Cần làm:** thu bớt mode/quỹ trên pill hoặc cho xuống dòng có kiểm soát; dời camera controls vào safe area; ở 320px chuyển Giao dịch ra menu hoặc hàng riêng, giữ nút chính đủ chỗ đọc. [Số đo](docs/review-v9-2026-11-07/mobile-320-metrics.json). Không tính panel trắng ngoài game của tiện ích trình duyệt vào lỗi này; kết luận dựa trên rect các phần tử game.

## 3. Những điểm V8 đã được sửa và kiểm chứng

| Vấn đề V8 | Kết quả mới |
| --- | --- |
| F03: HUD che nút lắc mobile | 390×844, sáu người: 0 card desktop hiện, mobile HUD display flex, tâm nút lắc nhận đúng click. Đã bấm lắc bằng UI, ra 2+6 và đến Hội An. [Số đo](docs/review-v9-2026-11-07/mobile-six-metrics.json). Còn tinh chỉnh 320px ở R04. |
| F04: preview blur toàn bàn | Đã hết: backdrop `none`, background trong suốt, panel nhỏ góc dưới trái; nhìn được ghost Biệt thự trên ô Hội An. [Ảnh preview mới](docs/review-v9-2026-11-07/preview-fixed.jpg), [số đo](docs/review-v9-2026-11-07/preview-metrics.json). |
| F05: host chọn quân bị thành car | Probe gửi đúng payload controller `token:diamond`, server trả diamond. Đã sửa và validate token. |
| F06: trade khi còn quyết định | Socket test fixture pending build: đề nghị bị từ chối, quyền mua vẫn giữ nguyên. Server đã thêm guard ở cả gửi và phản hồi. |
| F07: đếm tier thành số nhà | UI sau mua Hội An: **1 Đất, 1 Biệt thự**, không còn ghi 3 nhà. Ví 15 triệu→13 triệu, thuê 2,7 triệu đúng bảng dự án. [Trạng thái](docs/review-v9-2026-11-07/after-purchase.txt). |
| F07: banner/nhà khác màu người chơi | Banner đã dùng player.color; bỏ CORNER_THEMES theo index. Kiểm tra code và UI thấy cùng nhận diện. |
| F08: test N01 không thực sự phát broadcast | Đã thêm guest F tạo event và witness D phải nhận, khẳng định roster không còn E rồi kiểm tra E không nhận. Bài test qua. |
| Desktop sáu người che pill/camera | Đã dời người chơi khỏi top-center và hạ card trái; ở 1280×720 nhìn được pill và controls, cải thiện so với V8. Card hai sườn vẫn cần kiểm tra thêm ở tablet và bàn nhiều công trình. |

## 4. Kiểm tra và giới hạn

- `npm test`: **69/69 qua**, 23 bài nền và 46 Node runner, không có bài thất bại/bỏ qua. Các probe R01–R03 bổ sung ngoài bộ test chính.
- `npm run build`: qua; `index-CsOH2fmY.js` khoảng 412,45 kB (gzip 125,92 kB); Board3D 564,53 kB (gzip 142,29 kB). Vite còn cảnh báo chunk 3D >500 kB.
- Console cuối phiên UI không ghi error/warn. Kiểm tra UI ở local build: 1280×720, 390×844 và 320×740. Không sửa state trong trình duyệt để tạo giao diện mua/preview; fixture luật/socket nằm riêng trong script diagnostic.
- [Script probe](docs/review-v9-2026-11-07/audit-repros.mjs), [kết quả chạy](docs/review-v9-2026-11-07/audit-results.json). Assertion phần remaining xác nhận lỗi hiện tại, cần đổi kỳ vọng khi đưa thành regression test sau sửa.
- [Hash 16 file tại thời điểm review](docs/review-v9-2026-11-07/source-hashes.json) để đối chiếu bản nhận review với lần sửa tiếp.
- Chưa có shared datastore/broadcast adapter để nghiệm thu nhiều instance; chưa thực hiện deploy trong lượt này.

## 5. Trạng thái link public

Kiểm tra lúc **16:12 ngày 07/11/2026 giờ Việt Nam**: [link Vercel](https://monopoly-silk-ten.vercel.app) vẫn tải asset `index-BarhytB4.js`, chưa phải bundle local mới `index-CsOH2fmY.js`. Health trả HTML SPA; cả hai path WebSocket vẫn kết nối thất bại. [Kết quả read-only](docs/review-v9-2026-11-07/public-check.json).

Đánh giá giao diện mới ở mục 3 dựa trên local, không dựa vào public cũ. Không tuyên bố phần online đã xong bằng việc có API health hoặc tên class SharedRoomStore.

## 6. Thứ tự làm tiếp

1. **R01 + R02:** kho phòng thật dùng chung, broadcast, server export/upgrade đúng và test cold start.
2. **R03:** nối transaction/CAS và requestId vào mọi thao tác có thay đổi state, thay vì chỉ khai báo helper.
3. **R04:** thu gọn header/dock và chừa vùng camera cho màn 320px.
4. Bổ sung regression tests cho host token, pending trade, mobile hit-test, API cold start, hai tiến trình và retry; giữ 69 bài nền.
5. Tiếp tục mục tiêu Business Tour ở V7: World Tour/Lost Island, luật có version, cost basis rõ, nhân vật/công trình và góc nhìn. Phần này chưa thấy thay đổi cơ chế tương ứng trong lượt sửa mới; chưa nên gọi là bản giống hoàn chỉnh.

**Bản mới đã sửa được nhiều điểm cụ thể. Phần cần tập trung tiếp là hạ tầng online thực sự hoạt động qua nhiều tiến trình, không phải thêm tên shared/atomic vào lớp RAM.**
