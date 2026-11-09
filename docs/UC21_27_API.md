# API UC-21–27

Các URL dưới đây có tiền tố `/api`. Customer dùng Bearer. Guest gọi `POST /print/session` với `X-Print-Session: 1`; giữ cookie HttpOnly trả về và csrf trong response. Guest mutation gửi `X-Print-CSRF`. Không dùng guest token làm Bearer account. HTTP 400 validation, 403 permission/CSRF, 404 object không thuộc phiên, 409 version/workflow conflict, 429 rate limit.

| Endpoint | Quyền và hợp đồng |
|---|---|
| POST /print/session | Tạo/đọc session khách 7 ngày; trả csrf |
| GET /products/:id/print-options | Công khai; phiên bản cấu hình hiện hành |
| GET/POST /guest/designs | Guest draft riêng; title, productId, variantId, layers |
| GET/PATCH/DELETE /guest/designs/:id | Session owner; PATCH thêm version hiện tại, jobId khi sửa đơn SRS bị từ chối |
| /designs và /designs/:id | Cùng nghiệp vụ cho Customer; vẫn nhận identity guest hợp lệ để tương thích UI danh sách |
| POST /guest/designs/:id/assets | Multipart image + rightsConfirmed=true; SRS PNG/JPG 5MB, >=500px; trả id,width,height,sha256,warning |
| GET /design-assets/:id | Owner hoặc staff khi asset có trong job; original=1 cho staff; no-store |
| GET /design-revisions/:id/preview | PNG riêng tư của revision, hai mặt trong cùng ảnh; owner/staff |
| POST /print/quote | `{items:[{productId,variantId,designRevisionId,itemType:'custom',qty}],voucherCode?}` |
| POST /orders/quote | Cùng Pricing Service với print quote; trả items + subtotal/discount/shippingFee/total |
| POST /orders | Thêm acceptedTotal,requestKey,payMethod,address; Guest thêm email,guestTicket và cookie/CSRF. Guest chỉ COD |
| POST /orders/guest/send-code | fullName,email,phone; OTP service hiện hữu |
| POST /orders/guest/verify-code | email,code → ticket một lần |
| GET /orders/guest/:id | Chỉ phiên khách đã tạo đơn sau OTP |
| POST /orders/guest/:id/cancel | Session owner; cùng guard hủy/vật tư như Customer |
| GET /orders/:id/print-proofs | Owner Customer/Guest hoặc Staff |
| GET /print-jobs/:jobId | Owner/Staff; snapshot dùng để sửa đúng cấu hình đã mua |
| GET /admin/print-settings | Staff/Admin |
| PUT /admin/print-settings/:productId | version hiện tại + cấu hình mới; Staff/Admin; tạo version mới |
| POST /admin/print-settings/:productId/copy | targetProductId,version đích; cùng nhóm áo/kỹ thuật |
| GET /admin/print-jobs | Staff/Admin; oldest first, reviewAgeHours/reviewOverdue |
| POST /admin/print-jobs/:jobId/review | decision approve/reject,reason,designRevisionId,expectedHistoryLength; enhanced vẫn nhận revise |
| POST /print-jobs/:jobId/revision | Owner; reason,designRevisionId; một lần sửa miễn phí SRS |
| POST /admin/print-jobs/:jobId/status | status,reason,expectedHistoryLength; state machine theo mode |
| POST /admin/orders/:id/regular-items-ready | Staff xác nhận hàng thường đã chuẩn bị; tự xét readiness |
| GET /print-jobs/:jobId/export/:position | front/back/left_chest; proofId bắt buộc. download=1 chỉ staff. left_chest là vùng trên mặt trước |

SRS settings: workflowMode=srs; positions.FRONT/BACK/LEFT_CHEST gồm enabled,textRate,imageRate,maxChars,x,y,width,height,widthMM,heightMM. supportedFonts và supportedColors là whitelist. mockups chỉ front/back theo màu.

Element: `{id,position:'LEFT_CHEST',type:'text',text:'Xin chào',font:'Arial',fontSize:32,color:'#111111',x:.5,y:.5,width:.8,height:.2,rotation:0}` trong `layers.front`. IMAGE dùng type=image,assetId; x/y/w/h là tỷ lệ vùng in. SRS snapshot bổ sung contentType TEXT/IMAGE và configurationVersion.

Quote item có basePrice,printFee,unitPrice,quantity,lineTotal và priceBreakdown.positions[{position,contentType,fee}]. Trường frontFee/backFee được giữ cho client cũ (ngực trái được cộng vào frontFee). Các tổng và breakdown đều do server tính.

Email verify send trả mode=outbox hoặc smtp, queued; không khẳng định inbox delivery. Không trả OTP qua API công khai.
