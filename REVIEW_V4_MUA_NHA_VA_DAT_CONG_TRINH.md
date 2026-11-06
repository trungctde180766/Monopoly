# Review lần 4: mua nhà, nâng cấp và đặt công trình theo hướng Business Tour

**Ngày:** 06/11/2026. **Commit:** 8780404. So với review trước: 6d70a1a.

**Bản kiểm tra:** [monopoly-silk-ten.vercel.app](https://monopoly-silk-ten.vercel.app), asset index-DPIkxKEz.js. Kiểm tra kết nối lúc 13:46, probe nhà/server và thao tác mua trong khoảng 13:49–13:55, giờ Việt Nam.

## 1. Kết luận

**Bản mới đã sửa được một số lỗi quan trọng của review V3.** Tuy nhiên, cách mua/nâng nhà vẫn chưa đủ cơ sở để gọi là giống Business Tour, và vị trí công trình trên ô còn cần thiết kế lại.

Hai điểm chính:

1. **Luật xây đang quá tự do:** được mua thẳng Landmark lần đầu, nâng qua Sổ Đỏ khi không đứng ở đất đó và bot nâng đất từ xa cuối lượt.
2. **Ô chưa có vùng đặt nhà riêng:** nhà, quân cờ và thông tin cùng tranh vùng giữa ô; Landmark còn rộng hơn chiều ngang ô.

Đề xuất chốt một **mode lấy cảm hứng Business Tour với quy tắc xây rõ ràng**, dùng chung cho người và bot. Renderer chỉ đặt công trình vào ô được sở hữu theo state chính thức; việc kéo/thả hoặc preview không được tự quyết định quyền xây.

Đợt này là review và kế hoạch. Chưa sửa gameplay hoặc deploy thay người dùng.

## 2. Đối chiếu Business Tour: điều gì đã xác minh, điều gì chưa?

### Mốc tham chiếu có nguồn

Trong trả lời ngày 16/02/2018, moderator CONAN_Fabrice mô tả khách sạn cần thành phố đã ở cấp nhà 3, sau đó người chơi đáp lại thành phố mới mua được khách sạn. Đây là mốc tham chiếu trực tiếp hữu ích, nhưng là nguồn lịch sử, chưa phải chứng nhận toàn bộ luật phiên bản 2026. [Nguồn thảo luận Steam](https://steamcommunity.com/app/397900/discussions/0/2860219962083799627/).

Một thảo luận khác có phản hồi từ tài khoản gắn nhãn developer nói về tình huống tiền bất thường và mua khách sạn ngay vòng đầu như hành vi chơi không công bằng. Nguồn này không cung cấp đầy đủ bảng điều kiện xây. [Nguồn](https://steamcommunity.com/app/397900/discussions/0/569290593938844373/).

### Cần sửa nhận định trong đặc tả nội bộ

BUSINESS_TOUR_RULES.md hiện khẳng định có thể mua thẳng từ cấp 1 tới cấp 4 ngay lúc mua đất. **Không nên tiếp tục dùng khẳng định đó làm “luật Business Tour chuẩn”.** Nó không khớp mốc moderator nêu trên.

Những phần cần xác minh thêm bằng bản game/tutorial hiện hành trước khi gắn nhãn “giống 100%”:

- Giới hạn cấp nhà thường ở vòng đầu và sau khi qua GO.
- Điều kiện xây/nâng từ ô Start hoặc từ thẻ/sự kiện.
- Có được nâng ngay sau buyout hay không.
- Giá mua, chi phí từng cấp, phí mua lại và giá trị thanh lý.
- Mô hình hình ảnh của từng cấp là một công trình hay một cụm công trình.

**Không lấy hướng dẫn cộng đồng chưa kiểm chứng để biến mọi chi tiết thành luật cứng.** Phần dưới phân biệt rõ lỗi trong code, mốc tham chiếu và thiết kế đề xuất cho dự án.

## 3. Đã kiểm tra gì và bản mới sửa được gì?

| Kiểm tra | Kết quả |
| --- | --- |
| npm test | **23/23 vượt qua** |
| npm run build | Thành công; JS 976,27 kB, gzip 263,87 kB; còn cảnh báo chunk lớn |
| Qua GO rồi mua | Vẫn giữ đúng tiền và vị trí trong probe hồi quy |
| Bot thanh lý trả nợ | Chủ đất nhận đủ trong tình huống đã kiểm tra |
| Người thật thế chấp trả nợ | **Đã sửa**, chủ đất nhận đủ trong tình huống đã kiểm tra |
| gameLog qua server | **Đã giữ được mảng log**, client cũng có guard |
| Trả đất ngân hàng/xóa entry | **Đã xóa được**, không còn giữ owner cũ trong probe |
| Dice [0,99], turnIndex 999 | Đã bị đưa về giá trị state trước |
| Winner chỉ có chuỗi tùy ý | Đã bị loại nếu không chứa từ khóa |
| Winner có từ khóa hợp lệ nhưng không có tài sản | **Vẫn lọt** |
| Trade | Đã kiểm tra socket là target; vẫn chưa xác minh pending offer/điều khoản phía server |
| Vercel online | **Vẫn chưa kết nối phòng được**: hai transport thất bại, endpoint socket trả HTML |

Bằng chứng:

- [Probe mua/xây và kích thước model](docs/review-v4-2026-11-06/housing-probe-result.json).
- [Probe hồi quy gameplay](docs/review-v4-2026-11-06/gameplay-regression-result.json).
- [Probe server](docs/review-v4-2026-11-06/network-probe-result.json).
- [Kết nối Vercel](docs/review-v4-2026-11-06/online-check-result.json).
- [Modal mua lần đầu](docs/review-v4-2026-11-06/purchase-modal.jpg).
- [Nhà nhìn từ trên](docs/review-v4-2026-11-06/landmark-top-view.jpg), [nhà ở góc chơi](docs/review-v4-2026-11-06/landmark-board-view.jpg).

Các probe handler trích code thực tế và dùng setter/state giả lập; phần mua nhà còn được kiểm tra trực tiếp trên UI production. Chưa chơi trọn ván hai mạng khác nhau, chưa đo FPS/GPU. Khung trắng do trình duyệt chèn ngoài #root không được tính là lỗi game.

## 4. Review cách mua và nâng nhà hiện tại

### H01 — Mua thẳng Landmark ngay lần đầu

**Vị trí:** ActionModals.jsx:105–152; App.jsx:666–704; nhánh bot mua tại App.jsx.

Modal dựng cả bốn cấp cho đất chưa có chủ, rồi mặc định chọn cấp đắt nhất người chơi đủ tiền. Handler chỉ kiểm tra cấp tăng, không quá 4, không thế chấp và đủ tiền; chưa có điều kiện lịch sử xây/đáp lại.

**Đã thử UI:** Người Chơi 2 lần đầu tới Chợ Lớn, chưa mua thành phố đó trước đây. Modal mặc định chọn Landmark, cho xác nhận giá **2,1 triệu** và đặt công trình ngay. Số dư từ 15 triệu còn **12,9 triệu**.

Probe handler cũng xác nhận đất chưa có chủ đi thẳng tới tier 4 được chấp nhận.

**Đề xuất:** thêm gate khách sạn theo mốc tham chiếu tại mục 2; UI vẫn có thể hiển thị thẻ cấp khóa nhưng phải ghi lý do. Engine/server kiểm tra lại, không chỉ disable nút.

### H02 — Sổ Đỏ cho nâng nhà ở bất kỳ vị trí nào

**Vị trí:** gameEngine.js:84–100; ActionModals.jsx:710–764; App.jsx onBuildHouse.

canBuildHouse chỉ xét chủ, tiền, thế chấp và cấp. Không xét người chơi đang ở ô nào, đang ở phase nào hoặc có quyền xây từ sự kiện đặc biệt không.

**Probe:** người chơi đứng ô 20, sở hữu ô 1 cấp 3, có tiền → validator cho nâng ô 1 lên Landmark. Như vậy chỉ sửa modal mua ban đầu sẽ không đủ: người chơi vẫn có đường nâng qua Sổ Đỏ.

**Đề xuất:** Sổ Đỏ chủ yếu để xem/quản lý tài sản. Nút nâng chỉ hoạt động khi engine cấp quyền cho một BuildDecision cụ thể. Nếu ruleset cho nâng từ Start/thẻ, phải có context riêng, không biến thành quyền nâng mọi lúc.

### H03 — Bot còn dùng luật khác người

**Vị trí:** aiEngine.js:91 trở đi; App.jsx:1403–1428.

Cuối lượt, bot gọi getBuildRecommendations cho các bộ màu sở hữu rồi xây, dù không đang đáp tại những ô đó.

**Probe:** bot đứng ô 20, nhóm nâu có ô 1 cấp 3 và ô 3 cấp 4 → đề xuất xây ô 1.

Đây vừa là đường bỏ qua điều kiện ghé lại, vừa làm bot có nhịp nâng khác với người chơi. Nếu hướng tới Business Tour, đừng lấy cơ chế nâng toàn bộ bộ màu cuối lượt làm nền mặc định.

**Đề xuất:** bot chỉ chọn một trong các hành động hợp lệ do engine cấp cho phase hiện tại. Ưu tiên bộ màu có thể là chiến thuật, không phải một luồng luật xây riêng.

### H04 — Chưa có một nguồn tính chi phí và khả năng xây duy nhất

Chi phí đang được tính tại gameEngine, modal và handler App; đường Sổ Đỏ lại tăng một cấp bằng callback riêng.

Ngoài ra, tier 1 mua mới chỉ thu giá đất nhưng được ghi houses=1. Các phép net worth, buyout và thanh lý lại dùng houses như số lần trả tiền nhà. Cần định nghĩa rõ “cấp công trình” và “chi phí đã đầu tư”; không tự xem chúng là một đại lượng.

**Đề xuất:**

- Dùng buildingTier thay cho tên houses dễ nhầm với số căn nhà Monopoly.
- Quy định rõ giá đất là giá đất trống hay gói đã gồm cấp 1.
- Mọi preview giá lấy từ cùng hàm quote; lúc xác nhận engine tự tính lại.
- Giá trị bán/mua lại được định nghĩa theo ruleset, không suy ra tùy tiện từ số model đang vẽ.
- Validate số nguyên, owner, loại ô, phase, quyết định còn hiệu lực và số dư hiện hành.

## 5. Luồng mua/nâng đề xuất

Đây là **đặc tả đề xuất cho dự án**, không phải bản sao đã chứng nhận mọi luật của Business Tour hiện hành.

### 5.1. Lần đầu ghé thành phố chưa có chủ

1. Quân cờ dừng tại ô; camera/viền highlight đúng ô.
2. Engine tạo BuildDecision gồm ô, người chơi, landingId, các lựa chọn đang được phép và bảng giá.
3. UI hiện các cấp nhà thường được mở theo ruleset; khách sạn đi qua gate riêng.
4. Chọn một cấp hoặc bỏ qua. Không mặc định luôn chọn phương án tối đa.
5. Preview công trình trên đúng ô và hiện: tổng chi, số dư sau mua, tiền thuê dự kiến.
6. Xác nhận → server/engine kiểm tra → trừ tiền, đổi sở hữu/tier đúng một lần.
7. Đóng quyết định. Không cho mở Sổ Đỏ để tiếp tục nâng miễn điều kiện trong cùng lượt.

Giới hạn cấp nhà thường nên là cấu hình được kiểm chứng, ví dụ maxRegularTier theo completedLaps. **Chưa chốt con số vòng đầu chỉ dựa vào một bài kể của người chơi.**

### 5.2. Ghé đất của mình

| Trạng thái khi bắt đầu lần đáp | Hành vi đề xuất |
| --- | --- |
| Cấp thường còn nâng được | Cho chọn trong tập lựa chọn hợp lệ |
| Đạt điều kiện gate khách sạn | Mở hành động nâng đặc biệt |
| Đã tối đa | Xem tài sản, không có nút trả tiền nâng tiếp |
| Đang thế chấp | Giải thích trạng thái và các lựa chọn hợp lệ |
| Đang xử lý nợ/thẻ/decision khác | Chưa cấp thêm một quyết định xây chồng lên |

Phải lưu trạng thái tại **đầu landing**. Không cho người chơi chọn nâng lên cấp 3 rồi ngay lập tức bấm tiếp lên khách sạn trong cùng quyết định để lách gate.

Không chỉ kiểm tra turnNumber: một lượt có thể chứa nhiều lần di chuyển/đổ đôi. landingId hoặc decisionId mới diễn tả đúng một lần đáp và một cơ hội xây.

### 5.3. Ghé đất đối thủ hoặc tài sản đặc biệt

- Xử lý tiền thuê/nợ trước.
- Nếu có buyout: hiển thị phí riêng, tình trạng công trình và điều kiện mua lại theo mode.
- Quyền nâng sau buyout phải được xác minh và ghi rõ; không tự mở thêm modal xây chỉ vì owner vừa đổi.
- Ga/tiện ích đi qua luồng mua riêng, không có menu cấp nhà.
- Giữ lựa chọn không đấu giá của mode Arcade hiện tại; không tự thêm luật Monopoly Classic vào.

### 5.4. Một hợp đồng hành động chung

    BuildDecision:
      id, playerId, tileId, landingId, source
      tierAtLandingStart, allowedActions
      quote, stateRevision

    ConfirmBuild:
      decisionId, selectedAction, expectedRevision, actionId

Server xác định người gửi từ session và tự lấy giá. Client không quyết định owner, tiền hoặc điều kiện thắng bằng cách gửi cả state.

Nếu có nâng đặc biệt từ Start/thẻ, source có thể là start_bonus/card. Chỉ các source thật sự được ruleset hỗ trợ mới cấp quyền; không mặc định mọi ô đều nâng được.

### 5.5. Ví dụ giữ bảng giá repo để sửa quy trình

Chợ Lớn hiện có giá 600.000, mỗi bước nhà 500.000. Nếu tiếp tục dùng biểu giá đó:

| Phương án thường | Tổng chi mua mới hiện hành |
| --- | --- |
| Cấp 1 | 600.000 |
| Cấp 2 | 1.100.000 |
| Cấp 3 | 1.600.000, nếu đã được ruleset mở |

Đây chỉ là ví dụ giá của **dự án**, không phải giá Business Tour gốc. Gate đặc biệt, thời điểm mở và bước nâng sau đó phải được engine áp dụng. Nếu thay đổi quy tắc, cập nhật cả BUSINESS_TOUR_RULES.md, README và các test cũ đang coi mua thẳng tier 4 là hành vi hợp lệ.

## 6. Review vị trí công trình trên bàn

### P01 — Đế Landmark vượt chiều ngang ô

**Vị trí:** Board3D.jsx:467–481 và phần tạo tile.

Đo Box3 từ factory model thật:

- Ô thường rộng **1,8**, sâu **2,7**.
- Đế Landmark rộng/sâu khoảng **1,9**.
- Vượt chiều ngang khoảng **0,1**, chưa tính khoảng thở với viền và ô bên cạnh.

Không nên giải quyết bằng cách cho model luôn tràn ô. Cần footprint tối đa cho mỗi loại asset và vùng xây bên trong tile.

### P02 — Nhà và quân cờ chưa có vùng riêng

Nhà đặt tại transform.x/z của tâm ô. Token cũng quanh tâm với độ lệch 0,42. Kiểm tra AABB của Landmark và token tại vị trí đó có giao nhau.

Đây là kiểm tra hộp bao, không phải chứng minh mọi polygon đều va chạm, nhưng xác nhận layout chưa bảo đảm khoảng trống. Trên UI đã mua Landmark tại Chợ Lớn, khối công trình/quân chiếm phần lớn ô.

Giá, tên, nhóm màu, mô hình và token nên có vai trò/khu vực khác nhau. Đừng chỉ dời ngẫu nhiên tọa độ X/Z cho từng nhà.

### P03 — Sáu người có thể trùng slot

Token dùng góc pIdx×PI/2. Người số 5 trùng hướng số 1, người số 6 trùng số 2 khi cùng ở một ô.

**Sửa:** chia slot theo danh sách người đang đứng trên chính ô đó; hỗ trợ 1–6 người và tween nhẹ khi slot thay đổi. Không dùng chỉ số toàn bàn như một vòng tròn cố định bốn chỗ.

### P04 — Độ cao chân nhà đang gần đúng, không cần sửa mù

Mặt tile ở y≈0,155; root công trình ở y=0,16. Khoảng chênh nhỏ này hợp lý để tránh đè mặt.

Lỗi chính tìm được là footprint và vùng đặt, không đủ cơ sở kết luận mọi nhà đang bị lơ lửng. Khi thay asset, chuẩn hóa pivot chân model và tính từ mặt tile thay vì dùng offset tùy ý.

## 7. Cách chia ô để nhìn rõ và đặt nhà hợp lý

Thiết kế dưới đây là đề xuất hình học cho kích thước ô hiện tại.

### 7.1. Bốn vùng từ ngoài bàn vào trong

    PHÍA TRUNG TÂM BÀN
    ┌─────────────────────────┐
    │ Dải màu / dấu sở hữu    │
    ├─────────────────────────┤
    │ Vùng đặt công trình     │
    │   nhà / villa / hotel   │
    ├─────────────────────────┤
    │ Lối đi và slot quân cờ  │
    ├─────────────────────────┤
    │ Tên ngắn / giá rõ ràng  │
    └─────────────────────────┘
    PHÍA NGOÀI BÀN

Với chiều sâu 2,7, có thể thử phân bổ: 0,45 cho nhãn, 0,85 cho lane, 1,10 cho công trình và 0,30 cho dải màu. Đây là thông số khởi điểm để so ảnh, không phải số đo từ Business Tour.

Footprint asset gợi ý tối đa khoảng **1,5×1,0** trong vùng xây. Landmark nên có thân cao/khối riêng nhưng chân gọn; chọn hoặc thiết kế asset phù hợp trước khi scale.

### 7.2. Dùng hệ tọa độ của ô

Mỗi tile cần một layout root và các anchor: buildingAnchor, tokenSlots, priceAnchor, ownerMarker, festivalAnchor.

Hướng đi vào tâm bàn:

| Cạnh | Vector hướng vào tâm theo X/Z |
| --- | --- |
| Dưới | (0, -1) |
| Trái | (+1, 0) |
| Trên | (0, +1) |
| Phải | (-1, 0) |

Lưu rõ hướng asset quay mặt trước. Không mặc định rotation của texture cũng là hướng cần dời nhà; hai mục đích này có thể khác nhau.

Tọa độ thế giới được tính từ tâm ô + hướng vào trong × offset + tiếp tuyến × offset slot. Một hàm chung xử lý cả bốn cạnh, tránh bốn nhóm tọa độ hardcode rời rạc.

### 7.3. Chuẩn hóa asset trước khi đặt

- Pivot ở giữa chân, chân tiếp xúc mặt tile.
- Bounding box/footprint được đo trước.
- Uniform scale theo giới hạn vùng xây, không kéo méo từng trục để nhét đại vào ô.
- Mặt trước/quy tắc quay được khai báo.
- Công trình có bóng tiếp xúc và không che vùng số.
- Đổi tier thì thay model đúng tài sản; không tạo model mới mà quên gỡ model cũ.
- Màu chủ sở hữu có thể đổi khi trade/buyout; không chỉ tô lúc khởi tạo scene.

Landmark hiện có footprint tròn khá lớn. Một asset chân chữ nhật gọn thường phù hợp vùng xây hơn việc thu nhỏ cả lâu đài đến mức khó nhận diện.

### 7.4. Token và số tiền cũng phải theo layout

- Lane có slot được tính từ số người hiện tại trên ô.
- Khi đông, giảm footprint token hoặc dùng cụm/badge có thể mở xem; đừng để nhân vật đè giá hoặc nhà.
- Ô chưa có chủ có thể hiện giá mua; ô đã có chủ nên ưu tiên thông tin thuê hiện tại hoặc nhãn thật rõ. Đây là đề xuất UX, chưa khẳng định là quy tắc hiển thị của bản Business Tour hiện hành.
- Tiện ích hiện hệ số phù hợp thay vì một số thuê ngẫu nhiên không có ngữ cảnh.
- Festival/thế chấp/sở hữu phải cập nhật marker/texture sau đổi state.

Hiện createTileTexture vẫn khởi tạo với false/null và vẽ tile.price. Nếu muốn số/marker trên bàn phản ánh công trình và chủ mới thì cần update texture/label theo state, không chỉ vẽ thêm nhà.

### 7.5. Preview trước khi xác nhận

- Chọn cấp → ghost model ở buildingAnchor của ô được phép, có viền highlight.
- Màu/biểu tượng cho biết hợp lệ hoặc lý do bị khóa.
- Xác nhận mới trừ tiền; bỏ qua không đổi tài sản.
- Animation dựng nhà chỉ chạy sau khi engine xác nhận thành công.
- Tự snap vào anchor theo tileId; không lưu tọa độ tùy ý do client gửi.

Nếu muốn thêm kéo/thả, kéo chỉ là cách chọn vị trí hợp lệ và xem preview. Không biến game thành xây tự do ngoài bàn nếu mục tiêu vẫn là board game này.

## 8. Những lỗi online còn cần xử lý

Review chung vẫn phát hiện các điểm sau, dù phần nhà là trọng tâm:

1. **Winner vẫn có thể giả bằng từ khóa.** Client khách không có đất, tự nâng tiền lên 80 triệu rồi gửi lý do “ĐỘC QUYỀN MỘT HÀNG” vẫn được server chấp nhận.
2. **Thắng hợp lệ có thể bị từ chối.** Engine cho người sở hữu đủ bốn ga thắng, với lý do “ĐỘC QUYỀN 4 BẾN XE / GA TÀU…”. Bộ kiểm tra substring của server không nhận đúng chuỗi đó và phát winner=null.
3. **Trade vẫn chưa có pending offer chuẩn.** Kiểm tra targetId đã chặn phản hồi sai người theo payload, nhưng người nhận có thể tự dựng offer mới, tự nhận mình là target và được broadcast accept dù server chưa lưu đề nghị đó.
4. **Full state vẫn do client quyết định.** Kiểm tra khoảng giá trị không thay thế kiểm tra transition/phase.
5. **Vercel chưa có kết nối phòng thực tế.** /socket.io và /api/health vẫn trả HTML, polling/WebSocket thất bại.

Sửa winner bằng winnerReasonId enum và tính từ state chính thức, không so khớp câu tiếng Việt. Server thực hiện trade/build đúng một lần theo actionId; không để các client cùng tự tính rồi ghi đè.

## 9. Thứ tự triển khai đề xuất

### Mốc A — Chốt ruleset mua/nâng

- Sửa đặc tả nội bộ cho khớp mốc đã xác minh; ghi rõ những chi tiết cần đối chiếu bản game hiện hành.
- Tách buildingTier khỏi số model/số căn.
- Tạo getAllowedBuildActions và quoteBuild dùng chung.
- Khóa các đường vòng từ Sổ Đỏ và bot.

**Đạt khi:** cùng một state/context thì người, bot và server có cùng danh sách quyền xây.

### Mốc B — Hoàn thiện giao diện mua

- Chỉ hiển thị/cho chọn hành động hợp lệ, có lý do khóa.
- Preview đúng ô, chi phí rõ và một lần xác nhận.
- Không mặc định mua phương án đắt nhất.
- Decision hết hiệu lực sau khi dùng/bỏ qua; stale quote phải tính lại hoặc bị từ chối.

**Đạt khi:** người mới hiểu mua gì, tốn bao nhiêu và khi nào được nâng tiếp.

### Mốc C — Đặt nhà đúng vùng

- Tile layout có vùng xây/lane/nhãn riêng.
- Kiểm tra footprint từng tier ở cả bốn cạnh.
- Token 1–6 không dùng slot trùng; số tiền đọc được.
- Update model/owner marker từ state và quản lý tài nguyên dùng chung.

**Đạt khi:** nhà nằm gọn, quân không đè nhà, giá không bị che ở góc camera chuẩn.

### Mốc D — Online đáng tin

- Server quyết định action/build/trade/winner.
- Nối backend production và kiểm tra hai mạng khác nhau.
- Tiếp tục reconnect/rejoin, phase và revision.

**Đạt khi:** hai máy cùng nhìn thấy một công trình được mua đúng một lần, cùng số tiền và kết quả.

## 10. Test nghiệm thu cần bổ sung

### Quyền mua/nâng

- Lần đầu mua không vượt tập cấp được mở; thẻ đặc biệt tuân gate riêng.
- Nâng đúng lần đáp; kết thúc decision rồi không bấm Sổ Đỏ để nâng tiếp.
- Đứng nơi khác không nâng nếu không có quyền từ Start/thẻ.
- Bot không nâng ngoài phase hoặc dùng luật khác người.
- Sai owner, thế chấp, sai loại ô, tier thập phân/NaN, thiếu tiền hoặc stale decision đều bị từ chối.
- Gửi xác nhận hai lần chỉ tính một lần.
- Khi quy tắc đổi, cập nhật test GO cũ đang mua thẳng Landmark: dùng một phương án hợp lệ để kiểm tra giữ lương/vị trí, không giữ cơ chế sai chỉ để test xanh.

### Đặt công trình

- Mỗi asset có footprint nằm trong vùng xây sau transform ở bốn cạnh.
- Model/token có vùng độc lập; 1–6 quân không trùng slot.
- Mọi nhãn cần thiết đọc được ở 1366×768 và 390×844.
- Mua/nâng/buyout/trade thay đúng model và màu chủ.
- Bỏ preview không để lại công trình thật hoặc trừ tiền.
- Đổi tier nhiều lần không tích lũy model, material hoặc texture.

### Kiểm tra lại lỗi cũ

- gameLog không mất sau đồng bộ.
- Phá sản trả đất ngân hàng thật sự xóa owner.
- Người và bot cùng trả đủ nợ.
- Winner giả có từ khóa bị từ chối; thắng bốn ga hợp lệ được nhận.
- Trade chưa có pending offer không thể accept.

## 11. Prompt bàn giao cho Antigravity

> Đọc REVIEW_V4_MUA_NHA_VA_DAT_CONG_TRINH.md. Trọng tâm là sửa quy trình mua/nâng và vị trí nhà cho mode lấy cảm hứng Business Tour, không chỉ đổi model.
>
> Không tiếp tục coi “mua thẳng Landmark lần đầu” là luật chuẩn. Dùng mốc moderator đã dẫn làm tham chiếu lịch sử, xác minh thêm giới hạn cấp theo vòng và quyền từ Start/thẻ trước khi quảng bá giống hoàn toàn bản hiện hành.
>
> Tạo một BuildDecision/quote/validator dùng chung cho người và bot. Khóa đường nâng tùy ý qua Sổ Đỏ và nâng cuối lượt ở ô khác. Server tự tính giá/quyền và xử lý đúng một lần.
>
> Đặt nhà theo tile layout: vùng công trình, lane quân cờ, nhãn giá và dải sở hữu. Đế Landmark hiện khoảng 1,9 nhưng ô rộng 1,8; phải kiểm tra footprint, pivot và hướng quay. Tính slot theo người đang ở từng ô, không dùng vòng tròn bốn slot cho sáu người.
>
> Có preview tự snap vào ô hợp lệ trước xác nhận. Công trình thật chỉ xuất hiện sau state thành công. Giá/marker trên bàn cập nhật theo sở hữu và tier.
>
> Giữ các sửa đã tốt về log, xóa owner, trả nợ và màu sắc. Sửa tiếp winner keyword, thắng bốn ga bị từ chối, pending trade và backend Vercel.
>
> Test gọi code thật, có kịch bản mua/nâng đầy đủ và ảnh cùng snapshot ở bốn cạnh bàn. Không coi 23 test pass là bằng chứng bộ luật đã giống Business Tour.

---

**Ưu tiên cho lần sửa tiếp:** chốt điều kiện xây → thống nhất validator/decision → sửa modal → chia vùng đặt nhà và token → xác nhận đồng bộ online.
