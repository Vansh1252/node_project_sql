const { getTutorPerformanceReport, getStudentPerformanceReport } = require('../services/report.services');
const catchAsync = require('../utils/catchAsync');

exports.getTutorReport = catchAsync(async (req, res) => {
    const { tutorId } = req.params;
    const report = await getTutorPerformanceReport(tutorId);
    res.status(200).json({
        status: 'success',
        data: report
    });
});

exports.getStudentReport = catchAsync(async (req, res) => {
    const { studentId } = req.params;
    const report = await getStudentPerformanceReport(studentId);
    res.status(200).json({
        status: 'success',
        data: report
    });
});