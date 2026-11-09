# Kiểm toán VELATHIER — 07/11/2026

Đã đọc các module liên quan trước khi sửa. Repo có thay đổi chưa commit của người dùng; giữ nguyên và mở rộng trực tiếp.

## Baseline
- `npm.cmd run typecheck`: đạt.
- `npm.cmd run build`: đạt.
- `npm.cmd run test:integration`: 142 đạt, 0 lỗi; kiểm tra MongoDB và reviews đạt.
- Dùng npm.cmd vì ExecutionPolicy chặn npm.ps1.

## Tái sử dụng
JWT/OTP/email verification; catalog và variants; pricing/voucher/shipping; inventory reservation; VNPay signature/attempts/IPN; returns/refunds; SMTP/outbox; ProductReview đã có API, UI và test mua hàng xác thực.

## Khoảng trống và thay đổi
| Phần | Trước | Hướng mở rộng |
|---|---|---|
| UC01–07,11–12 | Chưa có | Design/revisions/assets/settings/PrintJob, editor Konva, hàng đợi staff và proof |
| UC04 | Giá sản phẩm thường | Chung pricing.buildLines, cộng phí từ cấu hình server, snapshot |
| UC08–10 | Shipping cơ bản và email trực tiếp | Guard packed, lịch sử, notification event có retry |
| UC13 | Hủy trước shipped | Chặn khi đã in; giữ refund lifecycle, không hoàn vật tư đã tiêu hao |
| UC14 | Chưa có dữ liệu chart | SizeChart và gợi ý theo vòng ngực, tồn kho |
| UC15 | Đã có | Tái sử dụng, bổ sung kiểm thử với custom order line |
| Cart/returns | variantId | lineId/revisionId để phân biệt mẫu in |
| Media | SVG catalog | Mockup minh họa riêng cho blank garments, metadata nguồn |

## Rủi ro
Mongo-store đọc toàn bộ collections và serialize trong một process. Standalone không có atomicity nhiều document; replica set có transaction khi ghi nhưng chưa có khóa phân tán giữa các instance. Chỉ triển khai một writer; cần cơ chế CAS/transaction đọc-ghi trước khi scale ngang. Không tuyên bố production HA.

Email SMTP là side effect ngoài MongoDB, không thể đảm bảo exactly-once khi process chết giữa SMTP ACK và commit. Outbox event durable giúp retry hữu hạn, cần provider idempotency khi chạy thật.

Checkout frontend yêu cầu đăng nhập dù backend có OTP guest COD. Giữ hành vi này; custom bắt buộc customer đã xác minh.

## Dữ liệu và tương thích
Thêm collections, indexes qua models hiện tại để unit-of-work tự nạp/lưu. Migration bổ sung idempotent, không reset dữ liệu. Đơn thiếu itemType coi là regular. Giữ business IDs, giá và thiết kế đã mua. Blank garments demo riêng để không biến áo có logo thành áo trơn sai SKU.

Files chính: server/models/index.js, custom-print.js, routes/custom-print.js, pricing.js, controllers/{orders,admin,payment,returns}.js, inventory.js, mailer.js; client context/cart, pages/product, checkout, order-detail, App và các component custom mới.
