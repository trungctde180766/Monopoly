# Review V6 — giao diện rõ ràng và logic dùng chung

> **Review tiếp theo:** [V7 — Business Tour, lỗi còn lại và Vercel cho Anti](REVIEW_V7_BUSINESS_TOUR_VERCEL_CHO_ANTI.md). V7 bổ sung lỗi đã tái hiện và cập nhật mục tiêu giao diện theo ảnh; kế hoạch desktop dashboard/sidebar của V6 không còn là hướng hình ảnh cuối cùng người dùng yêu cầu.

Ngày 06–07/11/2026, nền commit `b9b9621`. Đã review, triển khai và kiểm tra trong workspace theo yêu cầu người dùng. Bản V6 chưa commit/push/deploy trong lượt này.

## Phát hiện trước khi sửa

| Mã | Mức | Vấn đề và ảnh hưởng |
| --- | --- | --- |
| U01 | P1 | HUD đặt cố định ở 6 góc/vị trí, đồng hồ/quỹ/nút camera/nút âm thanh và dock đều nổi riêng. Trên mobile các vùng tranh chỗ, che bàn và không rõ nơi cần nhìn. |
| U02 | P2 | Banner dùng màu theo index, avatar/quân/đất dùng player.color. Một người có nhiều màu nhận diện khác nhau. |
| U03 | P1 | Nút hết lượt và nút bị khóa thiếu giải thích; chưa phân biệt rõ đang chọn mua, chờ người khác, xử lý nợ hay đã xong lượt. |
| U04 | P1 | DeedModal vẫn có “4 Nhà” rồi thêm “Khách Sạn” lấy rent[5], trong khi engine Landmark ở tier 4/rent[4]. Hướng dẫn chi phí khách sạn cũng còn luật cũ. |
| U05 | P2 | Modal mua làm mờ/che toàn bàn, các lựa chọn nhỏ; không có preview, khó thấy công trình sẽ nằm ở đâu. |
| U06 | P2 | Chữ trên mặt bàn nhỏ theo phối cảnh; thiếu vùng thông tin bằng chữ lớn và cách chọn ô bằng bàn phím. |
| L01 | P1 | Quỹ thưởng gom thuế nhưng không chi trả ở ô Lễ hội trong cả hai luồng local/server. Checkbox mô tả khác hành vi. |
| L02 | P1 | Lần đổ tù thất bại thứ ba trừ phạt rồi vẫn di chuyển dù còn âm tiền; có thể phát sinh khoản nợ thứ hai trước khi giải quyết khoản thứ nhất. |
| L03 | P1 | Logic local trong App và online trong gameSession bị nhân đôi; xử lý thẻ nhiều người/nợ khác nhau. Sửa một luồng chưa đảm bảo luồng còn lại đúng. |
| L04 | P1 | Timer lắc/di chuyển local không gắn với phiên ván. Rời bàn rồi mở ván mới có nguy cơ callback ván cũ cập nhật vào ván mới. |
| L05 | P2 | Ra tù nhờ đổ đôi ở local vẫn có thể được thêm lượt vì end-turn chỉ xét hai xúc xắc bằng nhau. |

## Kiểm tra bản đang deploy

Trang public đang tải asset `index-BarhytB4.js`, đúng bản V5 đã push. Đã xem giao diện sáu người ở desktop 1440×900 và mobile 390×844.

- [Trước sửa, desktop](docs/review-v6-2026-11-06/before-desktop.jpg).
- [Trước sửa, mobile](docs/review-v6-2026-11-06/before-mobile.jpg).

Khung trắng do môi trường trình duyệt chèn ngoài game không được tính là lỗi sản phẩm. Các nhận định HUD dựa thêm trên cấu trúc fixed của code, không quy khung trắng đó cho game.

## Thiết kế và cách sửa

- Header gọn: tên game, chế độ, lượt, thời gian, kết nối; âm thanh/rời bàn có tên rõ.
- Bàn nằm trong viewport riêng, không bị thẻ người chơi đè lên. Camera ở trong vùng bàn.
- Danh sách người chơi cùng một vùng, màu lấy trực tiếp player.color; mobile có danh sách thu gọn.
- Một thanh hành động: ai đang đi, bước hiện tại, lý do phải chờ và một hành động chính đúng phase. Quản lý tài sản/giao dịch/nhật ký ở cùng một nơi.
- Inspector bằng chữ lớn cho ô được chọn; danh sách chọn đủ 40 ô dùng được bàn phím. Tiền thuê tính từ engine, không chép bảng khác luật.
- Modal mua nhẹ hơn, bốn cấp rõ tổng chi/số dư còn lại, có preview công trình; preview không ghi state sở hữu.
- Engine phiên chơi dùng chung cho local/bot/server; lệnh có revision và vòng đời UI có hủy timer khi đổi ván.
- Trả Quỹ thưởng trước phần chọn Lễ hội nếu bật tùy chọn; dừng di chuyển từ tù cho tới khi trả được phạt.

## Kết quả triển khai

### Giao diện đã sửa

- Thay HUD rải rác bằng header, vùng bàn riêng, danh sách người chơi, bảng thông tin ô và thanh hành động. Desktop giữ bàn bên trái; mobile thu danh sách người chơi, cuộn phần thông tin trong vùng giữa và luôn giữ hành động trong khung.
- Màu chủ đất, thẻ người chơi và quân dùng cùng màu nhận diện. Thống kê đếm số công trình trên các thành phố, tránh coi Biệt thự là ba căn nhà.
- Camera mặc định tự căn theo tỷ lệ vùng bàn; có góc từ trên, viền ô đang chọn và nhãn HTML rõ tên ô/giá/tiền thuê. Đã giảm đường trang trí gây nhiễu nền.
- Chọn được cả 40 ô bằng danh sách; bảng giá lấy tiền thuê từ cùng hàm tính với luật chơi, gồm độc quyền, Lễ hội và thế chấp. Landmark là cấp 4, không còn thêm một hàng khách sạn cấp 5 sai luật.
- Cửa sổ mua có bốn cấp, tổng thanh toán, số dư còn lại và lý do khóa. Xem trước dựng công trình mờ xanh đúng ô; có chế độ thu nhỏ cửa sổ để nhìn bàn. Mở xem trước sẽ đưa về bàn 3D. Chọn preview chưa trừ tiền/chưa đổi sở hữu.
- Sau khi xác nhận, công trình thật thay preview. Không thể mua Biệt thự rồi bấm +Xây thành Landmark trong cùng lần ghé. Quản lý tài sản khóa thao tác khi ngoài lượt hoặc đang đến lượt bot.
- Bảng 2D hiển thị tiền thuê của tài sản đã có chủ; cấp nhà biểu diễn một công trình kèm số cấp. Inspector vẫn là nơi đọc chi tiết khi ô trên bản đồ nhỏ.
- Modal mới có tên truy cập, điều hướng Tab, Escape và trả focus về nút mở. Sửa lời giới thiệu ở sảnh để nói đúng ruleset Arcade của dự án.

### Logic đã sửa

- `src/logic/gameSession.js` là bộ xử lý phiên dùng chung cho local, bot và server. `server/gameSession.js` giữ các export tương thích. `src/hooks/useGameController.js` xử lý kết nối, hành động và hoạt ảnh; App chỉ lắp các màn hình.
- Quỹ thưởng trả đúng một lần ở ô Lễ hội, đặt quỹ về 0 và tôn trọng tùy chọn bật/tắt. Phần thưởng 500k khi chưa sở hữu thành phố vẫn hoạt động riêng.
- Lần đổ tù thất bại thứ ba, nếu thiếu tiền phạt, dừng ở tù để thanh lý trước; sau khi trả được mới di chuyển và tính tiền thuê ô đến. Tránh ghi đè khoản nợ.
- Ra tù bằng đôi không nhận thêm lượt đôi. Người phá sản được bỏ qua ngay khi ván chưa kết thúc.
- Rời bàn/đổi ván hủy callback lắc và di chuyển; trạng thái cũ khác phiên hoặc revision thấp hơn bị bỏ qua. Giữ xác thực hành động trên server khi online.

### Bằng chứng giao diện

| Kiểm tra thực tế | Kết quả |
| --- | --- |
| Desktop 1440×900, sáu người | Bàn, bảng thông tin và thanh lượt nằm trong các vùng riêng. [Ảnh](docs/review-v6-2026-11-06/after-desktop.jpg). |
| Mobile 390×844 và 320×740 | Không tràn ngang trong vùng game. Ở 390px, root rộng 390px, bàn kết thúc y≈547, thanh lượt bắt đầu y≈678, nút chơi kết thúc y≈789 trong màn hình cao 844px. Ở 320px nút kết thúc x=308, y≈685 trong màn hình 320×740. [Ảnh mobile](docs/review-v6-2026-11-06/after-mobile.jpg), [số đo 390px](docs/review-v6-2026-11-06/mobile-metrics.json). |
| Mua Biệt thự Huế ở local | 15 triệu → 13 triệu; 1 tài sản, 1 công trình. Landmark khóa ở lần ghé đầu. Quản lý không cho xây tiếp trong lần ghé đó. [Preview](docs/review-v6-2026-11-06/after-preview.jpg). |
| Bảng giá và bàn phím | Bảng đủ 5 hàng đất trống + cấp 1–4; Escape đóng và trả focus về nút mở. [Ảnh bảng giá](docs/review-v6-2026-11-06/after-deed.jpg). |
| Vòng bot qua UI | Ba bot tự đi, mua/nâng nhà và trả lượt về người thật; một bot đổ đôi tiếp tục lượt đúng luật. [Nhật ký](docs/review-v6-2026-11-06/bot-log.txt). |
| Rời bàn giữa lúc lắc | Về sảnh, mở ván Quick mới vẫn ở GO, tiền 15 triệu, lượt 1; không nhận kết quả callback ván cũ. |
| Online hai tab | Tạo/vào phòng, sẵn sàng, bắt đầu; khách bị khóa nút trong lượt host. Host mua Ga Sài Gòn 2 triệu, cả hai thấy host còn 13 triệu và thuê 250k. |
| Reload online | Khách tải lại trang, khôi phục đúng tên, phòng, tài sản và lượt; tiếp tục lắc được. [Trạng thái khôi phục](docs/review-v6-2026-11-06/online-guest-resumed.txt). |
| Preview/mua online | Khách chọn Biệt thự Sơn Trà: preview chưa đổi ví 15 triệu; xác nhận chi 2,2 triệu, còn 12,8 triệu, thuê 3 triệu. Cả hai màn hình đồng bộ. [Preview trên bàn](docs/review-v6-2026-11-06/after-preview-online.jpg), [host](docs/review-v6-2026-11-06/online-purchase-host.txt), [khách](docs/review-v6-2026-11-06/online-purchase-guest.txt). |

Ảnh desktop có thể chứa một panel trắng do tiện ích trình duyệt chèn ngoài `#root`; đó không phải panel của game. Ảnh preview online cắt phần bên phải để tránh panel ngoài game; giữ vùng bàn, header, cửa sổ mua và thanh lượt. Không sử dụng sửa state trong trình duyệt để tạo các tình huống UI này.

### Kiểm tra tự động

- `npm test`: **66/66 bài qua** — 23 bài nền và 43 bài dùng Node test runner, không có bài thất bại/bỏ qua. Bao gồm Socket.IO thật, từ chối hành động sai lượt/revision và snapshot giả, giao dịch, xây nhà, nợ, tù, jackpot, bảng giá và camera.
- Thêm 12 bài hồi quy V6, trong đó có 8 seed mô phỏng toàn bot, tối đa 600 hành động mỗi seed; kiểm tra vị trí, tiền nguyên và người đang đi chưa phá sản khi ván còn tiếp tục. Đây là mô phỏng hữu hạn, không phải chứng minh mọi ván đều đúng.
- `npm run build`: thành công. Bundle chính khoảng 407,04 kB, gzip 125,13 kB; tách Board3D tải riêng khoảng 564,72 kB, gzip 142,35 kB. Vite còn cảnh báo chunk 3D >500 kB.
- `git diff --check`: qua tại lần kiểm tra code. Không có script lint trong package.json; không báo là đã lint toàn dự án.

## Online trên Vercel: kết luận hiện tại

**Code chơi online được với server Node đang chạy; URL public hiện chưa chơi được với người ở nơi khác.** Không đồng nhất kết quả hai tab localhost với kiểm tra hai thiết bị qua Internet.

Kiểm tra lại lúc **14:42 ngày 07/11/2026, giờ Việt Nam** trên [trang public](https://monopoly-silk-ten.vercel.app):

- Frontend vẫn là asset `index-BarhytB4.js` của V5, chưa có các thay đổi V6 trong báo cáo này.
- `/api/health` và `/socket.io/?EIO=4&transport=polling` trả HTML SPA thay vì health JSON/Engine.IO handshake.
- Cả WebSocket và polling đều kết nối thất bại. Bundle public gọi Socket.IO cùng origin, chưa gắn backend riêng. [Kết quả kiểm tra thực tế](docs/review-v6-2026-11-06/public-connectivity.json).

Để hoàn tất public online, deploy toàn repository lên dịch vụ Node phù hợp, kiểm tra health, đặt `VITE_SOCKET_URL` và `VITE_SOCKET_PATH` trên Vercel rồi rebuild/redeploy cả hai cùng phiên bản. Hướng dẫn chi tiết ở [DEPLOY_ONLINE.md](DEPLOY_ONLINE.md). Workspace hiện chưa có backend URL public để triển khai/kiểm tra đích đó.

Server hiện giữ phòng trong RAM một tiến trình: restart sẽ mất phòng. Chưa có lưu ván bền vững/nhiều instance. Trước khi tuyên bố hoàn tất cần hai thiết bị thật ở hai mạng khác nhau tạo phòng, mua nhà, đổi lượt và reconnect.

## Phần nên nâng cấp tiếp

| Ưu tiên | Hạng mục | Tiêu chí hoàn tất |
| --- | --- | --- |
| P0 | Backend public và cấu hình frontend | Health JSON đúng, kết nối Socket.IO thành công; điện thoại 4G và máy Wi-Fi chơi chung phòng, đồng bộ mua/nâng nhà, reload khôi phục đúng người. |
| P1 | Lưu phòng/phiên và xử lý mất kết nối | Restart dịch vụ vẫn khôi phục được ván; mất kết nối/quay lại không nhân đôi người chơi; có thông báo và thời hạn rõ. |
| P1 | Đồng bộ phong cách các cửa sổ còn lại | Quản lý tài sản, giao dịch, tù, Lễ hội và thẻ dùng cùng màu/chữ/nút như BuildDialog và DeedModal. Hiện các cửa sổ cũ vẫn có nền tối và mật độ cao. |
| P1 | Đồ họa công trình có nhận diện mạnh hơn | Bốn cấp có silhouette rõ, chân nhà/ô đất tương phản, tài sản đối thủ nhận biết ngay; bổ sung chuyển động xây, thu tiền, lễ hội và nhân vật phản ứng vừa phải. Hiện vẫn là hình khối do code dựng, chưa đạt độ hoàn thiện mỹ thuật của Business Tour. |
| P2 | Cải thiện hiệu năng thiết bị yếu | Đo trên điện thoại thật, giới hạn pixel ratio/bóng đổ, điều chỉnh chất lượng hoặc dùng chế độ nhẹ; giảm thời gian tải chunk Three và kiểm tra GPU context loss. Camera đã vừa khung không đồng nghĩa FPS đã đạt trên mọi máy. |
| P2 | Hướng dẫn lần đầu và tóm tắt giao dịch tiền | Giải thích mua cấp 1–3/Landmark lần ghé sau, mua lại, nợ và điều kiện thắng ngay tại tình huống; bổ sung dòng tiền nổi từ người trả tới chủ đất. |
| P2 | Kiểm tra dài hạn | Nhiều seed hơn, nhiều vòng reconnect, rời phòng khi đang nợ/đang có đề nghị, phòng đủ sáu người và test UI tự động cho luồng quan trọng. |

## Đánh giá so với Business Tour

Luồng mua/chọn cấp/xem công trình trên ô đã gần hướng người dùng muốn hơn: thấy giá, thấy vị trí, xác nhận một lần và Landmark có điều kiện riêng. Giao diện lượt và thông tin ô rõ hơn bản V5. Tuy nhiên đây vẫn là ruleset riêng lấy cảm hứng: không nên quảng cáo là bản sao đầy đủ của Business Tour hoặc Monopoly trên Steam. Chất lượng asset, nhân vật, hiệu ứng giao dịch và online public còn là khoảng cách thực tế cần làm tiếp.
