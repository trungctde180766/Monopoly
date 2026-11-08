# Review V8 — kiểm tra lại sau bản sửa mới

Ngày 07/11/2026. Review workspace hiện tại trên nền `b9b9621` và các thay đổi chưa commit. Lượt này không sửa mã game, không commit/push/deploy; chỉ thêm review và bằng chứng kiểm tra.

## Kết luận

**Có tiến bộ rõ ở bố cục desktop và một số lỗi V7, nhưng chưa đủ để kết luận online Vercel đã xong hoặc giao diện dùng ổn trên mobile.** Có ba vấn đề P1 cần xử lý: entry realtime khởi động chưa nhận ngay WebSocket, room store vẫn chỉ ở RAM và HUD che nút chơi trên điện thoại.

Chạy lại `npm test`: **69/69 bài qua** (23 nền + 46 Node runner). `npm run build`: thành công. Build Vite chưa kiểm tra được vòng đời Function/upgrade của Vercel và không phát hiện chồng giao diện.

## 1. Các phát hiện cần sửa, theo ưu tiên

### F01 — P1: endpoint realtime chỉ gắn xử lý WebSocket sau một HTTP request

**Vị trí:** `api/realtime.js:11–24`, trọng tâm `:17–19`.

Entry export một HTTP handler, chờ handler chạy mới gọi `io.attach(res.socket.server)`, sau đó `res.end()`. Client hiện ưu tiên WebSocket ngay từ kết nối đầu. Khi chưa có HTTP warm-up, upgrade handler chưa được cài.

Đã thử chính entry này trong Node HTTP wrapper cô lập: kết nối WebSocket đầu tiên tới `/api/realtime/socket.io` thất bại; gửi một HTTP GET để handler khởi tạo xong thì WebSocket kế tiếp thành công. Đây là bằng chứng cold-start ở entry hiện tại, **không phải tuyên bố đã chạy thử một deployment Vercel mới**.

**Cần sửa:** dùng entry export HTTP server đã đăng ký Socket.IO/upgrade theo ví dụ Vercel hiện hành, thay vì trông chờ request trước cài handler vào socket server của runtime. Đồng bộ path client/server/rewrite; hiện client mặc định `/socket.io`, server API cấu hình `/api/realtime/socket.io`. Cấu hình rõ transport cho Vercel và kiểm tra trên URL thật từ cold start. [Tài liệu WebSocket/Socket.IO của Vercel](https://vercel.com/docs/functions/websockets).

**Tiêu chí đạt:** mở tab mới và kết nối ngay bằng WebSocket thành công, không cần gọi health hay HTTP để làm nóng trước; reload/redeploy rồi kiểm tra lại. Health 200 đơn thuần không chứng minh điều này.

### F02 — P1: roomStore mới vẫn là RAM từng instance, chưa có lưu ván/broadcast dùng chung

**Vị trí:** `server/roomStore.js:3–33`, `server/index.js:16–27`.

`MemoryRoomStore` chỉ bọc `new Map()`, và `defaultRoomStore` vẫn dùng lớp đó. Không thấy Redis/shared persistence, adapter broadcast, CAS/transaction hoặc requestId/idempotency trong thay đổi mới.

Thử hai server factory dùng hai MemoryRoomStore riêng: tạo phòng ở A, vào đúng mã ở B bị trả “Phòng không tồn tại!”. Restart cũng không thể khôi phục phòng từ Map cũ. Việc có interface tên roomStore không thay đổi hành vi này.

**Cần sửa:** triển khai store dùng chung thực sự cho lobby/game/session/trade/deadline, broadcast liên instance, cập nhật nguyên tử theo phòng/revision và chống xử lý request lặp. Store interface hiện đồng bộ và code sửa object trả về tại chỗ; chuyển sang Redis còn cần await/read-modify-write đúng, không chỉ thay constructor. Timer disconnect 60 giây vẫn ở RAM nên chưa giải quyết vòng đời Function.

Vercel có thể đưa các lần kết nối vào instance khác nhau; trạng thái lâu dài và phối hợp phòng phải tách khỏi bộ nhớ cục bộ. [Tài liệu Vercel](https://vercel.com/docs/functions/websockets#manage-persistent-state).

**Tiêu chí đạt:** hai instance thật dùng cùng kho dữ liệu nhìn cùng phòng, nhận cùng event; restart/reconnect giữ đúng người và ván; hai lệnh cùng revision không ghi đè/trừ tiền lặp.

### F03 — P1: HUD mobile che nút lắc, cả bốn và sáu người

**Vị trí:** `src/components/CornerHUD.jsx:68–120`, `src/game.css:181`, phần responsive từ `:769`.

Thẻ vẫn fixed bốn/sáu vị trí, `z-30`; dock chính chỉ z-index 25. Chưa có bố cục thu gọn người chơi cho mobile.

Ở 390×844, ván sáu người: nút lắc có rect khoảng x=132–245, y=764–829; thẻ người đang đi phủ vùng x=138–374, y=709–828. Hit-test tại giữa nút lắc trả về **nút Sổ Đỏ**, không phải nút lắc. Ván Quick bốn người cũng có tâm nút lắc không nhận click. Đây là lỗi chồng từ các phần tử của game, không phải do panel trắng ngoài game của tiện ích trình duyệt.

Desktop sáu người cũng có card giữa trên che pill đồng hồ/quỹ; camera controls ở góc trên trái nằm sau HUD.

**Cần sửa:** breakpoint mobile dùng thanh người đang đi + danh sách đối thủ thu gọn; chừa vùng riêng cho dock và safe area. Desktop sáu người cần bố trí thêm hai ghế tránh pill. Sửa bố cục trước, không chỉ tăng z-index để chuyển phần bị che sang thẻ người chơi.

**Tiêu chí đạt:** 320/390px, 2–6 người, tên dài: nút lắc/kết thúc bấm trúng, tên/tiền đọc được, không che camera controls. [Số đo sáu người](docs/review-v8-2026-11-07/mobile-metrics.json), [bốn người](docs/review-v8-2026-11-07/mobile-four-metrics.json).

### F04 — P2: chế độ xem trước bị blur toàn bàn, chức năng nhìn công trình bị thoái lui

**Vị trí:** `src/components/BuildDialog.jsx:17`, `src/game.css:443–454`.

BuildDialog vẫn gắn `.dialog-build.is-preview-only`, nhưng CSS riêng cho hai class đã mất. Khi bấm “Xem trước trên bàn”, nền vẫn đen 65%, `backdrop-filter: blur(8px)`, dialog vẫn ở chính giữa.

Đã chọn Biệt thự Phong Nha và mở preview qua UI: tổng chi/số dư đúng, nhưng bàn và ghost phía sau đều mờ; không còn nhìn nhà rõ như chức năng V6. [Ảnh thực tế](docs/review-v8-2026-11-07/preview-obscured.jpg).

**Cần sửa:** phục hồi style preview nền trong, không backdrop blur; panel nhỏ né ô đang chọn; giữ confirm/skip và focus hợp lý. Ghost chưa được làm thay đổi tiền/ownership; công trình thật chỉ hiện sau xác nhận.

### F05 — P2: chọn quân host không được chuyển đúng qua server

**Vị trí:** `src/hooks/useGameController.js:146`, `server/index.js:92–104`.

Controller gửi `{hostName, token: hostToken, ...}` nhưng server mới destructure `hostToken`, nên luôn fallback sang `car`. Probe gửi đúng payload hiện tại `token:'diamond'`, phòng trả host token `car`.

**Cần sửa:** thống nhất một tên field, validate token theo danh sách hỗ trợ; thêm test ở mức hợp đồng UI/controller→socket. Test đang gửi trực tiếp hostName chưa bắt được lỗi này.

### F06 — P2: L01 mới chặn ngoài lượt, chưa chặn giao dịch khi đang có quyết định bắt buộc

**Vị trí:** `server/index.js:267–280`, `src/logic/gameSession.js` hàm `applySessionTrade`.

Guard mới kiểm tra `pendingDecision?.type === 'debt'`, nhưng debt được thể hiện bởi tiền âm/phase debt; các decision thực tế gồm build/card/jail/jail_debt/buyout/festival. Nút giao dịch trên UI khóa khi còn decision, server chưa áp dụng cùng điều kiện.

Trong server fixture cô lập tạo bằng reducer, A đang chọn mua ô 3 vẫn gửi được trade cho B. B chấp nhận thì phase của A từ decision thành end, lựa chọn mua bị đóng. Lỗi B/C phá quyền A đã được giảm, nhưng người đang đi vẫn vượt được quy tắc phase của UI bằng lệnh socket.

**Cần sửa:** cùng validator cho phase, người đang đi, tiền/nợ và quyền trade ở cả lúc gửi/chấp nhận; xác định rõ có cho giao dịch trong quyết định hay không. Với UI hiện tại thì server nên từ chối mọi decision bắt buộc, không chỉ một chuỗi type không được sinh ra.

### F07 — P2: HUD tái đưa màu sai nhận diện và đếm tier thành số nhà

**Vị trí:** `src/components/CornerHUD.jsx:7–62`, `:187`, `:215`.

- Banner dùng `CORNER_THEMES[index]`, avatar/nhà dùng `player.color`: một người vẫn có hai màu khác nhau. Ví dụ player 1 avatar đỏ nhưng banner xanh lá.
- `totalHouses` cộng `prop.houses`; mua một Biệt thự cấp 3 hiển thị `1 Đất · 🏠 3`, trong khi trên bàn có một công trình. Đã thấy qua UI sau mua Phong Nha 3,4 triệu: ví 11,6 triệu đúng nhưng thống kê nhà sai nghĩa.

**Cần sửa:** thống nhất player.color hoặc có palette người chơi dùng xuyên suốt; hiển thị số công trình và cấp riêng. Tránh hiểu cấp 3 là ba căn nhà.

### F08 — P2, chất lượng test: bài N01 có trigger không phát broadcast

**Vị trí:** `test/reviewV7.test.js:122–131`.

Sau khi E rời phòng cũ, test gọi `d.emit('toggle_ready')` với D là host. Handler không đổi ready của host và không broadcast ở nhánh này. Chờ 200ms rồi thấy `leakedEvent === null` chưa chứng minh E đã hết nhận sự kiện phòng cũ.

Code hiện có gọi leave phòng cũ trước resume, là sửa đúng hướng; vấn đề ở độ mạnh của bằng chứng test. Thêm một người còn trong phòng cũ và thao tác thực sự phát `room_updated`, xác nhận client đối chứng nhận được event còn E không nhận. Cũng nên khẳng định roster/phòng cũ không còn danh tính E.

## 2. Đối chiếu V7: đã sửa và chưa xong

| Hạng mục V7 | Kết quả kiểm tra lại |
| --- | --- |
| B/C trade làm mất quyền mua của A | Reducer đã giữ quyền của A; server chặn người ngoài lượt. Hai test tương ứng qua. Vẫn còn F06. |
| Chủ đất rời lúc buyout | `forfeitSessionPlayer` dọn quyết định mồ côi; modal có fallback tiếp tục. Test mới qua. |
| Resume còn dính phòng cũ | Đã thêm leave phòng cũ, controller lọc roomCode. Bài kiểm tra còn yếu như F08, cần cải thiện. |
| Non-host start_game không ack | Đã trả lỗi rõ, socket test qua. |
| Mặt xúc xắc lặp số | Đã đổi phép chọn sáu mặt/cặp đối diện; kiểm tra code thấy đã xử lý trường hợp v=1–6. |
| Checkbox quỹ nói cả tiền phạt | Lời UI đổi thành chỉ gom tiền thuế, khớp cách thu hiện tại. |
| Bố cục bàn kiểu Business Tour | Đã thay sidebar thường trực bằng bàn full viewport, HUD góc, dock và drawer. Đây là cải thiện thật ở desktop; mobile bị F03. |
| Công trình lớn hơn | Geometry cottage/townhouse/villa/landmark đã tăng; chưa có bộ ảnh đông nhà đủ cả bốn cấp để nghiệm thu mỹ thuật. |
| Camera isometric/orthographic | Vẫn PerspectiveCamera và helper góc cũ; full viewport giúp bàn lớn hơn nhưng phối cảnh chưa đổi như hướng V7 đề xuất. |
| Giá mua/định giá/buyout L03 | Công thức vẫn như trước; cần thống nhất cost basis hoặc giải thích replacement value. Không phát hiện sửa ở đây. |
| World Tour/Lost Island đúng cơ chế mới | Chưa thấy type/decision World Tour; map vẫn 40 ô, tù/go_to_jail theo ruleset cũ. |
| AFK/deadline và rulesetVersion/boardVersion | Chưa thấy triển khai. |
| Store/broadcast liên instance | Chưa có; MemoryRoomStore mới chỉ là bước tách interface. |

## 3. Kết quả kiểm tra thực tế và giới hạn

- UI local: desktop 1280×720, ván sáu người; Quick bốn người; mobile 390×844 cho cả hai. Đã lắc tới Phong Nha, chọn Biệt thự, preview và xác nhận. Thanh toán **15 triệu → 11,6 triệu**, tiền thuê hiển thị **4,5 triệu**, đúng bảng của dự án.
- Console browser cuối kiểm tra không có error/warn được ghi nhận. Điều này không loại trừ lỗi bố cục hoặc endpoint chưa được gọi trong phiên local.
- [Ảnh desktop bốn người](docs/review-v8-2026-11-07/desktop-four.jpg), [sáu người](docs/review-v8-2026-11-07/desktop-six.jpg), [mobile bốn người](docs/review-v8-2026-11-07/mobile-four.jpg), [mobile sáu người](docs/review-v8-2026-11-07/mobile-six.jpg). Panel trắng ngoài game do môi trường trình duyệt, không quy thành lỗi game; F03 dựa thêm hit-test DOM và tọa độ phần tử game.
- [Probe và kết quả lỗi mới](docs/review-v8-2026-11-07/audit-results.json), [script tái hiện](docs/review-v8-2026-11-07/audit-repros.mjs). Script assert hành vi lỗi hiện tại, không đưa nó vào bộ test chấp nhận sau sửa mà giữ nguyên kỳ vọng.
- `npm test`: **69 qua**, gồm 3 test V7 mới. `npm run build`: **qua**, JS chính 410,47 kB, gzip 125,70 kB; Board3D 564,53 kB, gzip 142,29 kB. Còn cảnh báo chunk 3D >500 kB.
- Chưa deploy phiên bản mới, chưa thử hai thiết bị hai mạng trên bản mới, chưa có Redis/multi-instance production để nghiệm thu.

## 4. Link Vercel hiện tại

Kiểm tra read-only lúc **15:40 ngày 07/11/2026 giờ Việt Nam**: [trang public](https://monopoly-silk-ten.vercel.app) vẫn tải asset `index-BarhytB4.js`; `/api/health` và path realtime mới trả HTML SPA. WebSocket ở cả `/socket.io` và `/api/realtime/socket.io` đều thất bại. [Kết quả HTTP/socket](docs/review-v8-2026-11-07/public-check.json).

Không dùng trạng thái public cũ để đánh giá giao diện mới đã thấy tại localhost; đồng thời không coi file health/API mới trong workspace là đã chạy trên public. `api/health.js` hiện trả `status:ok` tĩnh, protocol `websocket`, trong khi server health dùng `actions-v1`: nên thống nhất protocol và tách readiness của store/realtime khỏi tình trạng endpoint HTTP sống.

## 5. Thứ tự sửa đề xuất cho Anti

1. **F03:** bố cục mobile bấm được và desktop sáu người không che pill/camera controls.
2. **F01 + F02:** entry upgrade đúng, path/transport thống nhất, shared state + atomic write + broadcast + reconnect. Không báo “deploy Vercel hoàn chỉnh” trước các bài nghiệm thu V7/V05.
3. **F04 + F05 + F06:** phục hồi preview, sửa hợp đồng token, hoàn thiện validator trade theo phase.
4. **F07/F08:** sửa thống kê/màu và thêm test có đối chứng, không chỉ chờ không thấy event.
5. Tiếp tục mục tiêu mỹ thuật và cơ chế V7: camera, chữ/nhà/nhân vật, World Tour, đảo hoang, deadline và bộ luật có version.

**Đánh giá:** bản này đã đi đúng hướng hình ảnh hơn V6 và xử lý được các lỗi cụ thể, nhưng còn blocker mobile và online. Chưa đạt mức “giống Business Tour hoàn chỉnh”, chưa sẵn sàng kết luận public multiplayer hoạt động ổn.
