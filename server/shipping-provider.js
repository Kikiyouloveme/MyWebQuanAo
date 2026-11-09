const {badRequest}=require('./security');
const transitions={prepared:['in_transit'],in_transit:['delayed','delivery_failed'],delayed:['in_transit','delivery_failed'],delivery_failed:['in_transit','return_to_sender'],return_to_sender:['returned_to_sender'],returned_to_sender:[]};
function validateManual(order,change,reason){
  const now=Date.now(),handed=change.handedOverAt?Date.parse(change.handedOverAt):null,eta=change.estimatedDeliveryAt?Date.parse(change.estimatedDeliveryAt):null;
  if(handed!==null&&(!Number.isFinite(handed)||handed>now||handed<Date.parse(order.createdAt)))throw badRequest('Ngày bàn giao phải từ ngày đặt đơn đến hiện tại');
  if(eta!==null&&(!Number.isFinite(eta)||(handed!==null&&eta<handed)))throw badRequest('Ngày dự kiến không được trước ngày bàn giao');
  const prior=order.shipping?.milestone||'prepared',next=change.milestone;
  if(next!==prior && !(transitions[prior]||[]).includes(next))throw badRequest('Mốc vận chuyển không đúng thứ tự');
  const correction=order.shipping?.handedOverAt&&(order.shipping.carrier!==change.carrier||order.shipping.trackingNumber!==change.trackingNumber||order.shipping.handedOverAt!==change.handedOverAt);
  if(correction&&String(reason||'').trim().length<5)throw badRequest('Cần lý do sửa thông tin đã bàn giao (ít nhất 5 ký tự)');
  return {trackingMode:'manual',providerEventId:null};
}
// A real provider must verify its signature and map its event to these normalized states.
// No webhook route is exposed until a provider and signing credentials are configured.
function normalizeProviderEvent(provider){throw badRequest(`Chưa cấu hình nhà vận chuyển ${String(provider).slice(0,40)}; chỉ hỗ trợ cập nhật thủ công`);}
module.exports={validateManual,normalizeProviderEvent,transitions};
