/**
 * VietQR (NAPAS 247) — sinh mã QR chuyển khoản theo chuẩn EMVCo.
 *
 * Dùng cho thanh toán tại quầy (POS): nhân viên mở bảng POS, hệ thống tạo QR đúng
 * số tiền và nội dung chuyển khoản của đơn, khách quét bằng app ngân hàng.
 *
 * Chuỗi QR gồm các trường TLV (ID 2 chữ số + độ dài 2 chữ số + giá trị):
 *   00  Payload Format Indicator = 01
 *   01  Point of Initiation Method: 12 = dùng một lần (có số tiền), 11 = tái sử dụng
 *   38  Merchant Account Information (NAPAS)
 *        00 GUID "A000000727"
 *        01    00 BIN ngân hàng (6 số), 01 số tài khoản; 02 định danh người nhận
 *        02 Service Code "QRIBFTTA" (chuyển khoản nhanh tới tài khoản)
 *   53  Currency = 704 (VND)
 *   54  Amount (không có phần thập phân)
 *   58  Country = VN
 *   62  Additional Data → 08 Purpose/Content (nội dung chuyển khoản)
 *   63  CRC-16/CCITT-FALSE trên toàn payload tính cả "6304"
 *
 * Tài khoản nhận lấy từ biến môi trường — KHÔNG hardcode tài khoản cá nhân.
 */
const QRCode = require('qrcode');
const config = require('./config');

const NAPAS_GUID = 'A000000727';
const SERVICE_TRANSFER = 'QRIBFTTA';
const SERVICE_WALLET = 'QRIBFTTWWH';

/** CRC-16/CCITT-FALSE — bắt buộc theo đặc tả EMVCo QR */
function crc16(input) {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, 'utf-8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Một trường TLV. Độ dài luôn 2 chữ số nên giá trị tối đa 99 ký tự. */
function field(id, value) {
  const text = String(value);
  if (text.length > 99) throw new Error(`Trường ${id} vượt 99 ký tự`);
  return id + String(text.length).padStart(2, '0') + text;
}

const merchant = () => ({
  bankBin: (process.env.VIETQR_BANK_BIN || '').trim(),
  accountNo: (process.env.VIETQR_ACCOUNT_NO || '').trim(),
  accountName: (process.env.VIETQR_ACCOUNT_NAME || '').trim(),
  /** individual | corporate — chỉ ảnh hưởng nhãn hiển thị, QR giống nhau */
  accountType: (process.env.VIETQR_ACCOUNT_TYPE || 'individual').trim() === 'corporate' ? 'corporate' : 'individual',
});

const isConfigured = () => {
  const m = merchant();
  return /^\d{6}$/.test(m.bankBin) && /^[A-Za-z0-9]{6,19}$/.test(m.accountNo);
};

/**
 * Nội dung chuyển khoản sinh từ mã đơn.
 * Giữ A-Z0-9 và tối đa 25 ký tự: nhiều app ngân hàng cắt nội dung dài, và việc
 * đối soát dựa vào việc tìm đúng mã đơn trong nội dung.
 */
function contentFor(orderId) {
  return String(orderId).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 25);
}

/**
 * Dựng chuỗi QR chuyển khoản.
 * @param {{amount:number, orderId:string, content?:string}} input
 */
function payload({ amount, orderId, content }) {
  const m = merchant();
  if (!isConfigured()) throw Object.assign(new Error('Chưa cấu hình tài khoản nhận tiền VietQR'), { status: 503 });
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw Object.assign(new Error('Số tiền QR không hợp lệ'), { status: 400 });
  // Trần an toàn cho chuyển khoản nhanh NAPAS
  if (value > 500_000_000) throw Object.assign(new Error('Số tiền vượt hạn mức QR'), { status: 400 });

  const merchantAccount =
    field('00', NAPAS_GUID) +
    field('01', field('00', m.bankBin) + field('01', m.accountNo)) +
    field('02', SERVICE_TRANSFER);

  const memo = String(content || contentFor(orderId)).slice(0, 25);

  const body =
    field('00', '01') +
    field('01', '12') +
    field('38', merchantAccount) +
    field('53', '704') +
    field('54', String(value)) +
    field('58', 'VN') +
    field('62', field('08', memo)) +
    '6304';

  return body + crc16(body);
}

/** Data URL PNG để hiển thị trực tiếp, và chuỗi thô cho app tự sinh mã */
async function render({ amount, orderId, content, width = 320 }) {
  const data = payload({ amount, orderId, content });
  return {
    payload: data,
    content: contentFor(orderId),
    amount: Math.round(Number(amount)),
    bank: { bin: merchant().bankBin, accountNo: merchant().accountNo, accountName: merchant().accountName, accountType: merchant().accountType },
    image: await QRCode.toDataURL(data, { errorCorrectionLevel: 'M', margin: 1, width, color: { dark: '#111827', light: '#ffffff' } }),
  };
}

/** Nhận dạng cấu hình cho giao diện quyết định có hiện phương thức này không */
function publicConfig() {
  const m = merchant();
  return {
    enabled: isConfigured() && config.features.vietqrEnabled,
    configured: isConfigured(),
    bankBin: m.bankBin || null,
    accountNo: m.accountNo || null,
    accountName: m.accountName || null,
    accountType: m.accountType,
    // Cửa hàng chưa khai báo BIN nên chưa biết tên ngân hàng; giao diện hiện BIN thay thế
    bankName: BANK_NAMES[m.bankBin] || null,
  };
}

/** Bảng BIN các ngân hàng phổ biến — chỉ để hiển thị, không dùng để quyết định logic */
const BANK_NAMES = {
  '970422': 'MB Bank',
  '970436': 'Vietcombank',
  '970415': 'VietinBank',
  '970418': 'BIDV',
  '970405': 'Agribank',
  '970407': 'Techcombank',
  '970416': 'ACB',
  '970432': 'VPBank',
  '970423': 'TPBank',
  '970443': 'SHB',
  '970426': 'MSB',
  '970441': 'VIB',
  '970437': 'HDBank',
  '970429': 'SCB',
  '970448': 'OCB',
  '970454': 'VietCapitalBank',
  '970452': 'KienLongBank',
  '970400': 'SAIGONBANK',
  '970403': 'Sacombank',
  '970428': 'Nam A Bank',
  '970414': 'Oceanbank',
  '970419': 'NCB',
  '970431': 'Eximbank',
  '970440': 'SeABank',
  '970449': 'LPBank',
  '970458': 'UOB',
  '971011': 'PVcomBank',
  '971005': 'ViettelMoney',
  '971016': 'MonPay',
};

module.exports = { payload, render, publicConfig, isConfigured, contentFor, crc16, field, merchant, BANK_NAMES };
