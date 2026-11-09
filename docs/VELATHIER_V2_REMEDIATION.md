# VELATHIER V2 — remediation / bàn giao 07/11/2026

Repo thực hiện: `E:\SDN302\Project\WebQuanAo`, được chủ repo xác nhận là đúng bản cần sửa dù prompt gọi là WebQuanAo(2). Giữ thay đổi có sẵn, không reset repo/DB và không xây lại 15 UC.

## Baseline và nguyên tắc bằng chứng

- Baseline: typecheck/build đạt; unit **12/12**; integration **142/0** API + MongoDB/reviews + **90/0** custom.
- Logs gốc: `docs/v2-baseline-{typecheck,build,unit,integration}.log`; git status trước sửa: `v2-initial-git-status.log`.
- Test integration/browser tạo DB `velathier_test_<timestamp>_<pid>` rồi chỉ drop đúng DB đó. Replica test khởi chạy mongod riêng, port riêng, thư mục riêng trong `server/private/test-replicas`; không đổi service MongoDB đang dùng.
- Các harness ép local storage riêng trong `server/private/test-storage/<test DB>`, JWT secret test và tắt SMTP/VNPay live; không kế thừa bucket hoặc secret thanh toán từ profile production.
- Backup trước thay đổi nằm trong `server/private/backups`; không commit/đóng gói. Bản đầu chứa 17 collections và 24 file local (kể cả orphan); bản backup theo metadata sau đó chứa 17 collections và 0 file được DB hiện tại tham chiếu (demo dùng chữ). Backup không chứa `.env`; cần sao lưu riêng secret manager/key mã hóa outbox.
- Không ghi đè order snapshot, revision hoặc proof đã duyệt. Proof cũ thiếu export không được đi tiếp qua production API; khách cần yêu cầu sửa và Staff duyệt lại, không tự sinh và tự xác nhận thay khách.

## Trước / sau / tiêu chí chấp nhận

| Mục | Trước | Sau | Bằng chứng / giới hạn |
|---|---|---|---|
| P0-A | VNPay hàng thường chưa trả tiền có thể chuẩn bị/giao | `fulfillment.js` chặn confirmed/processing/ready/shipped/delivered và shipping metadata; COD cần confirmed; dropdown theo allowedTransitions | 7 test fail trước sửa; 8 test guard đạt sau sửa; API âm tính và callback ký hợp lệ trong regression |
| P0-B | Proof JSON + Konva | PNG RGBA private theo mm/DPI, hash ảnh/font/output; manifest + rendererVersion; khách duyệt đúng raster; Staff chỉ lấy file khi đúng bản đã duyệt; revocation giữ proofHistory | Pixel dimensions/transparency/rotation/text, owner/RBAC, exact download và browser proof đạt. **Chưa chứng nhận print-ready**: cần operator checklist và in thử vật lý |
| P0-C | Full-DB UOW, transaction chỉ ở write, một process queue | Catalog list/detail targeted Mongo queries; checkout/quote có scope theo user/SKU/revision/voucher; replica transaction bao trùm read→business→write; conditional stock `$inc`; concurrent replica requests; requestKey cả regular/custom; standalone lease demo; private local/S3 adapter | Hai API process tranh last stock + fault injection stock/refund/outbox đạt. Legacy admin/auth/background vẫn dùng facade; chưa benchmark tải lớn, chưa nghiệm thu S3 thật |
| P0-D | Trust-proxy=1, demo login có thể tồn tại production, return evidence public | Proxy mặc định không tin XFF; production HTTPS/replica/S3/secret gates; chặn demo identities kể cả token cũ; bootstrap Admin từ secret env; bundle allowlist; return photos decode/private/ownership; audit log không ghi body/token | Production config/IP limiter/traversal tests; fake return photo + cross-user/public denial đạt. JWT localStorage được giữ để bảo toàn login; HttpOnly migration được hoãn có chủ đích |
| P1-E | SMTP bên trong serialized db.run và trước commit | `send` chỉ stage encrypted transactional outbox; worker riêng atomic claim/lease, 5 lần/backoff/dead-letter; payload xóa sau sent; event keys unique; queued khác sent | Slow SMTP không chặn auth API; hai worker không lấy cùng claim; failed commit không có email; dead-letter đạt. SMTP ACK→crash có thể gây gửi lặp: cần provider idempotency/đối soát |
| P1-F | Save đang chạy trả undefined; cart bị xóa trước link VNPay | Single-flight save promise, latest snapshot giữ lớp mới; upload chờ save; checkout giữ cart + orderId/requestKey trong sessionStorage; retry CTA tới đơn cũ | Delayed PATCH+upload và payment-link 503+refresh chạy thật trên desktop/mobile |
| P1-G | Chỉ SVG minh họa | Giữ đúng SKU/màu và nhãn minh họa; metadata/license tiếp tục lưu; thêm fallback ảnh lỗi; upload catalog đã dùng WebP, gallery SVG co giãn | Không có bộ ảnh thật được cấp phép/đối chiếu SKU nên **không thay bằng ảnh thương hiệu bất kỳ**. Xem IMAGE_SOURCES.md |
| P1-H | Manual tracking, thiếu chronology/correction rule | Giữ nhãn thủ công; guard payment+packed; validate date, milestone transitions; reason khi sửa tracking đã bàn giao; return_to_sender/returned_to_sender; provider boundary fail-closed | Unit shipping và API correction audit đạt; chưa có webhook nhà vận chuyển thật |
| P1-I | Studio có race/tràn ngang, thiếu onboarding; effect scroll gây crash browser mới | Hướng dẫn 3 bước, numeric keyboard placement, grid minmax(0,1fr), proof raster summary, reset checkbox khi proof đổi; sửa effect cleanup; guest UI yêu cầu login nhất quán | 6 Playwright cases đạt; xem phạm vi UI/API hỗn hợp bên dưới. Không tuyên bố đã chạy mọi nhánh mọi màn hình |
| P2 / vận hành | Chưa có gói triển khai/restore được diễn tập | Build deployment allowlist; backup hash manifest, restore DB rỗng, GC dry-run giữ refs/proofHistory; launch checklist | Restore riêng xác nhận 7 đơn. S3 lifecycle, monitoring, RPO/RTO và legal policy cần operator nghiệm thu |

## Thiết kế kỹ thuật và API/schema

File mới chính: `server/fulfillment.js` (payment/shipping guard), `print-export.js` (raster/manifest/hash), `private-storage.js` (local/S3), `outbox-worker.js` (claim/delivery), `shipping-provider.js` (manual transitions), `backup-private.js`/`restore-private.js`/`build-deployment.js`/`provision-admin.js` (vận hành). Bộ test mới: `test-remediation-unit.js`, `test-replica.js`, `test-reliability.js`, `test-browser.js`, `tests/browser/journeys.spec.cjs`, `playwright.config.cjs`.

Mở rộng các module hiện có: mongo-store, models, controllers orders/admin/returns/products, custom-print routes/service, mailer/config/server/security, migration/demo seed; phía React gồm Studio, checkout/payment, PrintJobs/PrintSettings, order/admin, PrivateImage và effect ScrollTop. Dependency mới ở lượt V2: AWS S3 SDK và Playwright (dev); không đổi framework. Các thay đổi chưa commit từ lượt trước vẫn được giữ.

Schema version **5**, thêm `mailOutbox` (unique eventKey), không đổi business IDs. `PrintJob.proof` có `exports`, `rendererVersion`, `qualification`; `proofHistory` giữ các proof bị thu hồi. `PrintSettings.exportDpi` từ 72–600 (mặc định 300 cho cấu hình mới), độc lập minimum/recommended input DPI. Snapshot lịch sử giữ nguyên.

`GET /api/print-jobs/:jobId/export/:side?proofId=<id>[&download=1]`:
- Customer owner xem raster trước khi xác nhận; người khác 404.
- Staff/Admin phải có exact customer approval kể cả khi không truyền download=1; file production không có public URL.
- Mismatch proof ID/revision/snapshot/manifest/file hash hoặc revoked → 409. Tải production qua nút Xưởng in.
- API approve/status kiểm tra file/hash. Export không tự chuyển QUEUED hoặc in.

Stock-only changes dùng conditional update so sánh variants trước khi `$inc`; transaction snapshot và Mongo write conflicts ngăn multi-instance ghi đè. Conflict trả 409, client giữ requestKey để retry; không tự retry lại handler Express hoặc side effect. Những endpoint facade chưa chuyển targeted queries còn chi phí tải state; cần đo tải trước mở rộng traffic.

Replica transaction là bảo vệ nhiều document. Standalone không thể đảm bảo atomicity khi mất điện giữa writes; chỉ là **demo**, có lease chặn hai writer ứng dụng (test DB được miễn để kiểm thử các harness). Production từ chối standalone. Operator vẫn phải dừng writer khi backup filesystem/DB hoặc dùng snapshot/PITR đồng bộ.

SMTP thật cũng yêu cầu replica set kể cả development; không gửi mail từ một standalone commit nhiều document có thể dở dang. Khi SMTP chưa cấu hình, worker không claim message để tránh biến queue tạm ngừng thành dead-letter.

Storage `private-storage.js`: local development hoặc S3/S3-compatible. Key allowlist, write-once `If-None-Match:*`, server-side encryption, không ACL public, không trả URL bucket cho client. IAM, block-public-access, versioning, lifecycle do operator thiết lập. Original/preview/artifact vẫn đi qua auth API. Remote object missing có thể chỉ bị phát hiện khi đọc/export; cần inventory reconciliation trước launch.

Return evidence mới giải mã Sharp rồi WebP private. URL lịch sử `/assets/img/returns/:key` được giữ nhưng yêu cầu token + ownership; legacy file còn trên disk được đọc qua route bảo vệ. Khi chuyển storage/root, cần copy legacy return files vào vị trí phù hợp hoặc chạy migration riêng; không tự xóa ảnh cũ.

Outbox payload AES-256-GCM bằng `OUTBOX_ENCRYPTION_KEY` (dev dùng derived JWT secret); Admin không đọc OTP ciphertext. Worker ngoài UOW SMTP, claim 120s, backoff exponential tối đa 1h, 5 attempts. Dead letters cần đối soát nhà cung cấp trước requeue; không có nút gửi lại mù quáng. `Message-ID` ổn định giúp đối soát nhưng không chứng minh SMTP exactly-once. Không thay secret mã hóa khi còn pending messages nếu chưa có kế hoạch decrypt/re-encrypt.

### Bản xuất và giới hạn xưởng

`pixels = round(mm / 25.4 × dpi)`. Layers đặt theo tâm chuẩn hóa của vùng in, không gồm áo/mockup; xoay quanh tâm, kiểm tra bounding box. Raster gốc được kiểm tra SHA256 và DPI theo cả hai trục. Chữ dùng font file được cấu hình, escaped markup, raster hóa và ghi hash font; PNG không cần font ở máy xưởng. Giới hạn 40MP/mặt.

Konva là preview chỉnh sửa; raster server là mẫu cuối khách xác nhận, có thể khác nhẹ cách layout chữ. Không có CMYK/ICC máy in, spot-color separation, underbase/white ink, halftone, RIP preset, bleed hoặc tự mirror. SCREEN/DTF/DTG được ghi vào manifest nhưng **không có nghĩa raster phù hợp mọi máy/kỹ thuật**. Xưởng phải xác nhận từng kỹ thuật. Nguồn kỹ thuật: [Sharp text/fontfile](https://sharp.pixelplumbing.com/api-constructor/).

## Kết quả thực tế

| Lệnh | Kết quả đã quan sát | Log |
|---|---|---|
| `npm.cmd run typecheck` | exit 0 | v2-typecheck.log |
| `npm.cmd run build` | exit 0 | v2-build.log |
| `npm.cmd run test:custom-unit` | 27 đạt, 0 lỗi | v2-unit.log |
| `npm.cmd run test:integration` | 153 API + 95 custom đạt; MongoDB/reviews suites đạt | v2-final-integration.log |
| `npm.cmd run test:replica` | 5 scenarios đạt, 0 lỗi | v2-replica.log |
| `npm.cmd run test:browser` | 6 đạt trên Chromium: desktop 1440×1000, mobile 390×844 | v2-browser-final.log |
| `npm.cmd run backup:private` + restore isolated | hash kiểm tra; phục hồi và xác nhận 7 orders | v2-backup.log, v2-restore.log |
| `npm.cmd run build:deployment` | allowlist bundle tạo được | v2-deployment.log |
| `npm.cmd audit --json` / `npm.cmd --prefix client audit --json` | 0 vulnerabilities cả hai | v2-server-audit.json, v2-client-audit.json |

Playwright gồm 3 case × 2 viewports: Studio→cart→checkout COD→Staff review→Customer raster approval→PRINTING/QC/PACKED→shipping/delivered→review; delayed PATCH+upload; VNPay create-link 503+refresh không tạo order trùng/không xóa giỏ, thử lại cùng đơn rồi thanh toán sandbox thành công và dọn đúng dòng giỏ. **Bước xác nhận COD và shipping/delivered trong E2E dùng API Staff thật**, còn Studio/checkout/review/proof/production controls dùng UI; không gọi đó là toàn bộ click-only E2E. Các API âm tính còn lại ở integration.

Ảnh: `server/private/browser-results/{desktop,mobile}-studio.png`, `{desktop,mobile}-review.png`. HTML report: `server/private/browser-report/index.html`. Các artefact này không được đóng gói production; trace có thể chứa token demo. Trong lần chạy đầu browser đã bắt lỗi cleanup effect và tràn ngang Studio; các lỗi đã sửa và re-run, không che logs thất bại.

## Migration / rollback

1. Dừng writer. `npm.cmd run backup:private`; giữ backup trên volume riêng có kiểm soát truy cập. Với S3 backup script tải các key được metadata/proofHistory tham chiếu và kiểm tra hash. Lưu riêng outbox secret key.
2. `npm.cmd install`; `npm.cmd --prefix client install`; `npm.cmd run migrate:custom-print`; `npm.cmd run build`. Migration additive lên schema 5 và indexes, không reset/seed DB đang có dữ liệu. Đã chạy trên local.
3. Production: dùng DB replica riêng, S3 private riêng, inject config từ `.env.example` bằng secret manager. `node server/provision-admin.js` với ADMIN_BOOTSTRAP_EMAIL/PASSWORD để tạo admin mới một lần; không đổi user có sẵn và không dùng u_admin demo. Sau bootstrap xóa hai biến tạm.
4. `npm.cmd run build:deployment` tạo thư mục private/deployment. Chỉ chuyển thư mục bundle đó; `npm ci --omit=dev` tại đích. Không copy nguyên repo. Không có .env/.git/node_modules/DB/private uploads trong manifest. Không sử dụng profile bucket test cho live.
5. Rollback code: deploy artifact cũ sau khi dừng writers; schema additive có thể giữ. Không downgrade bằng cách ghi lại snapshot/proof từ backup lên DB đang có đơn mới. Nếu cần full restore: inject `RESTORE_MONGO_URI` tới **DB riêng rỗng**, chạy `node server/restore-private.js <backup>`, kiểm tra hash/count/index và assets trước khi switch traffic. Script từ chối overwrite DB nguồn hoặc DB có collection. Restore không giữ traffic live; chọn RPO/RTO trước thao tác.
6. Legacy approved JSON không được auto-approved thành raster. Đơn chưa in: Customer yêu cầu chỉnh sửa→Staff duyệt→Customer xác nhận lại. Đơn lịch sử đã bắt đầu in được tiếp tục QC/đóng gói dựa trên snapshot cũ; không được bắt đầu in/in lại hoặc tải file production chưa có approval raster. Giữ nguyên bằng chứng cũ, không rewrite lịch sử.

## Demo và checklist trước live

Xem [DEMO_SCRIPT.md](DEMO_SCRIPT.md) cho 3 actor journeys; mở `http://localhost:5173`, `/product/blank-regular`, `/designs`, `/orders/:id`, `/admin`. Dữ liệu demo được đánh dấu; COD fixture không phải bằng chứng thu tiền thật. Guest UI yêu cầu đăng nhập; backend OTP guest vẫn được giữ, không tạo lookup đơn công khai.

Operator phải xác nhận:
- [ ] DB replica riêng, backup/PITR + restore drill, storage S3 private/versioning/retention/recovery, quyền IAM tối thiểu; chạy qualification với credential thật.
- [ ] HTTPS/reverse proxy thực tế, rate limits sau proxy, secret rotation nếu lộ, admin mới, không demo identity; request audit tập trung/alerting.
- [ ] VNPay sandbox chính thức rồi live callback/refund reconciliation. Mặc định `VNP_REFUND_AUTOMATION_ENABLED=0`: refund chờ thủ công, Admin chỉ xác nhận sau khi đối soát mã giao dịch; hệ thống nói rõ không gọi provider. **Nếu bật automation, provider vẫn là side effect bên ngoài transaction**; crash sau provider ACK trước DB commit cần đối soát, không retry mù. Không bật flag trước khi giải quyết/nghiệm thu live refund crash recovery.
- [ ] SMTP acceptance (timeout, dead-letter, bounce, provider idempotency), backup outbox key; cảnh báo tồn đọng; kiểm tra expiration/retention OTP theo SLA.
- [ ] Xưởng: đối chiếu mã đơn/revision/hash, size/màu áo, mm/pixel/DPI từng mặt, alignment, font chữ tiếng Việt, transparency/white ink, mirror/underbase theo kỹ thuật; in thử trên vật liệu thật; ghi người kiểm/ngày/máy/preset. Chỉ khi đạt mới gọi print-ready.
- [ ] Ảnh/size thật được nhà cung cấp xác nhận, source/license hợp lệ; policy quyền artwork, privacy/retention, đổi trả/hoàn tiền và liên hệ hỗ trợ.
- [ ] Chỉ quảng bá live tracking sau ký kết/tích hợp/kiểm tra webhook; hiện chỉ là tracking manual có audit.
- [ ] Load test và migration các legacy facade endpoints còn lại khi traffic tăng. Chưa có số liệu capacity/SLA hoặc đánh giá HA failover.

Không có credential live/ảnh nhà cung cấp nên không tự cấu hình hoặc xác nhận các mục live ở trên. Chưa chuyển JWT localStorage sang HttpOnly cookie: cần thiết kế refresh/revocation/CSRF và migration phiên riêng; hiện giữ Bearer auth/CSP, tránh phá login đang dùng. Không phát hiện .env/.env.local được Git theo dõi trong kiểm tra hiện tại, nhưng không thay thế kiểm toán toàn bộ lịch sử/secrets ở hệ thống bên ngoài.
