/**
 * Email cho VELATHIER.
 *
 * Cấu hình SMTP qua biến môi trường: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * Chưa cấu hình → chế độ "outbox": email được render đầy đủ và lưu vào database
 * (xem tại Admin → Email) thay vì gửi ra ngoài, để luồng nghiệp vụ vẫn chạy trọn vẹn.
 */
const nodemailer = require('nodemailer');
const config = require('./config');
const db = require('./db');

const FROM = process.env.SMTP_FROM || 'VELATHIER <no-reply@velathier.vn>';
const SHOP = 'VELATHIER';
const PUBLIC_URL = config.publicUrl;

let transporter = null;
function getTransport() {
  if (transporter !== null) return transporter;
  if (config.features.smtpConfigured) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 60000,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    transporter = false;
  }
  return transporter;
}

const isLive = () => Boolean(getTransport());
const money = (n) => (n || 0).toLocaleString('vi-VN') + '₫';
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- khung email ---------------- */
function shell(title, bodyHtml) {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f1ea;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1816">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#fbf9f4;border:1px solid #d9d3c6;border-radius:6px;overflow:hidden" cellpadding="0" cellspacing="0">
      <tr><td style="padding:22px 26px;border-bottom:1px solid #d9d3c6">
        <span style="font-size:22px;font-weight:700;letter-spacing:-.02em">VELATHIER<span style="color:#c14d21">.</span></span>
      </td></tr>
      <tr><td style="padding:26px">${bodyHtml}</td></tr>
      <tr><td style="padding:18px 26px;border-top:1px solid #d9d3c6;font-size:12px;color:#6d675d;line-height:1.7">
        ${SHOP} — Thời trang cơ bản làm kỹ.<br>
        <a href="${PUBLIC_URL}" style="color:#c14d21;text-decoration:none">${PUBLIC_URL.replace(/^https?:\/\//, '')}</a>
        &nbsp;·&nbsp; Email này được gửi tự động, vui lòng không trả lời.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Khối hiển thị mã OTP cỡ lớn, dễ đọc trên mobile */
const otpBlock = (code) => `
  <div style="margin:22px 0;padding:20px;background:#f4f1ea;border:1px dashed #c14d21;border-radius:6px;text-align:center">
    <div style="font-size:34px;font-weight:700;letter-spacing:.34em;color:#1a1816;font-family:'Courier New',monospace">
      ${esc(code)}
    </div>
    <div style="margin-top:8px;font-size:12px;color:#6d675d">Mã có hiệu lực trong ${config.otp.ttlMinutes} phút</div>
  </div>`;

function itemsTable(order) {
  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #e6e1d6">${esc(i.title)}<br>
          <span style="color:#6d675d;font-size:12px">${esc(i.color)} / ${esc(i.size)} × ${i.qty}</span></td>
        <td style="padding:8px 0;border-bottom:1px solid #e6e1d6;text-align:right;white-space:nowrap">${money(i.price * i.qty)}</td>
      </tr>`
    )
    .join('');

  const discountRow = order.discount > 0
    ? `<tr><td style="padding:4px 0;color:#2e7d43">Giảm giá${order.voucher ? ` (${esc(order.voucher.code)})` : ''}</td>
           <td style="padding:4px 0;text-align:right;color:#2e7d43">−${money(order.discount)}</td></tr>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:18px 0">
    ${rows}
    <tr><td style="padding:10px 0 4px">Tạm tính</td><td style="padding:10px 0 4px;text-align:right">${money(order.subtotal)}</td></tr>
    ${discountRow}
    <tr><td style="padding:4px 0 8px">Phí vận chuyển</td>
        <td style="padding:4px 0 8px;text-align:right">${order.shippingFee ? money(order.shippingFee) : 'Miễn phí'}</td></tr>
    <tr><td style="padding:10px 0 0;border-top:1px solid #1a1816;font-weight:700">Tổng cộng</td>
        <td style="padding:10px 0 0;border-top:1px solid #1a1816;text-align:right;font-weight:700;font-size:17px">${money(order.total)}</td></tr>
  </table>`;
}

const btn = (href, label) =>
  `<a href="${href}" style="display:inline-block;background:#1a1816;color:#f4f1ea;text-decoration:none;padding:12px 26px;border-radius:4px;font-weight:700;font-size:13px;letter-spacing:.1em;text-transform:uppercase">${esc(label)}</a>`;

const addressBlock = (a) => !a ? '' : `
  <p style="margin:0 0 18px;font-size:14px;color:#4a453e;line-height:1.7">
    <b>Người nhận:</b> ${esc(a.fullName)} — ${esc(a.phone)}<br>
    <b>Địa chỉ:</b> ${esc([a.line1, a.ward, a.district, a.province].filter(Boolean).join(', '))}
  </p>`;

const STATUS_TEXT = {
  pending: 'Đơn hàng đang chờ xác nhận',
  confirmed: 'Đơn hàng đã được xác nhận',
  processing: 'Đơn hàng đang được chuẩn bị',
  ready_to_ship: 'Đơn hàng đã sẵn sàng giao',
  shipped: 'Đơn hàng đang trên đường giao đến bạn',
  delivered: 'Đơn hàng đã giao thành công',
  cancelled: 'Đơn hàng đã bị hủy',
  return_requested: 'Yêu cầu đổi/trả đã được ghi nhận',
  return_approved: 'Yêu cầu đổi/trả đã được duyệt',
  returned: 'Đã nhận lại hàng hoàn',
  refunded: 'Đơn hàng đã được hoàn tiền',
};

/* ---------------- template ---------------- */
const TEMPLATES = {
  welcome: (user) => ({
    subject: `Chào mừng bạn đến với VELATHIER`,
    html: shell('Chào mừng', `
      <h1 style="margin:0 0 12px;font-size:22px">Chào mừng ${esc(user.name)}!</h1>
      <p style="margin:0 0 16px;line-height:1.7;color:#4a453e">
        Tài khoản <b>${esc(user.email)}</b> đã được tạo. Hãy xác minh email để bắt đầu mua sắm.
      </p>
      ${btn(PUBLIC_URL + '/shop', 'Khám phá bộ sưu tập')}`),
  }),

  guestCheckout: (contact, code) => ({
    subject: 'Mã xác minh đặt hàng — VELATHIER',
    html: shell('Xác minh email đặt hàng', `
      <h1 style="font-size:22px">Xác minh email đặt hàng</h1>
      <p>Xin chào ${esc(contact.fullName)}, nhập mã dưới đây để đặt hàng không cần tài khoản.</p>
      ${otpBlock(code)}
      <p>Nếu bạn không yêu cầu đặt hàng, hãy bỏ qua email này. Không chia sẻ mã với người khác.</p>`),
  }),

  verifyEmail: (user, code) => ({
    subject: `Mã xác minh email — VELATHIER`,
    html: shell('Xác minh email', `
      <h1 style="margin:0 0 12px;font-size:22px">Xác minh địa chỉ email</h1>
      <p style="margin:0 0 4px;line-height:1.7;color:#4a453e">
        Xin chào ${esc(user.name)}, nhập mã dưới đây để hoàn tất xác minh email và bắt đầu đặt hàng.
      </p>
      ${otpBlock(code)}
      <p style="margin:0;font-size:13px;color:#6d675d;line-height:1.7">
        Nếu bạn không tạo tài khoản tại VELATHIER, hãy bỏ qua email này.
      </p>`),
  }),

  resetPassword: (user, code) => ({
    subject: `Mã đặt lại mật khẩu — VELATHIER`,
    html: shell('Đặt lại mật khẩu', `
      <h1 style="margin:0 0 12px;font-size:22px">Đặt lại mật khẩu</h1>
      <p style="margin:0 0 4px;line-height:1.7;color:#4a453e">
        Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <b>${esc(user.email)}</b>.
        Nhập mã dưới đây để tiếp tục.
      </p>
      ${otpBlock(code)}
      <p style="margin:0;font-size:13px;color:#6d675d;line-height:1.7">
        Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại của bạn
        vẫn an toàn và không có gì thay đổi.
      </p>`),
  }),

  passwordChanged: (user) => ({
    subject: `Mật khẩu của bạn đã được thay đổi`,
    html: shell('Mật khẩu đã đổi', `
      <h1 style="margin:0 0 12px;font-size:22px">Mật khẩu đã được thay đổi</h1>
      <p style="margin:0 0 16px;line-height:1.7;color:#4a453e">
        Mật khẩu của tài khoản <b>${esc(user.email)}</b> vừa được cập nhật thành công vào lúc
        ${new Date().toLocaleString('vi-VN')}. Mọi phiên đăng nhập cũ đã bị đăng xuất.
      </p>
      <p style="margin:0 0 16px;line-height:1.7;color:#c0392b">
        Nếu không phải bạn thực hiện, hãy liên hệ ngay với chúng tôi.
      </p>
      ${btn(PUBLIC_URL + '/login', 'Đăng nhập')}`),
  }),

  orderPlaced: (order) => ({
    subject: `Xác nhận đơn hàng ${order.id} — VELATHIER`,
    html: shell('Xác nhận đơn hàng', `
      <h1 style="margin:0 0 12px;font-size:22px">Cảm ơn bạn đã đặt hàng!</h1>
      <p style="margin:0 0 4px;line-height:1.7;color:#4a453e">
        Đơn hàng <b>${esc(order.id)}</b> đã được ghi nhận.
        Phương thức thanh toán: <b>${order.payMethod === 'cod' ? 'Thanh toán khi nhận hàng (COD)' : 'VNPay'}</b>.
      </p>
      ${itemsTable(order)}
      ${addressBlock(order.shippingAddress)}
      ${order.userId ? btn(PUBLIC_URL + '/orders/' + order.id, 'Theo dõi đơn hàng') : `<p>Vui lòng giữ mã đơn <b>${esc(order.id)}</b> và liên hệ cửa hàng khi cần hỗ trợ.</p>${btn(PUBLIC_URL + '/contact', 'Liên hệ cửa hàng')}`}`),
  }),

  paymentSuccess: (order) => ({
    subject: `Thanh toán thành công đơn ${order.id} — VELATHIER`,
    html: shell('Thanh toán thành công', `
      <h1 style="margin:0 0 12px;font-size:22px;color:#2e7d43">Thanh toán thành công</h1>
      <p style="margin:0 0 4px;line-height:1.7;color:#4a453e">
        Chúng tôi đã nhận được <b>${money(order.total)}</b> cho đơn hàng <b>${esc(order.id)}</b>.
        ${order.payment?.transactionNo ? `Mã giao dịch: <b>${esc(order.payment.transactionNo)}</b>.` : ''}
        Đơn hàng đang được chuẩn bị.
      </p>
      ${itemsTable(order)}
      ${btn(PUBLIC_URL + '/orders/' + order.id, 'Xem đơn hàng')}`),
  }),

  paymentFailed: (order, reason) => ({
    subject: `Thanh toán chưa thành công — đơn ${order.id}`,
    html: shell('Thanh toán thất bại', `
      <h1 style="margin:0 0 12px;font-size:22px;color:#c0392b">Thanh toán chưa thành công</h1>
      <p style="margin:0 0 16px;line-height:1.7;color:#4a453e">
        Giao dịch cho đơn <b>${esc(order.id)}</b> không hoàn tất.
        ${reason ? `Lý do: <b>${esc(reason)}</b>.` : ''}
        Đơn hàng vẫn được giữ, bạn có thể thanh toán lại bất cứ lúc nào.
      </p>
      ${btn(PUBLIC_URL + '/payment/' + order.id, 'Thanh toán lại')}`),
  }),

  customEvent: (event) => ({
    subject: `VELATHIER — cập nhật đơn ${event.orderId}`,
    html: shell('Cập nhật in theo yêu cầu', `<h1>Đơn ${esc(event.orderId)}</h1><p>${esc(event.message)}</p>${btn(PUBLIC_URL + '/orders/' + encodeURIComponent(event.orderId), 'Xem mẫu in và đơn hàng')}`),
  }),
  orderStatus: (order) => ({
    subject: `Cập nhật đơn ${order.id}: ${STATUS_TEXT[order.status] || order.status}`,
    html: shell('Cập nhật đơn hàng', `
      <h1 style="margin:0 0 12px;font-size:22px">${esc(STATUS_TEXT[order.status] || order.status)}</h1>
      <p style="margin:0 0 16px;line-height:1.7;color:#4a453e">
        Đơn hàng <b>${esc(order.id)}</b> vừa được cập nhật trạng thái.
        ${order.shipping?.trackingNumber
          ? `<br>Đơn vị vận chuyển: <b>${esc(order.shipping.carrier)}</b> — Mã vận đơn: <b>${esc(order.shipping.trackingNumber)}</b>`
          : ''}
      </p>
      ${itemsTable(order)}
      ${btn(PUBLIC_URL + '/orders/' + order.id, 'Xem chi tiết')}`),
  }),

  orderCancelled: (order) => ({
    subject: `Đơn hàng ${order.id} đã được hủy`,
    html: shell('Đơn hàng đã hủy', `
      <h1 style="margin:0 0 12px;font-size:22px">Đơn hàng đã được hủy</h1>
      <p style="margin:0 0 16px;line-height:1.7;color:#4a453e">
        Đơn hàng <b>${esc(order.id)}</b> đã được hủy.
        ${order.cancel?.reason ? `<br>Lý do: <b>${esc(order.cancel.reason)}</b>` : ''}
        ${order.payStatus === 'paid' ? '<br>Chúng tôi sẽ liên hệ để hoàn tiền cho bạn trong thời gian sớm nhất.' : ''}
      </p>
      ${btn(PUBLIC_URL + '/shop', 'Tiếp tục mua sắm')}`),
  }),

  returnRequested: (ret, order) => ({
    subject: `Đã nhận yêu cầu ${ret.type === 'exchange' ? 'đổi' : 'trả'} hàng ${ret.id}`,
    html: shell('Yêu cầu đổi/trả', `
      <h1 style="margin:0 0 12px;font-size:22px">Đã nhận yêu cầu của bạn</h1>
      <p style="margin:0 0 16px;line-height:1.7;color:#4a453e">
        Yêu cầu <b>${esc(ret.type === 'exchange' ? 'đổi hàng' : 'trả hàng')}</b> mã <b>${esc(ret.id)}</b>
        cho đơn <b>${esc(order.id)}</b> đã được ghi nhận.
        Chúng tôi sẽ xem xét và phản hồi trong vòng 1–2 ngày làm việc.
      </p>
      ${btn(PUBLIC_URL + '/orders/' + order.id, 'Xem yêu cầu')}`),
  }),

  returnReviewed: (ret, order) => ({
    subject: `Yêu cầu ${ret.id} đã được ${ret.status === 'approved' ? 'duyệt' : 'từ chối'}`,
    html: shell('Kết quả xử lý đổi/trả', `
      <h1 style="margin:0 0 12px;font-size:22px;color:${ret.status === 'approved' ? '#2e7d43' : '#c0392b'}">
        Yêu cầu đã được ${ret.status === 'approved' ? 'duyệt' : 'từ chối'}
      </h1>
      <p style="margin:0 0 16px;line-height:1.7;color:#4a453e">
        Yêu cầu <b>${esc(ret.id)}</b> cho đơn <b>${esc(order.id)}</b>.
        ${ret.adminNote ? `<br>Ghi chú từ cửa hàng: <b>${esc(ret.adminNote)}</b>` : ''}
        ${ret.status === 'approved' && ret.shippingResponsibility
          ? `<br>Phí vận chuyển đổi/trả do <b>${ret.shippingResponsibility === 'shop' ? 'cửa hàng' : 'khách hàng'}</b> chịu.`
          : ''}
      </p>
      ${btn(PUBLIC_URL + '/orders/' + order.id, 'Xem chi tiết')}`),
  }),

  refunded: (order) => ({
    subject: `Đã hoàn tiền đơn ${order.id}`,
    html: shell('Hoàn tiền', `
      <h1 style="margin:0 0 12px;font-size:22px;color:#2e7d43">Đã hoàn tiền</h1>
      <p style="margin:0 0 16px;line-height:1.7;color:#4a453e">
        Số tiền <b>${money(order.refund?.amount || order.total)}</b> của đơn <b>${esc(order.id)}</b>
        đã được hoàn ${order.refund?.method === 'vnpay' ? 'về nguồn thanh toán VNPay' : 'qua chuyển khoản ngân hàng'}.
        ${order.refund?.reference ? `<br>Mã tham chiếu: <b>${esc(order.refund.reference)}</b>` : ''}
        <br>Tùy ngân hàng, tiền có thể về tài khoản sau 1–5 ngày làm việc.
      </p>
      ${btn(PUBLIC_URL + '/orders/' + order.id, 'Xem đơn hàng')}`),
  }),
};

/**
 * Email chứa mã bí mật — nội dung KHÔNG được lưu vào database ở production,
 * vì nhân viên/quản trị viên đọc được hộp thư sẽ chiếm được tài khoản khách hàng.
 * Ở môi trường phát triển vẫn lưu để bộ kiểm thử đọc được mã.
 */
const SENSITIVE_TEMPLATES = new Set(['verifyEmail', 'resetPassword', 'guestCheckout']);

/**
 * Gửi email. Không bao giờ throw — lỗi gửi mail không được làm hỏng luồng nghiệp vụ.
 * @returns {Promise<{ok: boolean, mode: 'smtp'|'outbox', error?: string}>}
 */
async function send(to, template, ...args) {
  if(isLive()&&!db.status().transactions)throw new Error('SMTP thật cần MongoDB replica set để bảo đảm outbox được commit cùng nghiệp vụ');
  const tpl = TEMPLATES[template];
  if (!tpl || !to) return { ok: false, mode: 'outbox', error: 'Thiếu template hoặc người nhận' };

  let subject, html;
  try {
    ({ subject, html } = tpl(...args));
  } catch (e) {
    console.error('[mail] Lỗi dựng nội dung:', e.message);
    return { ok: false, mode: 'outbox', error: e.message };
  }

  const sensitive = SENSITIVE_TEMPLATES.has(template);
  const record = {
    id: db.uid('mail'),
    to,
    subject,
    // Không bao giờ lưu nội dung chứa OTP ở production
    html: sensitive && !config.features.storeSensitiveEmailBody ? null : html,
    sensitive,
    template,
    mode: isLive() ? 'smtp' : 'outbox',
    status: isLive() ? 'pending' : 'sent',
    createdAt: new Date().toISOString(),
  };

  const eventKey = template === 'customEvent' ? `event:${args[0].eventKey}` : record.id;
  if (isLive()) {
    const outbox=db.load().mailOutbox;
    if(outbox.some(m=>m.eventKey===eventKey))return {ok:true,mode:'smtp',queued:true};
    outbox.push({id:db.uid('outbox'),eventKey,emailId:record.id,status:'pending',attempts:0,nextAttemptAt:Date.now(),payload:require('./outbox-worker').seal({from:FROM,to,subject,html}),createdAt:record.createdAt});
  }
  db.emails.insert(record);
  return { ok: true, mode: record.mode, queued: isLive() };
}

module.exports = { send: (...args) => db.track(send(...args)), deliver: payload => getTransport().sendMail(payload), isLive, TEMPLATES, STATUS_TEXT, SENSITIVE_TEMPLATES };
