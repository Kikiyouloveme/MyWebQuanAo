# Bàn giao thay đổi — 07/11/2026

## Đã bổ sung
- CustomDesign/DesignRevision/DesignAsset/PrintSettings/PrintJob/SizeChart/Notification trong persistence facade hiện có; schemaVersion 4; unique indexes cho version, event và request key.
- API và Studio React-Konva: hai mặt, màu/size, text/fonts/palette, drag/resize/rotate, numeric placement, reset/center/delete, preview/zoom, private upload, drafts/autosave/session recovery.
- Quote/checkout custom dùng pricing chung; stable cart identity và lineId, immutable order breakdown/snapshot, acceptedTotal/requestKey.
- Review Staff → proof Customer → production/QC/reprint; shipping packed guard; hủy pre-print/exception Admin; consumed stock không restock, late VNPay callback chờ refund.
- Notification events durable, retry hữu hạn, template Vietnamese escaped; giữ mailer/outbox/OTP.
- SizeChart demo và gợi ý theo vòng ngực/fit/stock; review mua hàng xác thực hiện có được bổ sung ảnh an toàn và moderation UI.
- Gallery theo màu với source/license metadata; 12 catalog silhouettes và 3 blank garments; artwork demo tốt/thấp DPI; migration/seed demo không reset dữ liệu.
- Tests unit/API/MongoDB/concurrency/security và tài liệu SRS/API/ERD/architecture/business rules/test matrix/demo.

## Files chính mới
Backend: custom-print.js, routes/custom-print.js, routes/review-photos.js, catalog-media.js, migrate-custom-print.js, seed-custom-demo.js, media-gc.js, test-custom-unit.js, test-custom-print.js, test-cart-identity.mjs.

Frontend: lib/custom-print.ts, lib/cart-identity.js + declaration; pages/design-studio.tsx, designs.tsx; components/design-canvas.tsx, custom-product.tsx, print-jobs.tsx, print-settings.tsx, product-media.tsx, review-moderation.tsx.

Assets: assets/img/catalog, custom, demo. Docs: 10 CUSTOM_PRINT/IMAGE_SOURCES/DEMO documents; Postman folder bổ sung.

## Files hiện có được mở rộng
server/models/index.js, mongo-store.js (rollback hook), db.js, pricing.js, inventory.js, payment-lifecycle.js, mailer.js, server.js, controllers/orders.js/admin.js/payment.js/returns.js, routes/reviews.js, test-integration.js/test-api.js.

client App, context/cart, lib/api, pages/product/checkout/order-detail/admin/account, components/layout/product-reviews. package manifests/locks thêm Sharp, Konva/react-konva. .gitignore bỏ private media khỏi source control.

Repo đã có nhiều thay đổi chưa commit trước khi bắt đầu (controllers/MongoDB/reviews và các phần khác). Không reset/revert chúng; danh sách trên mô tả phần mở rộng trong phiên này, không quy mọi git diff hiện tại là thay đổi mới.

## Kết quả và giới hạn
Dependency security: giữ React18/Express4; nâng Vite7 + plugin-react5, react-router-dom7, Nodemailer10, Multer2 và các dependency gián tiếp có bản vá. Node tối thiểu 20.19. Package-lock được cập nhật; install cuối báo 0 vulnerabilities ở cả server/client. Các API ứng dụng giữ nguyên; chạy lại regression sau nâng dependency.
Baseline 142/0; lượt integration mở rộng 90/0 custom; 12/12 unit; typecheck/build exit0. Kết quả cuối sau tất cả chỉnh sửa được ghi thêm bên dưới khi chạy xong. Xem TEST_CASES để tránh hiểu nhầm phần browser/live provider chưa chạy.

Không có ảnh nhà cung cấp được cấp phép nên dùng minh họa có nhãn. Chưa có browser QA vì host unavailable. Chưa có raster/PDF proof server-side, courier API hay production HA; chỉ một Node writer, standalone thiếu atomicity nhiều documents. Các giới hạn này đã được ghi rõ, không đánh dấu production-ready tuyệt đối.
