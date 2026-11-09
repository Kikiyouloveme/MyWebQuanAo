const express = require('express');
const { wrap, requireAuth, requireVerified, optionalAuth, limiters } = require('../security');
const controller = require('../controllers/orders');
const router = express.Router();

router.get('/locations', controller.getLocations);
router.get('/locations/:code/wards', controller.getLocationsCodeWards);
router.post('/guest/send-code', limiters.otpRequest, wrap(controller.postGuestSendCode));
router.post('/guest/verify-code', limiters.otpVerify, wrap(controller.postGuestVerifyCode));
router.post('/quote', require('../guest-print-session').optional, limiters.write, wrap(controller.postQuote));
router.post('/', require('../guest-print-session').optional, (req, res, next) => req.user ? requireVerified(req, res, next) : next(), limiters.write, wrap(controller.post));
router.get('/guest/:id',require('../guest-print-session').required,wrap(controller.getId));
router.post('/guest/:id/cancel',require('../guest-print-session').required,limiters.write,wrap(controller.postIdCancel));
router.get('/mine', requireAuth, wrap(controller.getMine));
router.get('/:id', requireAuth, wrap(controller.getId));
router.post('/:id/cancel', requireAuth, limiters.write, wrap(controller.postIdCancel));

module.exports = { ...controller, router };
