# UC-21–27 — audit và khoảng trống

Nguồn: prompt người dùng ngày 08/11/2026; người dùng xác nhận project hiện tại là source cần sửa. Không có DOCX/UML đính kèm để kiểm chứng trực tiếp; không tuyên bố đã đọc báo cáo hoặc sơ đồ.

Baseline trước sửa: `uc21-27-baseline-unit.log` (27 pass); integration đang chạy, lưu `uc21-27-baseline-integration.log`.

| Yêu cầu | Bằng chứng trước sửa | Khoảng trống / sửa cần thiết | Kiểm tra | Trạng thái |
|---|---|---|---|---|
| UC21 Guest/Customer | App.tsx routes; custom-print.customer/saveDesign | Bắt verified login; thêm session guest riêng, không nâng quyền account | guest isolation, checkout OTP | Đang triển khai |
| UC21 positions/elements/text | custom-print.validateLayers | 20 layer/mặt, 100 ký tự; thêm FRONT/BACK/LEFT_CHEST, một element/vị trí, NFC và maxChars | duplicate, Unicode, limits | Đang triển khai |
| UC22 upload | routes/custom-print POST assets | WebP/10MB, không short-side; SRS PNG/JPEG 5MB >=500, warning <1000, rate limit | corrupt/499/500/999/1000/429 | Đang triển khai |
| UC23 preview/persistence | design-canvas, design-studio | thiếu chest, lỗi tải bị nuốt; thêm vùng trước riêng, preview có lỗi rõ và PNG riêng tư | mobile/reload/color/failure | Đang triển khai |
| UC24 price | custom-print.customLine, pricing.buildLines | tính theo mặt; dùng rate(position,type), giữ snapshot lịch sử | 80k/110k/quantity/tamper | Đang triển khai |
| UC25 settings | validateSettings; routes/admin/print-settings; PrintSettingsPanel | Admin only, thiếu rates/maxChars/font/copy; thêm capability Staff giới hạn | RBAC/negative/version/copy | Đang triển khai |
| UC26 review/revision | review/revise | enhanced only, min3, unlimited revision; thêm SRS mode và 1 lần sửa miễn phí | stale review/reason/revision | Đang triển khai |
| UC27 production/readiness | transition/guardShipping | PACKED only, thiếu auto ready; thêm DONE/QC reprint/mixed-item readiness | guards/idempotency/ready | Đang triển khai |
| Compatibility | designRevision/settings snapshots | không đổi lịch sử/giá cũ; chế độ absent = enhanced | existing regression suite | Đang triển khai |
| Email | mailer.send; auth.postVerifyEmailSend; verify-email.tsx | SMTP thiếu host/user/pass nhưng UI báo đã gửi; trả trạng thái thật, giải thích outbox | API/UI mode | Đang triển khai |

Các mốc vị trí code được truy vết theo tên hàm/API (không dùng số dòng dễ sai khi sửa). Ma trận hoàn tất và bằng chứng sẽ ghi riêng trong IMPLEMENTATION_MATRIX/TEST_RESULTS.
