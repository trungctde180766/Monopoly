# Review V7 — bàn chơi kiểu Business Tour, logic còn thiếu và deploy trên Vercel

**Ngày:** 07/11/2026. **Người nhận:** Anti/agent triển khai tiếp.

**Yêu cầu hiện tại:** giữ hướng deploy FE + BE trên Vercel; làm giao diện bàn chơi thực sự gần ảnh Business Tour người dùng gửi. Lượt V7 chỉ review, thêm tài liệu và bằng chứng; chưa sửa những lỗi mới bên dưới, chưa commit/push/deploy.

## 1. Kết luận để bắt tay làm ngay

1. **Chưa giống ảnh mục tiêu.** V6 làm thông tin rõ hơn nhưng bố cục dạng dashboard có sidebar/header/footer lớn vẫn lệch hướng bàn chơi hoạt hình chiếm sân khấu. Không tiếp tục chỉ đổi màu, tăng blur/glow hoặc thêm card rồi gọi là giống Business Tour.
2. **Logic có nền tốt nhưng chưa hoàn tất.** Chạy lại 66/66 bài kiểm tra cũ đều qua; review mới tái hiện được lỗi giao dịch ngoài lượt, quyết định mua lại bị mồ côi khi chủ đất rời phòng và khôi phục phiên chưa rời phòng cũ. Đây là các khoảng trống của bộ test hiện tại.
3. **Ruleset hiện là bản lai Monopoly/Arcade.** Có bốn cấp, Landmark, mua lại và thắng nhanh, nhưng chưa có World Tour; ga tàu, điện/nước, thẻ, thuế và bản đồ vẫn mang cấu trúc Monopoly. Không chứng nhận khớp Business Tour 1:1.
4. **Vercel chạy được realtime, nhưng repo chưa triển khai backend theo cách đó.** Phải làm endpoint Function, kho trạng thái dùng chung, truyền sự kiện giữa instance, cập nhật state nguyên tử và khôi phục phiên. Chỉ thêm một file API hoặc thêm Redis adapter chưa đủ.

Thứ tự: **sửa lỗi L01/L02/N01 → hoàn thiện nền online Vercel → thay bố cục/camera và scale công trình → hoàn thiện ruleset/hiệu ứng → nghiệm thu hai mạng thật.** Có thể làm giao diện độc lập với phần hạ tầng, nhưng không tuyên bố online xong bằng kết quả localhost.

## 2. Bằng chứng và phạm vi kiểm tra

- Mã nguồn đang review: workspace trên nền commit `b9b9621`, gồm các thay đổi V6 chưa commit. Không được checkout đè hoặc bỏ phần V6 khi nhận việc.
- `npm test` chạy lại: **23 bài nền + 43 bài Node runner = 66 qua**, 0 thất bại/bỏ qua.
- `npm run build`: qua; bundle chính `index-C6NwrgvF.js` khoảng 407,04 kB, Board3D khoảng 564,72 kB. Còn cảnh báo chunk >500 kB.
- Mở bản build thật tại localhost, chọn bốn bot bằng UI và quan sát tới khoảng lượt 20. Danh sách thể hiện tổng 12 tài sản, 9 công trình; nhà vẫn rất nhỏ trên bàn. Đây là review bàn đã có công trình, không chỉ nhìn ván trống.
- [Ảnh mẫu người dùng](docs/review-v7-2026-11-07/reference-business-tour.png), [bàn hiện tại đã có công trình](docs/review-v7-2026-11-07/populated-board.jpg), [ảnh desktop đầy đủ](docs/review-v7-2026-11-07/populated-desktop.jpg), [trạng thái UI](docs/review-v7-2026-11-07/populated-ui.txt).
- Panel trắng bên phải trong ảnh đầy đủ do tiện ích trình duyệt chèn ngoài game. Không tính nó là lỗi giao diện game. Ảnh bàn đã cắt vùng bên phải đó; không dùng ảnh cắt để suy luận tỷ lệ toàn viewport.
- Các lỗi mới có [script tái hiện](docs/review-v7-2026-11-07/audit-repros.mjs) và [kết quả thực chạy](docs/review-v7-2026-11-07/audit-results.json). Script dùng fixture cô lập và server Socket.IO tạm, không sửa production. Assertion của script xác nhận **lỗi đang tồn tại**, không phải tiêu chí chấp nhận sau sửa; cần đảo thành regression test đúng hành vi mong muốn.

```sh
node docs/review-v7-2026-11-07/audit-repros.mjs
```

Kiểm tra public gần nhất cùng ngày ở [V6/public-connectivity.json](docs/review-v6-2026-11-06/public-connectivity.json): asset public vẫn là `index-BarhytB4.js`, health/socket trả SPA và cả hai transport thất bại. V7 không thực hiện deploy và không chạy lại bài thử hai thiết bị qua Internet.

## 3. Những phần nên giữ

- Dùng chung `src/logic/gameSession.js` cho local/bot/server; không quay lại nhét luật vào App hoặc để client online gửi toàn bộ snapshot.
- Xúc xắc, tiền, tài sản, winner do server xác nhận; revision và quyền xây theo lần ghé đã có.
- Mua lần đầu cấp 1–3; Landmark chỉ khi đã có Biệt thự từ lần ghé trước; không nâng tiếp bằng cách mở Sổ Đỏ lại.
- Đã xử lý tiền thuê thiếu tiền, tù phải thanh lý trước khi di chuyển, trả Quỹ thưởng ở Lễ hội, bỏ qua người phá sản và hủy timer khi đổi ván.
- Inspector/bảng giá và preview công trình là chức năng hữu ích. Chuyển chúng thành panel ngữ cảnh thay vì bỏ chức năng để lấy chỗ cho bàn.

## 4. Lỗi logic và phiên chơi phải sửa

### L01 — P1: giao dịch ngoài lượt có thể hủy quyền mua của người khác

**Vị trí:** `server/index.js:244`, `server/index.js:265`, `src/logic/gameSession.js:291`.

Tái hiện bằng reducer: A đang chọn mua ô 3. B tặng C một đồng, không liên quan đến A. `applySessionTrade` vẫn nhận, xóa `buildOpportunity` của mọi người và gọi `endLanding`; A mất lựa chọn mua, phase đổi từ decision sang end.

Socket.IO thật cũng nhận đề nghị B→C và cho C chấp nhận ngay trong lượt A. Nút UI khóa giao dịch ngoài lượt nhưng server chưa áp dụng cùng quy tắc.

**Cách sửa:** tạo một validator luật giao dịch dùng chung. Với quy tắc hiện tại, chỉ người đang đi được gửi khi không nợ/không có quyết định bắt buộc/ván chưa kết thúc; lúc chấp nhận kiểm tra lại phase, người gửi, revision, ownership, số dư và hạn. Giao dịch không được làm biến mất quyết định của người ngoài giao dịch. Đề nghị trống không thay đổi gì nên bị từ chối.

**Đạt khi:** test ba người A đang mua, B/C gửi/nhận lệnh trực tiếp đều không sửa state của A; đề nghị hết hạn/sai revision/trùng request không chuyển tiền hai lần; giao dịch hợp lệ vẫn bảo toàn tổng tiền hai bên.

### L02 — P1: chủ đất rời phòng khiến quyết định mua lại mất nút xử lý

**Vị trí:** `src/logic/gameSession.js:311`, `src/components/ActionModals.jsx:322`, `src/logic/gamePresentation.js:50`.

A đáp lên đất B và đang chọn buyout, C còn trong ván. B rời phòng hoặc bị xử thua do mất kết nối: đất bị xóa nhưng `pendingDecision` của A vẫn là buyout. `BuyoutModal` trả null khi không tìm được owner; CTA chính vẫn disabled do còn quyết định. Reducer vẫn cho `skip`, nhưng giao diện không còn nút gửi skip → kẹt lượt trên UI.

**Cách sửa:** mọi thay đổi người chơi/ownership phải kiểm tra lại quyết định đang chờ. Nếu đích/owner không còn hợp lệ, đóng hoặc chuyển quyết định theo luật đã chọn. Đề xuất an toàn: đóng buyout, giữ khoản thuê đã quyết toán, cho kết thúc lượt; không tự mua hay trừ tiền. UI phải có đường thoát khi quyết định không thể dựng.

**Đạt khi:** ba người, B rời đúng lúc A mở buyout; cả A/C đồng bộ và A tiếp tục được. Test thêm chủ đất bị phá sản, người đang đi rời, target giao dịch rời và hết hạn reconnect.

### N01 — P1: resume sang phòng khác vẫn giữ membership phòng cũ

**Vị trí:** `server/index.js:170`, `src/hooks/useGameController.js` handler `room_updated`.

Socket D đang ở phòng X. D dùng token hợp lệ của một người đã ngắt kết nối ở phòng Y. Server chấp nhận resume Y nhưng không rời X; D tiếp tục nhận broadcast `room_updated` của X và roster X vẫn có danh tính cũ. Đã tái hiện qua Socket.IO thật. Client nhận `room_updated` không lọc mã phòng nên có thể ghi nhầm room.

**Cách sửa:** một kết nối chỉ có một phiên/phòng game đang hoạt động. Từ chối resume nếu đã thuộc phòng khác, hoặc rời phòng cũ qua luồng chuẩn trước khi bind danh tính mới; chọn một chính sách rõ. Kiểm tra membership/identity nguyên tử. Mọi event client phải kèm và lọc `roomCode`/`gameId`/revision phù hợp.

**Đạt khi:** sau resume không nhận sự kiện phòng cũ, không để lại player kết nối giả, không nhân đôi danh tính khi hai lần resume cạnh tranh.

### L03 — P2: giá mua, định giá tài sản và giá mua lại chưa cùng cách tính

**Vị trí:** `src/logic/gameEngine.js:66`, `:171`, `:223`, `:274`.

Ô 3 mua cấp 1 tốn 600k. `houses=1` khiến `calculateNetWorth` tính thêm một `housePrice=500k`: tổng tài sản từ 15 triệu thành 15,5 triệu ngay sau mua. Buyout tính `(600k + 1×500k)×2 = 2,2 triệu`, trong khi hai lần khoản đã thanh toán là 1,2 triệu. Đây là chênh lệch cách định giá, **không phải phát hiện tiền mặt tự tăng 500k**.

**Cách sửa:** định nghĩa một bảng `purchaseCostByTier`, `upgradeCost`, `buyoutValue`, `sellRefund`, `mortgageValue` có ý nghĩa rõ; chọn cost basis hoặc replacement value và ghi vào ruleset. Nếu cấp 1 đã gói trong giá đất thì không cộng lại như một khoản xây thêm mà không giải thích. Dùng cùng nguồn cho engine, AI, modal và sổ giá. Không tự đổi hết giá kinh tế trước khi xác định quy tắc.

**Đạt khi:** bảng ví dụ cấp 0–4 cho từng loại ô giải thích được mọi khoản mua/nâng/bán/mua lại; test chuỗi mua→bán→thế chấp và chuyển chủ không tạo vòng kiếm tiền vô hạn.

### L04 — P2: mô tả Quỹ thưởng vẫn rộng hơn khoản thực thu

**Vị trí:** `src/components/Lobby.jsx` mô tả checkbox, `src/logic/gameSession.js:104`, `:138`, `:220`.

Tùy chọn nói gom toàn bộ tiền phạt và thuế. Thuế có cộng quỹ; trả bảo lãnh tù 500k và thẻ `pay_money` 1 triệu không cộng, đã tái hiện.

**Cách sửa:** hoặc chỉ rõ quỹ gom thuế, hoặc gom đúng các loại phí/phạt đã định nghĩa bằng hàm thanh toán chung. Tiền thuê/giao dịch trả người chơi không chảy vào quỹ. Nếu người nộp phá sản, quy định quỹ nhận phần thực thu hay nghĩa vụ danh nghĩa để tránh tự tạo tiền.

**Đạt khi:** bật/tắt checkbox có test thuế, phạt tù, thẻ phạt và payout đúng một lần; lời UI khớp luật.

### N02 — P2: một số lệnh bị từ chối nhưng không trả acknowledgement

**Vị trí:** `server/index.js:199`; rà các nhánh early return khác.

Người không phải host gửi `start_game` thì không nhận `{success:false}`, chỉ hết thời gian chờ. Đã tái hiện qua socket thật.

**Cách sửa:** mọi request có callback đều trả kết quả thành công hoặc lỗi có mã; tránh để lỗi quyền trông giống mất mạng. Client bỏ qua callback của phiên cũ và khóa nút trong lúc chờ.

### N03 — P1 trước public: chưa có deadline lượt/AFK

Chưa thấy `turnDeadline` hay bộ xử lý hết giờ trên server. Đồng hồ hiện là thời gian đã chơi; người còn kết nối nhưng bỏ máy có thể giữ lượt vô hạn. Đây là tính năng thiếu, khác với lỗi sai phép tính.

Đề xuất: deadline cấu hình theo ruleset, tính bằng server time; hết giờ tự bỏ qua mua/buyout/Lễ hội, xử lý thẻ/tù theo chính sách công khai, thanh lý nợ theo thuật toán xác định. Tuyệt đối không tự chấp nhận trade. Deadline phải được lưu và xử lý idempotent khi server khởi động lại.

## 5. So với Business Tour: giống ở đâu, chưa giống ở đâu?

Ảnh mẫu chứng minh phong cách và các góc START, LOST ISLAND, WORLD CHAMPIONSHIP, WORLD TOUR. Ảnh không chứng minh giá nâng cấp, xác suất thẻ, thời hạn Lễ hội hoặc toàn bộ luật. Trang Steam chính thức xác nhận sản phẩm/nhà phát triển và chế độ, không cung cấp đủ bộ luật để chứng nhận parity 1:1. [Nguồn Steam](https://store.steampowered.com/app/397900/?l=english).

| Cơ chế | Hiện tại | Kết luận / việc cần làm |
| --- | --- | --- |
| Di chuyển, mua đất, tiền thuê | Có, server xử lý; local dùng cùng reducer | Giữ nền này; xử lý các lỗi mục 4. |
| Xây công trình | Enum cấp 1–4, mỗi ô một model, một quyền xây/lần ghé | Có cảm hứng tương tự; chưa xác minh đầy đủ cách chọn nhiều công trình, nâng sau buyout hay chi phí so với game gốc. Không dùng tên hàm/comment “chuẩn” làm bằng chứng. |
| Landmark và buyout | Có khóa cấp 4, giá 2× theo công thức riêng | Giữ chống xây lặp; cần chuẩn hóa cost basis L03 và xác minh phạm vi loại ô được mua lại. |
| Lễ hội | Chọn city, cờ `isFestival` nhân 2 vĩnh viễn, có thể nhiều city | Đây là luật đang có, chưa chứng nhận giống giới hạn/thời hạn/cộng dồn của Business Tour. Viết test rõ chọn lại, thế chấp và đổi chủ. |
| Lost Island | Texture ô 10 ghi đảo hoang nhưng engine vẫn là thăm tù khi đáp thường; ô 30 ép vào tù | Đổi nhãn không tạo cơ chế đảo hoang đúng ảnh. Preset mới cần mô tả chính xác khi nào bị giữ và cách thoát. |
| World Tour | **Không có**; góc 30 hiện là `go_to_jail` | Thiếu rõ nhất so với ảnh và chính BUSINESS_TOUR_RULES.md. Cần thêm lựa chọn điểm đến, lượt kích hoạt, trả tiền/qua GO/xử lý ô đến và bot tương ứng. |
| Resort/địa điểm du lịch | Bốn ga kiểu Monopoly; hai tiện ích điện/nước | Đổi ga thành khu du lịch bằng tên/texture thôi không chứng minh đã có đúng cơ chế. Thiết kế type/rent riêng nếu preset mới dùng. |
| Điều kiện thắng | Ba bộ màu, toàn cạnh gồm cả ga/tiện ích, bốn ga, sống sót | Cần khóa danh sách ô thực sự được tính trong mỗi preset; hiện code hard-code index. |
| Bản đồ | 40 ô, nhiều chỉ số 0/10/20/30, modulo 40 và ga [5,15,25,35] | Chưa xác nhận số ô/slot của map tham chiếu; không gọi “40 ô chuẩn Business Tour”. Nếu đổi map phải cấu hình cả renderer/engine/AI, không chỉ sửa nhãn ô 30. |
| Avatar/nhân vật, phản ứng và dòng tiền | Quân dạng vật thể nhỏ, vài âm thanh/nhảy; thiếu nhân vật có biểu cảm | Còn cách biệt lớn với ảnh. Đây là phần làm game có sức sống, không giải quyết bằng độ phân giải texture. |

**Hướng triển khai:** giữ preset hiện tại là `arcade-v1`; thêm `business-inspired-v1` khi thay map/ô đặc biệt. Lưu `rulesetVersion` và `boardVersion` trong ván. Hoàn thiện mô tả World Tour, Lost Island, Lễ hội, buyout và thắng trong rulebook trước khi nối UI mới. Chưa xác minh luật nào thì ghi rõ lựa chọn riêng của dự án; cần bằng chứng từ tutorial/ghi hình game gốc nếu muốn tuyên bố giống hoàn toàn.

## 6. Yêu cầu giao diện bắt buộc theo ảnh người dùng

### 6.1. Thay bố cục: bàn là sân khấu chính

**File chính:** `src/components/GameInterface.jsx`, `src/game.css`, `src/components/PlayerRoster.jsx`, `src/App.jsx`.

- Desktop: canvas/nền xanh pastel phủ vùng chơi, bàn hình thoi ở giữa. Bỏ sidebar thường trực, khung card bọc bàn và header/footer dày trong chế độ chơi kiểu Business Tour. Sổ tài sản/inspector/log thành drawer mở theo nhu cầu.
- Bốn người: avatar vuông có chân dung, banner tên và ví tiền đặt bốn góc giống phân bố ảnh. Viền/mái nhà/banner thống nhất màu người chơi. Đến lượt có vòng sáng nhẹ + tên, tránh mọi thứ cùng nhấp nháy.
- Vẫn hỗ trợ sáu người: bổ sung hai vị trí compact ở vùng giữa trên/dưới hoặc rail thu gọn có safe area; không chồng sáu card vào bốn góc. Test riêng sáu người.
- Nút lắc/kết thúc chỉ là cụm ngữ cảnh gọn sát vùng dưới giữa, không chiếm một dải trắng cao. Nút âm thanh/cài đặt/log nhỏ ở cạnh phải. Tiền, ô đang tới và bước cần làm vẫn đọc rõ.
- Mobile: ưu tiên bàn + người đang đi + một hành động chính; đối thủ mở thu gọn. Không bê nguyên bốn avatar desktop vào màn 390px. Các điều khiển chính có vùng bấm tối thiểu khoảng 44px.

### 6.2. Camera và tỷ lệ

**File:** `src/components/Board3D.jsx:698`, `src/logic/boardLayout.js`.

Hiện PerspectiveCamera, aim thấp hơn mặt bàn và vùng canvas bị sidebar thu hẹp làm phối cảnh sâu; ảnh tham chiếu gần kiểu isometric, bàn trải ngang và bốn cạnh cân hơn.

- Thử **OrthographicCamera** cho góc mặc định; yaw khoảng 45°, elevation khởi điểm 32–36° rồi chỉnh theo ảnh. Đây là thông số khởi điểm thiết kế, không phải thông số camera lấy được từ game gốc.
- Desktop 16:9: đặt mục tiêu bàn khoảng 72–80% chiều rộng viewport và 72–82% chiều cao, canh tâm; 4 góc bàn và HUD đều trong safe area. Ảnh mẫu dùng để so cùng tỷ lệ màn hình.
- Nút reset trả đúng camera chuẩn; zoom bị chặn ở mức còn thấy đường đi. Có thể giữ chế độ xoay tự do phụ, không để góc đầu tiên phụ thuộc thao tác trước.
- Kiểm tra framing trên bàn **có nhà/cột cờ/nhân vật**, không chỉ bốn điểm mặt bàn. Không tăng model rồi để Landmark bị cắt mất đỉnh.

### 6.3. Công trình phải có khối và dễ phân biệt

**File:** các `createTier*Mesh`, `createLandmarkMesh`, phần đặt công trình trong `Board3D.jsx:1094`.

Hiện thân cottage rộng 0,48, cao 0,36; villa thân rộng 0,82, cao 0,55 so với ô rộng 1,8. Ở góc mặc định nhiều nhà chỉ như đốm mái màu trên mặt ô. Trong ảnh mẫu công trình có mặt đứng, cửa/cửa sổ và chiều cao nhìn rõ.

- Chốt bốn silhouette: nhà một tầng mái rõ; nhà hai tầng có cửa sổ/ban công; villa có khối chính và hiên; Landmark cao có dấu hiệu bảo vệ. Không chỉ đổi màu cùng một cube.
- Tăng kích thước theo **pixel nhìn thấy ở camera chuẩn**, không chỉ theo world unit. Mốc thử ở 1280×720: công trình đã xây cần có silhouette cao khoảng 18–30px trở lên; Landmark nổi hơn. Điều chỉnh sau so ảnh, giữ footprint không lấn ô bên cạnh.
- Tách vùng trong ô thành công trình phía trong, tên ở giữa, tiền phía ngoài và lane nhân vật. Chân công trình chạm đúng mặt ô; không xuyên đất/che giá. Preview dùng cùng transform/bounds như model thật.
- Có thể dùng GLB stylized hoặc nâng procedural hiện tại; phải có mái, mặt đứng, đế và độ tương phản tốt. Dùng asset được phép sử dụng, không lấy trực tiếp asset thương mại của Business Tour.
- Màu người chơi thể hiện qua mái/viền/cờ; không phủ cả công trình bằng phát sáng trắng. Giảm vật liệu quá bóng ở nhà và mặt ô, cân ánh sáng để thấy mặt bên và bóng tiếp xúc.

### 6.4. Chữ và vật liệu: sắc nét, không trắng bệt

- Texture 512×760 hiện có không tự đảm bảo đọc được: khi tên dài bị nén bằng `fillText(..., maxWidth)` và camera xa, chữ vẫn chỉ vài pixel. Dành diện tích thật cho chữ; rút gọn tên có quy tắc, giá đậm tương phản cao, xoay nhãn theo cạnh.
- Ở desktop chuẩn, mục tiêu giá ô gần/cạnh bên đọc được trực tiếp khoảng 12–16px biểu kiến; ô xa cho chọn/hover để đọc rõ. Mobile không ép cả 40 tên đầy đủ vào vài pixel.
- Giá mua khi chưa có chủ, tiền thuê khi đã có chủ; thế chấp và Lễ hội có badge rõ. Số trên bàn, bảng giá và khoản thu thật phải đồng nhất.
- Giảm ambient/exposure nếu mặt nhà trắng bệt, giữ một hướng sáng rõ và bóng tiếp xúc mềm. Không thêm fog/bloom/blur toàn cảnh. Độ mềm do ảnh tham chiếu nén không phải mục tiêu cần bắt chước.
- Nền xanh tươi gần ảnh, thảm cỏ dịu hơn để không lấn át thành phố; đế bàn sáng có độ dày vừa. Tiền trang trí làm cụm có chủ đích, không để các cọc tiền/xu to hơn công trình chính.

### 6.5. Làm bàn sống động bằng sự kiện thật

- Chân dung/nhân vật stylized đứng rõ trên lane, có idle và phản ứng khi thu tiền, bị thu, xây và thắng. Có thể giữ quân vật thể như skin phụ; không dùng emoji nhỏ làm toàn bộ trải nghiệm nhân vật.
- Mua/nâng: preview → xác nhận server → nhà mọc trong khoảng 250–450ms, một vòng bụi/cờ nhỏ. Chưa được ack thì chỉ hiện preview.
- Thuê: dòng `−tiền` từ người trả, `+tiền` tới chủ đất; card tóm tắt ô và hệ số. Một event giao dịch chỉ hiện một lần sau reconnect.
- Xúc xắc đáp có bóng/nảy ngắn, mặt trên khớp kết quả server. Hiện `createDiceMaterials` dùng `[2,5,topValue,7-topValue,3,4]`, gây lặp mặt khi topValue là 2/3/4/5. Cần sáu mặt 1–6 và cặp đối diện hợp lý, giữ tổng/kết quả thật không đổi.
- Lễ hội có cờ/pháo giấy nhẹ; World Tour có máy bay/đường bay và điểm đến; Lost Island có tín hiệu bị giữ. Cập nhật dựa trên loại sự kiện, không suy mọi thay đổi vị trí thành nhảy xuôi quanh bàn.
- Tôn trọng reduced motion, tắt âm thanh, thiết bị yếu. Không cần thêm engine vật lý để đạt các chuyển động này.

### 6.6. Mua nhà và đặt nhà

Giữ báo giá/khóa quyền hiện có. Panel mua gọn ở ngoài vùng ô đang chọn, thể hiện model 3D cho mỗi cấp, giá mua/nâng, tiền thuê và số dư còn lại. Chọn cấp làm preview tại đúng ô; confirm dùng quote/opportunity/revision hiện hành. Hủy không đổi tiền/owner. Nếu người/ô đổi trạng thái khi panel mở, cập nhật hoặc đóng với lý do, tránh lặp lại L02.

Nếu muốn mô phỏng nhiều loại công trình cùng trên một city theo game gốc, phải xác minh UI/quy tắc đó rồi đổi schema tương ứng; **không tự diễn giải `houses=3` thành ba căn giống nhau**. Tách `buildingTier` khỏi số model trang trí.

## 7. Nâng cấp để FE + BE đều chạy trên Vercel

Đây là phương án đáp ứng lựa chọn của người dùng; không chuyển mục tiêu sang Render. **FE + BE cùng Vercel vẫn cần một dịch vụ lưu trữ dùng chung**, ví dụ Redis được kết nối qua Marketplace; dịch vụ dữ liệu không phải một frontend/backend public thứ hai.

Tài liệu Vercel hiện hỗ trợ WebSocket và có ví dụ Socket.IO dùng transport `websocket`. Kết nối có thể đóng theo thời lượng Function; lần nối lại có thể đến instance khác, nên trạng thái phòng không được chỉ nằm trong RAM. [Tài liệu Vercel](https://vercel.com/docs/functions/websockets). Phần kiến trúc cụ thể dưới đây là đề xuất cho repo này.

### V01 — Endpoint và cấu hình deploy

- Tách factory tạo HTTP server + đăng ký handlers khỏi lệnh `listen`. Giữ entry local để chạy/test; thêm entry Function export server cho Vercel, ví dụ `api/realtime.js`.
- Chọn một path duy nhất, ví dụ `/api/realtime/socket.io`, đồng bộ server/client. Cấu hình client Vercel `transports: ['websocket']` theo hướng dẫn hiện hành; không để polling rơi vào SPA fallback.
- Sửa `vercel.json`: `/api/*` và realtime phải đến Function, asset đến dist; chỉ đường trang mới fallback index.html. Có health endpoint JSON với phiên bản giao thức/build.
- Khởi tạo server/adapter kết nối một lần mỗi instance bằng cơ chế cache phù hợp; tránh đăng ký handlers nhiều lần hoặc tạo kết nối dữ liệu lại theo từng message.

### V02 — Kho trạng thái và cập nhật nguyên tử

- Thay nguồn sự thật `rooms = new Map()` bằng room store chung: room/lobby, game snapshot, `revision`, `rulesetVersion`, `boardVersion`, identity, session, đề nghị trade và deadline. Map chỉ được làm cache có kiểm soát.
- Mọi create/join/ready/start/action/trade/leave/forfeit đều đọc/ghi cùng store, không chỉ riêng roll. Có TTL và dọn phòng không còn dùng.
- Dùng CAS/transaction hoặc khóa theo phòng có lease để hai instance không cùng nhận một revision rồi ghi đè kết quả. Winner và khoản thanh toán cập nhật cùng transaction với state.
- Thêm `requestId`: retry lắc/mua/trade trả lại kết quả cũ thay vì chạy/trừ tiền lần nữa. Xúc xắc sinh phía server, kết quả đã commit phải được giữ cho request đó.
- Kho unavailable thì trả lỗi tạm thời và khóa thao tác; không tạo một phòng RAM riêng nhìn như đã chơi thành công.

### V03 — Broadcast liên instance và khôi phục

- `io.to(room).emit()` mặc định chỉ ở instance hiện tại. Cần adapter/cơ chế stream dùng chung để người cùng phòng ở các instance khác đều nhận cập nhật.
- Chọn provider/client thực sự hỗ trợ cách adapter truyền sự kiện; không mặc định một Redis REST API bất kỳ thay thế được kết nối mà adapter yêu cầu.
- [Redis adapter](https://socket.io/docs/v4/redis-adapter/) truyền broadcast nhưng không hỗ trợ Connection State Recovery; [Redis Streams adapter](https://socket.io/docs/v4/redis-streams-adapter/) có hỗ trợ đó. **Cả hai không tự lưu/transaction toàn bộ gameState của ứng dụng.** V02 vẫn bắt buộc.
- Mỗi lần reconnect phải khôi phục logical playerId và fetch snapshot mới nhất, kiểm tra quyền/phiên, join đúng phòng, xử lý revision bị bỏ lỡ. Có hạn reconnect và chính sách chỉ một phiên hoạt động/người.
- Token phiên chỉ phía người sở hữu; credentials Redis chỉ phía server, không đặt vào biến `VITE_*`. Broadcast dùng DTO công khai, không gửi token/timer/connection registry của server cho client.

### V04 — Deadline và vòng đời Function

- Thay `setTimeout` RAM 60 giây bằng `disconnectedAt`/`expiresAt` đã lưu; có cơ chế thực thi deadline sau restart và chống chạy trùng. Áp dụng cùng nguyên tắc cho AFK, đề nghị trade và hết hạn phòng.
- Khi Function đóng/redeploy, client reconnect lấy state đã lưu; không tự xử thua tất cả chỉ vì một tiến trình bị thay. Dọn timer/adapter/subscription của instance đúng cách.
- Ghi log có roomId/requestId/revision/action/error, không log secret; giới hạn tần suất tạo phòng/chat/lệnh để endpoint public chịu được spam cơ bản.

### V05 — Tiêu chí online bắt buộc trước khi báo xong

| Bài nghiệm thu | Kết quả cần thấy |
| --- | --- |
| Hai thiết bị hai mạng | Máy Wi-Fi và điện thoại 4G tạo/vào cùng mã, ready/start, đổi lượt đúng. |
| Mua/nâng/trả thuê | Hai bên cùng giá/owner/tier/tiền/revision; không xác nhận mua hai lần vì double click/retry. |
| Hai instance | Ép hai client tới hai server cùng store trong integration test; vẫn thấy cùng lobby/state/event. Không lấy hai tab cùng tiến trình làm bằng chứng. |
| Hai lệnh đồng thời | Cùng revision chỉ một kết quả hợp lệ, tiền và xúc xắc không bị ghi đè. |
| Reload/mất mạng | Khôi phục đúng người/lượt/tài sản, không thêm ghế mới; đóng cửa sổ cũ không xóa người vừa resume. |
| Redeploy/restart | Ván đã lưu vẫn khôi phục được với phiên bản tương thích; thông báo rõ nếu có migration không tương thích. |
| Hết thời lượng Function | Nối lại và lấy snapshot, không kẹt room hay mất quyền vì timer RAM. |
| Lỗi mới mục 4 | Có regression tests L01/L02/N01 và các ack lỗi rõ. |

## 8. Danh sách công việc giao Anti theo đợt

| Đợt | Công việc | File/chỗ tác động | Điều kiện xong |
| --- | --- | --- | --- |
| A — lỗi đang tồn tại | L01/L02/N01, ack N02, chuẩn hóa lựa chọn L03/L04 | gameSession/gameEngine, server handlers, controller, ActionModals | Test mới bắt được trước sửa và qua sau sửa; giữ 66 bài nền. |
| B — Vercel | V01–V04, cấu hình biến và hướng dẫn deploy, integration hai instance | server factory, api entry, roomStore, socket adapter, vercel.json, controller | Health/realtime đúng, state sống qua restart, race/retry không thu tiền lặp. |
| C — ngoại hình chính | HUD góc, bỏ sidebar thường trực, camera chuẩn, tăng silhouette công trình/chữ | GameInterface, game.css, Board3D, boardLayout, asset models | So ảnh cùng 1280×720, 1440×900; bàn đã có nhiều công trình nhìn rõ, không che góc/giá. |
| D — ruleset và sức sống | World Tour/Lost Island, rulebook có version, avatar, xây/thu tiền/Lễ hội, mặt xúc xắc | boardData, gameSession, botTurn/AI, renderer, UI decisions | Người và bot không kẹt quyết định; mọi điểm đến qua reducer; hình theo event server. |
| E — nghiệm thu | Hai mạng, reconnect, sáu người, máy yếu, ảnh before/after | Tests + docs bằng chứng | V05 qua; mobile 390×844/320×740 bấm được; mục chưa xong được ghi thật. |

Trong C/D cần scene kiểm tra tái lập có bốn cấp công trình, bốn màu chủ, thế chấp, Lễ hội và nhiều quân cùng ô. Scene/dev harness dùng engine hoặc fixture riêng phục vụ QA, không đưa nút chỉnh tiền/state gian lận vào game production. Đừng chỉ chụp ván trống rồi kết luận art đã đạt.

Về hiệu năng: hiện group công trình bị dispose/rebuild mỗi lần `propertiesState` đổi (reducer clone cả snapshot), kể cả hành động không đổi nhà. Nên cache theo tile/tier/owner/festival và chỉ cập nhật ô bẩn; đo draw calls/texture memory/FPS trên thiết bị thật trước khi thêm nhiều asset/hiệu ứng.

## 9. Tiêu chí bàn giao

- Ảnh desktop đủ ngữ cảnh cạnh ảnh mẫu, cùng tỷ lệ; ảnh bàn đông công trình và panel mua không che ô đang chọn.
- Mỗi tier nhìn phân biệt được, đọc được chủ sở hữu/giá gần, nhân vật và công trình không lẫn thành đốm màu.
- Menu quản lý/giao dịch/tù/thẻ dùng cùng phong cách; không còn xen dashboard trắng với modal tối blur dày.
- Có bộ luật version rõ, đặc biệt World Tour, đảo hoang, Lễ hội, cost basis và thắng theo cạnh. Không gọi toàn bộ là “chuẩn Business Tour” nếu chưa có căn cứ.
- Các lỗi có bằng chứng trong review được sửa và có test; 66 bài cũ tiếp tục qua; build thành công, ghi cảnh báo/chưa kiểm tra còn lại.
- Chỉ công bố online hoạt động sau khi test URL deploy thật trên hai mạng, có kho state và khả năng reconnect như V05.

## 10. Lời giao việc có thể copy

> Đọc REVIEW_V7_BUSINESS_TOUR_VERCEL_CHO_ANTI.md và ảnh reference-business-tour.png. Giữ các sửa luật/quyền xây của V6. Trước hết sửa L01, L02, N01 và thêm regression tests; sau đó triển khai FE + backend realtime trên Vercel với room store chung, broadcast liên instance và transaction/idempotency. Làm lại màn chơi theo bố cục bàn isometric lớn, HUD góc, công trình và nhân vật rõ như ảnh; inspector chuyển thành drawer. Bổ sung World Tour/Lost Island theo ruleset version rõ, không chỉ đổi tên ô. Chụp bàn có nhà và test hai mạng thật trước khi báo hoàn tất; nêu rõ phần còn thiếu. Không tự bỏ thay đổi V6 hoặc gọi việc chỉ đổi màu dashboard là đã đạt mục tiêu.
