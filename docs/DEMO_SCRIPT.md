# Demo VELATHIER — in theo yêu cầu

> Cập nhật V2: xem [bàn giao remediation](VELATHIER_V2_REMEDIATION.md). Staff duyệt sẽ tạo PNG private; khách xem raster phía dưới mockup và xác nhận đúng phiên bản. Staff tải PNG chỉ sau xác nhận. PNG vẫn cần checklist xưởng/in thử, không tự coi là print-ready. Schema hiện tại là 5. Bộ browser desktop/mobile đã chạy, thay cho giới hạn browser host của bản triển khai đầu.

> Đơn demo cũ chưa in nhưng proof chỉ có JSON: khách yêu cầu chỉnh sửa → gửi lại → Staff duyệt → khách xác nhận raster. Không reset DB hoặc sửa Mongo thủ công. Đơn đã in từ trước có thể hoàn tất QC/đóng gói theo bằng chứng cũ; không được in lại khi chưa có raster được duyệt.

## Chuẩn bị
Node >=20.19 (hoặc Node 22.12+/24), MongoDB đang chạy. Trên Windows nếu PowerShell chặn npm.ps1, dùng npm.cmd.

```powershell
npm.cmd install
npm.cmd --prefix client install
# Chỉ trên DB TRỐNG mới dùng npm.cmd run seed.
# DB đã có dữ liệu: không seed/reset, chỉ chạy migration bổ sung.
npm.cmd run migrate:custom-print
npm.cmd run seed:custom-demo
npm.cmd run build
npm.cmd start
```

Dừng server trước migration/demo seed để chỉ có một writer. `seed:custom-demo` từ chối khi production, SMTP live hoặc VNPay live. Script không reset Users/Orders; cần các demo accounts từ seed gốc. Có sẵn 7 đơn minh họa với marker `demo=true`, khác requestKey; chạy lại không tạo trùng. Các mốc COD delivered của fixture là mô phỏng rõ ràng, không phải bằng chứng đã thu tiền thực.

Địa chỉ mặc định `http://localhost:5173` (hoặc PORT trong .env). Dữ liệu đã được bổ sung vào DB local trong phiên triển khai này.

| Actor demo | Email | Mật khẩu demo gốc |
|---|---|---|
| Customer | khach@velathier.vn | khach123 |
| Staff | staff@velathier.vn | staff123 |
| Admin | admin@velathier.vn | admin123 |

Chỉ dùng ở môi trường demo; script không đổi mật khẩu tài khoản đã tồn tại. Nếu tài khoản local đã đổi mật khẩu, dùng thông tin hiện có. Không dùng tài khoản này cho production.

## Routes
- `/shop?tag=custom`: bộ áo trơn; `/product/blank-regular`, `/product/blank-oversized`, `/product/blank-hoodie`.
- `/designs`: bản nháp của tôi; `/designs/new?product=blank-regular&variant=<id>` mở từ product để có đúng variant.
- `/orders`, `/orders/:id`: timeline và xác nhận proof.
- `/admin`: tab Xưởng in, Cấu hình in/Size (Admin), Đơn hàng, Đánh giá (Admin), Email.
- File demo upload: `assets/img/demo/artwork-1800.png`; file cố tình thấp DPI: `artwork-low-resolution.png`.

## Demo A — khách thiết kế và mua
1. Đăng nhập Customer, mở blank-regular, chọn trắng/M hoặc một variant còn hàng.
2. Mở bảng size, nhập vòng ngực 90cm, Regular; đọc số đo áo, gợi ý và lưu ý sample.
3. Bấm Tự thiết kế áo. Đặt tên draft; xác nhận quyền sử dụng; chọn artwork-1800.png.
4. Kéo/resize/rotate hoặc nhập x/y/rộng/cao; giữ trong vùng vàng. Thêm chữ, đổi font/màu, thử căn giữa/reset.
5. Đổi mặt sau, thêm chữ khác; quay lại trước để thấy hai mặt độc lập. Bấm Xem trước để bỏ guides, thử zoom.
6. Lưu, xem phí từng mặt; vào Thiết kế của tôi và mở lại. Xác nhận geometry được giữ.
7. Thêm giỏ; tạo một draft khác cùng variant để kiểm tra hai dòng. Có thể thêm áo thường cùng variant để có mixed cart.
8. Checkout, chọn địa chỉ có sẵn hoặc thêm mới, thử voucher WELCOME10 nếu còn lượt, xem base/printing/discount/shipping/total.
9. Đặt COD; mở chi tiết đơn thấy chờ xác nhận COD và job riêng. Không tự động bắt đầu in.

## Demo B — duyệt và sản xuất
1. Staff → Quản trị/Đơn hàng → chọn đơn Demo A → confirmed.
2. Xưởng in → làm mới → mở job → xem hai mặt, size/màu/DPI. Chọn Duyệt, chuyển chờ khách.
3. Customer → đơn tương ứng → xem exact proof → tick acknowledgment → Xác nhận mẫu in. Job QUEUED.
4. Staff → Xưởng in → PRINTING → QUALITY_CHECK → PACKED. Có thể thử QC_FAILED với reason rồi in lại có reason, không tăng giá.
5. Tất cả custom lines phải packed. Đơn hàng → ready_to_ship. Nhập carrier và vận đơn thật nếu giao thật; khi thuyết trình dùng `DEMO-NOT-LIVE-...` và ghi rõ không phải vận đơn thật.
6. Chuyển shipped, cập nhật ETA/mốc/ghi chú; Customer xem timeline. Chờ tối đa 15 giây rồi Admin Email kiểm tra outbox.
7. Nếu cần trình diễn nhanh, dùng các đơn fixture đang ở review/proof/QUEUED/QC/shipped có sẵn. Fixture không cần sửa MongoDB tay.

## Demo C — ngoại lệ và sau bán
1. Tạo đơn custom khác, hủy trước in; lặp request qua API nếu cần kiểm tra idempotency. Kho/voucher chỉ trả một lần.
2. Với job đã in, Customer hủy phải lỗi. Staff cũng không bypass. Admin có nút ngoại lệ riêng, lý do và xác nhận loại bỏ vật tư; thử trên đơn demo chưa giao.
3. Staff thử start PRINTING khi chưa Customer proof; server chặn. Thử approve proof cũ sau yêu cầu chỉnh sửa; server chặn.
4. Upload ảnh low-resolution, đặt ở kích thước lớn; lưu draft được nhưng báo giá/đặt hàng bị chặn DPI. Thu nhỏ đủ DPI hoặc tải ảnh tốt để tiếp tục.
5. Chuyển một đơn valid từ shipped → delivered. Customer mở product, chọn đúng lần mua, gửi 1–5 sao và text, tùy chọn ảnh.
6. Xem aggregate/distribution và nhãn đã mua; gửi lại cùng line bị chặn. Admin moderation có reason/history và không được ẩn chỉ vì sao thấp.

## Checklist E2E thủ công còn cần chạy
- Desktop 1440px/mobile 390px: không tràn ngang, canvas drag/touch/numeric controls, text không bị cắt, focus keyboard.
- Save → refresh → restore; mở hai tab và gây version conflict; hết phiên đăng nhập không mất nội dung chưa lưu.
- Cả ba actor: không thấy nút vượt quyền, Staff không cấu hình giá, Customer không duyệt thay người khác.
- Xem proof trước/sau đúng màu/size; ảnh riêng tư không mở được bằng URL khi logout.
- Gallery đổi theo màu, ảnh fallback, order price breakdown, tracking/review photos.

Browser automation chưa chạy: công cụ mở trang trả “The browser access host is unavailable”. HTTP route refresh và media URLs đã được kiểm tra bằng integration; điều này không thay thế kiểm tra tương tác/render trong browser.

## Vận hành
`npm.cmd run media:gc` chỉ báo orphan quá 7 ngày. Sau khi xem kết quả, `npm.cmd run media:gc -- --apply` mới dọn file không còn metadata; không dọn ảnh có draft/order/proof reference. Backup DB và `server/private` cùng nhau. Chạy một Node writer; production cần replica set và concurrency/worker infrastructure mạnh hơn.
