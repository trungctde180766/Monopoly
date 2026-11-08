# Review V10 — sau bản sửa V9

Ngày 07/11/2026. Review source hiện tại trong workspace trên nền `b9b9621`; không sửa mã game, không commit/push/deploy. Có thêm tài liệu và script diagnostic cô lập.

## Kết luận

**Màn hình 320px đã cải thiện, retry cùng request đã có kết quả cache, và hai tiến trình cùng máy đã đọc thấy file phòng. Tuy nhiên online nhiều instance chưa hoạt động đúng: host không nhận được người mới để bắt đầu ván, cập nhật có thể ghi đè nhau, và giao dịch đã xác nhận chưa được lưu xuống file.**

`npm test`: **72/72 qua** (23 bài nền + 49 Node runner). Build thành công. Các bài mới kiểm tra một phần tình huống, chưa đủ chứng minh triển khai Vercel hoặc vòng đời phòng hoàn chỉnh.

## 1. F01 — P1: khách vào được ở process B nhưng host ở A không bắt đầu được ván

**Vị trí:** `server/roomStore.js:131–145`, đặc biệt `if (local) return local`; broadcast trong `server/index.js:175–177`, `:212–219`, `:229–250`.

File lưu chung giúp process B đọc phòng lần đầu, nhưng mỗi process giữ cache riêng và `get()` luôn ưu tiên cache cũ. Chưa có cơ chế invalidation/đọc revision mới, cũng chưa có broadcast liên process.

**Đã chạy end-to-end bằng hai tiến trình Node thật cùng thư mục temp:**

1. Host ở A tạo phòng.
2. Khách ở B vào đúng mã thành công; B thấy 2 người.
3. Khách ở B bấm sẵn sàng thành công.
4. Host A không nhận `room_updated` và vẫn giữ bản phòng có 1 người. Gửi `start_game` ở A bị trả **“Cần ít nhất hai người và phòng đang chờ.”**

Test `test/reviewV9.test.js` mới chỉ dừng ở join thành công và `players.length === 2` trong response của B, nên chưa bắt được lỗi này.

**Cần sửa:** có một nguồn state chung thật, đọc revision nhất quán và truyền sự kiện giữa instance. Test phải đi hết create→join→ready→start→roll→mua→đổi lượt và xác nhận cả hai client cùng trạng thái. Nếu còn dùng file local cho phát triển, phải giải quyết cache và notification; đó vẫn không phải backend phân tán cho Vercel.

**Vercel:** `os.tmpdir()` là scratch space của môi trường chạy, không phải một ổ dữ liệu chung cho các instance. Hai process trên cùng máy có thể dùng chung đường dẫn vật lý; test đó không mô phỏng các môi trường Function độc lập. Vercel mô tả ranh giới instance và `/tmp` scratch trong [tài liệu runtime](https://vercel.com/docs/functions/runtimes#file-system-support); tài liệu WebSocket yêu cầu kho ngoài cho state/presence/rooms/pub-sub [ở đây](https://vercel.com/docs/functions/websockets#manage-persistent-state).

## 2. F02 — P1: atomicUpdate trên file vẫn chấp nhận hai state cũ cùng revision, làm mất cập nhật

**Vị trí:** `server/roomStore.js:202–216`, `:131–159`.

`atomicUpdate()` hiện là get→so revision trong object cache→mutate→ghi đè JSON. Không có lock/transaction so sánh revision với nguồn dữ liệu chung khi ghi. `writeFileSync` đồng bộ trong một process không khóa các cache/process khác.

**Đã tái hiện bằng hai store có cache độc lập của cùng một file:**

- Fixture người A sở hữu ô 3 và ga 5, revision 0.
- Store A nhận lệnh thế chấp ô 3 ở revision 0, ghi thành revision 1.
- Store B vẫn giữ revision 0 trong cache, tiếp tục nhận lệnh thế chấp ga 5 với cùng expectedRevision 0; không bị từ chối.
- Bản đọc mới cuối cùng chỉ còn ga 5 thế chấp, ô 3 mất dấu thế chấp vừa được chấp nhận. Revision cuối vẫn 1, tiền còn 16 triệu trong fixture thay vì bảo toàn kết quả trước đó.

Đây là probe store/reducer cô lập, không phải chỉnh state trong trình duyệt. **Cần có đúng một lệnh thắng khi hai lệnh cạnh tranh cùng revision**; lệnh thua nhận conflict và fetch lại state. Dùng transaction/CAS/lock theo phòng tại datastore chung, commit state và kết quả request cùng lúc. Không nuốt lỗi ghi file rồi trả thành công.

## 3. F05 — P1: giao dịch đã báo thành công và broadcast nhưng chưa persist

**Vị trí:** `server/index.js`, handler `respond_trade_offer` (đoạn gọi `applySessionTrade` rồi emit, chưa `rooms.set`/transaction).

Các nhánh create/join/ready/start/game_action đã được thêm ghi store; nhánh accept trade vẫn chỉ sửa `room.gameState` trong RAM.

**Đã tái hiện qua Socket.IO trên SharedRoomStore:** host tặng khách 1 triệu, người nhận chấp nhận thành công. RAM và broadcast hiển thị **14 triệu / 16 triệu**, revision 1. Đọc lại bằng store mới từ file vẫn thấy **15 triệu / 15 triệu**, revision 0. Nếu process mất trước lần ghi kế tiếp, kết quả giao dịch có thể mất khi khôi phục.

**Cần sửa:** đưa mọi mutation — đặc biệt trade, resume/leave/forfeit và hết hạn — qua một đường commit dùng chung, persist thành công trước khi ack/broadcast. Không chỉ sửa riêng `game_action`. Có regression test accept trade→tạo store/process mới→đọc lại đúng tiền, owner, winner và revision.

## 4. F03 — P1: sửa cold-start bằng thay prototype listen chưa giải quyết hợp đồng entry Vercel

**Vị trí:** `api/realtime.js:18–34`; test `test/reviewV9.test.js:9–44`.

Module mới thay toàn cục `http.Server.prototype.listen`, tự gắn Socket.IO cho mọi server chưa đánh dấu. Test mới import module API **trước** khi tạo/listen wrapper, nên hook được chạy và test qua.

**Hai phản ví dụ đã chạy:**

| Tình huống | Kết quả |
| --- | --- |
| Runtime đã mở listener trước khi import API; client kết nối WebSocket ngay | Vẫn thất bại; sau HTTP request khởi tạo mới kết nối được. |
| Một HTTP server không liên quan, chỉ trả chuỗi “plain unrelated service”, được listen sau khi import API | Tự xuất hiện endpoint Socket.IO và tạo được phòng game. |

Probe đầu là mô phỏng thứ tự khởi tạo runtime ở local, không phải xác nhận đã chạy deployment Vercel mới. Nó cho thấy bản sửa phụ thuộc vào thời điểm framework gọi listen và tạo tác dụng phụ sang các server khác.

**Cần sửa:** bỏ patch prototype toàn cục. Tạo/export đúng HTTP server đã gắn Socket.IO/upgrade từ entry của ứng dụng theo [ví dụ Vercel chính thức](https://vercel.com/docs/functions/websockets#set-up-a-websocket-endpoint). Đồng bộ path/transport; kiểm tra cold deployment thực tế. Không dùng thay đổi hành vi toàn cục của Node để làm wrapper test đi qua.

## 5. F04 — P2: cache requestId trả success trước khi kiểm tra actor/payload

**Vị trí:** `server/index.js:268–273`; `server/roomStore.js:92–110`.

Đã có replay cache, nhưng key chỉ là requestId do client cung cấp; cache hit trả ngay trước kiểm tra người gửi, nội dung lệnh và revision.

**Đã tái hiện:** host roll hợp lệ với ID X được success. Guest gửi lệnh build sai lượt, ô 39/cấp 4/revision 999 nhưng dùng lại ID X vẫn nhận đúng cached `{success:true, revision:2}`. Probe này **không làm phát sinh tài sản giả**, nhưng acknowledgement sai và chưa đáp ứng yêu cầu “cùng ID, khác payload phải bị từ chối”.

**Cần sửa:** scope key theo game/room + logical actor + requestId, lưu hash payload chuẩn hóa và kết quả. Xác thực membership trước replay; ID trùng nhưng payload khác trả conflict. Request cache phải nằm cùng datastore và transaction với state, không chỉ Map trong RAM; nếu không, retry sang process khác hoặc sau restart vẫn mất kết quả cũ.

## 6. Điểm đã sửa được từ V9

| Hạng mục | Kết quả |
| --- | --- |
| Mobile 320px pill bị cắt | Đã gọn hơn: pill rộng khoảng 124,6px, nằm x≈97,7–222,3 trong màn 320px. |
| Camera controls chồng pill | Đã dời xuống y=116; rect không còn giao với pill. |
| Nút chính bị ép 48px | Đã rộng khoảng **175px**, cao 40px; Giao dịch được ẩn khỏi dock hẹp. Tâm nút nhận đúng click, đã bấm lắc qua UI. |
| Retry cùng request ở một process | Đã thêm requestId ở client và nối cache/atomicUpdate trong game_action; bài retry mới qua. Cần hoàn thiện các giới hạn F02/F04. |
| Đọc phòng giữa hai process cùng máy | Có thể đọc lần đầu nhờ file temp; bài visibility mới qua. Vòng đời đồng bộ sau đó vẫn lỗi F01. |
| Cold socket khi module API import trước listen wrapper | Bài test mới qua nhờ hook. Chưa thể suy ra production đúng như F03. |

UI test ở local build 1280×720 và 320×740, sáu người: lắc 3+4 tới Cơ Hội, xác nhận thẻ sửa nhà khi chưa có nhà và trở về trạng thái kết thúc lượt. Không ghi nhận error/warn ở console cuối phiên. [Số đo 320px](docs/review-v10-2026-11-07/mobile-320-metrics.json), [ảnh](docs/review-v10-2026-11-07/mobile-320.jpg), [desktop](docs/review-v10-2026-11-07/desktop-six.jpg).

Ảnh đầy đủ có thể chứa panel trắng do tiện ích trình duyệt ngoài game. Các kết luận responsive dựa thêm vào rect/hit-test phần tử game; ảnh desktop cắt phần bên phải để tránh panel đó.

## 7. Kết quả kiểm tra và giới hạn

- `npm test`: **72/72 qua**, gồm 23 bài nền + 49 bài Node runner, không có bài thất bại/bỏ qua.
- `npm run build`: qua; JS chính `index-BGBxsv2J.js` 412,55 kB (gzip 125,98 kB); Board3D 564,55 kB (gzip 142,30 kB). Còn cảnh báo chunk 3D >500 kB.
- [Script probe bổ sung](docs/review-v10-2026-11-07/audit-repros.mjs), [kết quả thực chạy](docs/review-v10-2026-11-07/audit-results.json). Script dùng server/fixture/scratch riêng, không sửa production; assertion xác nhận lỗi hiện tại, cần đổi thành hành vi mong muốn khi tạo regression test. Harness diagnostic kết thúc process sau khi ghi kết quả để dọn handle Engine.IO của các lần attach, không phải quy trình npm test.
- [Hash source khi review](docs/review-v10-2026-11-07/source-hashes.json).
- Chưa deploy bản mới hoặc kiểm tra thiết bị Wi-Fi/4G trên backend mới. Cơ chế game/World Tour/ruleset và mức hoàn thiện mỹ thuật vẫn theo các phần chưa xong trong V7; lượt sửa này chủ yếu thay hạ tầng và responsive.

**Public lúc 16:46 ngày 07/11/2026:** [trang Vercel](https://monopoly-silk-ten.vercel.app) vẫn dùng asset `index-BarhytB4.js`, health trả SPA HTML, WebSocket path mặc định thất bại. Chưa phải bundle local mới. [Kết quả read-only](docs/review-v10-2026-11-07/public-check.json).

## 8. Công việc tiếp theo để tránh sửa theo từng probe riêng lẻ

1. **Hoàn thiện tầng commit chung:** state + revision + request/result + token/deadline có transaction; mọi mutation đi qua tầng này, gồm accept trade. Giải quyết F02/F05/F04 cùng một nơi.
2. **Dùng datastore và broadcast thực sự cho Vercel:** cache có revision/invalidation và giao tiếp liên instance. Thử end-to-end hai process, không dừng ở đọc thấy một file phòng.
3. **Entry realtime theo hợp đồng nền tảng:** export server riêng, bỏ patch prototype; deploy preview để kiểm tra cold WebSocket và reconnect.
4. Bổ sung regression tests create/join/ready/start trên hai instance; hai action cạnh tranh revision; trade rồi restart; replay sai actor/payload; runtime server có trước module import.
5. Giữ các sửa giao diện 320px đang tốt lên; kiểm tra thêm online trên hai mạng và bàn có đủ các cấp công trình trước khi tuyên bố hoàn tất.
