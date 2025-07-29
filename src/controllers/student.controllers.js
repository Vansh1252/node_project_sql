const { db } = require("../utils/db"); // ✅ Assuming db object is exported from db.js
const {
    createstudentservice,
    getonestudentservice,
    getonewithpaginationservice,
    deletestudentservice,
    updatestudentservice,
    deleteAssessments,
    getAssessments,
    statuschangeservice,
    assigntutorservices,
    studentmastesrservice
} = require("../services/student.services");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const fs = require('fs'); // Added for file system operations
const path = require('path'); // Added for path operations

// Create Student
exports.createstudents = catchAsync(async (req, res) => {
    const result = await createstudentservice(req);
    return res.status(result.statusCode).json(result);
});

// Update Student
exports.updatestudents = catchAsync(async (req, res) => {
    const result = await updatestudentservice(req);
    return res.status(result.statusCode).json(result);
});

// Get One Student
exports.getone = catchAsync(async (req, res) => {
    const result = await getonestudentservice(req);
    return res.status(result.statusCode).json(result);
});

// Get Students with Pagination
exports.getonewithpagination = catchAsync(async (req, res) => {
    const result = await getonewithpaginationservice(req);
    return res.status(result.statusCode).json(result);
});

// Delete Student
exports.deletestudnets = catchAsync(async (req, res) => {
    const result = await deletestudentservice(req);
    return res.status(result.statusCode).json(result);
});

// Upload Assessment
exports.uploadAssessment = catchAsync(async (req, res) => {
    const studentId = req.params.id;
    // Ensure req.file exists if you're using multer or similar middleware
    if (!req.file || !req.file.filename) {
        throw new AppError("No file uploaded or filename is missing.", 400);
    }
    const filePath = `/uploads/assessments/${req.file.filename}`;

    // Mongoose: studentModels.findById(studentId);
    const student = await db.Student.findByPk(studentId); // ✅ Use db.Student
    if (!student) {
        return res.status(404).json({ message: "Student not found" });
    }

    // Mongoose: student.arr_assessments.push(filePath); await student.save();
    // Sequelize: Update the JSONB array. Be careful with direct push, better to fetch, modify, then update.
    const currentAssessments = student.arr_assessments || []; // Ensure it's an array
    currentAssessments.push(filePath);
    await student.update({ arr_assessments: currentAssessments }); // ✅ Sequelize update

    return res.status(200).json({
        message: "Assessment uploaded successfully",
        filePath,
    });
});

// Status Change
exports.statuschange = catchAsync(async (req, res) => {
    const studentId = req.params.id;
    const result = await statuschangeservice(studentId, req);
    return res.status(result.statusCode).json(result);
});

// getAssessments
exports.getAssessments = catchAsync(async (req, res) => {
    const result = await getAssessments(req.params.id);
    return res.status(result.statusCode).json(result.data);
});

// deleteAssessments
exports.deleteAssessment = catchAsync(async (req, res) => {
    const { filePath } = req.body;
    const result = await deleteAssessments(req.params.id, filePath);
    return res.status(result.statusCode).json({ message: result.message });
});

// assign student tutor
exports.assigntutor = catchAsync(async (req, res) => {
    const studentId = req.params.studentId;
    const result = await assigntutorservices(studentId, req);
    return res.status(result.statusCode).json({ message: result.message });
})

exports.studentmaster = catchAsync(async (req, res) => {
    const result = await studentmastesrservice(req);
    return res.status(result.statusCode).json({ message: result.message, data: result.data });
})