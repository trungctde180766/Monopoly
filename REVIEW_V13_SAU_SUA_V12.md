# Review V13 — bản sửa sau V12

Ngày **08/11/2026**, kiểm tra khoảng **08:46 giờ Việt Nam**. Review source trong workspace, trên nền commit `b9b9621`. Chỉ thêm tài liệu và probe; không sửa game, commit, push hay deploy.

## Kết luận

**Có tiến triển về commit giao dịch, snapshot khi conflict và chặn quyền phiên cũ. Tuy nhiên còn 2 vấn đề P1 và 2 vấn đề P2 được tái hiện dưới đây. Chưa thể xác nhận chơi online nhiều instance trên Vercel đã hoàn chỉnh.**

- `npm test`: **85/85 qua**, gồm 23 bài nền và 62 bài Node runner, exit 0.
- `npm run build`: thành công. Main `index-BMAjP3NU.js` 412,73 kB; Board3D 564,55 kB trước gzip, còn cảnh báo chunk lớn.
- `git diff --check`: qua.
- Probe bổ sung: hai process thật cho kho external, Socket.IO thật cho quyền phiên cũ và chat trùng; store interleaving cho ghi lùi revision. Giới hạn của từng probe được ghi rõ.
- Public lúc 08:46 ngày 08/11: health vẫn trả HTML, WebSocket thất bại, bundle khác local.

## Những điểm V12 đã sửa được

| Hạng mục | Kết quả vòng này |
| --- | --- |
| Trade đi qua `set()` trực tiếp | `send_trade_offer` và `respond_trade_offer` đã dùng `atomicUpdate`; test từ chối trade ở revision cũ qua. Lỗi ghi snapshot cũ từ metadata còn ở C02. |
| Replay result ghi sau state | Đã ghi result vào `r.processedRequests` ngay trong mutator của game action. Vẫn có lệnh `recordProcessed` bổ sung sau commit; cần rà soát trong đường commit chung. |
| CAS thua làm bẩn object room của handler | Có clone trước mutate và nạp lại disk state khi conflict; handler đọc lại room mới để trả snapshot. Bài test cụ thể của V12 đã qua. |
| Phiên cũ gửi chat/action và rời làm mất phiên mới | Có `activeSessions`, `sessionId`, kiểm tra trong chat/action/trade và `leaveRoom`; bài test hai process của V12 qua. Ready/start còn thiếu kiểm tra ở C03. |
| Entry cold-start | Bài test listen trực tiếp default export và kết nối đầu qua. Default mới là Proxy của function, xem giới hạn nghiệm thu entry ở phần riêng. |

## C01 — P1: ExternalRoomStore mới vẫn dùng Map trong RAM, chưa kết nối datastore bên ngoài

**Vị trí:** `server/roomStore.js:435–453`, các phương thức get/set/atomicUpdate và `:624`; `test/reviewV12.test.js`, test R05.

Class đọc `endpoint` từ options hoặc tên biến Redis nhưng chỉ lưu vào thuộc tính. Backend storage thực tế mặc định là `static sharedAdapter = new Map()` và bus là `static sharedBus = new EventEmitter()`. Chưa có đoạn tạo client, gọi Redis, transaction server-side hoặc kênh sự kiện liên máy.

Ngoài ra, `defaultRoomStore` vẫn luôn là `new SharedRoomStore()`. Cấu hình endpoint hiện chưa tự chọn adapter external cho server production.

**Đã thử hai process độc lập:**

1. Process A tạo `ExternalRoomStore`, truyền endpoint fixture, ghi phòng `EXTV13` → A thấy phòng.
2. Process A kết thúc.
3. Process B mới tạo `ExternalRoomStore` cùng endpoint → **không thấy phòng**.
4. Cả hai báo storage class `Map`, default store class `SharedRoomStore`.

Endpoint fixture là địa chỉ loopback không cung cấp Redis. Class vẫn ghi thành công vì endpoint chưa được dùng để kết nối. Probe này kiểm tra implementation hiện tại, không phải kiểm tra một Redis server thật.

Test R05 mới truyền **cùng object Map và cùng EventEmitter** cho nhiều store trong một process, rồi tạo lại object store trong khi Map vẫn sống. Nó kiểm tra chia sẻ object trong RAM; chưa kiểm tra process restart, hai máy hoặc mất dữ liệu khi tiến trình chết.

**Cần thực hiện:**

- Triển khai adapter thật cho datastore đã chọn, cùng CAS/transaction và event transport phù hợp.
- Nếu client datastore dùng Promise, chuyển interface và các handler sang async/await đầy đủ; không thay Map bằng client async rồi giữ cách gọi đồng bộ hiện tại.
- Chọn adapter rõ ràng từ cấu hình production. Cấu hình external thiếu/sai phải báo lỗi rõ; không mặc nhiên chạy RAM/file và trả success như đã lưu bền vững.
- State, resume/session, deadline, request result và phân phối sự kiện phải hoạt động xuyên instance. Tầng broadcast không tự cung cấp transaction game state.

**Nghiệm thu:** hai backend riêng process, riêng filesystem, dùng chung datastore thật; tạo/join/start/roll/mua/chat/trade/resume thành công. Dừng hẳn process tạo phòng, khởi động process mới vẫn đọc đúng dữ liệu đã commit. Chạy thêm hai request cạnh tranh cùng revision, chỉ một commit thắng.

Vercel hỗ trợ WebSocket; tài liệu yêu cầu kho ngoài cho state/presence/rooms/pub-sub vì kết nối mới có thể đến instance khác. Có thể tiếp tục dùng Vercel, nhưng lớp Map mới chưa đáp ứng yêu cầu này. [Tài liệu Vercel](https://vercel.com/docs/functions/websockets#manage-persistent-state).

## C02 — P1: set() có khóa nhưng vẫn ghi đè snapshot cũ, làm revision từ 1 lùi về 0

**Vị trí:** `server/roomStore.js:310–331`; đường resume `server/index.js:294–301`; các đường cập nhật toàn room bằng `rooms.set()`.

Khóa hiện tuần tự hóa **bước ghi**, nhưng `set()` không đọc lại room mới hoặc kiểm version của snapshot đầu vào. Một room đã đọc trước commit của người khác vẫn có thể ghi đè cả gameState sau khi lấy khóa.

**Probe store đã tái hiện:**

1. Store B đọc room revision 0, giữ snapshot để cập nhật connection/session.
2. Store A `atomicUpdate` thế chấp ô 3, commit revision 1 thành công.
3. B cập nhật `connections` và `activeSessions` trên snapshot cũ, rồi gọi `set()` — cùng kiểu lưu mà `resume_room` đang dùng.
4. Store mới đọc file cuối: **revision 0**, mất thế chấp ô 3; metadata session mới vẫn được lưu.

Đây là interleaving có chủ đích ở tầng store, không phải một cuộc đua resume qua mạng đã được quay/chụp. Kết quả xác nhận khóa ghi chưa ngăn stale snapshot rollback. Bài trade revision cũ qua không bao phủ đường metadata này.

**Cần thực hiện:** cập nhật metadata bằng transaction/conditional patch trên room mới nhất; so `room.version` hoặc version phù hợp với toàn bộ dữ liệu được ghi. Đưa resume/ready/start/leave/forfeit và cập nhật request result vào cơ chế chung. Không cho `set()` công khai ghi đè toàn room cũ mà thiếu expected version; khởi tạo room mới cần thao tác tạo có điều kiện riêng.

**Nghiệm thu:** đọc metadata ở phiên bản cũ → commit game action → cập nhật metadata; action phải được bảo toàn hoặc metadata bị conflict để thử lại trên snapshot mới. Revision game không được giảm. Lặp lại với hai process thật và các ca resume/leave/forfeit cạnh tranh action.

## C03 — P2: phiên đã bị thay thế vẫn được toggle_ready và start_game

**Vị trí:** `server/index.js:314–328`, `:331–358`; helper `isActiveSession` đã có nhưng chưa dùng trong hai handler này.

Chặn phiên cũ đã áp dụng cho chat, game_action và trade. Hai hành động phòng chờ vẫn chỉ dựa vào player ID/host ID, nên socket cũ còn điều khiển phòng được sau khi quyền đã chuyển sang socket mới.

**Đã chạy qua Socket.IO thật, cùng một server:**

1. Host và guest tạo/join phòng.
2. Host mới và guest mới resume bằng token của chính họ, thay thế hai socket cũ.
3. Host cũ gửi chat → bị từ chối đúng; gửi game_action sau khi bắt đầu → cũng bị từ chối đúng.
4. Guest cũ gửi `toggle_ready` → **success, ready=true**.
5. Host cũ gửi `start_game` → **success**, phòng chuyển sang chơi.

Người dùng đang ở tab/cửa sổ mới có thể bị phiên cũ thay đổi trạng thái phòng hoặc bắt đầu ván ngoài ý muốn.

**Cần thực hiện:** dùng chung kiểm tra membership + session ownership cho mọi lệnh điều khiển phòng, gồm ready/start. Kiểm trạng thái phòng phù hợp trước mutation. Client nên xử lý `session_superseded` bằng thông báo và khóa thao tác để người dùng biết quyền đã chuyển; server vẫn là nơi bắt buộc từ chối phiên cũ.

**Nghiệm thu:** sau takeover, phiên cũ không ready/start/chat/action/trade được; leave/disconnect của phiên cũ không ảnh hưởng logical player. Phiên mới vẫn thực hiện các thao tác hợp lệ. Có ca cùng instance và khác instance.

## C04 — P2: ExternalRoomStore phát một sự kiện hai lần tới client cùng instance

**Vị trí:** `server/roomStore.js:447–453` và `:516–520`.

`broadcast()` emit trực tiếp `broadcast_event`, rồi gọi `bus.emit('event')`. Chính store gửi cũng đăng ký `_onBusEvent` trên bus; listener đó lại emit `broadcast_event` lần nữa. Chưa có bỏ qua nguồn gửi hoặc dedupe theo event ID.

**Đã thử Socket.IO với server được cấu hình ExternalRoomStore như test mới:** host gửi một tin `one-message-v13`, ACK success; guest nhận **2** `chat_received` cho cùng lần gửi.

Lỗi này áp dụng khi dùng adapter External mới, chưa phải đường default file store. Các sự kiện khác dùng cùng broadcast, gồm start và trade response, cũng cần được kiểm tra số lần nhận. Controller hiện reset khi nhận game_started, nên cần tránh phát lặp và xử lý start theo cách gọi lại vẫn an toàn.

**Cần thực hiện:** chọn một đường fan-out cho process gửi; dùng source ID/event ID và dedupe khi nhận lại từ bus. Thiết kế client chịu được sự kiện lặp hoặc đến muộn ở các hành động quan trọng.

**Nghiệm thu:** một send tạo đúng một dòng chat trên từng client của process gửi và process khác. Kiểm start, offer và response; phát lại event ID cũ không reset ván, xóa chat hoặc áp dụng lại thay đổi.

## Entry Vercel: test local qua, cần xác nhận hợp đồng runtime thực tế

`api/realtime.js:63–80` tạo Proxy của `handler`, chuyển tiếp thuộc tính/method sang HTTP server và đổi `getPrototypeOf`.

Probe xác nhận đồng thời:

| Biểu thức | Kết quả |
| --- | --- |
| `typeof api.default` | `function` |
| `api.default instanceof http.Server` | `true`, nhờ Proxy |
| `api.default === api.server` | `false` |

Bài test listen trực tiếp default rồi kết nối lạnh đã qua. Tuy nhiên `instanceof` do Proxy trả về chưa chứng minh runtime Vercel nhận đúng loại entry hoặc sử dụng đúng listener. Ví dụ chính thức export HTTP server đã gắn Socket.IO trực tiếp. [Ví dụ entry Vercel](https://vercel.com/docs/functions/websockets#set-up-a-websocket-endpoint).

Khuyến nghị xuất server thật làm entry production và để named handler phục vụ test tương thích; cập nhật fixture dùng đúng entry cần kiểm. Sau đó xác nhận cold deployment thật, path rewrite, WebSocket và resume. **Vòng này chưa kết luận Proxy chắc chắn thất bại trên Vercel**, vì chưa triển khai bản mới vào runtime đó.

## Link public

Kiểm tra chỉ đọc [trang hiện tại](https://monopoly-silk-ten.vercel.app) lúc **08:46 ngày 08/11/2026**, không tạo phòng public:

| Kiểm tra | Kết quả |
| --- | --- |
| Trang chủ | HTTP 200, bundle `/assets/index-BarhytB4.js` |
| `/api/health` | HTTP 200 nhưng content-type HTML, nội dung trang chủ |
| Socket.IO `/socket.io`, WebSocket trực tiếp | Kết nối thất bại, `websocket error` |
| Build local | `/assets/index-BMAjP3NU.js`, khác public |

Chưa có bằng chứng bản local mới đã lên link này hoặc hai người ở hai nơi có thể chơi qua nó. Cần xác nhận deployment dùng đúng source và route API, health trả JSON, rồi thử luồng chơi hai thiết bị/hai mạng. Probe hiện tại không xác định nguyên nhân nội bộ của deployment cũ. Review này không deploy.

## Giao diện, mua nhà và Business Tour

So với V12, các file đã đối chiếu thay đổi ở package, API entry, server và room store, cùng test V12 mới. Controller/UI, engine mua/xây, CSS và Board3D được lưu hash vẫn giữ nguyên; các bundle frontend build ra cũng giống V12.

- Các test mua/xây tiếp tục qua: lần mua đầu chưa lên Landmark, nâng đúng cơ hội ghé lại, chặn xây từ xa/đất người khác. Đợt này chưa thêm cơ chế mua nhà mới.
- Chưa có thay đổi hình ảnh được chứng minh; không thể gọi bản này giống ảnh Business Tour hơn dựa trên sửa backend. Không thực hiện lại kiểm tra ảnh trình duyệt trong vòng này.
- Giữ mục tiêu UI trước: tên/giá ô rõ ở camera mặc định, nhà nằm đúng footprint và không che số, quân cờ dễ phân biệt, animation di chuyển/xây có nhịp; tính năng World Tour vẫn thuộc backlog nếu tiếp tục mục tiêu đó.

Lượt chỉnh UI tiếp theo cần ảnh trước/sau cùng camera, viewport và trạng thái bàn; thử mua đất → chọn cấp → xác nhận → nhà xuất hiện đúng ô → tiền/tiền thuê cập nhật rõ. Test engine không thay thế nghiệm thu hình ảnh.

## Thứ tự bàn giao cho Anti

1. **C01:** kết nối datastore/event transport thật và chọn adapter production rõ ràng; test process restart thực sự.
2. **C02:** một cơ chế commit cho state và metadata; chặn mọi đường ghi snapshot cũ làm giảm revision.
3. **C03:** áp dụng session ownership đồng nhất cho ready/start; bổ sung thông báo phiên bị thay thế ở client.
4. **C04:** sửa vòng tự nhận lại broadcast của ExternalRoomStore; kiểm đếm sự kiện trên từng client.
5. **Entry/deployment:** đơn giản hóa entry, kiểm cold deployment thật và xác nhận link public đang chạy đúng bản.
6. **UI:** thực hiện riêng một lượt chỉnh hình ảnh có ảnh nghiệm thu, giữ các luật mua/xây đã đúng.

## Bằng chứng và chạy lại

Thư mục `docs/review-v13-2026-11-08/`:

- `audit-repros.mjs`: C01–C04 và quan sát kiểu entry.
- `external-worker.mjs`: hai process độc lập cho C01.
- `audit-results.json`: kết quả đã chạy và phạm vi từng probe.
- `public-probe.mjs`, `public-results.json`: kiểm tra public chỉ đọc.
- `source-hashes.json`: snapshot 20 file để đối chiếu vòng sau.

```powershell
rtk npm test
rtk npm run build
rtk proxy node docs/review-v13-2026-11-08/audit-repros.mjs
rtk proxy node docs/review-v13-2026-11-08/public-probe.mjs
```

Diagnostic cố ý assert hành vi lỗi đã tái hiện; exit 0 nghĩa là tái hiện đúng báo cáo, không có nghĩa game đạt nghiệm thu. Sau khi sửa cần chuyển thành regression test kỳ vọng hành vi đúng. Probe dùng scratch riêng, đóng socket/process và kiểm đường dẫn trước khi dọn dữ liệu tạm của chính nó.
