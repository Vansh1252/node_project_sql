// Import all required slot-related services
const {
    getoneslotservice,
    getslotswithpaginationservice,
    deleteslotservice,
    generateWeeklySlotsForTutor, // This service function needs to handle the new AvailabilitySlot model
    bookSlotService,
    rescheduleSlotService,
    cancelSlotService,
    getAvailableSlotsService,
    getMySlotsService,
    createManualSlotService,
    updateManualSlotService,
    markAttendance,
    getCalendarSlots, verifyRazorpayPaymentService
} = require("../services/slot.services");


// Import db object (instead of specific Mongoose model)
const { db } = require("../utils/db"); // ✅ Import db object

// Custom async error handler
const catchAsync = require('../utils/catchAsync');
const AppError = require("../utils/AppError"); // Make sure AppError is imported if used directly

// Book a new slot
exports.bookSlot = catchAsync(async (req, res) => {
    const result = await bookSlotService(req);
    return res.status(result.statusCode).json(result);
});
exports.verifyRazorpayPayment = catchAsync(async (req, res) => {
    const result = await verifyRazorpayPaymentService(req);
    return res.status(result.statusCode).json(result);
});
// Reschedule an existing slot
exports.rescheduleSlot = catchAsync(async (req, res) => {
    const result = await rescheduleSlotService(req);
    return res.status(result.statusCode).json({ message: result.message });
});

// Get a single slot by ID or criteria
exports.getoneslot = catchAsync(async (req, res) => {
    const result = await getoneslotservice(req);
    return res.status(result.statusCode).json(result);
});

// Get slots with pagination (useful for admin or UI listing)
exports.getslotswithpagination = catchAsync(async (req, res) => {
    const result = await getslotswithpaginationservice(req);
    return res.status(result.statusCode).json(result);
});

// Delete a slot
exports.deleteslot = catchAsync(async (req, res) => {
    const result = await deleteslotservice(req);
    return res.status(result.statusCode).json(result);
});

// Generate weekly slots for all tutors based on their availability
exports.generateWeeklySlotsForAllTutors = catchAsync(async (req, res) => {
    const tutors = await db.Tutor.findAll({
        include: [{
            model: db.AvailabilitySlot,
            as: 'arr_weeklyAvailability', // Alias defined in Tutor model
            required: true // Ensures only tutors with at least one availability slot are returned
        }]
    });

    let totalCreated = 0;

    for (const tutor of tutors) {
        try {
            // Pass the Sequelize tutor instance to the service
            const result = await generateWeeklySlotsForTutor(tutor);
            totalCreated += result.generatedCount || 0;
            console.log(`Generated ${result.generatedCount} slots for tutor ${tutor.id}`); // ✅ tutor.id
        } catch (error) {
            console.error(`Failed to generate slots for tutor ${tutor.id}: ${error.message}`); // ✅ tutor.id
        }
    }
    return res.status(200).json({
        message: "Weekly slots generated successfully",
        totalTutors: tutors.length,
        totalSlotsCreated: totalCreated,
    });
});

// Cancel a booked slot
exports.cancelSlot = catchAsync(async (req, res) => {
    const result = await cancelSlotService(req);
    return res.status(result.statusCode).json(result);
});

// Get all slots booked by the currently logged-in tutor/student
exports.getMySlots = catchAsync(async (req, res) => {
    const result = await getMySlotsService(req);
    if (!result) throw new AppError("No slot booked", 400); // Consider throwing AppError inside service
    return res.status(result.statusCode).json({ slots: result.data });
});

// Get available slots for students to book
exports.getAvailableSlotsForStudents = catchAsync(async (req, res) => {
    const result = await getAvailableSlotsService(req);
    return res.status(result.statusCode).json(result);
});

// Manually create a slot (used by admins or tutors)
exports.createManualSlot = catchAsync(async (req, res) => {
    const result = await createManualSlotService(req);
    return res.status(result.statusCode).json(result);
});

// Manually update a slot
exports.updateManualSlot = catchAsync(async (req, res) => {
    const result = await updateManualSlotService(req);
    return res.status(result.statusCode).json(result);
});

// marks attendance
exports.markAttendance = catchAsync(async (req, res) => {
    const result = await markAttendance(req.params.slotId, req);
    return res.status(result.statusCode).json(result);
});

//dynamic calendar
exports.getCalendarSlots = catchAsync(async (req, res) => {
    const result = await getCalendarSlots(req);
    return res.status(result.statusCode).json(result.data);
});