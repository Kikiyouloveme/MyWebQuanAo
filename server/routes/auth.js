const express = require('express');
const { wrap, requireAuth, limiters } = require('../security');
const controller = require('../controllers/auth');
const router = express.Router();

router.post('/register', limiters.register, wrap(controller.postRegister));
router.post('/login', limiters.login, wrap(controller.postLogin));
router.get('/me', requireAuth, wrap(controller.getMe));
router.post('/verify-email/send', requireAuth, limiters.otpRequest, wrap(controller.postVerifyEmailSend));
router.post('/verify-email/confirm', requireAuth, limiters.otpVerify, wrap(controller.postVerifyEmailConfirm));
router.post('/forgot-password', limiters.otpRequest, wrap(controller.postForgotPassword));
router.post('/forgot-password/verify', limiters.otpVerify, wrap(controller.postForgotPasswordVerify));
router.post('/forgot-password/reset', limiters.otpVerify, wrap(controller.postForgotPasswordReset));
router.put('/profile', requireAuth, limiters.write, wrap(controller.putProfile));
router.put('/avatar', requireAuth, limiters.write, wrap(controller.putAvatar));
router.put('/password', requireAuth, limiters.write, wrap(controller.putPassword));
router.get('/addresses', requireAuth, wrap(controller.getAddresses));
router.post('/addresses', requireAuth, limiters.write, wrap(controller.postAddresses));
router.put('/addresses/:id', requireAuth, limiters.write, wrap(controller.putAddressesId));
router.delete('/addresses/:id', requireAuth, limiters.write, wrap(controller.deleteAddressesId));
router.put('/addresses/:id/default', requireAuth, limiters.write, wrap(controller.putAddressesIdDefault));

module.exports = { ...controller, router };
