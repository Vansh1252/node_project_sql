// routes/slot.routes.js

const express = require('express');
const slotController = require('../controllers/slot.controllers');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const { roles } = require('../constants/sequelizetableconstants');

// Apply authentication middleware to all slot routes
router.use(authMiddleware.protect);

// Create individual (concrete) slots manually by admin
router.post('/', authMiddleware.restrictTo(roles.ADMIN), slotController.createSlot);

// Route: POST /api/v1/slots/generate-available/:studentId
router.get('/generate-available/:studentId', authMiddleware.restrictTo(roles.ADMIN, roles.STUDENT), slotController.getGeneratedAvailableSlots);

// Update status of an existing concrete slot (e.g., complete, cancel, mark attendance)
router.patch('/:id/status', authMiddleware.restrictTo(roles.ADMIN, roles.TUTOR), slotController.updateSlotStatus);

// Get all concrete Slts for a specific Tutor (e.g., for their schedule view)
router.get('/tutor/:tutorId/all', authMiddleware.restrictTo(roles.ADMIN, roles.TUTOR), slotController.getTutorConcreteSlots);

// Get all concrete Slots fr a specific Student (e.g., for their schedule view)
router.get('/student/:studentId/all', authMiddleware.restrictTo(roles.ADMIN, roles.STUDENT), slotController.getStudentConcreteSlots);
// create a razorpay oder
router.post('/create-razorpay-order', authMiddleware.restrictTo(roles.ADMIN), slotController.createRazorpayOrder);



module.exports = router;