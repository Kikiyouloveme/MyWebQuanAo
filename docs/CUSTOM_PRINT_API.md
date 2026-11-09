# API in theo yêu cầu

> V2 thêm private raster export, payment gate cho mọi loại đơn, idempotency cho regular orders và correction reason của vận chuyển. Xem hợp đồng và quy tắc mới tại [V2 remediation](VELATHIER_V2_REMEDIATION.md).

Base `/api`. JSON error `{error, code?}`; 400 dữ liệu sai, 401 phiên hết hạn, 403 sai quyền/điều kiện, 404 đối tượng không tồn tại hoặc không thuộc chủ, 409 phiên bản/trạng thái/quote xung đột. Request ghi có rate limit. JWT Bearer theo auth hiện có.

## Customer designs
| Method / path | Body | Response / quyền |
|---|---|---|
| POST /designs | productId, variantId, title, layers | 201 Design + revision; verified Customer |
| GET /designs | — | Drafts của mình, bỏ deleted |
| GET /designs/:id | — | Design + revision.snapshot |
| PATCH /designs/:id | version, title, variantId, layers | Phiên bản mới, không sửa revision cũ |
| DELETE /designs/:id | — | Soft delete nếu chưa dùng vào order; job liên quan trả 409 |
| POST /designs/:id/assets | multipart image + rightsConfirmed=true | 201 {id,width,height,sha256} |
| GET /design-assets/:id | query original=1 chỉ staff | Binary; owner preview, staff artwork đã gán job; no-store |

Layer: `{id,type:'image'|'text',x,y,width,height,rotation}`. Image thêm assetId; text thêm text,font,color. x/y là tâm trong vùng in, width/height 0–1, không phải pixels màn hình. `layers={front:[],back:[]}`. Front/back độc lập. Font palette có trong custom-print.js.

## Báo giá và checkout
`POST /orders/quote`: `{items:[{productId,variantId,qty,itemType:'custom',designRevisionId,qualityAcknowledged}],voucherCode?}`. Dòng thường bỏ trường custom. Response Quote hiện có + priceBreakdown, designSnapshot, printSettingsSnapshot trên dòng custom. Tiền từ browser bị bỏ qua.

`POST /orders`: các trường trên + address/addressId, payMethod, **acceptedTotal**, **requestKey** cho custom. Request key 10–100 ký tự, giữ nguyên khi retry cùng body. Giá khác quote trả 409 `QUOTE_CHANGED`. Existing guest COD chỉ dùng hàng thường; UI checkout vẫn yêu cầu login như trước.

## Settings/media/size
| Method / path | Body | Quyền |
|---|---|---|
| GET /products/:id/print-options | — | Public; latest settings hoặc null |
| GET /admin/print-settings | — | Admin, toàn bộ lịch sử |
| PUT /admin/print-settings/:productId | version, enabled, technique, minDpi, recommendedDpi, maxBytes, formats, areas, mockups | Admin; append version |
| PUT /admin/products/:productId/media | media[] | Admin; đúng màu, local file tồn tại và license evidence |
| GET /products/:id/size-guide | — | Public SizeChart hoặc null |
| POST /products/:id/size-recommendation | chest (cm cơ thể), fit, color | Public {size,available,explanation,sample} |
| PUT /admin/size-charts/:productId | version, fit, sample, rows[{size,chest,length}] | Admin; version conflict |

Settings `areas.front/back={enabled,fee,x,y,width,height,widthMM,heightMM}`; `mockups[color]={front:'/assets/img/...',back:'...'}`. Mockup tỷ lệ 4:5, geometry ratio tương ứng mm. technique DTF/DTG/SCREEN, thresholds là cấu hình áp dụng cho kỹ thuật đã chọn. Upload mockup qua POST /upload (Staff/Admin), raster PNG/JPEG/WebP 5MB, lưu WebP. SVG catalog do project tạo sẵn vẫn dùng được; không nhận SVG qua upload.

Media: assetId, productId, color, viewType(front/back/detail/lifestyle), localPath, altText, sourceName, sourceURL, licenseType, licenseEvidence, attribution, verifiedAt. API validate đường dẫn, file và text; con người phải kiểm tra quyền sử dụng thực tế.

## Review, proof và production
| Method / path | Body | Quyền / kết quả |
|---|---|---|
| GET /admin/print-jobs | — | Staff/Admin; đồng bộ payment gate |
| GET /admin/print-jobs/:jobId | — | Staff/Admin |
| POST /admin/print-jobs/:jobId/review | decision approve/revise/reject, reason nếu không approve | Staff/Admin; audit + proof |
| POST /admin/print-jobs/:jobId/status | status PRINTING/QUALITY_CHECK/QC_FAILED/PACKED, reason | Staff/Admin, guarded transition |
| GET /orders/:id/print-proofs | — | Owner hoặc Staff/Admin; jobs/history/proof |
| POST /print-jobs/:jobId/approve | proofId, hash, acknowledged=true | Owner verified Customer, exact current proof |
| POST /print-jobs/:jobId/revision | reason, designRevisionId? | Owner; thiếu revisionId là yêu cầu sửa, có thì gửi lại |

QC dùng chung `/status`, không có endpoint duplicate bypass state machine. Preview render frontend từ snapshot, không có API stub `/preview`. Mua snapshot qua checkout thay cho endpoint `/submit` độc lập. Post-order đổi mặt in trả 409 yêu cầu hủy/đặt lại xác nhận giá.

## Shipping/cancellation/refund
Giữ `POST /orders/:id/cancel {reason}`. Admin ngoại lệ thêm `productionException:{inventoryDecision:'discard_consumed',refundDecision:'pending_if_paid'}`. Chặn sau delivered. Hủy custom lặp trả đơn đã hủy, không cộng kho/voucher lần nữa.

Giữ `PUT /admin/orders/:id/status {status,note?}`. ready_to_ship/shipped/delivered phải mọi PrintJob PACKED; shipped cần carrier/tracking.

`PUT /admin/orders/:id/shipping {carrier,trackingNumber,handedOverAt?,estimatedDeliveryAt?,milestone?,customerNote?}`. milestone prepared/in_transit/delayed/delivery_failed; các mốc đang giao chỉ sau order shipped. Theo dõi thủ công, correction có history; request giống nhau không thêm mốc.

Payment/VNPay/refund endpoints hiện có được giữ; custom late payment chuyển refund_pending, không hồi sinh jobs. Notification worker xử lý events trong DB, không public API gửi mail tùy ý.

## Verified reviews
Giữ GET /products/:id/reviews?sort=newest|rating (gồm count,average,distribution), GET /products/:id/review-purchases, POST /orders/:id/items/:lineId/review, PUT /reviews/:id. Body rating,title,comment,photoAssetIds?. API edit hiện dùng PUT theo convention repo.

POST /review-photos multipart image,orderId: Customer có đơn delivered, response {id}. GET /review-photos/:id chỉ trả WebP sau khi có published review tham chiếu. Original không công khai. GET /admin/reviews và PUT /admin/reviews/:id/moderation {status:'published'|'hidden',reason}: Admin, có audit.

Postman collection được bổ sung folder Custom Printing. Biến token là JWT cho actor phù hợp; không lưu token thật trong file.
