import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartLineKey } from '../client/src/lib/cart-identity.js';
test('TC10 same SKU with different artwork revisions remains distinct',()=>{
  assert.notEqual(cartLineKey('v','revision-a'),cartLineKey('v','revision-b'));
  assert.equal(cartLineKey('v','revision-a'),cartLineKey('v','revision-a'));
});
test('TC11 regular/custom and delimiter-containing IDs cannot collide',()=>{
  assert.notEqual(cartLineKey('v'),cartLineKey('v','revision-a'));
  assert.notEqual(cartLineKey('v:x','r'),cartLineKey('v','x:r'));
});
