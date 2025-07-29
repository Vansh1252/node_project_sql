// src/services/report.services.js
const moment = require('moment'); // For date manipulation
const { db } = require('../utils/db'); // ✅ Import the db object
const AppError = require('../utils/AppError');
const { Op } = require('sequelize'); // ✅ Import Sequelize Operators
const { attendnace, slotstatus } = require('../constants/sequelizetableconstants'); // ✅ Use Sequelize constants


exports.getTutorPerformanceReport = async (tutorId) => {

    const thirtyDaysAgo = moment().subtract(30, 'days').toDate();

    // Fetch tutor details and their earnings history
    const tutor = await db.Tutor.findByPk(tutorId, {
        attributes: ['id', 'str_firstName', 'str_lastName'],
        include: [{
            model: db.EarningsHistory,
            as: 'earningsHistory',
            attributes: ['amount', 'sessionCount', 'periodStart', 'periodEnd'],
            where: {
                periodEnd: { [Op.gte]: thirtyDaysAgo } // Filter earnings history for the last 30 days
            },
            required: false // LEFT JOIN in case no earnings history
        }]
    });

    if (!tutor) {
        throw new AppError('Tutor not found', 404);
    }

    // Fetch all completed slots for this tutor within the last 30 days
    const slots = await db.Slot.findAll({
        where: {
            obj_tutor: tutorId,
            dt_date: { [Op.gte]: thirtyDaysAgo },
            str_status: slotstatus.COMPLETED // Use constant
        },
        attributes: ['id', 'obj_student', 'str_attendance', 'int_tutorPayout'],
        include: [{
            model: db.Student,
            as: 'student', // Alias from Slot model association
            attributes: ['str_firstName', 'str_lastName'],
            required: false // LEFT JOIN, student might be null or not found
        }],
        raw: true, // Get plain data objects
        nest: true // Nest included data
    });

    // Manually group and aggregate slot data in JavaScript
    const studentPerformanceMap = new Map();
    let totalSessions = 0;
    let attendedSessionsCount = 0;

    slots.forEach(slot => {
        const studentId = slot.obj_student;
        const studentName = slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : 'N/A';

        if (!studentPerformanceMap.has(studentId)) {
            studentPerformanceMap.set(studentId, {
                studentId: studentId,
                studentName: studentName,
                sessions: 0,
                attended: 0,
                earnings: 0
            });
        }

        const studentStats = studentPerformanceMap.get(studentId);
        studentStats.sessions += 1;
        totalSessions += 1;

        if (slot.str_attendance === attendnace.ATTENDED) { // Use constant
            studentStats.attended += 1;
            attendedSessionsCount += 1;
        }
        studentStats.earnings += slot.int_tutorPayout || 0;
    });

    const studentPerformance = Array.from(studentPerformanceMap.values());

    // Calculate total earnings from EarningsHistory
    const totalEarnings = tutor.earningsHistory.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const attendanceRate = totalSessions > 0 ? (attendedSessionsCount / totalSessions * 100) : 0;

    return {
        tutorId: tutor.id,
        tutorName: `${tutor.str_firstName} ${tutor.str_lastName}`,
        totalSessions,
        attendedSessions: attendedSessionsCount,
        attendanceRate: Number(attendanceRate.toFixed(2)),
        totalEarnings,
        studentPerformance: studentPerformance,
        period: { start: thirtyDaysAgo, end: new Date() }
    };
};

/**
 * Generates a performance report for a given student.
 * @param {string} studentId - The ID of the student.
 * @returns {object} The student's performance report.
 * @throws {AppError} If the student is not found or ID is invalid.
 */
exports.getStudentPerformanceReport = async (studentId) => {
    // No need for mongoose.Types.ObjectId.isValid for UUIDs
    // if (!mongoose.Types.ObjectId.isValid(studentId)) {
    //     throw new AppError('Invalid student ID', 400);
    // }

    const thirtyDaysAgo = moment().subtract(30, 'days').toDate();

    // Fetch student details
    const student = await db.Student.findByPk(studentId, {
        attributes: ['id', 'str_firstName', 'str_lastName']
    });
    if (!student) {
        throw new AppError('Student not found', 404);
    }

    // Fetch all completed slots for this student within the last 30 days
    const slots = await db.Slot.findAll({
        where: {
            obj_student: studentId,
            dt_date: { [Op.gte]: thirtyDaysAgo },
            str_status: slotstatus.COMPLETED // Use constant
        },
        attributes: ['id', 'obj_tutor', 'str_attendance'],
        include: [{
            model: db.Tutor,
            as: 'tutor', // Alias from Slot model association
            attributes: ['str_firstName', 'str_lastName'],
            required: false // LEFT JOIN, tutor might be null or not found
        }],
        raw: true,
        nest: true
    });

    // Manually group and aggregate slot data in JavaScript
    const tutorPerformanceMap = new Map();
    let totalSessions = 0;
    let attendedSessionsCount = 0;

    slots.forEach(slot => {
        const tutorId = slot.obj_tutor;
        const tutorName = slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : 'N/A';

        if (!tutorPerformanceMap.has(tutorId)) {
            tutorPerformanceMap.set(tutorId, {
                tutorId: tutorId,
                tutorName: tutorName,
                sessions: 0,
                attended: 0
            });
        }

        const tutorStats = tutorPerformanceMap.get(tutorId);
        tutorStats.sessions += 1;
        totalSessions += 1;

        if (slot.str_attendance === attendnace.ATTENDED) { // Use constant
            tutorStats.attended += 1;
            attendedSessionsCount += 1;
        }
    });

    const tutorPerformance = Array.from(tutorPerformanceMap.values());

    const attendanceRate = totalSessions > 0 ? (attendedSessionsCount / totalSessions * 100) : 0;

    return {
        studentId: student.id,
        studentName: `${student.str_firstName} ${student.str_lastName}`,
        totalSessions,
        attendedSessions: attendedSessionsCount,
        attendanceRate: Number(attendanceRate.toFixed(2)),
        tutorPerformance: tutorPerformance,
        period: { start: thirtyDaysAgo, end: new Date() }
    };
};
