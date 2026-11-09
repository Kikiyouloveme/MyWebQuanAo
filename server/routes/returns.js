const express = require('express');
const { wrap, requireAuth, requireStaff, limiters } = require('../security');
const controller = require('../controllers/returns');
const router = express.Router();

router.get('/eligibility/:orderId', requireAuth, wrap(controller.getEligibilityOrderId));
router.post('/', requireAuth, limiters.write, (req,res,next)=>controller.uploadProof.array('photos',5)(req,res,require('node:async_hooks').AsyncResource.bind(next)), wrap(controller.post));
router.get('/mine', requireAuth, wrap(controller.getMine));
router.get('/:id', requireAuth, wrap(controller.getId));
router.put('/:id/bank-account', requireAuth, limiters.write, wrap(controller.putIdBankAccount));
router.get('/', requireStaff, wrap(controller.get));
router.put('/:id/review', requireStaff, limiters.write, wrap(controller.putIdReview));
router.put('/:id/receive', requireStaff, limiters.write, wrap(controller.putIdReceive));
router.put('/:id/exchange', requireStaff, limiters.write, wrap(controller.putIdExchange));
router.get('/:id/exchange-options', requireStaff, wrap(controller.getIdExchangeOptions));
router.post('/:id/refund', requireStaff, limiters.write, wrap(controller.postIdRefund));

module.exports = { ...controller, router };
