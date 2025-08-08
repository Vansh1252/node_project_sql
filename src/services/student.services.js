const { Op } = require('sequelize');
const moment = require('moment');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sequelize, db } = require('../utils/db');
const AppError = require('../utils/AppError');
const mailer = require('../utils/mailer');
const tutorServices = require('./tutor.services');
const { roles, userStatus, status, slotstatus, paymentstatus, tables } = require('../constants/sequelizetableconstants');

// --- Centralized Helper Functions ---

// Validate UUID format
const validateUUID = (id, fieldName = 'ID') => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new AppError(`Invalid ${fieldName} format (expected UUID).`, 400);
    }
};

// Validate student existence and status
const validateStudent = async (studentId, session, requireActive = false) => {
    validateUUID(studentId, 'student ID');
    const student = await db.Student.findByPk(studentId, { transaction: session });
    if (!student) throw new AppError('Student not found.', 404);
    if (requireActive && student.str_status !== userStatus.ACTIVE) {
        throw new AppError(`Student ${student.str_firstName} is not active.`, 400);
    }
    return student;
};

// Validate tutor existence and status
const validateTutor = async (tutorId, session, includeWeeklyHours = false) => {
    validateUUID(tutorId, 'tutor ID');
    const options = { transaction: session };
    if (includeWeeklyHours) {
        options.include = [{ model: db.WeeklyHourBlock, as: 'weeklyHours' }];
    }
    const tutor = await db.Tutor.findByPk(tutorId, options);
    if (!tutor) throw new AppError('Tutor not found.', 404);
    if (tutor.str_status !== status.ACTIVE) {
        throw new AppError(`Tutor ${tutor.str_firstName} is not active.`, 400);
    }
    if (includeWeeklyHours && (!tutor.weeklyHours || tutor.weeklyHours.length === 0)) {
        throw new AppError(`Tutor ${tutor.str_firstName} has no weekly hours defined.`, 400);
    }
    return tutor;
};

// Validate unique fields (studentNumber, email, phoneNumber)
const validateUniqueFields = async ({ studentNumber, email, phoneNumber }, excludeId = null, transaction = null) => {
    const whereConditions = { [Op.or]: [] };
    if (studentNumber) whereConditions[Op.or].push({ int_studentNumber: studentNumber });
    if (email) whereConditions[Op.or].push({ str_email: email });
    if (phoneNumber) whereConditions[Op.or].push({ str_phoneNumber: phoneNumber });

    if (whereConditions[Op.or].length === 0) return;

    const where = excludeId ? { ...whereConditions, id: { [Op.ne]: excludeId } } : whereConditions;
    const existingStudent = await db.Student.findOne({ where, transaction });
    if (existingStudent) {
        if (existingStudent.int_studentNumber === studentNumber) throw new AppError('Student Number already exists', 409);
        if (existingStudent.str_email === email) throw new AppError('Email already exists', 409);
        if (existingStudent.str_phoneNumber === phoneNumber) throw new AppError('Phone Number already exists', 409);
    }
};

// Validate dates
const validateDates = (startDate, dischargeDate) => {
    if (!startDate) throw new AppError('Start Date is required.', 400);
    const startMoment = moment(startDate, 'YYYY-MM-DD', true);
    if (!startMoment.isValid()) throw new AppError('Invalid Start Date format. Use YYYY-MM-DD.', 400);
    if (dischargeDate) {
        const dischargeMoment = moment(dischargeDate, 'YYYY-MM-DD', true);
        if (!dischargeMoment.isValid()) throw new AppError('Invalid Discharge Date format. Use YYYY-MM-DD.', 400);
        if (startMoment.isAfter(dischargeMoment)) throw new AppError('Discharge Date cannot be before Start Date.', 400);
    }
};

// Convert time to minutes (consolidated _convertToMinutes and _convertToMinute)
const convertToMinutes = (timeString) => {
    if (!timeString || !/^\d{2}:\d{2}$/.test(timeString)) {
        throw new AppError(`Invalid time string format: ${timeString}. Expected HH:MM.`, 400);
    }
    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new AppError(`Invalid time value: ${timeString}.`, 400);
    }
    return hours * 60 + minutes;
};

// Calculate profits
const calculateProfits = (amount, transactionFee, tutorPayout) => {
    const netAmount = amount - transactionFee;
    const platformProfit = netAmount - tutorPayout;
    return {
        netAmount,
        profitWeek: platformProfit,
        profitMonth: platformProfit // Or adjust for package payments
    };
};

// Create student user and send email
const createStudentUserAndSendEmail = async (firstName, lastName, email, studentProfileId, transaction) => {
    const rawPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(rawPassword, 12);
    const newUser = await db.User.create({
        str_fullName: `${firstName} ${lastName}`.trim(),
        str_email: email,
        str_password: hashedPassword,
        str_role: roles.STUDENT,
        str_status: userStatus.ACTIVE,
        obj_profileId: studentProfileId,
        str_profileType: tables.STUDENT
    }, { transaction });

    await mailer.sendMail({
        to: email,
        from: process.env.EMAIL_FROM,
        subject: 'Welcome to Our Platform!',
        text: `Hello ${firstName},\n\nWelcome to our platform!\nYour email: ${email}\nTemporary Password: ${rawPassword}\n\nPlease login and consider changing your password for security.\n\nLogin URL: ${process.env.FRONTEND_URL}/login`
    });
    return newUser;
};

// Format tutor name
const formatTutorName = (tutor) => tutor ? `${tutor.str_firstName} ${tutor.str_lastName}`.trim() : 'N/A';

// Format student response (for getonestudentservice and getonewithpaginationservice)
const formatStudentResponse = (student, includeDetails = false) => {
    const baseData = {
        _id: student.id,
        studentNumber: student.int_studentNumber,
        firstName: student.str_firstName,
        lastName: student.str_lastName,
        email: student.str_email,
        status: student.str_status,
        startDate: student.dt_startDate,
        dischargeDate: student.dt_dischargeDate,
        assignedTutorName: formatTutorName(student.assignedTutor)
    };

    if (!includeDetails) return baseData;

    return {
        ...baseData,
        familyName: student.str_familyName,
        grade: student.str_grade,
        year: student.str_year,
        phoneNumber: student.str_phoneNumber,
        address: student.str_address,
        city: student.str_city,
        state: student.str_state,
        country: student.str_country,
        assignedTutor: student.assignedTutor ? student.assignedTutor.id : null,
        timezone: student.str_timezone,
        sessionDuration: student.int_sessionDuration,
        availabileTime: student.arr_availabileTime,
        referralSource: student.str_referralSource,
        meetingLink: student.str_meetingLink,
        assessments: student.assessments ? student.assessments.map(a => a.filePath) : [],
        accountCreated: student.bln_accountCreated,
        bookedSlots: student.slots ? student.slots.map(slot => ({
            id: slot.id,
            date: moment(slot.dt_date).format('YYYY-MM-DD'),
            startTime: slot.str_startTime,
            endTime: slot.str_endTime,
            status: slot.str_status,
            tutorNameForSlot: formatTutorName(slot.tutor),
            recurringPattern: slot.recurringPattern ? {
                id: slot.recurringPattern.id,
                dayOfWeek: slot.recurringPattern.str_dayOfWeek,
                startTime: slot.recurringPattern.str_startTime,
                endTime: slot.recurringPattern.str_endTime
            } : null
        })) : [],
        payoutHistory: student.paymentHistory ? student.paymentHistory.map(p => ({
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
            tutorName: formatTutorName(p.tutor)
        })) : []
    };
};

// Transaction wrapper to reduce duplication
const withTransaction = async (fn, externalSession = null) => {
    const session = externalSession || await sequelize.transaction();
    try {
        const result = await fn(session);
        if (!externalSession) await session.commit();
        return result;
    } catch (error) {
        if (!externalSession) await session.rollback();
        console.error(`Error in ${fn.name || 'service'}:`, error);
        throw error;
    }
};

// --- Service-Specific Helpers for assignTutorAndBookSlotsService ---

// Validate inputs for assignTutorAndBookSlotsService
const validateAssignTutorInputs = (studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, requestingUserId) => {
    if (!requestingUserId) throw new AppError('Unauthorized access.', 401);
    if (!Array.isArray(selectedRecurringPatterns) || selectedRecurringPatterns.length === 0) {
        throw new AppError('No recurring slot patterns provided for booking.', 400);
    }
    if (!initialPaymentForBooking) {
        throw new AppError('Payment details are required for recurring slot booking.', 400);
    }
};

// Validate recurring pattern
const validateRecurringPattern = (pattern, tutorWeeklyHours) => {
    const { dayOfWeek, startTime, endTime, durationMinutes } = pattern;
    if (!dayOfWeek || !startTime || !endTime || !durationMinutes) {
        throw new AppError('Each recurring pattern must have dayOfWeek, startTime, endTime, and durationMinutes.', 400);
    }
    const duration = parseInt(durationMinutes);
    if (isNaN(duration) || duration <= 0) {
        throw new AppError(`Invalid durationMinutes for pattern ${dayOfWeek} ${startTime}.`, 400);
    }
    const tutorDayAvailability = tutorWeeklyHours.find(d => d.str_day.toLowerCase() === dayOfWeek.toLowerCase());
    if (!tutorDayAvailability?.arr_slots.some(block => {
        const patternStartMinutes = convertToMinutes(startTime);
        const patternEndMinutes = convertToMinutes(endTime);
        return patternStartMinutes >= block.int_startMinutes && patternEndMinutes <= block.int_endMinutes;
    })) {
        throw new AppError(`Pattern ${dayOfWeek} ${startTime}-${endTime} is outside of tutor's general availability.`, 400);
    }
    return duration;
};

// Create recurring pattern
const createRecurringPattern = async (pattern, studenttutor, studentStartDate, studentDischargeDate, requestingUserId, session) => {
    const { dayOfWeek, startTime, endTime, durationMinutes } = pattern;
    return await db.RecurringBookingPattern.create({
        obj_tutor: studenttutor.tutorId,
        obj_student: studenttutor.studentId,
        dt_recurringStartDate: studentStartDate.toDate(),
        dt_recurringEndDate: studentDischargeDate.toDate(),
        str_dayOfWeek: dayOfWeek,
        str_startTime: startTime,
        str_endTime: endTime,
        int_durationMinutes: durationMinutes,
        int_startMinutes: convertToMinutes(startTime),
        int_endMinutes: convertToMinutes(endTime),
        obj_paymentId: studenttutor.obj_paymentId,
        str_status: status.ACTIVE,
        objectId_createdBy: requestingUserId,
        int_initialBatchSizeMonths: 3,
        dt_lastExtensionDate: moment().toDate()
    }, { transaction: session });
};

// Create payment record
const createPaymentRecord = async (initialPaymentForBooking, student, tutor, session) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, transactionFee, tutorPayout } = initialPaymentForBooking;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || amount === undefined || transactionFee === undefined || tutorPayout === undefined) {
        throw new AppError('Missing essential payment details for recurring slot booking.', 400);
    }
    const { netAmount, profitWeek, profitMonth } = calculateProfits(amount, transactionFee, tutorPayout);
    return await db.Payment.create({
        str_razorpayOrderId: razorpay_order_id,
        str_razorpayPaymentId: razorpay_payment_id,
        str_razorpaySignature: razorpay_signature,
        obj_studentId: student.id,
        obj_tutorId: tutor.id,
        obj_slotId: null,
        int_amount: amount,
        int_transactionFee: transactionFee,
        int_totalAmount: netAmount,
        int_tutorPayout: tutorPayout,
        int_profitWeek: profitWeek,
        int_profitMonth: profitMonth,
        str_paymentMethod: 'Razorpay',
        str_status: paymentstatus.COMPLETED
    }, { transaction: session });
};

// Book slots for a recurring pattern
const bookSlotsForPattern = async (pattern, bookedslotstudentandtutor, studentStartDate, studentDischargeDate, requestingUserId, session) => {
    const INITIAL_BOOKING_WINDOW_MONTHS = 3;
    const initialBookingCutoffDate = moment().add(INITIAL_BOOKING_WINDOW_MONTHS, 'months').endOf('day');
    let currentDayInstance = moment(studentStartDate).day(pattern.dayOfWeek);
    if (currentDayInstance.isBefore(studentStartDate, 'day')) currentDayInstance.add(1, 'week');

    const bookedSlotIds = [];
    while (currentDayInstance.isSameOrBefore(studentDischargeDate, 'day')) {
        const slotDate = currentDayInstance.startOf('day').toDate();
        if (currentDayInstance.isAfter(initialBookingCutoffDate, 'day')) break;
        if (moment(slotDate).isBefore(moment().startOf('day'), 'day')) {
            currentDayInstance.add(1, 'week');
            continue;
        }

        const createSlotPayload = [{
            tutorId: bookedslotstudentandtutor.tutorId,
            date: moment(slotDate).format('YYYY-MM-DD'),
            startTime: pattern.startTime,
            endTime: pattern.endTime,
            studentId: bookedslotstudentandtutor.studentId,
            status: slotstatus.BOOKED,
            obj_recurringPatternId: bookedslotstudentandtutor.obj_recurringPatternId,
            objectId_createdBy: requestingUserId
        }];

        const createdSlotResult = await tutorServices.createSlotService(createSlotPayload, requestingUserId, session);
        if (createdSlotResult?.data.createdSlotIds?.length > 0) {
            bookedSlotIds.push(createdSlotResult.data.createdSlotIds[0]);
        }
        currentDayInstance.add(1, 'week');
    }
    return bookedSlotIds;
};

// Assign student to tutor
const assignStudentToTutor = async (student, tutor, session) => {
    const isStudentAssigned = await tutor.hasAssignedStudent(student, { transaction: session });
    if (!isStudentAssigned) {
        await tutor.addAssignedStudent(student, { transaction: session });
    }
    await student.update({ objectId_assignedTutor: tutor.id }, { transaction: session });
};

// --- Main Service Functions ---

// Create student
exports.createstudentservice = async (studentData, requestingUserId) => {
    return withTransaction(async (session) => {
        const {
            studentNumber, firstName, lastName, familyName, grade, year, email,
            phoneNumber, address, city, state, country, startDate, dischargeDate,
            referralSource, meetingLink, accountCreated
        } = studentData;

        if (!requestingUserId) throw new AppError('Unauthorized access', 401);
        if (!email || typeof email !== 'string') throw new AppError('Invalid email format', 400);
        if (!firstName || !lastName || !studentNumber || !phoneNumber || !grade || !year || !address || !city || !state || !country || !startDate) {
            throw new AppError('Missing essential student profile fields.', 400);
        }

        await validateUniqueFields({ studentNumber, email, phoneNumber }, null, session);
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
            str_meetingLink: meetingLink || null,
            bln_accountCreated: accountCreated,
            str_status: userStatus.ACTIVE,
            objectId_createdBy: requestingUserId
        }, { transaction: session });

        if (accountCreated) {
            await createStudentUserAndSendEmail(firstName, lastName, email, newStudent.id, session);
        }

        return { statusCode: 201, message: 'Student created successfully.', studentId: newStudent.id };
    });
};

// Update student
exports.updatestudentservice = async (studentId, updateData, requestingUserId) => {
    return withTransaction(async (session) => {
        if (!requestingUserId) throw new AppError('Unauthorized access', 401);
        const student = await validateStudent(studentId, session);
        const oldAssignedTutorId = student.objectId_assignedTutor;
        const { studentNumber, email, phoneNumber, startDate, dischargeDate, assignedTutor } = updateData;

        await validateUniqueFields({ studentNumber, email, phoneNumber }, studentId, session);
        if (assignedTutor !== undefined) {
            await validateTutor(assignedTutor, session);
        }
        validateDates(startDate, dischargeDate);

        applyUpdatesToStudent(student, updateData);
        await student.save({ transaction: session });

        if (assignedTutor !== undefined && oldAssignedTutorId !== assignedTutor) {
            if (oldAssignedTutorId) {
                const oldTutor = await db.Tutor.findByPk(oldAssignedTutorId, { transaction: session });
                if (oldTutor) await oldTutor.removeAssignedStudent(student, { transaction: session });
            }
            if (assignedTutor) {
                const newTutor = await validateTutor(assignedTutor, session);
                await newTutor.addAssignedStudent(student, { transaction: session });
            }
        }

        return { statusCode: 200, message: 'Student updated successfully', data: formatStudentResponse(student, true) };
    });
};

// Get one student details
exports.getonestudentservice = async (studentId, requestingUserId) => {
    return withTransaction(async (session) => {
        if (!requestingUserId) throw new AppError('Unauthorized access', 401);
        const student = await validateStudent(studentId, session);
        const studentWithDetails = await db.Student.findByPk(studentId, {
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
            transaction: session
        });

        const paymentHistory = await db.Payment.findAll({
            where: { obj_studentId: student.id },
            include: [{ model: db.Tutor, as: 'tutor', attributes: ['str_firstName', 'str_lastName'] }],
            order: [['createdAt', 'DESC']],
            transaction: session
        });

        return { statusCode: 200, data: formatStudentResponse({ ...studentWithDetails.toJSON(), paymentHistory }, true) };
    });
};

// Get students with pagination
exports.getonewithpaginationservice = async (queryParams, userId) => {
    return withTransaction(async (session) => {
        const { page = 1, limit = 10, name = '', status: studentStatusFilter, date, tutorId } = queryParams;
        if (!userId) throw new AppError('Unauthorized access', 401);

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
            if (!filterDate.isValid()) throw new AppError('Invalid date format. Use YYYY-MM-DD.', 400);
            filter.dt_startDate = {
                [Op.gte]: filterDate.startOf('day').toDate(),
                [Op.lte]: filterDate.endOf('day').toDate()
            };
        }
        if (tutorId) {
            validateUUID(tutorId, 'tutor ID');
            filter.objectId_assignedTutor = tutorId;
        }

        const { count, rows: students } = await db.Student.findAndCountAll({
            where: filter,
            limit: itemsPerPage,
            offset: (currentPage - 1) * itemsPerPage,
            order: [['createdAt', 'DESC']],
            include: [
                { model: db.Tutor, as: 'assignedTutor', attributes: ['id', 'str_firstName', 'str_lastName'], required: false }
            ],
            transaction: session
        });

        const formattedStudents = students.map(student => formatStudentResponse(student, false));
        return {
            statusCode: 200,
            data: formattedStudents,
            currentPage,
            totalPages: Math.ceil(count / itemsPerPage),
            totalRecords: count
        };
    });
};

// Delete student
exports.deletestudentservice = async (studentId, requestingUserId) => {
    return withTransaction(async (session) => {
        if (!requestingUserId) throw new AppError('Unauthorized access', 401);
        const student = await validateStudent(studentId, session);

        await db.RefreshToken.destroy({ where: { userId: student.objectId_createdBy }, transaction: session });
        await db.Slot.destroy({ where: { obj_student: student.id }, transaction: session });
        await db.Payment.destroy({ where: { obj_studentId: student.id }, transaction: session });
        await db.RecurringBookingPattern.destroy({ where: { obj_student: student.id }, transaction: session });

        if (student.objectId_assignedTutor) {
            const oldTutor = await db.Tutor.findByPk(student.objectId_assignedTutor, { transaction: session });
            if (oldTutor) await oldTutor.removeAssignedStudent(student, { transaction: session });
        }

        const user = await db.User.findOne({
            where: { obj_profileId: student.id, str_profileType: tables.STUDENT },
            transaction: session
        });
        if (user) await user.destroy({ transaction: session });

        await student.destroy({ transaction: session });
        return { statusCode: 200, message: 'Student and associated data deleted successfully.' };
    });
};

// Status change
exports.statuschangeservice = async (studentId, newStatus, requestingUserId) => {
    return withTransaction(async (session) => {
        if (!requestingUserId) throw new AppError('Unauthorized access', 401);
        if (![userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED].includes(newStatus)) {
            throw new AppError('Invalid status value provided.', 400);
        }
        const student = await validateStudent(studentId, session);
        await student.update({ str_status: newStatus }, { transaction: session });

        if (newStatus === userStatus.INACTIVE || newStatus === userStatus.PAUSED) {
            await tutorServices.adjustTutorAvailability(student.id, session);
        }

        return { statusCode: 200, message: `Student status changed to ${newStatus} successfully.`, data: formatStudentResponse(student, true) };
    });
};

// Assign tutor and book slots
exports.assignTutorAndBookSlotsService = async (studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, requestingUserId, externalSession = null) => {
    return withTransaction(async (session) => {
        validateAssignTutorInputs(studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, requestingUserId);
        const student = await validateStudent(studentId, session, true);
        const tutor = await validateTutor(tutorId, session, true);
        await assignStudentToTutor(student, tutor, session);
        const mainPaymentRecord = await createPaymentRecord(initialPaymentForBooking, student, tutor, session);

        const studentStartDate = moment(student.dt_startDate).startOf('day');
        const studentDischargeDate = student.dt_dischargeDate ? moment(student.dt_dischargeDate).endOf('day') : moment().add(1, 'year').endOf('day');
        const createdRecurringPatternIds = [];
        const bookedSlotIds = [];

        for (const pattern of selectedRecurringPatterns) {
            validateRecurringPattern(pattern, tutor.weeklyHours);
            const studenttutor = {
                tutorId: tutor.id,
                studentId: student.id,
                obj_paymentId: mainPaymentRecord.id
            }
            const newRecurringPattern = await createRecurringPattern(pattern, studenttutor, studentStartDate, studentDischargeDate, requestingUserId, session);
            createdRecurringPatternIds.push(newRecurringPattern.id);
            const bookedslotstudentandtutor = {
                studentId: student.id,
                tutorId: tutor.id,
                obj_recurringPatternId: newRecurringPattern.id
            }
            const slotIds = await bookSlotsForPattern(pattern, bookedslotstudentandtutor, studentStartDate, studentDischargeDate, requestingUserId, session);
            bookedSlotIds.push(...slotIds);
        }

        if (bookedSlotIds.length > 0) {
            await mainPaymentRecord.update({ obj_slotId: bookedSlotIds[0] }, { transaction: session });
        }

        return {
            statusCode: 200,
            message: `Successfully booked ${bookedSlotIds.length} recurring slots across ${createdRecurringPatternIds.length} patterns for ${student.str_firstName}.`,
            data: { bookedSlotIds, totalBookedCount: bookedSlotIds.length, createdRecurringPatternIds }
        };
    }, externalSession);
};
