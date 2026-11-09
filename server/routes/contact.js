const express = require('express');
const { wrap, requireStaff, limiters } = require('../security');
const controller = require('../controllers/contact');
const router = express.Router();

router.post('/', limiters.write, wrap(controller.post));
router.get('/subjects', wrap(controller.getSubjects));
router.get('/', requireStaff, wrap(controller.get));
router.put('/:id/status', requireStaff, limiters.write, wrap(controller.putIdStatus));

module.exports = { ...controller, router };
