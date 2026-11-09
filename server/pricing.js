/**
 * Tính tiền phía server — nguồn sự thật duy nhất.
 *
 * Client CHỈ được gửi lên: sản phẩm, biến thể, số lượng, mã voucher.
 * Mọi con số tiền (đơn giá, tạm tính, giảm giá, phí ship, tổng) đều tính lại ở đây.
 *
 * Thứ tự: subtotal → voucher → discountedSubtotal → phí ship → finalTotal
 */
const config = require('./config');
const db = require('./db');
const { badRequest } = require('./security');

/** Lý do voucher không dùng được — trả về cho client hiển thị */
const VOUCHER_ERRORS = {
  NOT_FOUND: 'Mã giảm giá không tồn tại',
  INACTIVE: 'Mã giảm giá đã ngừng hoạt động',
  NOT_STARTED: 'Mã giảm giá chưa đến thời gian sử dụng',
  EXPIRED: 'Mã giảm giá đã hết hạn',
  MIN_ORDER: 'Đơn hàng chưa đạt giá trị tối thiểu để dùng mã này',
  USAGE_LIMIT: 'Mã giảm giá đã hết lượt sử dụng',
  USER_LIMIT: 'Bạn đã dùng hết số lượt cho mã này',
};

/**
 * Kiểm tra voucher với một giá trị đơn hàng cụ thể.
 * @returns {{ok: true, voucher, discount} | {ok: false, reason, message}}
 */
function validateVoucher(code, subtotal, userId) {
  const voucher = db.vouchers.byCode(code);
  if (!voucher) return { ok: false, reason: 'NOT_FOUND', message: VOUCHER_ERRORS.NOT_FOUND };
  if (!voucher.active) return { ok: false, reason: 'INACTIVE', message: VOUCHER_ERRORS.INACTIVE };

  const now = Date.now();
  if (voucher.startsAt && now < new Date(voucher.startsAt).getTime())
    return { ok: false, reason: 'NOT_STARTED', message: VOUCHER_ERRORS.NOT_STARTED };
  if (voucher.expiresAt && now > new Date(voucher.expiresAt).getTime())
    return { ok: false, reason: 'EXPIRED', message: VOUCHER_ERRORS.EXPIRED };

  if (voucher.minOrderValue && subtotal < voucher.minOrderValue) {
    return {
      ok: false,
      reason: 'MIN_ORDER',
      message: `Đơn hàng cần tối thiểu ${voucher.minOrderValue.toLocaleString('vi-VN')}₫ để dùng mã này`,
      shortBy: voucher.minOrderValue - subtotal,
    };
  }

  if (voucher.usageLimit && (voucher.usedCount || 0) >= voucher.usageLimit)
    return { ok: false, reason: 'USAGE_LIMIT', message: VOUCHER_ERRORS.USAGE_LIMIT };

  if (userId && voucher.perUserLimit) {
    const used = (voucher.usedBy || []).filter((x) => x === userId).length;
    if (used >= voucher.perUserLimit)
      return { ok: false, reason: 'USER_LIMIT', message: VOUCHER_ERRORS.USER_LIMIT };
  }

  return { ok: true, voucher, discount: computeDiscount(voucher, subtotal) };
}

/** Voucher chỉ giảm theo %, có trần maxDiscount nếu cấu hình */
function computeDiscount(voucher, subtotal) {
  let discount = Math.floor((subtotal * voucher.percentage) / 100);
  if (voucher.maxDiscount && discount > voucher.maxDiscount) discount = voucher.maxDiscount;
  return Math.min(discount, subtotal); // không bao giờ giảm quá giá trị đơn
}

/**
 * Dựng dòng hàng từ giỏ của client — lấy giá và tên từ DATABASE, không lấy từ client.
 * Đồng thời kiểm tra tồn kho của đúng biến thể (màu + size).
 *
 * @param {Array<{productId, variantId?, color?, size?, qty}>} cartItems
 * @returns {{lines: Array, subtotal: number}}
 */
function buildLines(cartItems, user) {
  if (!Array.isArray(cartItems) || !cartItems.length) throw badRequest('Giỏ hàng trống');
  if (cartItems.length > 50) throw badRequest('Giỏ hàng có quá nhiều sản phẩm');

  const lines = [];
  let subtotal = 0;

  for (const item of cartItems) {
    const product = db.products.byId(item.productId || item.id);
    if (!product) throw badRequest('Sản phẩm không còn tồn tại trong hệ thống');
    if (product.active === false) throw badRequest(`"${product.title}" đã ngừng kinh doanh`);

    const variant = item.variantId
      ? db.products.variantById(product, item.variantId)
      : db.products.findVariant(product, item.color, item.size);
    if (!variant) throw badRequest(`"${product.title}" không có phiên bản ${item.color || ''} ${item.size || ''}`.trim());
    if (variant.active === false) throw badRequest(`"${product.title}" (${variant.color} / ${variant.size}) đã ngừng bán`);

    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20)
      throw badRequest('Số lượng phải là số nguyên từ 1 đến 20');
    if (variant.stock < qty)
      throw badRequest(
        variant.stock === 0
          ? `"${product.title}" (${variant.color} / ${variant.size}) đã hết hàng`
          : `"${product.title}" (${variant.color} / ${variant.size}) chỉ còn ${variant.stock} sản phẩm`
      );

    // Giá lấy từ DB — client không thể can thiệp
    if (item.itemType && !['regular','custom'].includes(item.itemType)) throw badRequest('Loại dòng hàng không hợp lệ');
    const custom = item.itemType === 'custom' || item.designRevisionId
      ? require('./custom-print').customLine(item,user,product,variant) : { itemType:'regular' };
    const unitPrice = custom.priceBreakdown?.unitTotal ?? product.price;
    subtotal += unitPrice * qty;

    lines.push({
      ...custom,
      basePrice:product.price,printFee:unitPrice-product.price,unitPrice,quantity:qty,lineTotal:unitPrice*qty,
      lineId: db.uid('line'),
      productId: product.id,
      variantId: variant.id,
      sku: variant.sku,
      title: product.title,
      color: variant.color,
      size: variant.size,
      price: unitPrice,
      compareAtPrice: product.compareAtPrice || null,
      qty,
      img: custom.designRevisionId ? (require('./custom-print').revision(custom.designRevisionId).previewUrl || product.img) : product.img,
    });
  }

  return { lines, subtotal };
}

/**
 * Tính toàn bộ số tiền của đơn.
 * @returns {{subtotal, discount, discountedSubtotal, shippingFee, total, voucher, freeShippingShortBy}}
 */
function computeTotals(subtotal, voucherCode, userId) {
  let discount = 0;
  let voucherSnapshot = null;
  let voucherError = null;

  if (voucherCode) {
    const result = validateVoucher(voucherCode, subtotal, userId);
    if (result.ok) {
      discount = result.discount;
      // Lưu ảnh chụp voucher vào đơn — voucher sau này bị sửa cũng không ảnh hưởng đơn cũ
      voucherSnapshot = {
        id: result.voucher.id,
        code: result.voucher.code,
        percentage: result.voucher.percentage,
        maxDiscount: result.voucher.maxDiscount || null,
        discountAmount: discount,
        appliedAt: new Date().toISOString(),
      };
    } else {
      voucherError = result;
    }
  }

  const discountedSubtotal = subtotal - discount;
  const freeShip = discountedSubtotal >= config.shipping.freeThreshold;
  const shippingFee = discountedSubtotal <= 0 ? 0 : freeShip ? 0 : config.shipping.flatFee;
  const total = discountedSubtotal + shippingFee;

  return {
    subtotal,
    discount,
    discountedSubtotal,
    shippingFee,
    total,
    voucher: voucherSnapshot,
    voucherError,
    freeShipping: freeShip,
    // Còn thiếu bao nhiêu nữa thì được miễn phí ship (0 nếu đã đạt)
    freeShippingShortBy: freeShip ? 0 : Math.max(0, config.shipping.freeThreshold - discountedSubtotal),
  };
}

/**
 * Số tiền khách THỰC SỰ đã trả cho một tập dòng hàng, sau khi phân bổ lại giảm giá.
 *
 * Voucher giảm trên tổng đơn, nên nếu hoàn theo giá gốc của sản phẩm thì sẽ hoàn
 * nhiều hơn số khách đã trả. Ví dụ đơn 1.000.000₫ giảm 10% còn 900.000₫; trả một
 * món giá gốc 500.000₫ thì chỉ được hoàn 450.000₫.
 *
 * Phí vận chuyển không nằm trong số này — ai chịu phí ship đổi/trả là quy tắc riêng.
 *
 * @param {object} order đơn hàng gốc (dùng subtotal & discount đã chốt lúc đặt)
 * @param {Array<{price: number, qty: number}>} items dòng hàng muốn hoàn
 */
function refundableAmount(order, items) {
  const subtotal = Number(order.subtotal) || 0;
  if (subtotal <= 0) return 0;

  const discounted = subtotal - (Number(order.discount) || 0);
  const gross = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  // Hoàn toàn bộ hàng hoá → trả đúng số đã thu, tránh lệch do làm tròn từng dòng
  if (gross >= subtotal) return Math.max(0, discounted);

  // Làm tròn xuống để không bao giờ hoàn vượt số đã thu
  return Math.max(0, Math.floor((gross * discounted) / subtotal));
}

/** Số tiền còn có thể hoàn của đơn (đã trừ những lần hoàn trước) */
function remainingRefundable(order) {
  const paid = order.payStatus === 'paid' ? Number(order.total) || 0 : 0;
  const alreadyRefunded = Number(order.refundedTotal) || 0;
  return Math.max(0, paid - alreadyRefunded);
}

module.exports = {
  buildLines, computeTotals, validateVoucher, computeDiscount,
  refundableAmount, remainingRefundable, VOUCHER_ERRORS,
};
