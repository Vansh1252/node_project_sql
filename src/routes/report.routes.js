const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controllers');
const { protect, restrictTo } = require('../middleware/auth');
const { roles } = require('../constants/sequelizetableconstants');

router.get('/tutor/:tutorId', protect, restrictTo(roles.ADMIN, roles.TUTOR), reportController.getTutorReport);
router.get('/student/:studentId', protect, restrictTo(roles.ADMIN), reportController.getStudentReport);

module.exports = router;