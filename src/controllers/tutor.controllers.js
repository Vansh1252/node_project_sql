const {
    createtutorservice,
    updatetutorservice,
    getonetutorservice,
    getonewithpaginationtutorservice,
    deletetutorservice,
    adjustTutorAvailability, // This service function needs to handle the new AvailabilitySlot model
    tutormastersservice,
    updateRateHistory,
    assignstudentservices,
    removeStudentService
} = require('../services/tutor.services');
const catchAsync = require('../utils/catchAsync');

// Create Tutor
exports.createtutor = catchAsync(async (req, res) => {
    const result = await createtutorservice(req);
    return res.status(result.statusCode).json(result);
});

// Update Tutor
exports.updatetutor = catchAsync(async (req, res) => {
    const result = await updatetutorservice(req);
    return res.status(result.statusCode).json(result);
});

// Get One Tutor
exports.getone = catchAsync(async (req, res) => {
    const result = await getonetutorservice(req);
    return res.status(result.statusCode).json(result);
});

// Get All Tutors with Pagination
exports.getonewithpagination = catchAsync(async (req, res) => {
    const result = await getonewithpaginationtutorservice(req);
    return res.status(result.statusCode).json(result);
});

// Delete Tutor
exports.deletetutor = catchAsync(async (req, res) => {
    const result = await deletetutorservice(req);
    return res.status(result.statusCode).json(result);
});

exports.updateTutorRate = catchAsync(async (req, res) => {
    const tutorId = req.params.tutorId;
    const result = await updateRateHistory(tutorId, req);
    return res.status(result.statusCode).json({ result });
});

// assign tutor student
exports.assignstudent = catchAsync(async (req, res) => {
    const tutorId = req.params.tutorId;
    const result = await assignstudentservices(tutorId, req);
    return res.status(result.statusCode).json({ message: result.message });
});

exports.tutormaster = async (req, res) => {
    const result = await tutormastersservice(req);
    return res.status(result.statusCode).json({ message: result.message, data: result.data });
}

// remove student from tutor
exports.removestudent = async (req, res) => {
    const tutorId = req.params.id; // Assuming id is the tutor's ID here
    const result = await removeStudentService(req, tutorId);
    return res.status(result.statusCode).json({ message: result.message });
}