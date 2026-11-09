# Kiến trúc và migration UC-21–27

Giữ React/TypeScript + Express + MongoDB/Mongoose. Không thay framework.

| Tầng | Hiện thực |
|---|---|
| Presentation | DesignStudio/DesignCanvas, CustomProduct, CartProvider, GuestCheckout, PrintSettingsPanel, PrintJobs |
| REST/auth | routes/custom-print, routes/orders; guest-print-session cookie/CSRF; security RBAC/limiter |
| Domain services | custom-print (design/review/production), print-srs (position/text/rate/SLA), pricing (cart/totals), print-preview (PNG), print-export (production raster) |
| Data | mongo-store transaction/unit of work, models/index; private-storage local/S3 |
| Notifications | custom-print.event → notification processor → encrypted transactional mail outbox → SMTP worker |

Router custom-print hiện gọi service trực tiếp; orders dùng Router → Controller → Pricing/domain → persistence. Không tuyên bố tất cả routes đã tách Controller riêng. PrintElement là embedded snapshot trong DesignRevision/PrintJob; unique position được service kiểm tra, không tạo collection PrintElement giả.

## Migration

`node server/migrate-print-srs.js` tăng schemaVersion tối thiểu 6 và tạo một phiên bản settings SRS cho ba sản phẩm demo blank-regular/oversized/hoodie. Marker uc21-27-v1 giúp chạy lại không tạo trùng. Không reset/seed MongoDB, không ghi đè sản phẩm/stock/user/order/proof. Sản phẩm ngoài ba demo được Staff/Admin chuyển mode qua UI. Snapshot không có mode luôn enhanced.

Trước migration DB đang dùng: dừng writer, backup DB/private bằng `npm.cmd run backup:private`, sau đó chạy migration, build và khởi động lại server. Rollback bằng bản code và bundle cũ chỉ sau khi kiểm tra hiểu mode SRS; không hạ version schema/ghi đè đơn mới bằng backup. Full restore vào DB riêng rỗng theo tài liệu V2.

Ảnh preview mới dùng artwork/<revision>.preview.png; backup đã thêm các khóa từ designRevisions. GC giữ preview và mọi asset có metadata. Không xóa ảnh cũ khi thay nội dung; revisions lịch sử và proofHistory còn tham chiếu.

Guest id là id chủ sở hữu riêng, không User MongoDB giả. Order có userId=null, guestDesignOwnerId và customerEmailVerified sau OTP. Cookie hết hạn không thể truy cập đơn chỉ bằng ID. Chuyển từ guest sang đăng nhập không tự chuyển quyền sở hữu asset; hoàn tất giỏ guest bằng checkout guest hoặc tạo thiết kế mới dưới tài khoản.

Mongo replica dùng snapshot transaction + write conflict409, standalone single writer/queue để demo. Không có workflow state chỉ nằm trong RAM. SRS review và status lưu trong cùng unit of work với stock/order/event. SMTP bên ngoài transaction có retry/dead-letter. Hạ tầng replica/S3/SMTP production vẫn cần cấu hình và nghiệm thu thật.

Không có DOCX/UML đính kèm để đối chiếu sơ đồ gốc; các state mappings trong BUSINESS_RULES là mô tả code và prompt, không phải xác nhận UML chính thức.
