const router = require('express').Router();
const db = require('../db');
const { wrap, requireRole, requireAdmin, limiters, v, notFound, conflict, forbidden } = require('../security');
const all = () => db.load().reviews;
const lineId = (order, item, index) => item.lineId || `${order.id}:line:${index}`;
const publicReview = ({ id, productId, rating, title, comment, createdAt, updatedAt, photoAssetIds=[] }) =>
  ({ id, productId, rating, title, comment, createdAt, updatedAt, photoAssetIds, verifiedPurchase: true });
function photos(body,userId,orderId){
  const ids=body.photoAssetIds||[];
  if(!Array.isArray(ids)||ids.length>4)throw conflict('Tối đa 4 ảnh đánh giá');
  for(const id of ids)if(!db.load().designAssets.some(a=>a.id===id&&a.ownerId===userId&&a.orderId===orderId&&a.purpose==='review'))throw notFound('Không tìm thấy ảnh đánh giá');
  return [...new Set(ids)];
}
function fields(body) {
  return { rating: v.int(body.rating, 'số sao', { min: 1, max: 5 }),
    title: v.str(body.title, 'tiêu đề', { required: false, max: 100 }),
    comment: v.str(body.comment, 'nội dung đánh giá', { min: 3, max: 2000 }) };
}
router.get('/products/:id/reviews', wrap(async (req, res) => {
  if (!db.products.byId(req.params.id)) throw notFound();
  const reviews = all().filter((r) => r.productId === req.params.id && r.moderationStatus === 'published');
  const distribution = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: reviews.filter((r) => r.rating === rating).length }));
  const sorted = [...reviews].sort(req.query.sort === 'rating' ? (a, b) => b.rating - a.rating : (a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ reviews: sorted.map(publicReview), count: reviews.length,
    average: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0, distribution });
}));
router.get('/products/:id/review-purchases', requireRole('customer'), wrap(async (req, res) => {
  const purchases = db.orders.byUser(req.user.id).filter((o) => o.status === 'delivered').flatMap((o) =>
    o.items.flatMap((item, index) => item.productId !== req.params.id ? [] : [{ orderId: o.id,
      lineId: lineId(o, item, index), color: item.color, size: item.size,
      review: all().find((r) => r.orderId === o.id && r.orderLineId === lineId(o, item, index)) || null }]));
  res.json(purchases);
}));
router.post('/orders/:id/items/:lineId/review', requireRole('customer'), limiters.write, wrap(async (req, res) => {
  const order = db.orders.byId(req.params.id);
  if (!order || order.userId !== req.user.id) throw notFound();
  if (order.status !== 'delivered') throw forbidden('Chỉ được đánh giá sau khi nhận hàng');
  const item = order.items.find((line, index) => lineId(order, line, index) === req.params.lineId);
  if (!item) throw notFound();
  if (all().some((r) => r.orderId === order.id && r.orderLineId === req.params.lineId)) throw conflict('Bạn đã đánh giá sản phẩm trong lần mua này');
  const review = { id: db.uid('review'), ...fields(req.body), userId: req.user.id, orderId: order.id,
    photoAssetIds: photos(req.body,req.user.id,order.id),
    orderLineId: req.params.lineId, productId: item.productId, variantId: item.variantId,
    moderationStatus: 'published', verifiedPurchase: true, createdAt: new Date().toISOString(), history: [] };
  all().push(review);
  res.status(201).json(publicReview(review));
}));
router.put('/reviews/:id', requireRole('customer'), limiters.write, wrap(async (req, res) => {
  const review = all().find((r) => r.id === req.params.id && r.userId === req.user.id);
  if (!review) throw notFound();
  Object.assign(review, fields(req.body), { photoAssetIds: req.body.photoAssetIds === undefined ? review.photoAssetIds || [] : photos(req.body,req.user.id,review.orderId), updatedAt: new Date().toISOString() });
  res.json(publicReview(review));
}));
router.put('/admin/reviews/:id/moderation', requireAdmin, limiters.write, wrap(async (req, res) => {
  const review = all().find((r) => r.id === req.params.id);
  if (!review) throw notFound();
  const status = v.oneOf(req.body.status, ['published', 'hidden'], 'trạng thái');
  const reason = v.str(req.body.reason, 'lý do kiểm duyệt', { min: 3, max: 500 });
  review.history.push({ status, reason, actorId: req.user.id, at: new Date().toISOString() });
  review.moderationStatus = status;
  res.json({ ok: true });
}));
router.get('/admin/reviews',requireAdmin,wrap(async(req,res)=>res.json(all())));
module.exports = { router };
