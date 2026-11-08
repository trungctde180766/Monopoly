# Review V12 — bản mới sau các sửa chữa V11

Ngày 07/11/2026, kiểm tra khoảng 17:26 giờ Việt Nam. Review source hiện tại trong workspace trên nền `b9b9621`; không sửa game, commit, push hay deploy. Chỉ bổ sung review và probe cô lập.

## Kết luận

**Đã sửa được ba ca lỗi cụ thể của V11 ở môi trường cùng máy: phát sự kiện giữa process, hai atomicUpdate cạnh tranh, và resume sau khi có action. Tuy nhiên còn 3 vấn đề P1 và 2 vấn đề P2 dưới đây. Chưa đủ để xác nhận online ổn định trên Vercel.**

- **80/80 bài test qua:** 23 bài nền và 57 bài Node runner, exit 0.
- Build thành công: `index-BMAjP3NU.js` 412,73 kB; Board3D 564,55 kB trước gzip, còn cảnh báo chunk lớn.
- `git diff --check` qua.
- Probe mới xác nhận: giao dịch vẫn có thể mất vì đi ngoài khóa; hai socket trên hai process cùng giữ quyền của một người; conflict có thể để lại snapshot chưa commit; default entry còn lỗi kết nối đầu.
- Link public lúc **17:26 ngày 07/11/2026** vẫn trả HTML cho health và không kết nối WebSocket. Bundle public khác local.

## Những điểm đã sửa được — không yêu cầu sửa lại theo mô tả lỗi cũ

| V11 | Kết quả ở bản này |
| --- | --- |
| N01: thiếu game_started/chat/trade giữa hai process | Có `broadcast()` và watcher thư mục events; bài test hai process thật xác nhận guest nhận start/chat/offer và host nhận response. Đây là thử nghiệm dùng chung filesystem. |
| N01: guest có snapshot nhưng không vào màn chơi | Controller có khởi tạo ván từ `room_updated` khi phòng đang playing; đã thay đổi luồng hydrate. Chưa kiểm tra lại bằng trình duyệt trong vòng này. |
| N02: hai atomicUpdate cùng revision cùng thành công | Đã thêm file lock và kiểm revision lần nữa trong lock. Bài test dùng hai child process và barrier từ V11 qua: một success, một conflict. R01 bên dưới là đường ghi khác chưa dùng khóa. |
| N05: action làm mất map timer rồi resume vẫn bị loại | Deserialize giữ map timer; thêm bảng timer theo room/player; callback đọc room mới và kiểm connected. Test disconnect → host action → resume trước hạn → qua hạn còn trong phòng đã qua. |
| N03: thiếu server được khởi tạo sẵn | Đã thêm named export `server`. Probe xác nhận kết nối đầu trực tiếp tới server này thành công. Default export vẫn là handler cũ, xem R02. |

## R01 — P1: khóa chỉ bảo vệ atomicUpdate; lưu giao dịch vẫn có thể bị ghi đè

**Vị trí:** `server/roomStore.js:358–401`, `:308–318`; `server/index.js:415–420`; `recordProcessed()` ở `server/roomStore.js:150–164`.

`atomicUpdate()` đã khóa trước khi kiểm revision lần cuối và ghi. Tuy nhiên `respond_trade_offer` vẫn gọi `applySessionTrade()` rồi `rooms.set()` trực tiếp. `set()` không lấy khóa và không kiểm revision. Các đường resume/leave/pending offer/ghi replay cũng chưa nằm chung một transaction với game action.

**Probe hai process đã chạy:**

1. Process A xử lý thế chấp ô 3 ở revision 0. Sau khi production code đã lấy khóa và kiểm revision, fixture chỉ tạm dừng ngay trước bước ghi để điều khiển lịch chạy.
2. Process B thực hiện đúng chuỗi reducer/lưu của handler trade: chuyển 1 triệu từ A sang B rồi gọi `set()`. Việc ghi đi xuyên qua khóa đang tồn tại; đọc file mới thấy người nhận có **16 triệu**, revision 1.
3. Cho process A ghi tiếp. Lệnh thế chấp trả success, revision 1. File cuối giữ thế chấp nhưng người nhận trở về **15 triệu**: mất giao dịch vừa được lưu.

**Giới hạn bằng chứng:** probe này dùng store/reducer production và hai process, có barrier tại bước persist; không tuyên bố đã chạy một cuộc đua trade đồng thời hoàn chỉnh qua Socket.IO. Đường gọi trực tiếp `set()` trong handler đã được đối chiếu riêng ở các dòng trên.

**Cần sửa:** dùng một cơ chế commit chung cho mọi thay đổi cùng phòng, gồm trade, game action, resume/leave/forfeit, pending offers và kết quả request. Kiểm version của dữ liệu thực sự được ghi, bảo toàn metadata của phòng; không chỉ kiểm game revision rồi ghi đè cả room. State và idempotency phải commit cùng nhau, chỉ ACK/broadcast sau commit thành công. Không nuốt lỗi ghi rồi báo success.

**Nghiệm thu:** action cạnh tranh với accept trade; action cạnh tranh với resume/leave; retry sang process khác. Mỗi thao tác hoặc commit hợp lệ, hoặc bị từ chối rõ ràng; không có mutation đã ACK thành công rồi biến mất. Tiếp tục giữ test hai atomicUpdate đã sửa.

## R03 — P1: hai process cùng cho một người giữ hai phiên; phiên cũ rời làm phiên mới mất người chơi

**Vị trí:** `server/index.js:225–251`, đặc biệt kiểm tra `io.sockets.sockets.get(...)` ở `:228`; `leaveRoom()` và các handler dùng `socket.playerId`.

Kiểm tra “phiên đang mở ở kết nối khác” chỉ nhìn socket của process hiện tại. B không nhìn thấy socket đang connected ở A nên cho resume cùng logical player. Sau đó A vẫn giữ quyền gửi sự kiện; chưa có kiểm tra quyền sở hữu phiên hiện tại trên từng lệnh/rời phòng.

**Đã thử qua Socket.IO với hai Node process thật, ván đã bắt đầu:**

1. Chủ phòng đang connected ở A; có guest và game status playing.
2. Một socket ở B dùng chính resume token của chủ phòng → resume success, cùng `playerId`; socket A vẫn connected.
3. Cả socket cũ A và mới B đều gửi chat thành công dưới cùng người chơi.
4. Socket cũ A gửi `leave_room` → người chơi bị loại khỏi room. Socket B còn connected nhưng gửi chat bị từ chối vì không còn membership.

Không dùng token đánh cắp hoặc giả mạo; dùng token ứng dụng trả cho chính người tạo phòng. Trường hợp này có thể xảy ra khi đổi tab/kết nối trong lúc chuyển instance hoặc khi hai phiên trùng nhau.

**Cần sửa:** quản lý session ownership/presence trong kho chung với session ID hoặc generation. Chọn rõ chính sách từ chối phiên mới hoặc chuyển quyền sang phiên mới. Nếu chuyển quyền, vô hiệu hóa socket cũ trên toàn cụm; mọi action/leave/disconnect/timeout phải kiểm lại phiên nào đang có quyền. Socket đã mất quyền không được xóa logical player hoặc ghi connected=false cho phiên mới.

**Nghiệm thu:** resume trên B khi A còn connected; A rời hoặc disconnect muộn; B vẫn tiếp tục đúng theo chính sách đã chọn. Kiểm tra đồng thời cả action và timer hết hạn, không chỉ chat hoặc resume ACK.

## R05 — P1: kho state và event bus vẫn là filesystem local, chưa đáp ứng nhiều Vercel instance

**Vị trí:** `server/roomStore.js`, constructor dùng `os.tmpdir()/cotyphu_shared_rooms`, `eventsDir`, `_initWatcher()` và `broadcast():256–265`.

Bản mới mở rộng file store thành event bus bằng JSON trong thư mục `events`. Nó đã sửa các ca phát sự kiện giữa process dùng chung ổ file, nhưng chưa bổ sung datastore hoặc kênh sự kiện ngoài instance. Probe hai store dùng hai filesystem root riêng vẫn xác nhận B không đọc được phòng A.

Vercel hỗ trợ WebSocket; kết nối mới có thể vào instance khác. Tài liệu yêu cầu kho ngoài cho state/presence/rooms/pub-sub, và mô tả `/tmp` là scratch space. Có thể tiếp tục dùng Vercel cho FE/API, nhưng file watcher không chứng minh khả năng đồng bộ giữa các instance. [WebSocket Vercel](https://vercel.com/docs/functions/websockets#manage-persistent-state), [filesystem runtime](https://vercel.com/docs/functions/runtimes#file-system-support).

**Cần sửa:** triển khai RoomStore có giao dịch/CAS trong datastore chung, cùng cơ chế phân phối sự kiện phù hợp. Lưu resume/session, deadline, state và request result ở đó. Giữ file store làm lựa chọn local nếu cần. Test tách filesystem và restart backend là bắt buộc; test hai process chung temp chưa thay thế được chúng.

**Nghiệm thu:** hai backend không chung ổ dữ liệu vẫn tạo/join/start/chơi/chat/trade/resume đúng; restart một backend giữ nguyên dữ liệu đã xác nhận. Sau đó thử deployment mới bằng hai thiết bị trên hai mạng khác nhau.

## R02 — P2: server export mới hoạt động, nhưng default API entry vẫn lỗi WebSocket lần đầu

**Vị trí:** `api/realtime.js:44–49`; test `test/reviewV9.test.js:29–32` vẫn tự gọi `attachServer(wrapper)`.

Đã thêm `export const server = getSharedApp().httpServer`, nhưng default export vẫn là handler chỉ gắn upgrade khi có HTTP request với `res.socket.server`.

**Đã so sánh hai đường khởi tạo:**

| Entry thử tại local | Kết quả |
| --- | --- |
| HTTP wrapper gọi default handler, chưa warmup | WebSocket đầu thất bại |
| Cùng wrapper sau HTTP warmup | Kết nối được |
| Listen trực tiếp named export `server` đã khởi tạo | WebSocket đầu thành công |

Đây là mô phỏng local, không phải phép đo Vercel runtime của deployment mới. Named export hoạt động không tự chứng minh runtime đang sử dụng nó làm entry. Ví dụ chính thức dùng HTTP server đã gắn Socket.IO làm default export; cần đấu entry và path theo hợp đồng được hỗ trợ. [Ví dụ Vercel](https://vercel.com/docs/functions/websockets#set-up-a-websocket-endpoint).

**Cần sửa:** thống nhất một entry production thực sự được deploy, đường dẫn rewrite và transport; test chính entry đó, không bổ sung bootstrap trong fixture để che bước thiếu. Client Vercel theo cấu hình WebSocket của ví dụ chính thức.

**Nghiệm thu:** deployment lạnh, không HTTP warmup, client kết nối ngay thành công; mất kết nối rồi resume giữ danh tính và state. Xác nhận bằng deployment mới thay vì suy từ một named export local.

## R04 — P2: CAS trả conflict nhưng object cache đã chứa mutation thua, handler phát sai snapshot

**Vị trí:** `server/roomStore.js:365–377`, `:385–394`; `server/index.js:356–358`.

`atomicUpdate()` lấy object room trực tiếp từ cache rồi gọi mutator trước khi lấy lock. Mutator thay `room.gameState`. Nếu CAS cuối bị từ chối, object mà handler giữ từ đầu vẫn chứa mutation chưa commit. Nhánh catch lại emit chính `room.gameState` đó để đồng bộ client.

**Đã dựng thứ tự cạnh tranh ở tầng store:**

- A đang chuẩn bị thế chấp ô 3 từ revision 0; trong khoảng đọc → commit, B commit thế chấp ga 5 thành revision 1.
- A nhận conflict đúng.
- Object mà handler A giữ: revision 1, **ô 3** thế chấp.
- Snapshot đọc mới từ disk: revision 1, **ga 5** thế chấp.

Như vậy cùng revision có hai nội dung khác nhau. Nhánh catch có thể phát mutation đã bị từ chối như snapshot authoritative, trước hoặc sau sự kiện cập nhật từ watcher. Không khẳng định lỗi này ghi mutation thua xuống disk; probe xác nhận object dùng cho response sai. Chưa chạy cuộc đua UI/network hoặc chụp ảnh cho ca này.

**Cần sửa:** reducer/mutator làm trên bản sao độc lập, chỉ thay cache khi commit thành công. Khi conflict, đọc lại snapshot đã commit và phát snapshot đó với revision hiện tại; không dùng object bị mutate trước CAS. Đưa current revision/snapshot vào phản hồi conflict phù hợp với client.

**Nghiệm thu:** lệnh thua không làm đổi cache; snapshot gửi cho bên thua khớp dữ liệu commit, cùng revision phải cùng nội dung. Không chỉ assert `conflict === true` và kiểm file cuối.

## Link public và phạm vi triển khai

Kiểm tra chỉ đọc [link Vercel hiện tại](https://monopoly-silk-ten.vercel.app), lúc **17:26 ngày 07/11/2026**, không tạo phòng public:

| Kiểm tra | Kết quả |
| --- | --- |
| Trang chủ | HTTP 200, `/assets/index-BarhytB4.js` |
| `/api/health` | HTTP 200, `text/html`, nội dung trang chủ; chưa phải JSON health |
| `/socket.io`, WebSocket trực tiếp | Thất bại: `websocket error` |
| Build local vòng này | `/assets/index-BMAjP3NU.js`, khác bundle public |

**Chưa xác nhận bản local mới đã lên deployment này hoặc người ở nơi khác có thể chơi online qua link.** Probe không xác định cấu hình nội bộ hay nguyên nhân chính xác của deployment cũ. Sau khi sửa backend, cần deploy đúng source rồi kiểm lại API, transport và luồng hai người đầy đủ. Vòng review này không deploy.

## Giao diện, mua nhà và Business Tour

Các thay đổi so với snapshot V11 nằm ở `package.json`, `api/realtime.js`, `server/index.js`, `server/roomStore.js`, `src/hooks/useGameController.js`, cùng test V11 mới. Controller thay đổi việc vào màn chơi; các file layout/CSS/Board3D và engine mua/xây đã lưu hash vẫn trùng V11.

- Luật mua/xây hiện có tiếp tục qua test: chặn Landmark lần mua đầu, cho nâng đúng lần ghé/cơ hội, chặn xây từ xa và xây đất người khác. Chưa thấy thay đổi mới về quy tắc mua nhà trong đợt này.
- Chưa có nâng cấp hình ảnh được chứng minh so với V11; thay đổi tên bundle main đến từ controller, không phải bằng chứng bàn chơi đã giống ảnh tham chiếu hơn. Không thực hiện lại kiểm tra ảnh trình duyệt trong vòng này.
- Mức hoàn thiện Business Tour vẫn là backlog trước: mô hình nhà/quân cờ dễ phân biệt, tên và giá ô rõ ở camera mặc định, footprint nhà không che số, nhịp animation mượt, hoàn thiện World Tour nếu tiếp tục mục tiêu tính năng đó.

Đối với UI, yêu cầu lần sửa tiếp có ảnh trước/sau cùng viewport và cùng trạng thái bàn, kèm thử thao tác mua đất → chọn cấp → xác nhận → nhà xuất hiện đúng ô → xem tiền thuê. Không dùng test engine qua để kết luận hình ảnh hoặc trải nghiệm đã đạt Business Tour.

## Thứ tự làm tiếp cho Anti

1. **R05 + R01:** chọn kho dùng chung và một đường commit nguyên tử cho tất cả mutation; hoàn tất đường accept trade và idempotency cùng transaction.
2. **R03:** ownership của phiên xuyên instance; vô hiệu hóa quyền của socket cũ và chống callback cũ loại người vừa resume.
3. **R04:** clone trước mutate, chỉ công bố snapshot đã commit; thêm test dữ liệu bên thua nhận được khi conflict.
4. **R02 + deployment:** dùng đúng entry, kiểm kết nối đầu trên cold deployment, health JSON và hai thiết bị/hai mạng.
5. **UI:** tách một lượt chỉnh hình ảnh có ảnh nghiệm thu; giữ các luật mua/xây đã qua test.

Theo dõi thêm cho file store local: mỗi broadcast đang tạo một JSON và thêm ID vào `seenEvents`, chưa thấy cơ chế dọn/giới hạn. Nếu tiếp tục dùng khi phát triển lâu dài cần retention; đây là hạng mục phụ, không thay thế việc hoàn tất kho chung.

## Bằng chứng và chạy lại

Thư mục `docs/review-v12-2026-11-07/` chứa:

- `audit-repros.mjs`, `commit-worker.mjs`: các probe R01–R05; barrier chỉ điều khiển thứ tự chạy tại điểm đã mô tả.
- `audit-results.json`: kết quả thực tế kèm timestamp UTC và giới hạn từng probe.
- `public-probe.mjs`, `public-results.json`: kiểm tra public chỉ đọc.
- `source-hashes.json`: snapshot 19 file để đối chiếu vòng tiếp theo.

```powershell
rtk npm test
rtk npm run build
rtk proxy node docs/review-v12-2026-11-07/audit-repros.mjs
rtk proxy node docs/review-v12-2026-11-07/public-probe.mjs
```

Assertion của diagnostic cố ý tái hiện lỗi V12. Exit 0 nghĩa là tái hiện đúng như báo cáo, **không phải nghiệm thu game đã đúng**. Sau khi sửa cần chuyển thành regression test kỳ vọng hành vi đúng. Probe dùng scratch riêng, đóng socket/process và kiểm đường dẫn trước khi dọn dữ liệu tạm của chính nó; không sử dụng phòng thật.
