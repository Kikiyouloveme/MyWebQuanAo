require('./config');
const assert = require('node:assert/strict');
const db = require('./db');
const { sign } = require('./security');
async function main() {
  if (!process.env.TEST_BASE_URL || !/\/velathier_test_\d+_\d+$/.test(process.env.MONGO_URI || '')) throw Error('Run through test:integration');
  await db.connect();
  const buyer = await db.models.users.findOne({ id: 'u_demo' }).lean();
  const admin = await db.models.users.findOne({ id: 'u_admin' }).lean();
  const p = await db.models.products.findOne().lean();
  const order = { id: 'review-test-order', userId: buyer.id, total: p.price, status: 'pending', items: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, price: p.price }] };
  await db.models.orders.create(order);
  const token = sign(buyer);
  const call = async (method, path, body, auth = token) => {
    const r = await fetch(process.env.TEST_BASE_URL + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  const endpoint = '/api/orders/review-test-order/items/review-test-order%3Aline%3A0/review';
  const body = { rating: 1, title: 'Trải nghiệm', comment: 'Sản phẩm cần cải thiện' };
  assert.equal((await call('POST', endpoint, body)).status, 403);
  await db.models.orders.updateOne({ id: order.id }, { $set: { status: 'delivered' } });
  assert.equal((await call('POST', endpoint, body, sign(admin))).status, 403);
  assert.equal((await call('POST', endpoint, { ...body, rating: 6 })).status, 400);
  const created = await call('POST', endpoint, body);
  assert.equal(created.status, 201);
  assert.equal((await call('POST', endpoint, body)).status, 409);
  const publicList = await call('GET', `/api/products/${p.id}/reviews`);
  assert.equal(publicList.body.count, 1);
  assert.equal(publicList.body.average, 1);
  assert.equal(publicList.body.reviews[0].userId, undefined);
  assert.equal((await call('PUT', `/api/reviews/${created.body.id}`, { ...body, rating: 4 })).status, 200);
  const stranger = { ...buyer, _id: undefined, id: 'review-stranger', email: 'review-stranger@example.test' };
  await db.models.users.create(stranger);
  assert.equal((await call('PUT', `/api/reviews/${created.body.id}`, body, sign(stranger))).status, 404);
  assert.equal((await call('POST', endpoint, body, sign(stranger))).status, 404);
  assert.equal((await db.models.reviews.findOne({ id: created.body.id }).lean()).rating, 4);
  console.log('Review checks passed: delivery gate, role, rating validation, duplicate, negative review, privacy, editing, ownership, persistence.');
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.close());
