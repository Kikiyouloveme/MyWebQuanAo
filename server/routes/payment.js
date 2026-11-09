const express = require('express');
const { wrap, requireAuth, requireStaff, limiters } = require('../security');
const controller = require('../controllers/payment');
const router = express.Router();

router.post('/vnpay/create', requireAuth, limiters.write, wrap(controller.postVnpayCreate));
router.get('/vnpay/sandbox', wrap(controller.getVnpaySandbox));
router.get('/vnpay/return', wrap(controller.getVnpayReturn));
router.get('/vnpay/ipn', wrap(controller.getVnpayIpn));

/* VietQR — chuyển khoản ngân hàng. Khách/khách vãng lai tạo QR của đơn mình;
   chỉ Staff/Admin xác nhận đã nhận tiền, vì tiền về tài khoản là ngoài hệ thống. */
router.post('/vietqr/create', requireAuth, limiters.write, wrap(controller.postVietqrCreate));
router.post('/vietqr/confirm', requireStaff, limiters.write, wrap(controller.postVietqrConfirm));
router.get('/vietqr/pending', requireStaff, wrap(controller.getVietqrPending));

router.get('/config', wrap(controller.getConfig));

module.exports = { ...controller, router };
