const tutorServices = require('../services/tutor.services');
const catchAsync = require('../utils/catchAsync'); // Ensure catchAsync is imported
const AppError = require('../utils/AppError'); // Ensure AppError is imported

// Create Tutor
exports.createtutor = catchAsync(async (req, res, next) => { 
    const result = await tutorServices.createtutorservice(req.body, req.user.id);
    return res.status(result.statusCode).json({ message: result.message, tutorId: result.tutorId });
});

// Update Tutor
exports.updatetutor = catchAsync(async (req, res, next) => { 
    const tutorId = req.params.tutorId; 
    const result = await tutorServices.updatetutorservice(tutorId, req.body, req.user.id);
    return res.status(result.statusCode).json({ message: result.message, data: result.data });
});

// Get One Tutor
exports.getone = catchAsync(async (req, res, next) => { 
    const tutorId = req.params.id; 
    const result = await tutorServices.getonetutorservice(tutorId, req.user.id);
    return res.status(result.statusCode).json({ data: result.data });
});

// Get All Tutors with Pagination
exports.getonewithpagination = catchAsync(async (req, res, next) => { 
    const result = await tutorServices.getonewithpaginationtutorservice(req.query, req.user.id);
    return res.status(result.statusCode).json({
        data: result.data,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalRecords: result.totalRecords
    });
});

// Delete Tutor
exports.deletetutor = catchAsync(async (req, res, next) => { 
    const tutorId = req.params.tutorId; 
    const result = await tutorServices.deletetutorservice(tutorId, req.user.id);
    return res.status(result.statusCode).json({ message: result.message });
});

// remove student
exports.removestudent = catchAsync(async (req, res, next) => { 
    const tutorId = req.params.tutorId; 
    const { studentId } = req.body; 
    const result = await tutorServices.removeStudentService(tutorId, studentId, req.user.id);
    return res.status(result.statusCode).json({ message: result.message });
});
// get tutor name api
exports.tutormaster = catchAsync(async (req, res, next) => { 
    const result = await tutorServices.tutormaster(req.query, req.user.id);
    return res.status(result.statusCode).json({ message: result.message, data: result.data });
});
