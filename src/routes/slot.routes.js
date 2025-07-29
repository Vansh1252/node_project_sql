const express = require("express");
const router = express.Router();
const { db } = require('../utils/db'); // ✅ Import the db object
const { Op } = require('sequelize');
const slotController = require("../controllers/slot.controllers");
const { protect, restrictTo } = require("../middleware/auth");
const { roles } = require('../constants/sequelizetableconstants');
const { validateCreateManualSlot, validateUpdateManualSlot, validateVerifyRazorpayPayment } = require('../validations/slot.validations');
const { validate } = require("../middleware/validate");


router.get('/view/:slotId', async (req, res, next) => {
    try {
        const { slotId } = req.params;

        // Fetch slot by primary key
        const slot = await db.Slot.findByPk(slotId);

        // Check if slot exists and is available
        if (!slot || slot.str_status.toLowerCase() !== 'available') {
            return res.status(404).send("Slot not found or unavailable");
        }

        // Fetch tutor info by tutor ID associated with slot
        const tutor = await db.Tutor.findByPk(slot.obj_tutor, {
            attributes: ['str_firstName', 'int_rate']
        });

        if (!tutor) {
            return res.status(404).send("Tutor not found");
        }

        const transactionFee = tutor.int_rate * 0.05;
        const totalAmount = tutor.int_rate + transactionFee;

        // Render the view with data
        return res.render('bookslot', {
            slotId,
            slot: {
                tutorName: tutor.str_firstName,
                rate: tutor.int_rate,
                totalAmount,
                date: slot.dt_date,
                startTime: slot.str_startTime,
                endTime: slot.str_endTime
            }
        });
    } catch (err) {
        next(err);
    }
});
router.get('/my-bookings', async (req, res, next) => {
    try {
        // Assuming user object is set in req.user and profileId holds Student id
        const studentId = req.user.ObjectId_profileId;

        // Fetch all slots booked by this student with tutor data eagerly loaded
        const slots = await db.Slot.findAll({
            where: { obj_student: studentId },
            include: [
                {
                    model: db.Tutor,
                    as: 'obj_tutor', // Use the actual alias from your model associations
                    attributes: ['str_firstName']
                }
            ],
            order: [['dt_date', 'DESC']]
        });

        // Map slots to plain JS objects to send to the view
        const slotData = slots.map(slot => ({
            tutorName: slot.obj_tutor ? slot.obj_tutor.str_firstName : 'N/A',
            dt_date: slot.dt_date,
            str_startTime: slot.str_startTime,
            str_endTime: slot.str_endTime,
            str_status: slot.str_status
        }));

        res.render('my-bookings', { slots: slotData });
    } catch (err) {
        next(err);
    }
});

// backend API
router.post("/payment/create-order", slotController.bookSlot);
router.post('/payment/verify', validateVerifyRazorpayPayment, validate, slotController.verifyRazorpayPayment);

router.post("/reschedule", protect, restrictTo(roles.STUDENT), slotController.rescheduleSlot);
router.post("/cancel/:id", protect, restrictTo(roles.STUDENT), slotController.cancelSlot);

router.get("/my", protect, restrictTo(roles.STUDENT), slotController.getMySlots);
router.get("/available", protect, slotController.getAvailableSlotsForStudents);
router.get("/details/:id", protect, restrictTo(roles.ADMIN, roles.TUTOR), slotController.getoneslot);

router.post("/manual/create", protect, validateCreateManualSlot, validate, restrictTo(roles.ADMIN), slotController.createManualSlot);
router.put("/manual/update/:id", protect, validateUpdateManualSlot, validate, restrictTo(roles.ADMIN), slotController.updateManualSlot);

router.get("/", protect, restrictTo(roles.ADMIN, roles.TUTOR), slotController.getslotswithpagination);

router.delete("/:id", protect, restrictTo(roles.ADMIN), slotController.deleteslot);

router.post("/generate-weekly", protect, restrictTo(roles.ADMIN), slotController.generateWeeklySlotsForAllTutors);
router.post('/attendance/:slotId', protect, restrictTo(roles.TUTOR, roles.ADMIN), slotController.markAttendance);
router.get('/calendar', protect, restrictTo(roles.ADMIN, roles.TUTOR), slotController.getCalendarSlots);
module.exports = router;
