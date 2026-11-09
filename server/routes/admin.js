const express = require('express');
const { wrap, requireStaff, requireAdmin, limiters } = require('../security');
const controller = require('../controllers/admin');
const router = express.Router();

router.get('/stats', requireStaff, wrap(controller.getStats));
router.get('/orders', requireStaff, wrap(controller.getOrders));
router.get('/orders/:id', requireStaff, wrap(controller.getOrdersId));
router.put('/orders/:id/status', requireStaff, limiters.write, wrap(controller.putOrdersIdStatus));
router.put('/orders/:id/shipping', requireStaff, limiters.write, wrap(controller.putOrdersIdShipping));
router.post('/orders/:id/refund', requireStaff, limiters.write, wrap(controller.postOrdersIdRefund));
router.get('/users', requireAdmin, wrap(controller.getUsers));
router.get('/users/:id', requireAdmin, wrap(controller.getUsersId));
router.put('/users/:id/role', requireAdmin, limiters.write, wrap(controller.putUsersIdRole));
router.get('/emails', requireStaff, wrap(controller.getEmails));
router.get('/emails/:id', requireStaff, wrap(controller.getEmailsId));

module.exports = { ...controller, router };
