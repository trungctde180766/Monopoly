# Review V11 — kiểm tra bản sửa sau V10

Ngày 07/11/2026, khoảng 17:10 giờ Việt Nam. Review workspace hiện tại trên nền commit `b9b9621`. Chỉ thêm tài liệu và probe chẩn đoán; không sửa game, commit, push hay deploy.

## Kết luận

**Có sửa được các lỗi của V10, nhưng chưa đủ để xác nhận chơi online ổn định trên Vercel.** Vẫn tái hiện được mất sự kiện giữa hai process, mất cập nhật khi xử lý đồng thời, và loại nhầm người đã kết nối lại. Kho phòng vẫn là file temp local. Lần kết nối WebSocket đầu qua default API entry cũng chưa được bảo đảm.

- `npm test`: **77/77 qua** — 23 bài nền và 54 bài Node runner; exit 0.
- `npm run build`: thành công; còn cảnh báo chunk Board3D 564,55 kB trước gzip.
- `git diff --check`: qua.
- Probe bổ sung đã chạy bằng Socket.IO thật, hai tiến trình Node thật và store/reducer hiện tại, không sửa mã production.
- Public Vercel được kiểm tra lại lúc **17:10 ngày 07/11/2026**: trang mở được, `/api/health` trả HTML, WebSocket `/socket.io` thất bại. **Chưa có bằng chứng bản local mới đã được triển khai lên link này.**

## Những điểm bản này đã sửa được

| Hạng mục V10 | Kết quả kiểm tra V11 |
| --- | --- |
| Accept trade không lưu file | Đã thêm `rooms.set`; bài Socket.IO kiểm tra store mới đọc được 14 triệu / 16 triệu, revision 1 đã qua. |
| Replay request khác actor/payload vẫn success | Đã kiểm tra membership, actor và chữ ký payload; các trường hợp từ chối trong test mới qua. |
| Thay toàn cục `http.Server.prototype.listen` | Đã bỏ. Probe độc lập xác nhận prototype giữ nguyên, HTTP server không liên quan không tự xuất hiện endpoint game. |
| Cache process A không thấy người ở B vào phòng | Đã thêm đọc lại file và watcher. Hai process cùng thư mục trên một máy: host nhận khách và start ACK thành công. Phần vào bàn còn lỗi N01 dưới đây. |
| Request revision cũ xử lý sau một request đã ghi xong | Đã đọc file trước khi kiểm revision; test tuần tự A xong rồi B gửi revision cũ qua. Chưa xử lý được race thật ở N02. |

## N01 — P1: khách ở process B vẫn kẹt phòng chờ, mất chat và đề nghị giao dịch

**Vị trí:** `server/index.js:32–35`, `:262–265`, `:355`, handler `send_chat`; phía client `src/hooks/useGameController.js:99–108`.

Watcher chỉ chuyển tiếp `room_updated` và `game_state_updated`. Các sự kiện `game_started`, `chat_received`, `trade_offer_received`, `trade_offer_responded` vẫn phát qua Socket.IO adapter trong RAM của process gửi.

**Đã thử với hai Node process thật, cùng ổ file:**

1. Host nối vào A, tạo phòng; khách nối vào B, join và ready.
2. Host A thấy 2 người và nhận `{success:true}` khi start.
3. Host nhận **1** `game_started`; khách nhận **0** `game_started`, dù đã nhận cập nhật game state qua watcher.
4. Host gửi chat và đề nghị tặng khách 1 triệu; cả hai ACK đều success. Khách B nhận **0** tin chat, **0** đề nghị.

Client chỉ đổi sang màn chơi trong handler `game_started`. `room_updated` chỉ cập nhật phòng; `game_state_updated` yêu cầu `gameRef.current` đã tồn tại nên không khởi tạo ván cho khách đang chờ. Do đó chỉ bổ sung watcher state chưa hoàn tất vòng đời online.

**Cần sửa:**

- Có kênh phát sự kiện giữa các instance, bao gồm cả sự kiện theo phòng và theo logical player. Dùng Socket.IO adapter/kênh pub-sub phù hợp với môi trường đã chọn; xác minh khả năng sử dụng của nhà cung cấp, không mặc định mọi Redis HTTP endpoint đều hỗ trợ subscription liên tục.
- Đồng bộ việc khởi tạo màn chơi từ snapshot có trạng thái `playing`, theo room/game ID và revision, theo cách gọi lại không reset ván đang chơi.
- Giữ kiểm tra phòng, danh tính và revision ở client khi nhận lại sự kiện; tránh áp dụng sự kiện của phòng cũ.

**Tiêu chí nghiệm thu:** host A + guest B cùng vào bàn; cả hai đi hết roll → mua/xây → đổi lượt; gửi/nhận chat và offer/response hai chiều. Phải xác nhận sự kiện và trạng thái trên **cả hai client**, không dừng ở ACK của người gửi.

## N02 — P1: atomicUpdate vẫn không nguyên tử, hai process có thể cùng ghi revision 1

**Vị trí:** `server/roomStore.js:287–323`; đặc biệt đọc file ở `:297–299`, so revision ở `:307–315`, ghi ở `:322`. `set()` ghi đè JSON và nuốt lỗi ghi.

Đọc mới trước khi so revision sửa được trường hợp request đến tuần tự. Khoảng giữa kiểm revision và ghi vẫn không có transaction hoặc khóa giữa các process.

**Đã tái hiện race bằng hai child process thật:** fixture A sở hữu ô 3 và ga 5, revision 0. Barrier của probe cho hai process cùng đọc/kiểm revision 0 trước khi cho phép ghi. Cả hai dùng store và reducer production nguyên trạng.

| Lệnh | Kết quả trả về |
| --- | --- |
| Process 1 thế chấp ô 3, expected revision 0 | success, revision 1 |
| Process 2 thế chấp ga 5, expected revision 0 | success, revision 1 |
| Đọc lại dữ liệu cuối | revision 1, chỉ ga 5 thế chấp; mất một mutation đã được chấp nhận |

Ô bị mất có thể đổi theo thứ tự ghi. Lỗi nằm ở việc cả hai cùng được chấp nhận, không phụ thuộc ô nào ghi cuối.

Test `test/reviewV10.test.js:56–68` gọi A hoàn tất rồi mới gọi B; chưa phải thực thi cạnh tranh.

**Cần sửa:** commit state bằng CAS/transaction tại nguồn dữ liệu chung theo room ID + expected revision. Cùng transaction phải ghi kết quả idempotency của request. Các mutation trade/leave/forfeit cũng phải đi qua đường commit này. Chỉ ACK success sau khi lưu thành công; lỗi lưu không được bị bỏ qua.

**Tiêu chí nghiệm thu:** cho hai process cùng vượt tới điểm cạnh tranh revision 0; đúng một commit thắng, bên còn lại nhận conflict và snapshot mới. Không có hai success cho cùng một bước revision; retry cùng request không tạo thêm mutation, kể cả sau restart.

## N05 — P1: người đã resume thành công vẫn bị timer cũ loại khỏi ván

**Vị trí:** `server/roomStore.js:45` tạo lại `disconnectTimers`; `:297–299` deserialize room khi atomicUpdate; `server/index.js:91–97` giữ timer/room cũ, `:200–201` hủy timer khi resume.

`atomicUpdate()` đọc file thành object room mới, có `disconnectTimers` rỗng. Nó thay room trong cache, trong khi timer mất kết nối vẫn đang chạy và closure giữ room cũ. Khi người chơi resume, map mới không chứa timer cần hủy. Timer cũ hết hạn vẫn gọi `removeRoomPlayer()` trên object cũ và có thể ghi đè snapshot mới.

**Đã chạy qua Socket.IO trên một server:**

1. Hai người bắt đầu ván; guest mất kết nối → map có 1 timer.
2. Host roll hợp lệ → map trên room hiện tại còn 0 timer.
3. Guest kết nối lại bằng resume token → ACK success.
4. Đến hạn timer cũ → guest bị xóa khỏi room, dù socket mới vẫn đang connected.

Probe rút riêng thời gian grace từ **60.000 ms xuống 900 ms** để chạy nhanh; không thay handler/store/reducer. Kết quả không phải phép đo chờ đủ 60 giây trên production.

**Cần sửa:** quản lý deadline mất kết nối và phiên kết nối trong state/presence chung. Tác vụ hết hạn phải đọc state mới, kiểm lại phiên/deadline và tình trạng kết nối, rồi forfeit có điều kiện trong transaction. Không dùng room snapshot cũ trong closure để ghi đè. Giữ lại map timer chỉ là bước sửa cho local, chưa giải quyết resume sang instance khác.

**Tiêu chí nghiệm thu:** disconnect → người khác thực hiện action → resume trước hạn → qua hạn vẫn còn trong ván. Lặp lại với resume sang process B. Nếu không resume, hết hạn chỉ loại đúng người và bảo toàn tất cả action diễn ra sau lúc họ ngắt kết nối.

## N04 — P1: file temp và fs.watch chưa cung cấp kho chung cho các Vercel instance

**Vị trí:** `server/roomStore.js:169–187`; mặc định dùng `os.tmpdir()/cotyphu_shared_rooms`, theo dõi file bằng `fs.watch`.

Các test hai process hiện dùng chung một thư mục vật lý trên cùng máy. Probe bổ sung tạo hai store ở hai filesystem root tách biệt: A tạo phòng, B không đọc được phòng. Đây là mô phỏng điều kiện tách ổ dữ liệu, không phải đo trực tiếp hạ tầng Vercel.

Vercel hiện có hỗ trợ WebSocket và ví dụ Socket.IO. Kết nối mới có thể đến instance khác; tài liệu yêu cầu kho ngoài cho state, presence, rooms và pub/sub. Vì vậy có thể tiếp tục dùng Vercel cho FE/API, nhưng cần thay tầng lưu và đồng bộ của game. [Tài liệu WebSocket Vercel](https://vercel.com/docs/functions/websockets#manage-persistent-state).

`/tmp` được tài liệu mô tả là scratch space; tên đường dẫn giống nhau không chứng minh cùng một ổ lưu trữ giữa instance. [Tài liệu filesystem Vercel](https://vercel.com/docs/functions/runtimes#file-system-support).

**Cần sửa:** triển khai RoomStore dùng datastore ngoài có transaction/CAS; lưu room/game, resume/session/presence, deadline và kết quả request ở đó. Thêm kênh sự kiện liên instance cho N01. `SharedRoomStore` hiện tại chỉ nên là lựa chọn phát triển local. Không coi adapter broadcast là thứ tự động lưu toàn bộ game state hoặc khóa transaction.

**Tiêu chí nghiệm thu:** hai backend không dùng chung filesystem vẫn join/start/chơi/resume đúng; khởi động lại một backend không mất room, tiền, owner hoặc kết quả request đã xác nhận. Sau đó thử thật bằng hai thiết bị, hai mạng khác nhau trên deployment mới.

## N03 — P2: test cold-start vẫn tự làm bước khởi tạo mà entry mặc định chưa làm

**Vị trí:** `api/realtime.js:44–47`; `test/reviewV9.test.js:29–32`.

Test mới gọi trực tiếp `attachServer(wrapper)` trước khi listen. Default export hiện là HTTP handler, chỉ attach khi handler được gọi với `res.socket.server`.

**Probe entry mặc định không tự gọi attachServer:**

- Import API, tạo HTTP wrapper gọi default handler, listen, kết nối WebSocket đầu → thất bại.
- Thử lại đường alternate sau lần lỗi → thành công; HTTP warmup rồi thử lại cũng thành công. Lần lỗi đầu có thể đã đi qua fallback HTTP và gắn listener cho các lần sau.

Đây là mô phỏng entry local, **chưa phải xác nhận kết quả của Vercel runtime mới**. Nó cho thấy test đang bảo đảm helper được gọi, chưa bảo đảm deployment entry tự xử lý kết nối đầu tiên. Bản sửa bỏ prototype toàn cục là đúng và đã được xác nhận riêng.

**Cần sửa:** chuẩn hóa entry xuất HTTP server đã gắn Socket.IO/upgrade, đồng bộ path rewrite và transport với client; đối chiếu [ví dụ entry chính thức](https://vercel.com/docs/functions/websockets#set-up-a-websocket-endpoint). Kiểm tra chính entry đó, không thêm bootstrap riêng trong fixture. Client Vercel nên theo cấu hình WebSocket trong ví dụ chính thức.

**Tiêu chí nghiệm thu:** deployment lạnh vừa tạo, chưa HTTP warmup; client kết nối ngay thành công và tạo/join phòng được. Có ca mất kết nối rồi resume giữ đúng danh tính/state. Không dựa vào retry để che lỗi khởi tạo đầu tiên.

## Tình trạng link public

Đọc lại [trang đang deploy](https://monopoly-silk-ten.vercel.app) lúc 17:10 ngày 07/11/2026, không tạo phòng public:

| Kiểm tra | Kết quả |
| --- | --- |
| Trang chủ | HTTP 200; script `/assets/index-BarhytB4.js` |
| `/api/health` | HTTP 200 nhưng content-type HTML và cùng nội dung trang chủ; không phải health JSON |
| Socket.IO `/socket.io`, WebSocket trực tiếp | Kết nối thất bại, `websocket error` |
| Build local V11 | `index-BGBxsv2J.js`, khác script public |

Chưa thể kết luận người ở nơi khác tham gia ván được qua link này. Cần kiểm tra deployment đã nhận đúng commit/source và route API mới, sau đó chạy nghiệm thu online. Không dùng trạng thái “trang web mở được” hoặc HTTP 200 từ health HTML làm bằng chứng backend hoạt động. Probe này không xác định chính xác cấu hình nội bộ của deployment đang chạy.

## Giao diện, mua nhà và mức giống Business Tour

Đợt thay đổi này tập trung backend và test. Các file UI/engine được lưu hash ở V10 vẫn trùng; bundle main, CSS và Board3D build ra cũng giữ tên hash như V10. Vì vậy **chưa có cải thiện đồ họa mới được chứng minh trong đợt này**. Không chụp lại UI để rồi coi đó là thiết kế mới.

- Các bài test luật mua/xây vẫn qua: lần mua đầu không lên Landmark; ghé lại mới nâng theo cơ hội hợp lệ; chặn xây từ xa và xây trên đất người khác; giá/tiền thuê dùng chung logic. Không thấy thay đổi engine mua nhà so với V10.
- Đây là bộ luật pha trộn theo hướng Business Tour trên bàn Monopoly 40 ô. Chưa có cơ sở gọi là tương đương Business Tour hoàn chỉnh; tính năng World Tour và mức hoàn thiện hình ảnh vẫn thuộc backlog trước.
- Cải thiện 320px từ V10 được giữ trong source/bundle; vòng này không thực hiện lại kiểm tra hình ảnh trên thiết bị thực.

Sau khi ổn định online, giữ mục tiêu hình ảnh đã chốt: góc bàn dễ đọc, tên/giá ô đủ tương phản, nhà đặt đúng footprint không che số, avatar/quân cờ dễ phân biệt, hiệu ứng di chuyển/xây có nhịp. Đánh giá bằng ảnh cùng camera/viewport và cùng trạng thái bàn với V10; bổ sung animation không tự giải quyết độ rõ hoặc độ giống ảnh tham chiếu.

## Thứ tự bàn giao cho Anti

1. **Kho dữ liệu + commit nguyên tử:** xử lý N04 và N02 cùng nhau; chọn rõ datastore và cơ chế sự kiện thực sự dùng được trên môi trường deploy.
2. **Sự kiện và hydrate màn chơi:** sửa N01, test cả hai client trên hai process tách ổ dữ liệu.
3. **Presence/reconnect/forfeit:** sửa N05 bằng deadline + phiên trong kho chung, tránh callback ghi snapshot cũ.
4. **Entry và deployment lạnh:** sửa N03; deploy đúng bản rồi xác nhận health JSON, WebSocket và luồng chơi thực tế. Review này không thực hiện deploy.
5. **Hoàn thiện đồ họa:** tiếp tục mục tiêu Business Tour sau khi các luồng trên đã có nghiệm thu, hoặc tách thành phần việc UI độc lập có ảnh trước/sau rõ ràng.

Không chỉ sửa bài test để gọi thêm helper hoặc giữ thứ tự tuần tự. Test cần diễn tả hành vi người chơi và lỗi cạnh tranh đang xảy ra.

## Bằng chứng và cách chạy lại

Trong `docs/review-v11-2026-11-07/`:

- `audit-repros.mjs`: probe N01–N05, cùng phép kiểm tra đã bỏ tác dụng phụ prototype.
- `cas-worker.mjs`: child process tạo race thật ở N02.
- `audit-results.json`: kết quả đã chạy, timestamp UTC.
- `public-probe.mjs`, `public-results.json`: kiểm tra public chỉ đọc.
- `source-hashes.json`: snapshot 18 file source/test phục vụ đối chiếu vòng tiếp theo.

Chạy từ thư mục dự án:

```powershell
rtk npm test
rtk npm run build
rtk proxy node docs/review-v11-2026-11-07/audit-repros.mjs
rtk proxy node docs/review-v11-2026-11-07/public-probe.mjs
```

**Lưu ý:** assertion trong `audit-repros.mjs` xác nhận đã tái hiện lỗi ở snapshot V11; script exit 0 không có nghĩa game đạt nghiệm thu. Khi sửa đúng, đổi thành regression test kỳ vọng hành vi đúng. Probe tạo scratch riêng, đóng socket/process và chỉ xóa các file tạm do chính nó tạo; không dùng phòng thật của người chơi.
