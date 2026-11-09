# Kiểm thử và ma trận nghiệm thu

> Đây là ma trận của lượt triển khai đầu. Kết quả hiện tại (bao gồm Playwright đã chạy), test remediation và giới hạn mới nằm tại [VELATHIER_V2_REMEDIATION.md](VELATHIER_V2_REMEDIATION.md). Không dùng ghi chú “browser chưa chạy” bên dưới để mô tả phiên bản V2.

## Baseline trước sửa
- `npm.cmd run typecheck`: exit 0.
- `npm.cmd run build`: exit 0.
- `npm.cmd run test:integration`: 142 đạt/0 lỗi; MongoDB checks và review checks đạt.
- `npm run ...` ban đầu bị PowerShell ExecutionPolicy chặn npm.ps1; npm.cmd chạy bình thường.

## Suite mới
- `npm.cmd run test:custom-unit`: 11 test — cart identity, normalized geometry, rotation/aspect, invalid fields, disabled side, DPI/ownership, voucher/refund rounding, shipment/cancel guards, payment gate.
- `npm.cmd run test:integration`: giữ toàn bộ suite cũ, thêm server/test-custom-print.js; lượt mở rộng đã đạt 90 kiểm tra/0 lỗi, có MongoDB thật riêng, API Express thật, Sharp decode thật.
- Suite cũ `test-mongo` và `test-reviews` không xuất tổng assertion count nên không cộng số giả. Integration tự tạo/xóa đúng DB `velathier_test_<timestamp>_<pid>`, không reset DB local .env.
- Test lần đầu phát hiện lỗi AsyncLocalStorage ở Multer upload; đã bind callback và chạy lại đạt. Unit fixture DPI/rotation ban đầu có expectation sai; đã sửa fixture theo phép tính và chạy lại 12/12.

## TC01–TC40
| TC | Nội dung | Bằng chứng |
|---|---|---|
| 01 | Create draft | custom API test |
| 02 | Save/reopen geometry | custom API + Mongo reconnect |
| 03 | Stale version | custom PATCH 409 |
| 04 | PNG upload | Sharp decode + metadata + private file |
| 05 | Executable giả PNG | custom upload 400 |
| 06 | Oversized | multipart >10MB 400 |
| 07 | Low DPI | unit limiting axis + quote 400 |
| 08 | Outside zone | rotated geometry unit + API |
| 09 | Independent front/back | snapshot API; visual switch chưa browser-test |
| 10 | Same SKU/two designs | cart helper unit + quote lines |
| 11 | Mixed regular/custom | cart helper + price quote |
| 12 | Tampered fee | server quote bỏ qua client price |
| 13 | Fee changed after order | immutable persisted price test |
| 14 | Voucher | custom discount + baseline shipping/voucher |
| 15 | Staff approval | WAITING_CUSTOMER_APPROVAL assert |
| 16 | Printing without proof | 409; COD unconfirmed review 409 |
| 17 | Exact proof | approve hash/id; retry idempotent |
| 18 | Obsolete proof | 409 |
| 19 | Revision resets gates | request revision + obsolete approval check |
| 20 | Ordered production | PRINTING/QC/PACKED API sequence |
| 21 | Skip PACKED | 409 |
| 22 | QC fail/reprint | reason required; controlled loop |
| 23 | Cancel before print | custom cancel API |
| 24 | Cancel after print | Customer/Staff 403 |
| 25 | Duplicate cancellation | qty restored once |
| 26 | Paid VNPay cancellation | signed sandbox IPN + refund pending |
| 27 | Duplicate VNPay callback | RspCode02; baseline payment regression |
| 28 | Ship before packed | ready_to_ship guard 409 |
| 29 | Shipping info | valid correction + retry history count |
| 30 | Cross-user object | design/asset/order ownership tests |
| 31 | Size guidance | recommendation API + explanation |
| 32 | Recommended size unavailable | available=false |
| 33 | Review before delivered | existing reviews suite 403 |
| 34 | Verified review | delivered custom line API + photos |
| 35 | Duplicate review | 409 unique line |
| 36 | Other user edit | existing review ownership suite |
| 37 | Notification retry | eventKey dedupe + persisted outbox state |
| 38 | Regular orders | 142 baseline regression retained |
| 39 | Historical fields missing | review fixture lacks lineId/itemType; fallback works |
| 40 | Returns/refunds | baseline API suite + lineId extension |

## Bổ sung ngoài 40 TC
Migration lặp không tạo product/settings trùng; seed-demo lặp giữ 7 order fixtures; staff không giả Customer; config negative fee và RBAC; acceptedTotal mismatch; checkout idempotency; callback đến sau cancel không hồi sinh job; start-print/cancel concurrent chỉ một thành công; Admin exception không restock consumed; review photos private-before-publish và hidden-after-moderation; mọi media URL trả image; SPA refresh trả index cho routes mới.

## Ma trận UC
“UI có” là implementation trong source/build; không đồng nghĩa đã kiểm thử tương tác browser.

| UC | API/service | UI | Test tự động | Còn cần xác minh |
|---|---|---|---|---|
| 01 | Có | Studio | geometry/version/cart đạt | drag/touch/browser |
| 02 | Có | upload/rights | valid/invalid/size/ownership/DPI đạt | upload interruption UI |
| 03 | Snapshot + geometry | preview/front/back/zoom | data/path đạt | visual alignment/browser |
| 04 | pricing chung | fee/checkout | tamper/qty/voucher/snapshot đạt | browser checkout |
| 05 | versioned config | Admin config/history/media | RBAC/fees/version đạt | cấu hình UI/browser |
| 06 | guarded review | Staff queue | approval/revision/payment gate đạt | browser staff |
| 07 | state machine | job controls/QC | progression/QC/skip/race đạt | browser board |
| 08 | shipping guard/audit | Admin shipping | tracking/retry/packed đạt | live courier không tích hợp |
| 09 | owner order/jobs | timelines | ownership/history/SPA đạt | mobile readability |
| 10 | persisted events/worker | Admin outbox | dedupe/outbox đạt | SMTP live chưa chạy |
| 11 | immutable revisions | drafts/autosave/recovery | save/reload/conflict đạt | autosave/recovery browser |
| 12 | exact proof hash | customer proof panel | old/exact/repeated/invalidation đạt | visual proof browser |
| 13 | guarded cancel/refund | customer/admin exception | before/after/late payment/race đạt | live refund provider |
| 14 | chart/recommendation | product chart/Admin editor | available/unavailable đạt | charts chưa xác minh supplier |
| 15 | verified review/photos/moderation | product/Admin review UI | existing + custom/photo tests đạt | browser photo gallery |

## Không tuyên bố đã kiểm thử
Browser host không khả dụng; chưa có Playwright/component DOM E2E chạy. SMTP thật, VNPay live/refund provider, carrier API, replica-set fault injection và multi-instance writes chưa chạy. Các giới hạn này cần được kiểm tra trước production. Không dùng HTTP 200 của SPA làm bằng chứng UI hoạt động hoàn chỉnh.
