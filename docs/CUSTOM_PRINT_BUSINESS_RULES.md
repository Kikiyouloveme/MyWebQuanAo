# Quy tắc nghiệp vụ in theo yêu cầu

## Danh tính, giá và dữ liệu
- Giỏ thường: `[regular, variantId]`; giỏ in: `[custom, variantId, revisionId]`. JSON serialization ngăn va chạm dấu phân cách. Đơn dùng `lineId` do server sinh; đổi/trả và review tham chiếu đúng dòng.
- Tất cả custom draft/quote/proof yêu cầu Customer đã xác minh email. Staff/Admin không dùng API khách để tự duyệt mẫu. Truy cập đối tượng người khác trả 404.
- `DesignRevision.snapshot` bất biến; lưu draft tạo version mới. PATCH yêu cầu version hiện hành, sai trả 409. Sửa draft không tự đổi job đã đặt.
- Giá đơn vị = giá áo DB + phí mặt trước nếu có lớp + phí mặt sau nếu có lớp. Mặc định 49.000/69.000đ chỉ là giá demo. Phí nhân theo số lượng, sau đó voucher và vận chuyển dùng pricing hiện có.
- Checkout custom phải gửi `acceptedTotal`, `requestKey`. Sai tổng trả 409; retry cùng key/body trả lại đơn cũ; key trùng với body khác bị từ chối. Giá/thiết kế đơn đã đặt không đổi khi cấu hình mới được xuất bản.
- Sau đặt hàng chỉ sửa nội dung trên những mặt đã mua. Đổi mặt in làm thay đổi giá: hủy trước sản xuất, báo giá và đặt lại; không âm thầm tăng tiền đã trả.

## Ảnh và geometry
- Artwork Customer chỉ PNG/JPEG/WebP. Kiểm tra bằng decoder Sharp, không tin MIME; chặn ảnh nhiều frame, ảnh hỏng, hơn 25 triệu pixels, hơn giới hạn cấu hình (tối đa 10MB).
- Original và preview nằm trong `server/private/artwork`; JWT kiểm soát preview; Staff chỉ truy cập artwork đã được gán vào job. Metadata không chứa base64. Giới hạn 100 assets/tài khoản.
- User xác nhận quyền sử dụng, không tuyên bố hệ thống chứng minh bản quyền. Preview WebP được loại metadata. Original giữ nguyên để phục vụ in.
- Layer gồm tâm x/y, rộng/cao tương đối vùng in, góc xoay quanh tâm, zIndex theo thứ tự mảng. Giới hạn 20 lớp/mặt. Kiểm tra cả bounding box sau xoay, có xét tỷ lệ vùng in trên viewport 4:5.
- Mockup 4:5. Tỷ lệ vùng in phải khớp mm. DPI = min(pxW/(wMM/25.4), pxH/(hMM/25.4)). Dưới minDpi chặn quote; từ min đến recommended cần acknowledgment; không dùng cân nặng để suy đoán chất lượng hoặc size.
- Review photos là ảnh riêng, tối đa 4 ảnh/review, mỗi ảnh 5MB, decoder giới hạn 20MP. Chỉ bản WebP đã xử lý được công khai sau khi gắn vào published review. Không dùng ảnh review làm artwork.

## Duyệt, sản xuất, vận chuyển
- COD cần order confirmed/processing; VNPay cần payStatus paid từ callback được xác thực. Tồn kho phải reserved; đơn không hủy/hoàn.
- Staff approve tạo `proof` chứa snapshot + SHA-256. Customer gửi đúng proofId/hash và acknowledgment. Hash ràng buộc dữ liệu mẫu, không phải chứng nhận màu in ngoài đời.
- Sửa mẫu trước in vô hiệu staffApproval, customerApproval và proof. Proof cũ không thể được duyệt lại.
- QUEUED → PRINTING → QUALITY_CHECK → PACKED. QUALITY_CHECK → QC_FAILED → PRINTING là vòng in lại có lý do. Không nhảy thẳng PACKED, không quay lùi job đã hoàn tất.
- Lần PRINTING đầu tiên đặt `productionStartedAt` và `OrderItem.stockConsumed`. In lại không tính thêm tiền, có audit; quản lý vật tư tiêu hao bổ sung ngoài áo cần hệ thống sản xuất thực tế.
- Chỉ khi mọi custom job PACKED mới cho ready_to_ship/shipped/delivered. Mỗi đơn có một shipment; hàng thường vẫn theo quy trình cũ.
- Tracking do Staff nhập thủ công, không phải API hãng vận chuyển. Cần carrier/trackingNumber hợp lệ, mốc ngày hợp lệ, history và ghi chú công khai. Retry cùng thông tin không tạo thêm history.

## Hủy và hoàn tiền
- Customer hủy toàn đơn trước bàn giao và trước khi bất kỳ job nào bắt đầu in. QUEUED vẫn hủy được.
- Staff không bypass giới hạn in. Admin hủy ngoại lệ phải cung cấp lý do + `inventoryDecision=discard_consumed` + `refundDecision=pending_if_paid`. Không hủy đơn đã giao qua endpoint này.
- Chỉ trả kho dòng chưa tiêu hao. Đồ đã in, kể cả khi đổi/trả, không tự trở thành áo trơn bán lại. Release và voucherReleased ngăn hoàn hai lần.
- Đã thu tiền thì chờ refund; COD chưa thu không phát sinh hoàn tiền. Callback VNPay đến sau hủy custom ghi nhận tiền, giữ jobs CANCELLED và đưa refund_pending, không tự tái sản xuất hoặc giữ lại kho.
- Hoàn tiền tái sử dụng processRefund; refundTransactions chống dùng lại cùng reference. Hệ thống không coi pending_manual là đã hoàn; giới hạn theo remainingRefundable.

## Email, size, reviews
- Notification có eventKey unique, pending/failed/sent, tối đa 3 attempts cách nhau tăng dần. Worker trong process chạy mỗi 15 giây. SMTP/outbox giữ nguyên. Exactly-once qua crash giữa SMTP ACK và DB commit không được đảm bảo.
- Size tops: chọn dòng nhỏ nhất có ngực áo ≥ ngực cơ thể + 8/12/18 cm cho Regular/Relaxed/Oversized. Luôn kiểm tra màu/stock; không gợi ý size hết hàng là mua được. Bảng demo có nhãn sample.
- Review: chỉ Customer có dòng hàng đã delivered; unique(orderId,orderLineId), 1–5 sao nguyên. Cho phép đánh giá thấp. Moderation Admin phải có lý do và history; aggregates chỉ tính published.

## Giới hạn triển khai
Serialize request chỉ trong một Node process. Replica set hỗ trợ commit đa document; standalone không đảm bảo rollback đa document khi DB chết giữa commit. Không scale nhiều writer trước khi thêm CAS/transaction đọc-ghi hoặc lock phân tán. Backup MongoDB và private media cùng nhau. Xem ARCHITECTURE để biết giới hạn ngoài phạm vi demo.
