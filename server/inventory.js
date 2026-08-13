/**
 * Quản lý tồn kho theo biến thể (màu + size).
 *
 * Vòng đời tồn kho của một đơn được đánh dấu bằng `order.stockState`:
 *   'reserved' — đã trừ kho (khi tạo đơn)
 *   'released' — đã hoàn kho (hủy / thanh toán thất bại / hết hạn)
 *
 * Mọi hàm ở đây đều IDEMPOTENT: gọi lại lần hai không làm thay đổi gì thêm.
 * Đây là điều kiện bắt buộc vì VNPay có thể gọi callback/IPN nhiều lần cho cùng
 * một giao dịch.
 */
const db = require('./db');
const { badRequest, conflict } = require('./security');

/**
 * Trừ kho cho toàn bộ dòng hàng của đơn.
 * Kiểm tra đủ hàng cho TẤT CẢ các dòng trước khi trừ dòng nào — tránh trạng thái
 * trừ được một nửa rồi lỗi giữa chừng.
 */
function reserve(order) {
  if (order.stockState === 'reserved') return { changed: false, reason: 'Đã trừ kho trước đó' };

  return db.transaction(() => {
    // Vòng 1: kiểm tra
    const targets = [];
    for (const line of order.items) {
      const product = db.products.byId(line.productId);
      if (!product) throw badRequest(`Sản phẩm ${line.title} không còn tồn tại`);
      const variant = db.products.variantById(product, line.variantId);
      if (!variant) throw badRequest(`Phiên bản ${line.color}/${line.size} của "${line.title}" không còn tồn tại`);
      if (variant.stock < line.qty) {
        throw conflict(
          variant.stock === 0
            ? `"${line.title}" (${line.color} / ${line.size}) vừa hết hàng`
            : `"${line.title}" (${line.color} / ${line.size}) chỉ còn ${variant.stock} sản phẩm`
        );
      }
      targets.push({ variant, qty: line.qty });
    }
    // Vòng 2: trừ
    for (const t of targets) t.variant.stock -= t.qty;
    order.stockState = 'reserved';
    return { changed: true };
  });
}

/**
 * Hoàn kho về lại cho đơn đã bị hủy / thất bại.
 * Chỉ chạy khi đơn đang ở trạng thái 'reserved'.
 */
function release(order, reason = '') {
  if (order.stockState !== 'reserved') return { changed: false, reason: 'Kho đã được hoàn trước đó hoặc chưa từng bị trừ' };

  return db.transaction(() => {
    for (const line of order.items) {
      const product = db.products.byId(line.productId);
      if (!product) continue; // sản phẩm đã bị xoá — không còn kho để hoàn
      const variant = db.products.variantById(product, line.variantId);
      if (!variant) continue;
      variant.stock += line.qty;
    }
    order.stockState = 'released';
    order.stockReleasedAt = new Date().toISOString();
    if (reason) order.stockReleaseReason = reason;
    return { changed: true };
  });
}

/**
 * Trừ kho cho một biến thể cụ thể — dùng khi Admin duyệt đổi hàng sang sản phẩm khác.
 */
function decrementVariant(productId, variantId, qty) {
  return db.transaction(() => {
    const product = db.products.byId(productId);
    if (!product) throw badRequest('Sản phẩm không tồn tại');
    const variant = db.products.variantById(product, variantId);
    if (!variant) throw badRequest('Phiên bản sản phẩm không tồn tại');
    if (variant.stock < qty) throw conflict(`Chỉ còn ${variant.stock} sản phẩm cho phiên bản này`);
    variant.stock -= qty;
    return { product, variant };
  });
}

/** Cộng kho cho một biến thể — dùng khi nhận lại hàng trả đủ điều kiện bán lại */
function incrementVariant(productId, variantId, qty) {
  return db.transaction(() => {
    const product = db.products.byId(productId);
    if (!product) throw badRequest('Sản phẩm không tồn tại');
    const variant = db.products.variantById(product, variantId);
    if (!variant) throw badRequest('Phiên bản sản phẩm không tồn tại');
    variant.stock += qty;
    return { product, variant };
  });
}

/** Tổng tồn kho của một sản phẩm (cộng mọi biến thể) */
const totalStock = (product) => (product.variants || []).reduce((s, v) => s + (v.active === false ? 0 : v.stock), 0);

/** Sản phẩm sắp hết hàng — dùng cho cảnh báo ở Admin */
const isLowStock = (product, threshold = 5) => totalStock(product) <= threshold;

module.exports = { reserve, release, decrementVariant, incrementVariant, totalStock, isLowStock };
