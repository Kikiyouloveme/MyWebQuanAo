# Kiến trúc triển khai

> Bản mô tả nền ban đầu. V2 đã bổ sung transaction đọc–ghi replica set, targeted checkout/catalog, outbox worker và private raster/S3; xem [bản cập nhật kiến trúc](VELATHIER_V2_REMEDIATION.md) trước khi triển khai.

## Thành phần
Tái sử dụng Express/React/Mongoose, không thêm service độc lập. `custom-print.js` tập trung validation, geometry, quote extensions, approval gates, state machine và notification events. Controller cũ gọi các guards ngay trước thay đổi kho/trạng thái.

```mermaid
flowchart LR
  Studio[React Studio + Konva] --> API[Express routes/custom-print]
  Admin[Admin / Staff / Proof UI] --> API
  Checkout[Cart + Checkout] --> Orders[orders controller]
  Orders --> Pricing[pricing.buildLines]
  Pricing --> CP[custom-print service]
  API --> CP
  CP --> UOW[mongo-store unit of work]
  Orders --> Inventory[inventory / payment-lifecycle]
  Inventory --> UOW
  UOW --> Mongo[(MongoDB)]
  API --> Sharp[Sharp decode / normalize]
  Sharp --> Private[private artwork / review photos]
  CP --> Notices[(notifications)]
  Worker[15s notification worker] --> Notices
  Worker --> Mail[mailer SMTP / dev outbox]
```

## Trình tự mua và duyệt
```mermaid
sequenceDiagram
  actor C as Customer
  participant UI as Studio
  participant API as Express
  participant DB as MongoDB
  actor S as Staff
  C->>UI: Upload / sửa layer / lưu
  UI->>API: PATCH design + version
  API->>DB: Append DesignRevision, update currentVersion
  DB-->>UI: ACK rồi response
  UI->>API: quote(items + revisionId)
  API-->>UI: Giá server và cảnh báo
  C->>API: checkout(acceptedTotal, requestKey)
  API->>DB: Reserve stock + order snapshot + PrintJob
  S->>API: Confirm COD hoặc callback VNPay paid
  S->>API: Approve design revision
  API->>DB: Immutable proof + staffApproval + event
  C->>API: Approve(proofId, hash)
  API->>DB: customerApproval, QUEUED
  S->>API: PRINTING → QUALITY_CHECK → PACKED
  API->>DB: history, consumed stock, events
  S->>API: Tracking → shipped → delivered
```

## Phân tách trạng thái
```mermaid
stateDiagram-v2
  [*] --> WAITING_PAYMENT
  WAITING_PAYMENT --> WAITING_STAFF_REVIEW: paid / confirmed COD
  WAITING_STAFF_REVIEW --> WAITING_CUSTOMER_APPROVAL: staff approve
  WAITING_STAFF_REVIEW --> REVISION_REQUIRED: staff request revision
  WAITING_STAFF_REVIEW --> REJECTED: reason required
  REJECTED --> WAITING_STAFF_REVIEW: corrected revision
  REVISION_REQUIRED --> WAITING_STAFF_REVIEW: corrected revision
  WAITING_CUSTOMER_APPROVAL --> QUEUED: exact proof approval
  WAITING_CUSTOMER_APPROVAL --> REVISION_REQUIRED: customer requests change
  QUEUED --> REVISION_REQUIRED: before physical printing
  QUEUED --> PRINTING: two approvals + payment + stock
  PRINTING --> QUALITY_CHECK
  QUALITY_CHECK --> QC_FAILED: reason
  QC_FAILED --> PRINTING: controlled reprint with reason
  QUALITY_CHECK --> PACKED
  WAITING_PAYMENT --> CANCELLED
  QUEUED --> CANCELLED
```
Hủy ở trạng thái khác được service guard kiểm tra. Admin ngoại lệ sau in cũng kết thúc CANCELLED; hàng đã tiêu hao không restock. Order shipping/payment/refund giữ state machine riêng.

## Lưu trữ và concurrency
- Models được đăng ký trong `server/models/index.js`; mongo-store tự đọc/lưu tất cả collections. Không tạo cache JSON mới.
- Business ID cũ được giữ. New lineId không thay đổi lịch sử cũ; thiếu itemType được coi regular.
- Optimistic version trên draft/config; unique indexes revision/version, settings/version, order user/requestKey, PrintJob line, review line, eventKey.
- Hàng đợi unit-of-work bảo vệ start printing/cancel trong một process; test gửi song song kiểm tra chỉ một bên thành công.
- Multer callback được bind bằng AsyncResource để giữ AsyncLocalStorage của unit-of-work. File upload có rollback hook khi commit thất bại. `media:gc` mặc định dry-run, chỉ xóa orphan không metadata quá 7 ngày khi có `--apply`.
- Standalone có thể ghi một phần nhiều collections khi lỗi hạ tầng giữa commit. Replica set commit transaction giảm rủi ro này nhưng unit-of-work hiện đọc trước transaction; chưa bảo vệ nhiều process writer. Đây là giới hạn có thật, không phải production HA.
- Asset original, derived previews và metadata cần backup đồng bộ. File system cần volume bền vững, quota, giám sát dung lượng; không dùng ephemeral deployment disk.
- Proof hiện là snapshot JSON immutable + SHA-256, render bằng Konva cùng cấu hình. Chưa có raster proof server-side có chữ ký hay PDF kỹ thuật cho máy in; cần bước RIP/kiểm tra màu vật lý của xưởng khi triển khai thật.

## Dependency
Konva/react-konva v18 cho React18, dùng Transformer chuẩn; Sharp giải mã ảnh và giới hạn pixels. Tham khảo [Konva Transformer](https://konvajs.org/docs/react/Transformer.html), [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/). Không viết drag engine tự chế, không đưa binary vào order.

## Migration
Chạy `npm.cmd run migrate:custom-print` khi server đã dừng hoặc không có writer khác. Chỉ thêm 3 sản phẩm blank và cấu hình/size chưa có; nâng schemaVersion lên 4. Với ảnh placeholder seed cũ và chưa có media, chuyển sang minh họa đúng loại/màu; không thay ảnh upload của người dùng. Settings cũ và order snapshots không bị sửa. `seed:custom-demo` chỉ chạy development + VNPay sandbox + outbox.
