const { db } = require("../utils/db"); 
const {
    createstudentservice,
    getonestudentservice,
    getonewithpaginationservice,
    deletestudentservice,
    updatestudentservice,
    statuschangeservice,
    studentmastesrservice,
    assignTutorAndBookSlotsService
} = require("../services/student.services");
const AppError = require("../utils/AppError"); 
const catchAsync = require("../utils/catchAsync"); 

// Create Student (initial profile only)
exports.createstudents = catchAsync(async (req, res, next) => { 
    const result = await createstudentservice(req.body, req.user.id); 
    return res.status(result.statusCode).json({
        message: result.message,
        studentId: result.studentId
    });
});

// Update Student
exports.updatestudents = catchAsync(async (req, res, next) => { 
    const studentId = req.params.studentId; 
    const result = await updatestudentservice(studentId, req.body, req.user.id); 
    return res.status(result.statusCode).json({ message: result.message, data: result.data });
});

// Get One Student
exports.getone = catchAsync(async (req, res, next) => { 
    const studentId = req.params.id; 
    const result = await getonestudentservice(studentId, req.user.id); // Service expects studentId, userId
    // Service returns { statusCode, data }
    return res.status(result.statusCode).json({ data: result.data });
});

// Get Students with Pagination
exports.getonewithpagination = catchAsync(async (req, res, next) => { 
    const result = await getonewithpaginationservice(req.query, req.user.id); 
    return res.status(result.statusCode).json({
        data: result.data,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalRecords: result.totalRecords
    });
});

// Delete Student
exports.deletestudnets = catchAsync(async (req, res, next) => { 
    const studentId = req.params.id; 
    const result = await deletestudentservice(studentId, req.user.id);
    return res.status(result.statusCode).json({ message: result.message });
});


// Change Student Status
exports.statuschange = catchAsync(async (req, res, next) => { 
    const studentId = req.params.id; 
    const result = await statuschangeservice(studentId, req.body.status, req.user.id);
    return res.status(result.statusCode).json({ message: result.message, data: result.data });
});

exports.assigntutor = catchAsync(async (req, res, next) => { 
    const studentId = req.params.studentId;
    const { tutorId, selectedRecurringPatterns, initialPaymentForBooking } = req.body;
    
    const result = await assignTutorAndBookSlotsService(studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, req.user.id);
    return res.status(result.statusCode).json({ message: result.message, data: result.data }); 
});

// Student Master (for dropdowns etc.)
exports.studentmaster = catchAsync(async (req, res, next) => { 
    const result = await studentmastesrservice(req.query, req.user.id); 
    return res.status(result.statusCode).json({ message: result.message, data: result.data });
});