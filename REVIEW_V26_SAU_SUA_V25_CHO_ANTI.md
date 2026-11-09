# Review V26 — Sau sửa mobile và báo cáo V25

Ngày 08/11/2026. **Chỉ review; không sửa source, commit/push hoặc deploy.**

## Kết luận

Mobile đã cải thiện rõ trong ảnh mới: công cụ chuyển thành hàng trên, tiền hiển thị gọn và bàn ít bị che hơn. Báo cáo browser có tọa độ thật, kiểm tra thiếu element và ghi nhãn fixture, nên tốt hơn V25.

**Còn một lỗi P2 cần sửa trước khi chốt production:** điều kiện giới hạn debug đang bật trong trình duyệt production. Controller toàn cục và hàm inject state vẫn có mặt trong bundle vừa build, trái với ý định giới hạn development.

**127 test thường qua, build thành công.** Chưa có bằng chứng regression mới trong luật mua nhà hoặc resume; thay đổi ở `gameEngine` lần này là format tiền, không phải thuật toán giao dịch/tiền thuê.

## Kiểm chứng vòng này

| Hạng mục | Kết quả |
|---|---|
| `npm test` | 23 legacy + 104 Node runner = **127 qua**, 0 fail/cancelled/skip |
| Build | Thành công, còn cảnh báo chunk lớn |
| Debug production | Kiểm tra bundle mới và điều kiện trong môi trường không có Node `process`; xác nhận vẫn bật |
| Hình ảnh | Đã xem ảnh mobile mới trong `docs/review-v25-evidence/` |
| Browser report | Đã đọc script và JSON được cung cấp; không tự chạy lại browser script trong V26 |
| Redis/production đang deploy | Không chạy lại Redis integration hoặc xác nhận bản deploy mới |

Snapshot theo dõi thay đổi ở hook, format tiền, camera layout, CornerHUD, Board3D, CSS, App, script browser và JSON cũ. Có thêm thư mục bằng chứng V25. Xem hash đầy đủ trong bằng chứng V26.

## R01 — P2: Guard development dùng `process` khiến debug bật trên production

**Vị trí:** `src/App.jsx:26–28`, `src/hooks/useGameController.js` đoạn `const isDev` và `injectVisualShowcaseState`.

Code dùng điều kiện:

```js
typeof process === 'undefined' || process.env?.NODE_ENV !== 'production'
```

Trong trình duyệt thông thường không có Node `process`, vế đầu là `true`. Vì vậy production vẫn coi là development.

**Đã kiểm chứng trên build mới:** `dist/assets/index-BtSyCalT.js` có cả `__CONTROLLER__` và `injectVisualShowcaseState`. Đoạn App sau build là:

```js
typeof window<`u`&&typeof process>`u`&&(window.__CONTROLLER__=e)
```

Phép kiểm tra guard trong môi trường có `window` nhưng không có `process` trả `true`. Đây là bằng chứng từ output production, không chỉ tìm chuỗi trong source development.

**Ảnh hưởng:** công cụ sửa state minh họa vẫn được đưa vào runtime production. Hàm mới đã đi qua `commit()` nên thay cả UI và `gameRef`, không còn lệch hai state như setter thô V25; nhưng điều đó càng cần được giới hạn đúng môi trường. Đây là lỗi ranh giới debug/release, **không có bằng chứng nó cho phép sửa Redis hoặc vượt xác thực server**.

**Anti cần sửa:** dùng cờ môi trường build của Vite như `import.meta.env.DEV` để loại nhánh debug khỏi production; kiểm tra cả chỗ gắn lên window và chỗ trả hàm inject từ hook. Tách fixture chụp ảnh khỏi bản release nếu cần. Không sửa server để tin state từ client.

**Nghiệm thu:** build production → mở preview/trình duyệt → không có `window.__CONTROLLER__` hoặc hàm inject được công khai. Test development vẫn tạo được cảnh minh họa theo cơ chế dành riêng cho test/dev. Kiểm tra output bundle cùng runtime, không chỉ kiểm tra biểu thức source.

## Những điểm V25 đã cải thiện

| V25 | Trạng thái V26 |
|---|---|
| Công cụ đè cạnh bàn mobile | Ảnh mới cho thấy dock đã chuyển lên hàng trên, cải thiện rõ |
| Tiền xuống dòng ký hiệu đồng | Đổi sang dạng `15M₫`; ảnh mới gọn hơn |
| `boardVerification` trống | Có kiểm tra canvas và WebGL, không còn `{}` |
| Thiếu element vẫn báo pass | `elementsFound` bắt buộc, điều kiện thiếu element không mặc định true |
| Rect mất số liệu | JSON có top/bottom/left/right/width/height cụ thể |
| Fixture bị hiểu thành giao dịch | Đã ghi `visual_showcase` và mô tả tách khỏi kiểm chứng giao dịch |
| Setter thô gây UI/ref lệch | Đã thay bằng hàm inject đi qua commit; nhưng guard production vẫn sai như R01 |

Không giữ nguyên các nhận xét V25 đã được sửa để mô tả sai bản mới.

## Hình ảnh: tốt hơn nhưng chưa chốt độ rõ

Ảnh mobile mới cho thấy HUD gọn hơn, thanh công cụ không còn nằm dọc đè cạnh phải bàn. Bàn lớn hơn và tập trung hơn so với ảnh V25.

Tên/giá ô vẫn rất nhỏ ở góc toàn bàn; còn nhiều khoảng trống giữa HUD, bàn và dock hành động. Chưa có bằng chứng mới về đọc giá khi chạm ô, zoom, bàn phím/chat hoặc thao tác mua nhà trên điện thoại thật. **Chưa chốt “đã giống Business Tour” chỉ từ ảnh overview.**

Ưu tiên tiếp: làm thông tin ô chọn dễ đọc, kiểm tra vùng chạm và zoom/camera; giữ cả bàn trong vùng an toàn. Không tăng kích thước mọi label đến mức chồng nhau trên màn hình nhỏ.

## Chất lượng bằng chứng còn cần hoàn thiện

1. JSON ghi HEAD `b5da067`, trong khi source đang có nhiều thay đổi chưa commit. Commit hash một mình chưa nhận diện được bản chụp; thêm hash source/build bundle hoặc thông tin working tree.
2. `dockClearOfBoard` hiện chủ yếu kiểm tra `dockRect.top <= 200`. Đây là kiểm tra vị trí hàng công cụ, chưa chứng minh không giao với vùng ô trên bàn ở mọi camera/viewport. Không đổi tên một điều kiện tọa độ thành chứng nhận toàn layout.
3. Canvas/WebGL hoạt động chứng minh renderer có mặt, chưa chứng minh chữ đủ đọc hoặc mô hình không che quân.
4. Fixture là bằng chứng mỹ thuật. Mua nhà thật vẫn phải qua reducer/server và so owner, tier, tiền, revision trên hai client.

## Thứ tự Anti làm tiếp

1. Sửa R01 và thêm kiểm tra runtime production không còn debug global/inject.
2. Chốt truy xuất source/build cho báo cáo ảnh; giữ nhãn fixture rõ.
3. Nghiệm thu mobile: chạm ô, giá/thuê, zoom, chat/bàn phím, quyết định mua nhà; chụp cùng state và kích thước.
4. Kiểm tra giao dịch mua/nâng nhà thật và resume trên hai thiết bị/hai mạng trước khi chốt phát hành.

Giữ Vercel/Redis miễn phí; chưa có lý do từ review này để đổi hosting hoặc viết lại engine.

## Bằng chứng

- [Log 127 test](docs/review-v26-2026-11-08/tests.txt), [build](docs/review-v26-2026-11-08/build.txt).
- [Kiểm tra debug trên output production](docs/review-v26-2026-11-08/production-debug-check.json).
- [Snapshot hash](docs/review-v26-2026-11-08/validation.json).
- [Báo cáo mới được cung cấp](docs/review-v25-evidence/browser-verification-v25.json), [ảnh mobile mới](docs/review-v25-evidence/mobile_board_overview_live.png).

Không chỉnh source game, tài khoản hoặc cấu hình dịch vụ trong lượt review V26.
