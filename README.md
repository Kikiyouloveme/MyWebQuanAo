# VELATHIER

Website thương mại điện tử thời trang — chuẩn bị cho vận hành bán hàng thật tại Việt Nam.

**Stack:** React 18 · TypeScript · Tailwind CSS v4 · shadcn/ui · Express · JWT · VNPay · Nodemailer

---

## Cài đặt & chạy

Lần đầu:

```bash
npm run setup
```

Lệnh trên cài dependencies (server + client), tạo dữ liệu mẫu và build giao diện.

Sau đó tạo file cấu hình:

```bash
cp .env.example .env
```

Chạy máy chủ:

```bash
npm start
```

Mở http://localhost:5173

### Các lệnh khác

| Lệnh | Công dụng |
|---|---|
| `npm run build` | Build lại giao diện sau khi sửa code trong `client/src` |
| `npm run seed` | Tạo lại dữ liệu mẫu (**ghi đè toàn bộ dữ liệu hiện có**) |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run test:api` | Chạy 142 test API (cần server đang chạy) |

> **Lưu ý khi seed lại:** máy chủ giữ dữ liệu trong bộ nhớ, nên phải **tắt máy chủ
> trước khi chạy `npm run seed`** rồi mới bật lại. Seed lúc máy chủ đang chạy sẽ khiến
> file và bộ nhớ lệch nhau, dữ liệu mới bị ghi đè trở lại.

### Chạy bộ kiểm thử

```bash
npm run seed
```

Rồi khởi động máy chủ và chạy:

```bash
npm run test:api
```

Bộ test tạo nhiều đơn hàng nên tiêu hao tồn kho. Muốn chạy lại từ đầu, lặp lại đúng
thứ tự: tắt máy chủ → seed → bật máy chủ → chạy test.

Rate limit sẽ chặn chính bộ test nếu để bật. Khi chạy test, đặt biến môi trường
`DISABLE_RATE_LIMIT=1` cho máy chủ — biến này **bị bỏ qua hoàn toàn ở production**
nên không thể dùng để tắt lớp bảo vệ trên môi trường thật.

### Tài khoản mẫu

Chỉ dùng cho môi trường phát triển — **đổi mật khẩu hoặc xóa trước khi lên production**.

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@velathier.vn` | `admin123` |
| Nhân viên | `staff@velathier.vn` | `staff123` |
| Khách hàng | `khach@velathier.vn` | `khach123` |

---

## Kiến trúc

```
├── server/                   Backend Express
│   ├── config.js             Nạp & kiểm tra biến môi trường (phải require đầu tiên)
│   ├── db.js                 Data-access layer — mọi truy cập dữ liệu đi qua đây
│   ├── security.js           Security headers, rate limit, JWT, phân quyền, validate
│   ├── pricing.js            Tính tiền: subtotal → voucher → phí ship → tổng
│   ├── inventory.js          Tồn kho theo biến thể, reserve/release idempotent
│   ├── otp.js                OTP 6 số, lưu dạng hash, dùng một lần
│   ├── mailer.js             Template email + SMTP/hộp thư nội bộ
│   ├── vnpay.js              Ký/xác thực HMAC-SHA512, tạo link, hoàn tiền
│   ├── routes/               auth · products · orders · payment · vouchers · returns · admin
│   ├── seed.js               Dữ liệu khởi tạo
│   └── test-api.js           Bộ kiểm thử API
├── client/                   Frontend React (đây là ứng dụng chạy thật)
│   └── src/
│       ├── components/ui/    shadcn/ui: button, input, label, badge, dialog…
│       ├── components/auth/   Giao diện xác thực nền tối + ô nhập OTP
│       ├── context/          auth · cart · toast
│       ├── pages/            home, shop, product, checkout, payment, orders, account, admin…
│       └── lib/              api client, meta SEO, tiện ích
├── assets/img/               Ảnh sản phẩm và ảnh khách tải lên
└── legacy/                   Mã HTML/CSS/JS cũ, KHÔNG còn được nạp lúc chạy
```

Dữ liệu hiện lưu trong file JSON tại `server/data/db.json`. Toàn bộ truy cập dữ liệu
đã đi qua `server/db.js`, nên khi chuyển sang PostgreSQL chỉ cần viết lại phần thân
các hàm repository trong file đó — phần nghiệp vụ giữ nguyên. Schema có đánh version
và tự migrate khi khởi động, có sao lưu trước khi nâng cấp.

---

## Phân quyền

| Chức năng | Khách vãng lai | Khách hàng | Nhân viên | Admin |
|---|:-:|:-:|:-:|:-:|
| Xem sản phẩm, trang nội dung | ✓ | ✓ | ✓ | ✓ |
| Thêm vào giỏ hàng | ✓ | ✓ | ✓ | ✓ |
| Đặt hàng (cần xác minh email) | | ✓ | ✓ | ✓ |
| Xem/hủy đơn của chính mình | | ✓ | ✓ | ✓ |
| Yêu cầu đổi/trả | | ✓ | ✓ | ✓ |
| Quản lý sản phẩm, tồn kho, voucher | | | ✓ | ✓ |
| Xử lý đơn hàng, đổi/trả, hoàn tiền | | | ✓ | ✓ |
| Quản lý người dùng & phân quyền | | | | ✓ |

Kiểm soát ở **cả hai lớp**: middleware chặn ở API và `<Protected>` chặn ở route React.
Bỏ qua lớp giao diện cũng không truy cập được dữ liệu vì API tự kiểm tra quyền.

---

## Quy tắc nghiệp vụ

- **Thanh toán:** COD hoặc VNPay. Đặt hàng bắt buộc đăng nhập và đã xác minh email.
- **Phí vận chuyển:** 40.000₫, miễn phí khi giá trị đơn **sau khi trừ voucher** đạt 750.000₫.
- **Voucher:** chỉ giảm theo phần trăm, tối đa 1 mã mỗi đơn, áp dụng được cho cả hàng đang sale.
- **Tồn kho:** riêng cho từng tổ hợp màu + size.
- **Hủy đơn:** khách tự hủy được cho tới trước khi đơn bàn giao đơn vị vận chuyển.
- **Đổi/trả:** trong 7 ngày kể từ khi giao thành công, hàng còn nguyên tem và chưa sử dụng,
  bắt buộc có lý do + ảnh minh chứng, nhân viên duyệt thủ công.
- **Phí ship đổi/trả:** khách đổi ý thì khách chịu; sản phẩm lỗi hoặc giao sai thì cửa hàng chịu.
- **Hoàn tiền:** đơn VNPay hoàn về nguồn thanh toán; đơn COD hoàn qua chuyển khoản.

Mọi con số tiền đều được **server tính lại từ database**. Client chỉ gửi lên mã sản phẩm,
biến thể, số lượng và mã voucher — giá, giảm giá, phí ship, tổng tiền do client gửi đều bị bỏ qua.

---

## Bảo mật

- Mật khẩu băm bằng bcrypt (12 vòng), không bao giờ trả ra API.
- JWT có phiên bản — đổi mật khẩu sẽ vô hiệu hóa toàn bộ token cũ.
- OTP chỉ lưu dạng hash + salt, hết hạn 10 phút, dùng một lần, giới hạn số lần nhập sai.
- Rate limit riêng cho đăng nhập, đăng ký, yêu cầu OTP và xác minh OTP.
- Security headers qua helmet, bao gồm Content-Security-Policy.
- Trạng thái `paid` **chỉ** được đặt sau khi xác thực chữ ký HMAC-SHA512 của VNPay và
  đối chiếu số tiền — không có API nào cho phép client tự đánh dấu đã thanh toán.
- Callback và IPN của VNPay xử lý idempotent, gọi lại nhiều lần không trừ/hoàn kho hai lần.
- Khách chỉ truy cập được đơn hàng của chính mình (trả 404 thay vì 403 để không lộ mã đơn có thật).
- Thông tin ngân hàng nhận hoàn tiền chỉ nhân viên xử lý mới xem được, không ghi log.
- Lỗi máy chủ không lộ stack trace ở production.

Chạy `npm run test:api` để kiểm chứng — bộ test bao phủ 142 trường hợp gồm giả mạo giá,
giả mạo thanh toán, truy cập chéo đơn hàng, OTP hết hạn/tái sử dụng và tranh chấp tồn kho.

---

## Bật VNPay thật

Đăng ký tài khoản thử nghiệm tại https://sandbox.vnpayment.vn/devreg/ rồi điền vào `.env`:

```env
VNP_TMN_CODE=mã_website_của_bạn
VNP_HASH_SECRET=secret_key_của_bạn
PUBLIC_URL=https://tên-miền-của-bạn.vn
```

Khi chưa cấu hình, hệ thống dùng cổng giả lập nội bộ — vẫn ký và xác thực HMAC thật,
chỉ khác là không gọi ra server VNPay. Điền credential thật là chạy được ngay, không cần sửa code.

Nhớ khai báo **IPN URL** trong cổng quản trị VNPay: `https://tên-miền-của-bạn.vn/api/payment/vnpay/ipn`

## Bật gửi email thật

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=email_của_bạn
SMTP_PASS=mật_khẩu_ứng_dụng
```

Chưa cấu hình thì email được lưu vào hộp thư nội bộ, xem tại **Admin → Email**.
Lưu ý: ở production, **chưa có SMTP thì khách không nhận được mã OTP** nên không thể
đăng ký hoặc đặt lại mật khẩu.

---

## Chuẩn bị lên production

- [ ] Đặt `NODE_ENV=production` và `JWT_SECRET` ngẫu nhiên ≥ 32 ký tự (server sẽ từ chối khởi động nếu thiếu)
- [ ] Đặt `PUBLIC_URL` là tên miền thật, chạy qua HTTPS
- [ ] Cấu hình SMTP thật (bắt buộc — nếu không khách không nhận được OTP)
- [ ] Cấu hình VNPay thật và khai báo IPN URL
- [ ] Đổi mật khẩu hoặc xóa các tài khoản mẫu
- [ ] Thay ảnh sản phẩm mockup (SVG) bằng ảnh thật qua Admin → Sản phẩm
- [ ] Cân nhắc chuyển `server/db.js` sang PostgreSQL và sao lưu định kỳ
