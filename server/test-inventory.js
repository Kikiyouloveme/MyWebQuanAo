const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('./db');
const inventory = require('./inventory');

test('aggregate same variant across separate lines before reserving stock', () => {
  const originals = { transaction: db.transaction, byId: db.products.byId };
  const variant = { id: 'v1', stock: 3 };
  db.transaction = (fn) => fn();
  db.products.byId = () => ({ id: 'p1', variants: [variant] });
  try {
    const order = { stockState: 'none', items: [
      { productId: 'p1', variantId: 'v1', qty: 2 },
      { productId: 'p1', variantId: 'v1', qty: 2 },
    ] };
    assert.throws(() => inventory.reserve(order), (e) => e.status === 409);
    assert.equal(variant.stock, 3);
    assert.equal(order.stockState, 'none');
    order.items[1].qty = 1;
    inventory.reserve(order);
    assert.equal(variant.stock, 0);
    inventory.reserve(order);
    assert.equal(variant.stock, 0);
    inventory.release(order);
    inventory.release(order);
    assert.equal(variant.stock, 3);
  } finally {
    db.transaction = originals.transaction;
    db.products.byId = originals.byId;
  }
});
