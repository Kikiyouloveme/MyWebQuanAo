const { badRequest } = require('./security');
const fulfillmentStatuses = new Set(['confirmed', 'processing', 'ready_to_ship', 'shipped', 'delivered']);
function guardFulfillment(order, target) {
  if (!fulfillmentStatuses.has(target)) return;
  if(target==='delivered'&&['return_to_sender','returned_to_sender'].includes(order.shipping?.milestone))throw badRequest('Đơn đang hoàn về người gửi không được đánh dấu giao thành công');
  if (order.payMethod === 'vnpay' && order.payStatus !== 'paid') {
    throw badRequest('Đơn VNPay chưa thanh toán thành công; chưa được xác nhận, xử lý hoặc giao hàng.');
  }
  if (order.payMethod === 'cod' && target !== 'confirmed' && order.status === 'pending') {
    throw badRequest('Cần xác nhận đơn COD trước khi chuẩn bị hàng.');
  }
}
function permitsFulfillment(order, target) {
  try { guardFulfillment(order, target); return true; } catch { return false; }
}
module.exports = { guardFulfillment, permitsFulfillment };
