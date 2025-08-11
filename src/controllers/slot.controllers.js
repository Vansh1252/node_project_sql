const {
    createSlotService,
    getGeneratedAvailableSlotsService,statuschangeservice,
    getTutorConcreteSlotsService,
    getStudentConcreteSlotsService,
    createRazorpayOrderService,
} = require('../services/slot.services');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.createSlot = catchAsync(async (req, res, next) => {
    const slotsData = req.body;
    const requestingUserId = req.user.id;

    if (!Array.isArray(slotsData) || slotsData.length === 0) {
        throw new AppError("Request body must be an array of slot objects for creation.", 400);
    }

    const result = await createSlotService(slotsData, requestingUserId);
    return res.status(result.statusCode).json({ message: result.message, data: result.data });
});

exports.getGeneratedAvailableSlots = catchAsync(async (req, res, next) => {
    const studentId = req.params.studentId;
    const { tutorId, durationMinutes } = req.query; // Extract from request body
    const requestingUserId = req.user.id;

    if (!tutorId || !durationMinutes) {
        throw new AppError("tutorId and durationMinutes are required in the request body.", 400);
    }

    const result = await getGeneratedAvailableSlotsService(tutorId, studentId, durationMinutes, requestingUserId);
    return res.status(result.statusCode).json({ data: result.data });
});

exports.updateSlotStatus = catchAsync(async (req, res, next) => {
    const slotId = req.params.id;
    const { newStatus, attendanceStatus } = req.body;
    const requestingUserId = req.user.id;
    console.log(slotId)
    if (!newStatus) {
        throw new AppError("New status is required.", 400);
    }
    if (!['completed', 'cancelled', 'attended', 'missed'].includes(newStatus)) {
        throw new AppError("Invalid status for update. Must be 'completed', 'cancelled', 'attended', or 'missed'.", 400);
    }
    if (['attended', 'missed'].includes(newStatus) && !attendanceStatus) {
        throw new AppError("Attendance status ('attended' or 'missed') is required when marking attendance.", 400);
    }

    const result = await statuschangeservice(slotId, newStatus, attendanceStatus, requestingUserId);
    return res.status(result.statusCode).json({ message: result.message, data: result.data });
});


exports.getTutorConcreteSlots = catchAsync(async (req, res, next) => {
    const tutorId = req.params.tutorId;
    const queryParams = req.query;
    const requestingUserId = req.user.id;

    const result = await getTutorConcreteSlotsService(tutorId, queryParams, requestingUserId);
    return res.status(result.statusCode).json({
        data: result.data,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalRecords: result.totalRecords
    });
});

exports.getStudentConcreteSlots = catchAsync(async (req, res, next) => {
    const studentId = req.params.studentId;
    const queryParams = req.query;
    const requestingUserId = req.user.id;

    const result = await getStudentConcreteSlotsService(studentId, queryParams, requestingUserId);
    return res.status(result.statusCode).json({
        data: result.data,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalRecords: result.totalRecords
    });
});
exports.createRazorpayOrder = catchAsync(async (req, res, next) => {
    const { tutorId, studentId, selectedRecurringPatterns } = req.body;
    const requestingUserId = req.user.id; // From auth middleware

    if (!tutorId || !studentId || !selectedRecurringPatterns || selectedRecurringPatterns.length === 0) {
        throw new AppError("tutorId, studentProfileData, and selectedRecurringPatterns are required to create a payment order.", 400);
    }

    const result = await createRazorpayOrderService(tutorId, studentId, selectedRecurringPatterns, requestingUserId);

    res.status(result.statusCode).json({
        message: result.message,
        data: result.data // Contains orderId, amount, currency, etc.
    });
});