# Review lần 3 sau bản cập nhật gameplay, online và đồ họa

**Ngày:** 06/11/2026. **Commit:** 6d70a1a. So với lần trước: 53a7caf.

**Website đã kiểm tra:** [monopoly-silk-ten.vercel.app](https://monopoly-silk-ten.vercel.app). Kiểm tra kết nối lúc **13:09**, kiểm tra lỗi UI local lúc **13:14**, giờ Việt Nam.

## 1. Kết luận

**Bản này tiến bộ rõ hơn bản trước**, đặc biệt ở màu sắc, mô hình nhà theo cấp, dock điện thoại và việc giữ tiền/vị trí sau GO. Một số lỗi được sửa thật, có probe xác nhận.

Tuy nhiên, **chưa thể coi online hoàn chỉnh**:

- Production vẫn chưa kết nối được Socket.IO.
- Server mới làm rơi gameLog; đã tái hiện mở nhật ký sau đồng bộ khiến màn chơi biến mất.
- Giới hạn tiền/nhà chưa ngăn được client sửa kết quả ván.
- Trade online có lỗi state cũ và thiếu xác thực người chấp nhận.
- Người thật thanh lý trả nợ vẫn khiến chủ đất nhận thiếu tiền.

**Ưu tiên tiếp theo:** sửa hợp đồng đồng bộ và quyền thực thi ở server trước; sau đó hoàn thiện nợ/giao dịch, camera và chữ. Không cần quay lại sửa những phần đã được xác nhận tốt.

## 2. Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| npm test | **21/21 vượt qua**, tăng từ 18 |
| npm run build | Thành công |
| Bundle | JS 974,73 kB, gzip 263,31 kB; còn cảnh báo chunk lớn |
| Production asset | index-DXw7lr0k.js, trùng tên asset build local |
| Socket.IO trên Vercel | Polling và WebSocket đều không kết nối được |
| Probe handler mua sau GO | Đã giữ đúng vị trí và tiền |
| Probe bot thiếu tiền thuê → thế chấp | Chủ đất đã nhận đủ |
| Probe người thật thiếu tiền thuê → thế chấp | Chủ đất vẫn nhận thiếu |
| Hai client Socket.IO trên server local riêng | Tái hiện sửa state tùy ý, rơi gameLog, không xóa được tài sản và accept trade sai người |
| UI online local với một trình duyệt và một client thử | Tái hiện màn chơi mất sau khi mở nhật ký |
| UI production 1440×900 và 390×844 | Màu tốt hơn; dock mobile hết tràn; camera vẫn chưa fit vùng chơi |

Bằng chứng và công cụ:

- [Kết quả kết nối production](docs/review-v3-2026-11-06/online-check-result.json).
- [Kết quả probe gameplay/server](docs/review-v3-2026-11-06/probe-results.json).
- [Lỗi runtime trên trình duyệt](docs/review-v3-2026-11-06/runtime-errors.json).
- [Ảnh desktop](docs/review-v3-2026-11-06/vercel-desktop.jpg), [ảnh mobile](docs/review-v3-2026-11-06/vercel-mobile.jpg), [ảnh UI sau lỗi đồng bộ](docs/review-v3-2026-11-06/local-sync-crash.jpg).
- [Script kiểm tra kết nối](docs/review-v3-2026-11-06/check-online.mjs), [script probe code thật](docs/review-v3-2026-11-06/probe-review.mjs).

Các probe gameplay trích handler thực tế từ App.jsx và chạy với setter/state giả lập. Chúng kiểm tra đường logic cụ thể, không thay thế toàn bộ vòng đời React. Riêng lỗi nhật ký đã được kiểm tra thêm bằng giao diện React thật. Các thử nghiệm sửa state chỉ chạy trên **server local cô lập ở cổng 3127**, không gửi hành động sửa ván tới production.

Chưa chơi trọn ván trên hai mạng Internet khác nhau; chưa đo FPS/GPU trên thiết bị thật. Khung trắng do trình duyệt chèn ngoài #root vẫn xuất hiện trong ảnh; không tính nó thành lỗi game.

## 3. Phần nào đã sửa được?

| Mục ở review V2 | Kết luận mới |
| --- | --- |
| R02 — bot mua sau GO dùng state cũ | **Đã sửa trong đường mua đất đã probe.** Luồng gọi nay truyền danh sách sau di chuyển |
| R03 — chủ đất nhận thiếu sau thanh lý | **Bot đã sửa; người thật chưa sửa** |
| R04 — ra tù người thật dùng state cũ | Đã truyền updated vào movePlayer ở hai nhánh; xác nhận bằng đọc code, chưa chạy đủ mọi trường hợp tù |
| R05 — trade online chỉ mở ở máy gửi | Đã thêm event gửi/nhận/phản hồi; còn lỗi thực thi và xác thực, xem mục 4 |
| R06 — Sổ Đỏ không sync | Đã thêm sync cho xây/bán/thế chấp/chuộc; phase, doubles, rejoin và phiên bản state vẫn thiếu |
| R07 — ô Du Lịch lại đưa vào tù | **Đã sửa tên/texture ô 30 về Vào Tù**, khớp cơ chế hiện tại |
| Cấp khách sạn 4/5 lẫn nhau | Board 2D, DeedModal và thông báo xây đã sửa về cấp 4 |
| Báo trạng thái kết nối | **Đã có thông báo trên lobby**, tốt hơn việc bấm tạo phòng không có phản hồi |
| Fog và color space | **Đã tắt fog và khai báo sRGB** cho texture màu; màu trên UI thực tế đậm hơn |
| Shadow frustum | Đã mở vùng shadow camera; cần tiếp tục kiểm tra hình và chi phí |
| Mô hình nhà theo tier | **Đã có Cottage / Townhouse / Villa / Landmark riêng trong code** |
| Dice animation giữ state cũ | **Đã thêm isRollingRef**, giải quyết đúng nguyên nhân closure cũ |
| Dock mobile bị tràn | **Đã cải thiện và xác nhận trong viewport 390×844** |
| Camera tự fit, chữ đủ lớn, tài nguyên GPU | Chưa hoàn thiện |

Ví dụ mua sau GO đã xác nhận:

- Bot từ ô 39, tiền 1 triệu; qua GO tới ô 1, có 3 triệu.
- Bot chọn cấp 4, giá 600.000 + 3×500.000 = 2,1 triệu.
- Kết quả đúng: **ô 1, còn 900.000**.
- Trước đây cùng dạng luồng bị quay lại vị trí/tiền cũ; lỗi này không còn trong trường hợp đã kiểm tra.

## 4. Những lỗi cần sửa trước

Quy ước: **P0** chặn phát hành online công khai; **P1** làm sai ván hoặc gây lỗi luồng; **P2** ảnh hưởng khả năng đọc, sử dụng hoặc độ bền.

### V3-01 — P1: Snapshot mới làm rơi gameLog và gây sập UI

**Vị trí:** server/index.js:159–224; App.jsx:147–154, 188 và 1750.

Server tạo sanitized nhưng không chép gameLog. Sau đó phát **sanitized**, trong khi client vẫn gọi setGameLog(incomingState.gameLog).

Một cập nhật đầy đủ bình thường gửi lên có gameLog, nhưng gói nhận lại chỉ còn:

    propertiesState, players, hasRolled, turnIndex, dice, freeParkingPool

gameLog thành undefined. Mở bảng nhật ký gọi gameLog.map; thêm log mới cũng có thể lỗi ở prev.slice.

**Đã tái hiện UI thật:** tạo phòng local → client thứ hai vào và ready → bắt đầu → client thứ hai gửi snapshot đầy đủ → chủ phòng mở nhật ký → màn chơi biến mất, console báo:

    TypeError: Cannot read properties of undefined (reading 'map')

**Sửa đề xuất:**

- Chốt rõ giao thức là snapshot đầy đủ hay patch; hiện server/client đang hiểu khác nhau.
- Nếu dùng snapshot, phát bản room.gameState đầy đủ đã xác thực, bao gồm các trường bắt buộc.
- Nếu dùng patch, client chỉ cập nhật trường có trong patch và phải merge đúng hợp đồng.
- Có kiểm tra schema phía nhận; giữ gameLog là mảng. Không chỉ dùng gameLog?.map để che lỗi đồng bộ.

**Nghiệm thu:** nhận cập nhật từ người khác rồi mở/thêm nhật ký không lỗi; mọi trường bắt buộc của snapshot tồn tại.

### V3-02 — P0: Chặn giá trị quá lớn chưa phải kiểm soát luật

**Vị trí:** server/index.js:170–216.

Mức houses=99 nay bị ép về 4 và tiền bị chặn trên 100 triệu. Nhưng client vẫn được tự chọn chủ đất, tiền dưới trần, xúc xắc, lượt và nội dung thắng.

Probe mới từ client khách xác nhận server phát lại:

| Trường | Payload được chấp nhận |
| --- | --- |
| Tiền của khách | **80.000.000** dù chưa có giao dịch hợp lệ |
| Ô 39 | Khách tự nhận sở hữu, công trình cấp 4 |
| winner | Khách tự khai thắng |
| winReason | Chỉ cần chuỗi “arbitrary text” |
| turnIndex | **999** |
| dice | **[0, 99]** |

hasLegitReason tại dòng 205 chỉ kiểm tra có chuỗi lý do, không kiểm tra điều kiện thắng. Một lý do bất kỳ không làm kết quả trở nên hợp lệ.

Việc ép trần 100 triệu còn có thể cắt tiền tích lũy hợp lệ nếu luật cho ván tiếp tục lâu. Quan trọng hơn, server sửa payload rồi chỉ phát cho máy khác; máy gửi giữ state gốc, có thể lập tức lệch nhau.

**Sửa đề xuất:** server nhận action và actor từ session; tự kiểm tra luật, tự sinh xúc xắc và tính kết quả. Winner được tính từ state chính thức sau transition hợp lệ. Từ chối lệnh sai thay vì chỉnh giá trị rồi coi như hợp lệ. Gửi kết quả/ack hoặc snapshot chuẩn về cả người gửi.

**Nghiệm thu:** khách không tự sửa được tiền, chủ đất, xúc xắc hoặc winner; 999 và [0,99] bị từ chối; các máy cùng revision.

### V3-03 — P1: Merge tài sản giữ lại đất đã trả ngân hàng

**Vị trí:** server/index.js:170–181.

sanitizedProps bắt đầu bằng bản sao tài sản cũ rồi chỉ ghi thêm các entry được gửi lên. Entry không còn trong snapshot mới không bị xóa.

**Đã probe:** state có ô 1 thuộc chủ phòng → gửi snapshot mới propertiesState={} → phía nhận vẫn có ô 1 thuộc chủ phòng.

**Hậu quả:** phá sản trả đất về ngân hàng hoặc một chuyển trạng thái xóa tài sản có thể đúng trên máy gửi nhưng không đúng ở server/máy khác.

**Sửa:** snapshot đầy đủ phải thay thế danh sách sở hữu sau kiểm tra; patch phải có thao tác remove/tombstone rõ. Tốt nhất server tự xử lý BANKRUPTCY và tạo state sau đó.

**Nghiệm thu:** đất trả ngân hàng không còn owner trên mọi máy và trong snapshot khôi phục.

### V3-04 — P1: Trade online còn hai lỗi độc lập

**Vị trí:** App.jsx:113–183, 1059; server/index.js:228–237.

**Lỗi thực thi:** listener trade_offer_responded được đăng ký trong useEffect([]), giữ executeTrade của lần render đầu. Lần đó players=[]; executeTrade không tìm thấy sender/target và return. Có thể hiện log “thành công” nhưng giao dịch không được áp dụng.

Probe handler ở ngữ cảnh render đầu xác nhận không ghi state; kết luận về listener dựa thêm vào closure thực tế trong code. Chưa chứng nhận một giao dịch online hoàn chỉnh bằng hai trình duyệt.

**Lỗi quyền chấp nhận:** server không lưu pending offer theo id, không kiểm tra người phản hồi có phải targetId. Probe cho thấy **chính người gửi tự phát respond_trade_offer accept=true** cho đề nghị nhắm tới người khác vẫn được broadcast.

Nếu chỉ vá closure, hiện mọi client nhận accept lại cùng executeTrade và phát state; vẫn có nguy cơ ghi chồng hoặc thực hiện nhiều lần.

**Sửa:**

- Server lưu offerId và người nhận, chỉ target được phản hồi.
- Server kiểm tra sở hữu/tiền hiện tại và thực hiện đúng một lần.
- Các client nhận state mới hoặc event kết quả, không cùng tự tính và sync lại giao dịch.
- Không sửa bằng cách thêm players vào dependency của effect tạo socket; cleanup của effect đang disconnect, sẽ gây nối lại liên tục. Nếu còn cần đọc state hiện hành ở listener, dùng store/ref/dispatch đúng vòng đời.

**Nghiệm thu:** người gửi không tự accept; accept hợp lệ chuyển tiền/đất đúng một lần, mọi máy khớp nhau.

### V3-05 — P1: Trả đủ nợ mới chỉ áp dụng cho bot

**Vị trí:** App.jsx:1161–1210 và onMortgage tại dòng 1936.

Bot đã được cộng shortfall cho chủ nợ sau thanh lý. Nhánh người thật vẫn chỉ mở Sổ Đỏ; khi bán/thế chấp, tiền tăng cho con nợ nhưng không có pending debt để thanh toán cho chủ nợ.

| Trường hợp cùng khoản nợ | Tiền chủ đất cuối cùng |
| --- | --- |
| Có 400.000, nợ thuê 1.000.000, bot thế chấp ô 37 được 1.750.000 | **1.000.000 — đã đúng** |
| Cùng tình huống nhưng người thật bấm thế chấp | **400.000 — còn thiếu 600.000** |

Con nợ người thật còn 1.150.000 sau thế chấp, không âm nữa, nên kiểm tra cuối lượt theo money < 0 không phát hiện phần chủ đất chưa được trả.

**Sửa:** debtContext dùng chung cho người và bot, lưu tổng nợ/đã trả/còn thiếu/chủ nợ. Bán hoặc thế chấp xong đi qua cùng bước settlement; không có hai nhánh kinh tế khác nhau.

**Nghiệm thu:** cùng đầu vào thì người và bot tạo cùng kết quả tiền/tài sản.

### V3-06 — P1: Production vẫn chưa có kết nối phòng online

Lần kiểm tra này đã dùng **bundle mới index-DXw7lr0k.js**:

- Trang chính: 200, HTML — frontend hoạt động.
- /api/health: 200, HTML trang game — không phải JSON health.
- /socket.io/?EIO=4&transport=polling: 200, HTML — không phải handshake.
- Polling: server error; WebSocket: websocket error.
- Bundle vẫn gọi socket với đích undefined/domain hiện tại.
- Lobby nay hiển thị “Chưa kết nối máy chủ”, phù hợp kết quả kiểm tra.

**Kết luận:** thêm trạng thái kết nối đã cải thiện UX, nhưng chưa làm backend production hoạt động. Người ở nơi khác vẫn chưa tạo/vào cùng phòng được qua link này.

Kế hoạch triển khai backend trong [review V2](REVIEW_V2_VERCEL_VA_KE_HOACH_DO_HOA.md) vẫn áp dụng: cấu hình backend thật, route và biến môi trường phù hợp rồi kiểm tra lại. Không cần suy đoán lỗi Wi-Fi khi endpoint đang trả HTML.

## 5. Đánh giá đồ họa mới

### Những thay đổi đúng hướng

- Cỏ và xúc xắc đậm màu, rõ hơn; không còn lớp fog làm nhạt phần xa như trước.
- Texture đã gắn sRGB; renderer khai báo output color space.
- Đã mở shadow frustum và thêm isRollingRef.
- Cấp 1/2/3 có hình khối riêng; không còn chỉ xếp nhiều bản sao cùng căn nhà.
- Nút camera đã chuyển xuống dưới card.
- Ô 30 hiển thị đúng Vào Tù.
- Dock mobile đã thu gọn: nút log hiện ở x≈356, rộng≈33, nằm trong viewport 390; trước đây ở x≈455.

### Những điểm còn thiếu để đạt cảm giác rõ như ảnh Business Tour

**1. Camera vẫn là bán kính cố định, chưa tự fit.** Board3D.jsx:684 dùng radius=36, dòng 706 vẫn là PerspectiveCamera. Desktop đã bớt sát nhưng góc gần còn bị dock che; portrait 390×844 vẫn cắt nhiều phần bên trái/phải của bàn.

Nên tính safe rectangle sau HUD/dock và fit bounding box theo từng aspect ratio. Orthographic mặc định là một lựa chọn; Perspective cũng dùng được nếu có thuật toán fit đúng. Không coi đổi một con số radius là hoàn tất responsive.

**2. Tăng texture chưa làm chữ lớn tương ứng.**

| Thành phần | Trước | Nay | Tỷ lệ trên cùng kích thước ô |
| --- | --- | --- | --- |
| Chiều rộng texture | 256 | 512 | Gấp đôi độ phân giải nguồn |
| Font giá | 30 | 64 | Chỉ lớn hơn khoảng **6,7%** theo tỷ lệ texture |
| Font tên | 24 | 42 | Nhỏ hơn khoảng **12,5%** theo tỷ lệ texture |

Camera lại lùi xa hơn, làm ô nhỏ đi trên màn hình. Vì vậy không thể dựa vào comment “64px cực lớn” để kết luận chữ đã đủ lớn cho người chơi.

Nên đo chữ theo pixel chiếu thực tế ở góc chuẩn, giảm dòng tên nhóm màu lặp lại, cho giá chiếm diện tích lớn hơn và có inspector chữ lớn. Mục tiêu không phải tăng texture vô hạn.

**3. Model đã đa dạng hơn nhưng còn cần ngôn ngữ hình ảnh thống nhất.** Tiếp tục làm silhouette, cửa/sảnh, chân đế/bóng tiếp xúc và dấu chủ sở hữu rõ. Cần ảnh kiểm tra một bàn đã có nhiều tier, không chỉ bàn trống. Chưa xác nhận chất lượng đầy đủ của các tier bằng một ván dài.

**4. Sắc nét cần đi cùng độ bền render.** Các chỗ sau vẫn còn:

- Board3D.jsx:1097 group.clear() chưa dispose tài nguyên công trình.
- Đổi material xúc xắc chưa giải phóng material cũ.
- Effect công trình phụ thuộc players, dựng lại mọi nhà cả khi chỉ đổi tiền/vị trí.
- Raycast tại dòng 914–915 dùng width/height lúc mount, không phải kích thước mới sau resize.
- Nhận click/drag vẫn so với vị trí pointermove cuối, dễ nhận nhầm kéo thành click.
- Texture ô vẫn tạo ban đầu với false/null tại dòng 843, chưa có cập nhật tương ứng cho chủ đất/thế chấp.

Tăng texture từ 256×380 lên 512×760 làm dữ liệu pixel của mỗi texture thường tăng khoảng bốn lần. Cần xử lý cache/dispose trước khi tăng thêm tài sản/hiệu ứng.

**5. Mobile hết tràn dock nhưng chưa hoàn thiện thao tác.** Sổ Đỏ/Đổi Đất chuyển sang card; một số nút ở đó chỉ cao khoảng 19–33 px. Cần menu/bottom sheet dễ bấm, vùng chạm đủ lớn và bàn được fit riêng cho portrait.

## 6. Những việc cũ chưa được xử lý hết

- doublesCount, phase thẻ/tù/nợ/trade, turn count và thời điểm bắt đầu chưa có hợp đồng đồng bộ hoàn chỉnh.
- Socket ID vẫn là danh tính chính; chưa có rejoin bền sau refresh/mất mạng.
- Chưa chặn toàn bộ thao tác online theo người đang tới lượt.
- Bắt đầu ván mới chưa reset timer/turn count/dice/pending state tập trung.
- Hệ số thuê gấp đôi của thẻ ga gần nhất vẫn cần truyền vào xử lý thuê.
- Thẻ thu/trả nhiều người vẫn cần giải quyết nợ từng bên.
- Jackpot/Festival chưa khớp hoàn toàn với mô tả lobby.
- Bundle gần 975 kB vẫn tải chung; Board3D chưa lazy-load.

Những mục này không nhất thiết đều phải làm trong một lượt sửa, nhưng không nên đánh dấu đã hoàn tất R01–R08/G01–G06 chỉ dựa vào tên commit.

## 7. Bộ test hiện tại cần cải thiện

Ba test mới về GO, shortfall và sanitization **tự dựng lại phép tính trong file test**, chưa gọi handler/server thật. Vì vậy test có thể pass khi luồng ứng dụng còn sai.

Ví dụ test shortfall chỉ mô phỏng bot; không kiểm tra người thật thanh lý. Test server chứng minh clamp hoạt động, nhưng không thử người thắng giả có winReason, sai lượt hoặc gói đồng bộ thiếu trường.

Các test có giá trị cần thêm:

1. Hai Socket.IO client: gửi snapshot hợp lệ → bên kia nhận đủ trường và UI dùng được.
2. Sau cập nhật peer: mở log, lắc và thêm log không lỗi.
3. Xóa tài sản khỏi snapshot/phá sản → server và mọi client cùng xóa owner.
4. Bypass dùng số trong giới hạn: tiền 80 triệu, nhà cấp 4, winner có lý do bất kỳ vẫn phải bị từ chối.
5. Người không phải target phản hồi trade → không đổi state.
6. Trade đã accept gửi lặp → thực hiện đúng một lần.
7. Người và bot có cùng khoản nợ → cùng kết quả sau bán/thế chấp.
8. GO + mua đất/ga gọi đúng code triển khai, không chép lại công thức trong test.
9. Resize desktop → mobile: click đúng ô, nút còn truy cập được và bàn được fit.
10. Chuyển 2D/3D, xây nhiều lần: tài nguyên ổn định sau khi cache ấm.

Về lâu dài, tách engine và handler server thành module có thể import để kiểm thử trực tiếp. Script trích App trong review là công cụ chẩn đoán, không phải kiến trúc test nên giữ lâu dài.

## 8. Thứ tự sửa đề xuất

### Đợt 1 — Ngăn sập và lệch state

- Sửa V3-01: thống nhất snapshot/patch, trường bắt buộc và fallback hợp lệ.
- Sửa V3-03: hỗ trợ xóa tài sản đúng.
- Thêm test hai client và kiểm tra UI sau đồng bộ.

**Đạt khi:** một cập nhật bình thường từ máy khác không làm mất màn chơi hoặc giữ owner cũ.

### Đợt 2 — Làm luật online đáng tin và kinh tế nhất quán

- Server xử lý action và tự tính winner; bỏ cách xem chuỗi lý do là xác nhận thắng.
- Trade có offerId, đúng người accept, thực hiện một lần ở server.
- Debt context chung cho người/bot.
- Bổ sung revision/actionId và reconnect/rejoin.

**Đạt khi:** không sửa được tiền/kết quả từ client; người và bot trả nợ đúng; các máy cùng trạng thái.

### Đợt 3 — Hoàn thiện deploy và xác nhận chơi từ xa

- Cấu hình backend production, route và URL socket.
- Chạy lại script kết nối.
- Hai thiết bị dùng hai mạng khác nhau: vào phòng, chơi các luồng chính và tới kết quả cuối.

**Đạt khi:** có bằng chứng ván chơi thực tế, không chỉ trang web mở được.

### Đợt 4 — Đồ họa và mobile

- Fit camera theo safe area; đo kích thước chữ sau chiếu.
- Inspector/bottom sheet dễ đọc và dễ bấm.
- Cache/dispose, cập nhật texture sở hữu/thế chấp và sửa raycast.
- Sau đó thêm chi tiết model, nhân vật, âm thanh/animation sự kiện.

**Đạt khi:** bàn rõ trên cả desktop/portrait, không cắt ô quan trọng, không giảm hiệu năng dần.

## 9. Prompt ngắn bàn giao cho Antigravity

> Đọc REVIEW_V3_SAU_CAP_NHAT.md, probe-results.json và runtime-errors.json. Giữ các sửa đã tốt: truyền state sau GO, shortfall của bot, tier model riêng, sRGB/no fog, ref xúc xắc và dock mobile.
>
> Ưu tiên lỗi mới: server bỏ gameLog làm UI sập; merge propertiesState không xóa owner; winner có chuỗi lý do bất kỳ vẫn được chấp nhận; client vẫn sửa được tiền/tài sản/lượt. Chốt giao thức snapshot/patch và chuyển logic online sang server nhận action.
>
> Sửa trade: listener hiện giữ executeTrade của render đầu có players=[]; server chưa kiểm tra đúng người nhận hoặc lưu pending offer. Chỉ server thực hiện giao dịch một lần, client nhận kết quả.
>
> Sửa debt context cho người thật, không chỉ bot. Kiểm tra cùng khoản nợ 1 triệu với tiền mặt 400k và thế chấp 1,75 triệu: chủ đất phải nhận đủ 1 triệu.
>
> Camera cần fit theo viewport và HUD; texture lớn hơn chưa có nghĩa chữ hiển thị lớn hơn. Tiếp tục cải thiện độ rõ theo pixel thực, đồng thời sửa tài nguyên GPU và raycast.
>
> Test phải gọi code thực hoặc hai client/server thật, không chép lại công thức. Xác nhận production kết nối được rồi mới báo chơi online từ nơi khác hoàn tất.

---

**Đánh giá cuối:** đồ họa và một số đường gameplay đã tiến bộ thật. Phần cần đầu tư ngay bây giờ là hợp đồng state giữa server/client và xử lý tiền/giao dịch thống nhất; đây là chỗ đang khiến test xanh nhưng ván thực tế vẫn có thể lỗi.
