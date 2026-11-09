const express = require('express');
const { wrap, requireStaff, limiters } = require('../security');
const controller = require('../controllers/products');
const router = express.Router();

router.get('/', wrap(controller.get));
router.get('/:id', wrap(controller.getId));
router.get('/admin/all', requireStaff, wrap(controller.getAdminAll));
router.post('/', requireStaff, limiters.write, wrap(controller.post));
router.put('/:id', requireStaff, limiters.write, wrap(controller.putId));
router.put('/:id/variants/:variantId/stock', requireStaff, limiters.write, wrap(controller.putIdVariantsVariantIdStock));
router.delete('/:id', requireStaff, limiters.write, wrap(controller.deleteId));

module.exports = { ...controller, router };
