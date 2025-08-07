// services/student.services.js

// --- Core Imports ---
const { Op } = require('sequelize');
const { sequelize, db } = require('../utils/db');
const moment = require('moment');
const AppError = require('../utils/AppError');
const bcrypt = require('bcrypt');
const mailer = require('../utils/mailer');
const crypto = require('crypto');
const tutorServices = require('./tutor.services');


// --- Constants ---
const { roles, userStatus, status, slotstatus, paymentstatus, tables } = require('../constants/sequelizetableconstants');

// --- Helper Functions (Adjusted for Sequelize context) ---

const _convertToMinutes = (timeString) => {
    if (!timeString || !/^\d{2}:\d{2}$/.test(timeString)) {
        throw new Error(`Invalid time string format: ${timeString}. Expected HH:MM.`);
    }
    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error(`Invalid time value: ${timeString}.`);
    }
    return hours * 60 + minutes;
};
const _convertMinutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

function calculateProfits(amount, transactionFee, tutorPayout) {
    // Net amount received by the platform after payment gateway fees
    const netAmount = amount - transactionFee;

    const platformProfit = netAmount - tutorPayout;
    const profit1Week = platformProfit;
    const profit4Week = platformProfit; // Or (platformProfit / totalWeeksInPackage) * 4 for package payments

    return {
        netAmount: netAmount,
        profitWeek: profit1Week,
        profitMonth: profit4Week // Renamed to profitMonth for consistency with schema
    };
}
const validateUniqueFields = async ({ studentNumber, email, phoneNumber }, excludeId = null, transaction = null) => {
    const whereConditions = { [Op.or]: [] };
    if (studentNumber) whereConditions[Op.or].push({ int_studentNumber: studentNumber });
    if (email) whereConditions[Op.or].push({ str_email: email });
    if (phoneNumber) whereConditions[Op.or].push({ str_phoneNumber: phoneNumber });

    if (excludeId) {
        whereConditions.id = { [Op.ne]: excludeId };
    }

    if (whereConditions[Op.or].length === 0) return;

    const existingStudent = await db.Student.findOne({ where: whereConditions, transaction });
    if (existingStudent) {
        if (existingStudent.int_studentNumber === studentNumber) throw new AppError('Student Number already exists', 409);
        if (existingStudent.str_email === email) throw new AppError('Email already exists', 409);
        if (existingStudent.str_phoneNumber === phoneNumber) throw new AppError('Phone Number already exists', 409);
    }
};

// Helper: For validating assigned tutor existence
const validateAssignedTutor = async (tutorId, transaction = null) => {
    // Assuming UUID validation for Sequelize IDs
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tutorId)) throw new AppError("Invalid Tutor ID format (expected UUID).", 400);
    const tutorExists = await db.Tutor.findByPk(tutorId, { attributes: ['id'], transaction });
    if (!tutorExists) throw new AppError("Assigned tutor not found", 404);
};

// Helper: For validating dates
const validateDates = (startDate, dischargeDate) => {
    if (!startDate) throw new AppError("Start Date is required.", 400);
    const startMoment = moment(startDate, 'YYYY-MM-DD', true);
    if (!startMoment.isValid()) throw new AppError("Invalid Start Date format. Use YYYY-MM-DD.", 400);

    if (dischargeDate) {
        const dischargeMoment = moment(dischargeDate, 'YYYY-MM-DD', true);
        if (!dischargeMoment.isValid()) throw new AppError("Invalid Discharge Date format. Use YYYY-MM-DD.", 400);
        if (startMoment.isAfter(dischargeMoment)) throw new AppError("Discharge Date cannot be before Start Date.", 400);
    }
};

// Helper: For creating student user account and sending email
// Ensure this helper takes 'transaction' parameter if it performs DB operations
const createStudentUserAndSendEmail = async (firstName, lastName, email, studentProfileId, transaction) => {
    const rawPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    const newUser = await db.User.create({
        str_fullName: `${firstName} ${lastName}`,
        str_email: email,
        str_password: hashedPassword,
        str_role: roles.STUDENT,
        str_status: userStatus.ACTIVE,
        obj_profileId: studentProfileId,
        str_profileType: tables.STUDENT,
    }, { transaction });

    await mailer.sendMail({
        to: email,
        from: process.env.EMAIL_FROM,
        subject: 'Welcome to Our Platform!',
        text: `Hello ${firstName},\n\nWelcome to our platform!\nYour email: ${email}\nTemporary Password: ${rawPassword}\n\nPlease login and consider changing your password for security.\n\nLogin URL: ${process.env.FRONTEND_URL}/login`
    });
    return newUser;
};

// Helper: For applying updates to student document (used in updateStudentService)
// Ensure this helper updates fields of the Sequelize instance directly (studentInstance.set(fields))
const applyUpdatesToStudent = (studentInstance, updateFields) => {
    const {
        studentNumber, firstName, lastName, familyName, grade, year, email,
        phoneNumber, address, city, state, country, startDate, dischargeDate,
        assignedTutor, timezone, sessionDuration, availabileTime, str_status,
        referralSource, meetingLink, accountCreated
    } = updateFields;

    const fieldsToUpdate = {};
    if (studentNumber !== undefined) fieldsToUpdate.int_studentNumber = studentNumber;
    if (firstName !== undefined) fieldsToUpdate.str_firstName = firstName;
    if (lastName !== undefined) fieldsToUpdate.str_lastName = lastName;
    if (familyName !== undefined) fieldsToUpdate.str_familyName = familyName;
    if (grade !== undefined) fieldsToUpdate.str_grade = grade;
    if (year !== undefined) fieldsToUpdate.str_year = year;
    if (email !== undefined) fieldsToUpdate.str_email = email;
    if (phoneNumber !== undefined) fieldsToUpdate.str_phoneNumber = phoneNumber;
    if (address !== undefined) fieldsToUpdate.str_address = address;
    if (city !== undefined) fieldsToUpdate.str_city = city;
    if (state !== undefined) fieldsToUpdate.str_state = state;
    if (country !== undefined) fieldsToUpdate.str_country = country;
    if (startDate !== undefined) fieldsToUpdate.dt_startDate = moment(startDate).startOf('day').toDate();
    if (dischargeDate !== undefined) fieldsToUpdate.dt_dischargeDate = dischargeDate ? moment(dischargeDate).endOf('day').toDate() : null;
    if (assignedTutor !== undefined) fieldsToUpdate.objectId_assignedTutor = assignedTutor; // Handle null assignment
    if (timezone !== undefined) fieldsToUpdate.str_timezone = timezone;
    if (sessionDuration !== undefined) fieldsToUpdate.int_sessionDuration = sessionDuration;
    if (availabileTime !== undefined) fieldsToUpdate.arr_availabileTime = availabileTime; // Assuming this is directly assignable
    if (referralSource !== undefined) fieldsToUpdate.str_referralSource = referralSource;
    if (meetingLink !== undefined) fieldsToUpdate.str_meetingLink = meetingLink;
    if (accountCreated !== undefined) fieldsToUpdate.bln_accountCreated = accountCreated;
    if (str_status && [userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED].includes(str_status)) {
        fieldsToUpdate.str_status = str_status;
    }
    studentInstance.set(fieldsToUpdate); // Update the Sequelize instance in memory
};


// Main Service Functions (Converted to Sequelize)

// CREATE STUDENT (initial profile only)
exports.createstudentservice = async (studentData, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        const {
            studentNumber, firstName, lastName, familyName, grade, year, email,
            phoneNumber, address, city, state, country, startDate, dischargeDate,
            referralSource, meetingLink, accountCreated,
        } = studentData;

        if (!requestingUserId) throw new AppError("Unauthorized access", 401);
        if (!email || typeof email !== 'string') throw new AppError('Invalid email format', 400);
        if (!firstName || !lastName || !studentNumber || !phoneNumber || !grade || !year || !address || !city || !state || !country || !startDate) {
            throw new AppError("Missing essential student profile fields.", 400);
        }
        await validateUniqueFields({ studentNumber, email, phoneNumber }, null, transaction);
        validateDates(startDate, dischargeDate);

        const newStudent = await db.Student.create({
            int_studentNumber: studentNumber,
            str_firstName: firstName,
            str_lastName: lastName,
            str_familyName: familyName,
            str_grade: grade,
            str_year: year,
            str_email: email,
            str_phoneNumber: phoneNumber,
            str_address: address,
            str_city: city,
            str_state: state,
            str_country: country,
            dt_startDate: moment(startDate).startOf('day').toDate(),
            dt_dischargeDate: dischargeDate ? moment(dischargeDate).endOf('day').toDate() : null,
            str_referralSource: referralSource || null,
            str_meetingLink: meetingLink || null,// Ensure this matches model type if not an association
            bln_accountCreated: accountCreated,
            str_status: userStatus.ACTIVE,
            objectId_createdBy: requestingUserId // Should link to User ID
        }, { transaction });

        if (accountCreated) {
            await createStudentUserAndSendEmail(firstName, lastName, email, newStudent.id, transaction);
        }

        await transaction.commit();
        return { statusCode: 201, message: "Student created successfully.", studentId: newStudent.id };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in createstudentservice:", error);
        throw error;
    }
};

// UPDATE STUDENT
exports.updatestudentservice = async (studentId, updateData, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access", 401);

        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) throw new AppError("Student not found", 404);

        const oldAssignedTutorId = student.objectId_assignedTutor;

        const {
            studentNumber, firstName, lastName, familyName, grade, year, email,
            phoneNumber, address, city, state, country, startDate, dischargeDate,
            assignedTutor, timezone, sessionDuration, availabileTime, str_status,
            referralSource, meetingLink, accountCreated
        } = updateData;

        await validateUniqueFields({ studentNumber, email, phoneNumber }, studentId, transaction);
        if (assignedTutor !== undefined) {
            await validateAssignedTutor(assignedTutor, transaction);
        }
        validateDates(startDate, dischargeDate);

        const fieldsToUpdate = {};
        if (studentNumber !== undefined) fieldsToUpdate.int_studentNumber = studentNumber;
        if (firstName !== undefined) fieldsToUpdate.str_firstName = firstName;
        if (lastName !== undefined) fieldsToUpdate.str_lastName = lastName;
        if (familyName !== undefined) fieldsToUpdate.str_familyName = familyName;
        if (grade !== undefined) fieldsToUpdate.str_grade = grade;
        if (year !== undefined) fieldsToUpdate.str_year = year;
        if (email !== undefined) fieldsToUpdate.str_email = email;
        if (phoneNumber !== undefined) fieldsToUpdate.str_phoneNumber = phoneNumber;
        if (address !== undefined) fieldsToUpdate.str_address = address;
        if (city !== undefined) fieldsToUpdate.str_city = city;
        if (state !== undefined) fieldsToUpdate.str_state = state;
        if (country !== undefined) fieldsToUpdate.str_country = country;
        if (startDate !== undefined) fieldsToUpdate.dt_startDate = moment(startDate).startOf('day').toDate();
        if (dischargeDate !== undefined) fieldsToUpdate.dt_dischargeDate = dischargeDate ? moment(dischargeDate).endOf('day').toDate() : null;
        if (assignedTutor !== undefined) fieldsToUpdate.objectId_assignedTutor = assignedTutor;
        if (timezone !== undefined) fieldsToUpdate.str_timezone = timezone;
        if (sessionDuration !== undefined) fieldsToUpdate.int_sessionDuration = sessionDuration;
        if (availabileTime !== undefined) fieldsToUpdate.arr_availabileTime = availabileTime; // Assuming direct assign
        if (referralSource !== undefined) fieldsToUpdate.str_referralSource = referralSource;
        if (meetingLink !== undefined) fieldsToUpdate.str_meetingLink = meetingLink;
        if (accountCreated !== undefined) fieldsToUpdate.bln_accountCreated = accountCreated;
        if (str_status && [userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED].includes(str_status)) {
            fieldsToUpdate.str_status = str_status;
        }

        await student.update(fieldsToUpdate, { transaction });

        // Handle tutor assignment/unassignment changes
        // Assuming 'assignedStudents' is the alias for Tutor.hasMany(Student)
        if (assignedTutor !== undefined && (!student.objectId_assignedTutor || student.objectId_assignedTutor !== assignedTutor)) {
            // If student was previously assigned to a different tutor, remove from old tutor's assignedStudents
            if (oldAssignedTutorId) {
                const oldTutor = await db.Tutor.findByPk(oldAssignedTutorId, { transaction });
                if (oldTutor) {
                    await oldTutor.removeAssignedStudent(student, { transaction }); // Use Sequelize association method
                }
            }
            // Assign student to new tutor (if a new tutor ID is provided and is not null)
            if (assignedTutor) {
                const newTutor = await db.Tutor.findByPk(assignedTutor, { transaction });
                if (newTutor) {
                    await newTutor.addAssignedStudent(student, { transaction }); // Use Sequelize association method
                }
            }
        }

        await transaction.commit();
        return { statusCode: 200, message: "Student updated successfully", data: student.toJSON() };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in updatestudentservice:", error);
        throw error;
    }
};

// GET ONE STUDENT DETAILS
exports.getonestudentservice = async (studentId, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access", 401);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) throw new AppError('Invalid student ID format', 400);

        const student = await db.Student.findByPk(studentId, {
            include: [
                { model: db.Tutor, as: 'assignedTutor', attributes: ['id', 'str_firstName', 'str_lastName'], required: false },
                {
                    model: db.Slot,
                    as: 'slots',
                    include: [
                        { model: db.Tutor, as: 'tutor', attributes: ['id', 'str_firstName', 'str_lastName'] },
                        { model: db.RecurringBookingPattern, as: 'recurringPattern', attributes: ['id', 'str_dayOfWeek', 'str_startTime', 'str_endTime'] }
                    ],
                    required: false
                }
            ],
            transaction
        });

        if (!student) throw new AppError("Student not found", 404);

        const paymentHistory = await db.Payment.findAll({
            where: { obj_studentId: student.id },
            include: [{ model: db.Tutor, as: 'tutor', attributes: ['str_firstName', 'str_lastName'] }],
            order: [['createdAt', 'DESC']],
            transaction
        });

        const data = {
            id: student.id,
            studentNumber: student.int_studentNumber,
            firstName: student.str_firstName,
            lastName: student.str_lastName,
            familyName: student.str_familyName,
            grade: student.str_grade,
            year: student.str_year,
            email: student.str_email,
            phoneNumber: student.str_phoneNumber,
            address: student.str_address,
            city: student.str_city,
            state: student.str_state,
            country: student.str_country,
            startDate: student.dt_startDate,
            dischargeDate: student.dt_dischargeDate,
            assignedTutor: student.assignedTutor ? student.assignedTutor.id : null,
            assignedTutorName: student.assignedTutor ? `${student.assignedTutor.str_firstName} ${student.assignedTutor.str_lastName}`.trim() : null,
            timezone: student.str_timezone,
            sessionDuration: student.int_sessionDuration,
            availabileTime: student.arr_availabileTime,
            referralSource: student.str_referralSource,
            meetingLink: student.str_meetingLink,
            assessments: student.assessments ? student.assessments.map(a => a.filePath) : [], // If Assessment model re-added
            accountCreated: student.bln_accountCreated,
            status: student.str_status,
            bookedSlots: student.slots ? student.slots.map(slot => ({
                id: slot.id,
                date: moment(slot.dt_date).format('YYYY-MM-DD'),
                startTime: slot.str_startTime,
                endTime: slot.str_endTime,
                status: slot.str_status,
                tutorNameForSlot: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}`.trim() : 'N/A',
                recurringPattern: slot.recurringPattern ? {
                    id: slot.recurringPattern.id,
                    dayOfWeek: slot.recurringPattern.str_dayOfWeek,
                    startTime: slot.recurringPattern.str_startTime,
                    endTime: slot.recurringPattern.str_endTime
                } : null
            })) : [],
            payoutHistory: paymentHistory.map(p => ({
                id: p.id,
                razorpayOrderId: p.str_razorpayOrderId,
                razorpayPaymentId: p.str_razorpayPaymentId,
                amount: p.int_amount,
                transactionFee: p.int_transactionFee,
                totalAmount: p.int_totalAmount,
                tutorPayout: p.int_tutorPayout,
                profitWeek: p.int_profitWeek,
                profitMonth: p.int_profitMonth,
                paymentMethod: p.str_paymentMethod,
                status: p.str_status,
                createdAt: p.createdAt,
                tutorName: p.tutor ? `${p.tutor.str_firstName} ${p.tutor.str_lastName}` : 'N/A'
            }))
        };

        await transaction.commit();
        return { statusCode: 200, data };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in getonestudentservice:", error);
        throw new AppError(`Failed to load student details: ${error.message}`, 500);
    };
}

// GET STUDENTS WITH PAGINATION
exports.getonewithpaginationservice = async (queryParams, userId) => {
    const transaction = await sequelize.transaction();
    try {
        const { page = 1, limit = 10, name = '', status: studentStatusFilter, date, tutorId } = queryParams;

        if (!userId) throw new AppError("Unauthorized access", 401);

        const currentPage = parseInt(page);
        const itemsPerPage = parseInt(limit);
        const filter = {};

        if (name && typeof name === 'string') {
            filter[Op.or] = [
                { str_firstName: { [Op.like]: `%${name}%` } },
                { str_lastName: { [Op.like]: `%${name}%` } },
                { str_email: { [Op.like]: `%${name}%` } }
            ];
        }
        if (studentStatusFilter && [userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED].includes(studentStatusFilter)) {
            filter.str_status = studentStatusFilter;
        }

        if (date) {
            const filterDate = moment(date, 'YYYY-MM-DD', true);
            if (!filterDate.isValid()) throw new AppError("Invalid date format. Use YYYY-MM-DD.", 400);
            filter.dt_startDate = {
                [Op.gte]: filterDate.startOf('day').toDate(),
                [Op.lte]: filterDate.endOf('day').toDate()
            };
        }
        if (tutorId) {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tutorId)) throw new AppError("Invalid Tutor ID format (expected UUID).", 400);
            filter.objectId_assignedTutor = tutorId;
        }

        const { count, rows: students } = await db.Student.findAndCountAll({
            where: filter,
            limit: itemsPerPage,
            offset: (currentPage - 1) * itemsPerPage,
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: db.Tutor,
                    as: 'assignedTutor',
                    attributes: ['id', 'str_firstName', 'str_lastName'],
                    required: false
                }
            ],
            transaction
        });

        const formattedStudents = students.map(student => ({
            _id: student.id,
            studentNumber: student.int_studentNumber,
            firstName: student.str_firstName,
            lastName: student.str_lastName,
            email: student.str_email,
            status: student.str_status,
            startDate: student.dt_startDate,
            dischargeDate: student.dt_dischargeDate,
            assignedTutorName: student.assignedTutor
                ? `${student.assignedTutor.str_firstName} ${student.assignedTutor.str_lastName}`.trim()
                : 'Not Assigned',
        }));

        await transaction.commit();
        return {
            statusCode: 200,
            data: formattedStudents,
            currentPage,
            totalPages: Math.ceil(count / itemsPerPage),
            totalRecords: count
        };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in getonewithpaginationservice:", error);
        throw new AppError(`Failed to fetch students: ${error.message}`, 500);
    };
}

// DELETE STUDENT
exports.deletestudentservice = async (studentId, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access", 401);

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
            throw new AppError("Invalid student ID format (expected UUID).", 400);
        }

        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) throw new AppError("Student not found", 404);

        await db.RefreshToken.destroy({ where: { userId: student.objectId_createdBy }, transaction });
        await db.Slot.destroy({ where: { obj_student: student.id }, transaction });
        await db.Payment.destroy({ where: { obj_studentId: student.id }, transaction });
        await db.RecurringBookingPattern.destroy({ where: { obj_student: student.id }, transaction });

        if (student.objectId_assignedTutor) {
            const oldTutor = await db.Tutor.findByPk(student.objectId_assignedTutor, { transaction });
            if (oldTutor) {
                await oldTutor.removeAssignedStudent(student, { transaction });
            }
        }

        await student.destroy({ transaction });

        const user = await db.User.findOne({
            where: { obj_profileId: student.id, str_profileType: tables.STUDENT },
            transaction
        });
        if (user) {
            await user.destroy({ transaction });
        }

        await transaction.commit();
        return { statusCode: 200, message: "Student and associated data deleted successfully." };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in deletestudentservice:", error);
        throw error;
    };
}

// STATUS CHANGE
exports.statuschangeservice = async (studentId, newStatus, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access", 401);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
            throw new AppError("Invalid student ID format (expected UUID).", 400);
        }
        if (![userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED].includes(newStatus)) throw new AppError("Invalid status value provided.", 400);

        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) throw new AppError("Student not found", 404);

        await student.update({ str_status: newStatus }, { transaction });

        // Call adjustTutorAvailability if student goes inactive or paused
        if (newStatus === userStatus.INACTIVE || newStatus === userStatus.PAUSED) {
            await tutorServices.adjustTutorAvailability(student.id, transaction);
        }

        await transaction.commit();
        return { statusCode: 200, message: `Student status changed to ${newStatus} successfully.`, data: student.toJSON() };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in statuschangeservice:", error);
        throw error;
    };
}


// ASSIGN TUTOR AND BOOK SLOTS
exports.assignTutorAndBookSlotsService = async (studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, requestingUserId, externalSession = null) => {
    const transaction = externalSession || await sequelize.transaction();
    const session = transaction || externalSession;
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access.", 401);
        if (!Array.isArray(selectedRecurringPatterns) || selectedRecurringPatterns.length === 0) {
            throw new AppError("No recurring slot patterns provided for booking.", 400);
        }
        if (!initialPaymentForBooking) {
            throw new AppError("Payment details are required for recurring slot booking.", 400);
        }

        const student = await db.Student.findByPk(studentId, { transaction: session });
        if (!student) throw new AppError("Student not found.", 404);
        if (student.str_status !== userStatus.ACTIVE) throw new AppError(`Student ${student.str_firstName} is not active and cannot be assigned sessions.`, 400);

        const tutor = await db.Tutor.findByPk(tutorId, {
            include: [{ model: db.WeeklyHourBlock, as: 'weeklyHours' }],
            transaction: session
        });
        if (!tutor) throw new AppError("Tutor not found.", 404);
        if (tutor.str_status !== status.ACTIVE) throw new AppError(`Tutor ${tutor.str_firstName} is not active and cannot be assigned sessions.`, 400);
        if (!tutor.weeklyHours || tutor.weeklyHours.length === 0) {
            throw new AppError(`Tutor ${tutor.str_firstName} has no weekly hours defined. Cannot book recurring slots.`, 400);
        }

        const studentStartDate = moment(student.dt_startDate).startOf('day');
        const studentDischargeDate = student.dt_dischargeDate ? moment(student.dt_dischargeDate).endOf('day') : moment().add(1, 'year').endOf('day');

        const oldAssignedTutorId = student.objectId_assignedTutor;
        if (oldAssignedTutorId && oldAssignedTutorId !== tutorId) { // Direct comparison for UUID strings
            const oldTutor = await db.Tutor.findByPk(oldAssignedTutorId, { transaction: session });
        }
        // Assign student to new tutor (use Sequelize association methods)
        // Check if student is already associated with this tutor to prevent redundant association adds
        const isStudentAssignedToTutor = await tutor.hasAssignedStudent(student, { transaction: session }); // Check if student is already in assignedStudents
        if (!isStudentAssignedToTutor) {
            await tutor.addAssignedStudent(student, { transaction: session });
        }
        await student.update({ objectId_assignedTutor: tutorId }, { transaction: session });


        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, transactionFee, tutorPayout } = initialPaymentForBooking;
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || amount === undefined || transactionFee === undefined || tutorPayout === undefined) {
            throw new AppError('Missing essential payment details for recurring slot booking.', 400);
        }
        const { netAmount, profitWeek, profitMonth } = calculateProfits(amount, transactionFee, tutorPayout);

        const mainPaymentRecord = await db.Payment.create({
            str_razorpayOrderId: razorpay_order_id, str_razorpayPaymentId: razorpay_payment_id,
            str_razorpaySignature: razorpay_signature, obj_studentId: student.id, obj_tutorId: tutor.id,
            obj_slotId: null, int_amount: amount, int_transactionFee: transactionFee, int_totalAmount: netAmount,
            int_tutorPayout: tutorPayout, int_profitWeek: profitWeek, int_profitMonth: profitMonth,
            str_paymentMethod: 'Razorpay', str_status: paymentstatus.COMPLETED
        }, { transaction: session });


        const createdRecurringPatternIds = [];
        const bookedSlotIds = [];

        for (const pattern of selectedRecurringPatterns) {
            const { dayOfWeek, startTime, endTime, durationMinutes } = pattern;
            if (!dayOfWeek || !startTime || !endTime || !durationMinutes) throw new AppError("Each recurring pattern must have dayOfWeek, startTime, endTime, and durationMinutes.", 400);
            const duration = parseInt(durationMinutes);
            if (isNaN(duration) || duration <= 0) throw new AppError(`Invalid durationMinutes for pattern ${dayOfWeek} ${startTime}.`, 400);

            const tutorDayAvailability = tutorWeeklyHours.find(d => d.str_day.toLowerCase() === dayOfWeek.toLowerCase());
            if (!tutorDayAvailability?.arr_slots.some(block => {
                const patternStartMinutes = _convertToMinutes(startTime);
                const patternEndMinutes = _convertToMinutes(endTime);
                return patternStartMinutes >= block.int_startMinutes && patternEndMinutes <= block.int_endMinutes;
            })) {
                throw new AppError(`Pattern ${dayOfWeek} ${startTime}-${endTime} is outside of tutor's general availability.`, 400);
            }

            const newRecurringPattern = await db.RecurringBookingPattern.create({
                obj_tutor: tutor.id, obj_student: student.id, dt_recurringStartDate: studentStartDate.toDate(),
                dt_recurringEndDate: studentDischargeDate.toDate(), str_dayOfWeek: dayOfWeek, str_startTime: startTime, str_endTime: endTime,
                int_durationMinutes: duration, int_startMinutes: _convertToMinutes(startTime), int_endMinutes: _convertToMinutes(endTime),
                obj_paymentId: mainPaymentRecord.id, str_status: status.ACTIVE, objectId_createdBy: requestingUserId,
                int_initialBatchSizeMonths: 3, dt_lastExtensionDate: moment().toDate(),
            }, { transaction: session });
            createdRecurringPatternIds.push(newRecurringPattern.id);


            const INITIAL_BOOKING_WINDOW_MONTHS = 3;
            const initialBookingCutoffDate = moment().add(INITIAL_BOOKING_WINDOW_MONTHS, 'months').endOf('day');
            let currentDayInstance = moment(studentStartDate).day(dayOfWeek);
            if (currentDayInstance.isBefore(studentStartDate, 'day')) currentDayInstance.add(1, 'week');

            while (currentDayInstance.isSameOrBefore(studentDischargeDate, 'day')) {
                const slotDate = currentDayInstance.startOf('day').toDate();
                if (currentDayInstance.isAfter(initialBookingCutoffDate, 'day')) break;
                if (moment(slotDate).isBefore(moment().startOf('day'), 'day')) { currentDayInstance.add(1, 'week'); continue; }

                const createSlotPayload = [{
                    tutorId: tutor.id, date: moment(slotDate).format('YYYY-MM-DD'),
                    startTime: startTime, endTime: endTime,
                    studentId: student.id, status: slotstatus.BOOKED,
                    obj_recurringPatternId: newRecurringPattern.id // Link to parent pattern
                }];

                const createdSlotResult = await slotService.createSlotService(createSlotPayload, requestingUserId, session);
                if (createdSlotResult?.data.createdSlotIds && createdSlotResult?.data.createdSlotIds.length > 0) {
                    bookedSlotIds.push(createdSlotResult.data.createdSlotIds[0]);
                }
                currentDayInstance.add(1, 'week');
            }
        }
        if (mainPaymentRecord.obj_slotId === null && bookedSlotIds.length > 0) {
            await mainPaymentRecord.update({ obj_slotId: bookedSlotIds[0] }, { transaction: session });
        }

        await session.commit();
        return { statusCode: 200, message: `Successfully booked ${bookedSlotIds.length} recurring slots across ${createdRecurringPatternIds.length} patterns for ${student.str_firstName}.`, data: { bookedSlotIds, totalBookedCount: bookedSlotIds.length, createdRecurringPatternIds } };

    } catch (error) {
        await session.rollback();
        console.error("Error in assignTutorAndBookSlotsService:", error);
        throw error;
    }
};

