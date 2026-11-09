const express = require('express');
const { wrap, requireAuth, requireStaff, limiters } = require('../security');
const controller = require('../controllers/vouchers');
const router = express.Router();

router.post('/validate', requireAuth, limiters.write, wrap(controller.postValidate));
router.get('/available', wrap(controller.getAvailable));
router.get('/', requireStaff, wrap(controller.get));
router.post('/', requireStaff, limiters.write, wrap(controller.post));
router.put('/:id', requireStaff, limiters.write, wrap(controller.putId));
router.delete('/:id', requireStaff, limiters.write, wrap(controller.deleteId));

module.exports = { ...controller, router };
