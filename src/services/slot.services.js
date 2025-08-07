
const { Op } = require('sequelize');
const moment = require('moment');
const { sequelize, db } = require('../utils/db');
const AppError = require('../utils/AppError');
const razorpay = require('../utils/razerpaysetup');
const { tables, status, slotstatus, userStatus, paymentstatus } = require('../constants/sequelizetableconstants');
const tutorServices = require('./tutor.services');

// --- Centralized Utilities ---

// Time Utility
const timeUtils = {
    validateTimeString(timeString) {
        if (!timeString || !/^\d{2}:\d{2}$/.test(String(timeString))) {
            throw new AppError(`Invalid time string format: ${timeString}. Expected HH:MM.`, 400);
        }
        const [hours, minutes] = String(timeString).split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            throw new AppError(`Invalid time value: ${timeString}.`, 400);
        }
        return { hours, minutes };
    },
    convertToMinutes(timeString) {
        const { hours, minutes } = this.validateTimeString(timeString);
        return hours * 60 + minutes;
    },
    convertMinutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    },
    validateTimeRange(startTime, endTime) {
        const startMinutes = this.convertToMinutes(startTime);
        const endMinutes = this.convertToMinutes(endTime);
        if (startMinutes >= endMinutes) throw new AppError('Slot end time must be after start time.', 400);
        return { startMinutes, endMinutes };
    }
};

// Validation Utility
const validateUUID = (id, fieldName = 'ID') => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new AppError(`Invalid ${fieldName} format (expected UUID).`, 400);
    }
};

const validateStudent = async (studentId, transaction, requireActive = false) => {
    if (!studentId) return null;
    validateUUID(studentId, 'Student ID');
    const student = await db.Student.findByPk(studentId, { transaction });
    if (!student) throw new AppError(`Student with ID ${studentId} not found.`, 404);
    if (requireActive && student.str_status !== userStatus.ACTIVE) {
        throw new AppError(`Student ${student.str_firstName} is not active.`, 400);
    }
    return student;
};

const validateTutor = async (tutorId, transaction, options = {}) => {
    validateUUID(tutorId, 'Tutor ID');
    const include = options.includeWeeklyHours ? [{ model: db.WeeklyHourBlock, as: 'weeklyHours' }] : [];
    const tutor = await db.Tutor.findByPk(tutorId, { include, transaction });
    if (!tutor) throw new AppError(`Tutor with ID ${tutorId} not found.`, 404);
    if (tutor.str_status !== status.ACTIVE) {
        throw new AppError(`Tutor ${tutor.str_firstName} is not active.`, 400);
    }
    if (options.includeWeeklyHours && (!tutor.weeklyHours || tutor.weeklyHours.length === 0)) {
        throw new AppError(`Tutor ${tutor.str_firstName} has no weekly hours defined.`, 400);
    }
    return tutor;
};

const validateRecurringPatterns = (patterns, context = 'booking') => {
    if (!Array.isArray(patterns) || patterns.length === 0) {
        throw new AppError(`No recurring slot patterns provided for ${context}.`, 400);
    }
    patterns.forEach(({ dayOfWeek, startTime, endTime, durationMinutes }) => {
        if (!dayOfWeek || !startTime || !endTime || !durationMinutes) {
            throw new AppError('Each recurring pattern must have dayOfWeek, startTime, endTime, and durationMinutes.', 400);
        }
        const duration = parseInt(durationMinutes);
        if (isNaN(duration) || duration <= 0) {
            throw new AppError(`Invalid durationMinutes for pattern ${dayOfWeek} ${startTime}.`, 400);
        }
        timeUtils.validateTimeRange(startTime, endTime);
    });
};

// Transaction Utility
const withTransaction = async (fn, externalTransaction = null) => {
    const transaction = externalTransaction || await sequelize.transaction();
    try {
        const result = await fn(transaction);
        if (!externalTransaction) await transaction.commit();
        return result;
    } catch (error) {
        if (!externalTransaction) await transaction.rollback();
        console.error(`Error in ${fn.name || 'service'}:`, error.message);
        throw error;
    } finally {
        if (!externalTransaction) await transaction.end();
    }
};

// Recurring Pattern Utility
const processRecurringPattern = (pattern, startDate, endDate, callback) => {
    const { dayOfWeek } = pattern;
    let currentDayInstance = moment(startDate).day(dayOfWeek);
    if (currentDayInstance.isBefore(startDate, 'day')) currentDayInstance.add(1, 'week');
    const results = [];

    while (currentDayInstance.isSameOrBefore(endDate, 'day')) {
        const slotDate = currentDayInstance.startOf('day');
        if (slotDate.isSameOrAfter(moment().startOf('day'), 'day')) {
            const result = callback(slotDate, currentDayInstance);
            if (result) results.push(result);
        }
        currentDayInstance.add(1, 'week');
    }
    return results;
};

// --- Shared Helpers ---

const checkSlotConflict = async (tutorId, studentId, slotDate, startMinutes, endMinutes, excludeSlotId = null, transaction = null) => {
    const normalizedDate = moment(slotDate).startOf('day').toDate();
    const where = {
        dt_date: normalizedDate,
        str_status: { [Op.in]: [slotstatus.BOOKED, slotstatus.COMPLETED] },
        [Op.or]: [
            { obj_tutor: tutorId },
            ...(studentId ? [{ obj_student: studentId }] : [])
        ],
        int_startMinutes: { [Op.lt]: endMinutes },
        int_endMinutes: { [Op.gt]: startMinutes }
    };
    if (excludeSlotId) where.id = { [Op.ne]: excludeSlotId };
    const conflictingSlot = await db.Slot.findOne({ where, transaction });
    if (conflictingSlot) {
        throw new AppError(`Time conflict: Slot on ${moment(slotDate).format('YYYY-MM-DD')} overlaps with existing sessions.`, 409);
    }
};

const calculateProfits = (amount, transactionFee, tutorPayout) => {
    const netAmount = amount - transactionFee;
    const platformProfit = netAmount - tutorPayout;
    return { netAmount, profitWeek: platformProfit, profitMonth: platformProfit };
};

// --- createSlotService Helpers ---

const validateSlotData = ({ tutorId, date, startTime, endTime, studentId, obj_recurringPatternId }) => {
    validateUUID(tutorId, 'Tutor ID');
    if (!date || !startTime || !endTime) throw new AppError('Missing required fields for slot creation.', 400);
    if (studentId) validateUUID(studentId, 'Student ID');
    if (obj_recurringPatternId) validateUUID(obj_recurringPatternId, 'Recurring Pattern ID');
};

const createSlot = async (slotData, requestingUserId, transaction) => {
    const { tutorId, date, startTime, endTime, studentId, status = slotstatus.AVAILABLE, obj_recurringPatternId = null } = slotData;
    const slotDate = moment(date).startOf('day').toDate();
    const { startMinutes, endMinutes } = timeUtils.validateTimeRange(startTime, endTime);

    await validateTutor(tutorId, transaction);
    await validateStudent(studentId, transaction);
    await checkSlotConflict(tutorId, studentId, slotDate, startMinutes, endMinutes, null, transaction);

    const newSlot = await db.Slot.create({
        obj_tutor: tutorId,
        obj_student: studentId || null,
        obj_recurringPatternId: obj_recurringPatternId || null,
        dt_date: slotDate,
        str_startTime: startTime,
        str_endTime: endTime,
        int_startMinutes: startMinutes,
        int_endMinutes: endMinutes,
        str_status: status,
        objectId_createdBy: requestingUserId
    }, { transaction });
    return newSlot.id;
};

// --- getGeneratedAvailableSlotsService Helpers ---

const generatePotentialSlots = (weeklyHourBlock, date, durationMinutes) => {
    const potentialSlots = [];
    let currentStartMinutes = weeklyHourBlock.int_startMinutes;
    while (currentStartMinutes + durationMinutes <= weeklyHourBlock.int_endMinutes) {
        const currentEndMinutes = currentStartMinutes + durationMinutes;
        potentialSlots.push({
            date: moment(date).format('YYYY-MM-DD'),
            startTime: timeUtils.convertMinutesToTime(currentStartMinutes),
            endTime: timeUtils.convertMinutesToTime(currentEndMinutes),
            startMinutes: currentStartMinutes,
            endMinutes: currentEndMinutes
        });
        currentStartMinutes += durationMinutes;
    }
    return potentialSlots;
};

const fetchBookedSlots = async (tutorId, studentId, startMoment, endMoment, transaction) => {
    const slots = await db.Slot.findAll({
        where: {
            [Op.or]: [{ obj_tutor: tutorId }, { obj_student: studentId }],
            dt_date: { [Op.gte]: startMoment.toDate(), [Op.lte]: endMoment.toDate() },
            str_status: { [Op.in]: [slotstatus.BOOKED, slotstatus.COMPLETED] }
        },
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'int_startMinutes', 'int_endMinutes', 'str_status', 'obj_tutor', 'obj_student'],
        transaction
    });
    const bookedSlotsByDateMap = new Map();
    slots.forEach(slot => {
        const dateKey = moment(slot.dt_date).startOf('day').toDate().getTime();
        if (!bookedSlotsByDateMap.has(dateKey)) bookedSlotsByDateMap.set(dateKey, []);
        bookedSlotsByDateMap.get(dateKey).push(slot);
    });
    return bookedSlotsByDateMap;
};

const createSlotTemplate = (dayName, pSlot, tutor) => ({
    dayOfWeek: dayName,
    startTime: pSlot.startTime,
    endTime: pSlot.endTime,
    status: slotstatus.AVAILABLE,
    tutorId: tutor.id,
    tutorName: `${tutor.str_firstName} ${tutor.str_lastName}`.trim(),
    conflictDetails: []
});

const checkSlotInstance = (pSlot, currentCheckDay, bookedSlotsByDateMap, today) => {
    const checkDateNormalized = currentCheckDay.startOf('day').toDate();
    const checkDateFormatted = currentCheckDay.format('YYYY-MM-DD');
    const dateKey = checkDateNormalized.getTime();
    const bookedSlotsOnThisDate = bookedSlotsByDateMap.get(dateKey) || [];

    let instanceIsPast = false;
    let conflict = null;

    if (currentCheckDay.isSame(today, 'day') && pSlot.endMinutes <= timeUtils.convertToMinutes(moment().format('HH:mm'))) {
        instanceIsPast = true;
        conflict = { date: checkDateFormatted, status: slotstatus.COMPLETED, reason: 'In the past today' };
    } else if (currentCheckDay.isBefore(today, 'day')) {
        instanceIsPast = true;
        conflict = { date: checkDateFormatted, status: slotstatus.COMPLETED, reason: 'In the past' };
    } else {
        for (const bSlot of bookedSlotsOnThisDate) {
            if (pSlot.startMinutes < bSlot.int_endMinutes && pSlot.endMinutes > bSlot.int_startMinutes) {
                conflict = {
                    date: checkDateFormatted,
                    status: bSlot.str_status,
                    slotId: bSlot.id,
                    bookedByTutorId: bSlot.obj_tutor,
                    bookedByStudentId: bSlot.obj_student
                };
                return { instanceIsPast, conflict };
            }
        }
    }
    return { instanceIsPast, conflict };
};

const processSlotRecurrences = (pSlot, dayName, startMoment, endMoment, bookedSlotsByDateMap, today) => {
    let hasPastConflictForAllRecurrences = false;
    let hasActualBookingConflictForAllRecurrences = false;
    const allConflictInstancesForThisPattern = [];

    let currentCheckDay = moment(startMoment).day(dayName);
    if (currentCheckDay.isBefore(startMoment, 'day')) currentCheckDay.add(1, 'week');

    while (currentCheckDay.isSameOrBefore(endMoment, 'day')) {
        const { instanceIsPast, conflict } = checkSlotInstance(pSlot, currentCheckDay, bookedSlotsByDateMap, today);
        if (conflict) {
            allConflictInstancesForThisPattern.push(conflict);
            if (conflict.status === slotstatus.BOOKED || conflict.status === slotstatus.COMPLETED) {
                hasActualBookingConflictForAllRecurrences = true;
            }
        }
        if (instanceIsPast) hasPastConflictForAllRecurrences = true;
        currentCheckDay.add(1, 'week');
    }

    let status;
    if (hasPastConflictForAllRecurrences) status = slotstatus.COMPLETED;
    else if (hasActualBookingConflictForAllRecurrences) status = slotstatus.BOOKED;
    else status = slotstatus.AVAILABLE;

    return { status, conflictDetails: allConflictInstancesForThisPattern };
};

const processDayAvailability = (tutor, dayName, duration, startMoment, endMoment, bookedSlotsByDateMap, today) => {
    const tutorDayAvailability = tutor.weeklyHours.find(day => day.str_day.toLowerCase() === dayName.toLowerCase());
    if (!tutorDayAvailability) return [];

    if (tutorDayAvailability.int_startMinutes === undefined || tutorDayAvailability.int_endMinutes === undefined) {
        console.warn(`Tutor ${tutor.id} weekly hours block missing int_startMinutes/endMinutes for ${dayName}. Skipping.`);
        return [];
    }

    const block = {
        int_startMinutes: tutorDayAvailability.int_startMinutes,
        int_endMinutes: tutorDayAvailability.int_endMinutes
    };
    const dummyDate = moment('2000-01-01').day(dayName);
    const potentialSlots = generatePotentialSlots(block, dummyDate.toDate(), duration);

    return potentialSlots.map(pSlot => {
        const template = createSlotTemplate(dayName, pSlot, tutor);
        const { status, conflictDetails } = processSlotRecurrences(pSlot, dayName, startMoment, endMoment, bookedSlotsByDateMap, today);
        template.status = status;
        template.conflictDetails = conflictDetails;
        return template;
    });
};

// --- assignTutorAndBookSlotsService Helpers ---

const validateRecurringPattern = (pattern, tutorWeeklyHours) => {
    const { dayOfWeek, startTime, endTime } = pattern;
    const tutorDayAvailability = tutorWeeklyHours.find(d => d.str_day.toLowerCase() === dayOfWeek.toLowerCase());
    if (!tutorDayAvailability?.arr_slots.some(block => {
        const patternStartMinutes = timeUtils.convertToMinutes(startTime);
        const patternEndMinutes = timeUtils.convertToMinutes(endTime);
        return patternStartMinutes >= block.int_startMinutes && patternEndMinutes <= block.int_endMinutes;
    })) {
        throw new AppError(`Pattern ${dayOfWeek} ${startTime}-${endTime} is outside of tutor's general availability.`, 400);
    }
};

const createRecurringPattern = async (pattern, student, tutor, studentStartDate, studentDischargeDate, paymentId, requestingUserId, transaction) => {
    const { dayOfWeek, startTime, endTime, durationMinutes } = pattern;
    return await db.RecurringBookingPattern.create({
        obj_tutor: tutor.id,
        obj_student: student.id,
        dt_recurringStartDate: studentStartDate.toDate(),
        dt_recurringEndDate: studentDischargeDate.toDate(),
        str_dayOfWeek: dayOfWeek,
        str_startTime: startTime,
        str_endTime: endTime,
        int_durationMinutes: durationMinutes,
        int_startMinutes: timeUtils.convertToMinutes(startTime),
        int_endMinutes: timeUtils.convertToMinutes(endTime),
        obj_paymentId: paymentId,
        str_status: status.ACTIVE,
        objectId_createdBy: requestingUserId,
        int_initialBatchSizeMonths: 3,
        dt_lastExtensionDate: moment().toDate()
    }, { transaction });
};

const createPaymentRecord = async (initialPaymentForBooking, student, tutor, transaction) => {
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
    }, { transaction });
};

const assignStudentToTutor = async (student, tutor, transaction) => {
    const oldAssignedTutorId = student.objectId_assignedTutor;
    if (oldAssignedTutorId && oldAssignedTutorId !== tutor.id) {
        const oldTutor = await db.Tutor.findByPk(oldAssignedTutorId, { transaction });
        if (oldTutor) await oldTutor.removeAssignedStudent(student, { transaction });
    }
    await tutor.addAssignedStudent(student, { transaction });
    await student.update({ objectId_assignedTutor: tutor.id }, { transaction });
};

// --- createRazorpayOrderService Helpers ---

const calculateRecurringCost = (selectedRecurringPatterns, tutor, student, startDate, endDate) => {
    const costPerMinute = tutor.int_rate / 60; // Assuming int_rate is per hour
    let totalBaseCost = 0;
    let totalSessionCount = 0;

    selectedRecurringPatterns.forEach(({ dayOfWeek, durationMinutes }) => {
        const duration = parseInt(durationMinutes);
        const baseCostPerInstance = costPerMinute * duration;
        const recurrences = processRecurringPattern(
            { dayOfWeek },
            startDate,
            endDate,
            () => {
                totalSessionCount++;
                return baseCostPerInstance;
            }
        );
        totalBaseCost += recurrences.reduce((sum, cost) => sum + cost, 0);
    });

    return { totalBaseCost, totalSessionCount };
};

const addPlatformCommission = (totalBaseCost) => {
    const PLATFORM_COMMISSION_PERCENTAGE = 0.10; // 10%
    return totalBaseCost * (1 + PLATFORM_COMMISSION_PERCENTAGE);
};

const prepareRazorpayOrderOptions = (tutor, student, totalBaseCost, selectedRecurringPatterns, amountToCharge, totalSessionCount) => {
    return {
        amount: Math.round(amountToCharge * 100), // Amount in paisa/cents
        currency: 'INR',
        receipt: `receipt_stud_${student.int_studentNumber}_${Date.now()}`,
        notes: {
            tutorId: tutor.id,
            studentNumber: student.int_studentNumber,
            studentName: `${student.str_firstName} ${student.str_lastName}`.trim(),
            studentEmail: student.str_email,
            totalBaseCost: totalBaseCost.toFixed(2),
            platformCommission: (amountToCharge - totalBaseCost).toFixed(2),
            sessionCount: totalSessionCount,
            patterns: JSON.stringify(selectedRecurringPatterns.map(p => ({ day: p.dayOfWeek, start: p.startTime })))
        },
        payment_capture: 1
    };
};

// --- Main Service Functions ---

exports.createSlotService = async (slotsData, requestingUserId, externalTransaction = null) => {
    return withTransaction(async (transaction) => {
        if (!requestingUserId) throw new AppError('Unauthorized access.', 401);
        if (!Array.isArray(slotsData) || slotsData.length === 0) {
            throw new AppError('No slot data provided for creation.', 400);
        }

        const createdSlotIds = [];
        for (const slotData of slotsData) {
            validateSlotData(slotData);
            const slotId = await createSlot(slotData, requestingUserId, transaction);
            createdSlotIds.push(slotId);
        }

        return {
            statusCode: 201,
            message: `Successfully created ${createdSlotIds.length} slot(s).`,
            data: { createdSlotsCount: createdSlotIds.length, createdSlotIds }
        };
    }, externalTransaction);
};

exports.getGeneratedAvailableSlotsService = async (tutorId, studentId, durationMinutes, requestingUserId) => {
    return withTransaction(async (transaction) => {
        if (!requestingUserId) throw new AppError('Unauthorized access.', 401);
        const duration = parseInt(durationMinutes);
        if (isNaN(duration) || duration <= 0) throw new AppError('Invalid durationMinutes. Must be a positive number.', 400);

        const tutor = await validateTutor(tutorId, transaction, { includeWeeklyHours: true });
        const student = await validateStudent(studentId, transaction, true);

        const startMoment = moment(student.dt_startDate).startOf('day');
        const endMoment = student.dt_dischargeDate ? moment(student.dt_dischargeDate).endOf('day') : moment().add(1, 'year').endOf('day');
        const today = moment().startOf('day');

        const bookedSlotsByDateMap = await fetchBookedSlots(tutorId, studentId, startMoment, endMoment, transaction);
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const generatedRecurringSlotsWithStatus = [];

        for (const dayName of daysOfWeek) {
            const slots = processDayAvailability(tutor, dayName, duration, startMoment, endMoment, bookedSlotsByDateMap, today);
            generatedRecurringSlotsWithStatus.push(...slots);
        }

        return { statusCode: 200, data: generatedRecurringSlotsWithStatus };
    });
};

exports.getonewithpaginationservice = async (queryParams, userId) => {
    return withTransaction(async (transaction) => {
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
            validateUUID(tutorId, 'Tutor ID');
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
                : 'Not Assigned'
        }));

        return {
            statusCode: 200,
            data: formattedStudents,
            currentPage,
            totalPages: Math.ceil(count / itemsPerPage),
            totalRecords: count
        };
    });
};

exports.statuschangeservice = async (studentId, newStatus, requestingUserId) => {
    return withTransaction(async (transaction) => {
        if (!requestingUserId) throw new AppError('Unauthorized access', 401);
        if (![userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED].includes(newStatus)) {
            throw new AppError('Invalid status value provided.', 400);
        }
        const student = await validateStudent(studentId, transaction);
        await student.update({ str_status: newStatus }, { transaction });

        if (newStatus === userStatus.INACTIVE || newStatus === userStatus.PAUSED) {
            await tutorServices.adjustTutorAvailability(student.id, transaction);
        }

        return {
            statusCode: 200,
            message: `Student status changed to ${newStatus} successfully.`,
            data: student.toJSON()
        };
    });
};

exports.assignTutorAndBookSlotsService = async (studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, requestingUserId, externalTransaction = null) => {
    return withTransaction(async (transaction) => {
        if (!requestingUserId) throw new AppError('Unauthorized access.', 401);
        validateRecurringPatterns(selectedRecurringPatterns);
        if (!initialPaymentForBooking) throw new AppError('Payment details are required for recurring slot booking.', 400);

        const student = await validateStudent(studentId, transaction, true);
        const tutor = await validateTutor(tutorId, transaction, { includeWeeklyHours: true });
        await assignStudentToTutor(student, tutor, transaction);
        const mainPaymentRecord = await createPaymentRecord(initialPaymentForBooking, student, tutor, transaction);

        const studentStartDate = moment(student.dt_startDate).startOf('day');
        const studentDischargeDate = student.dt_dischargeDate ? moment(student.dt_dischargeDate).endOf('day') : moment().add(1, 'year').endOf('day');
        const INITIAL_BOOKING_WINDOW_MONTHS = 3;
        const initialBookingCutoffDate = moment().add(INITIAL_BOOKING_WINDOW_MONTHS, 'months').endOf('day');

        const createdRecurringPatternIds = [];
        const bookedSlotIds = [];

        for (const pattern of selectedRecurringPatterns) {
            validateRecurringPattern(pattern, tutor.weeklyHours);
            const newRecurringPattern = await createRecurringPattern(pattern, student, tutor, studentStartDate, studentDischargeDate, mainPaymentRecord.id, requestingUserId, transaction);
            createdRecurringPatternIds.push(newRecurringPattern.id);

            const slotIds = processRecurringPattern(
                pattern,
                studentStartDate,
                studentDischargeDate,
                (slotDate, currentDayInstance) => {
                    if (currentDayInstance.isAfter(initialBookingCutoffDate, 'day')) return null;
                    const createSlotPayload = [{
                        tutorId: tutor.id,
                        date: slotDate.format('YYYY-MM-DD'),
                        startTime: pattern.startTime,
                        endTime: pattern.endTime,
                        studentId: student.id,
                        status: slotstatus.BOOKED,
                        obj_recurringPatternId: newRecurringPattern.id
                    }];
                    return createSlotService(createSlotPayload, requestingUserId, transaction)
                        .then(result => result.data.createdSlotIds[0]);
                }
            ).filter(id => id);
            bookedSlotIds.push(...slotIds);
        }

        if (bookedSlotIds.length > 0) {
            await mainPaymentRecord.update({ obj_slotId: bookedSlotIds[0] }, { transaction });
        }

        return {
            statusCode: 200,
            message: `Successfully booked ${bookedSlotIds.length} recurring slots across ${createdRecurringPatternIds.length} patterns for ${student.str_firstName}.`,
            data: { bookedSlotIds, totalBookedCount: bookedSlotIds.length, createdRecurringPatternIds }
        };
    }, externalTransaction);
};

exports.createRazorpayOrderService = async (tutorId, studentId, selectedRecurringPatterns, userId) => {
    return withTransaction(async (transaction) => {
        if (!userId) throw new AppError('Unauthorized access.', 401);
        validateRecurringPatterns(selectedRecurringPatterns, 'order creation');

        const tutor = await validateTutor(tutorId, transaction, { attributes: ['id', 'int_rate', 'str_firstName', 'str_lastName', 'str_email', 'str_status'] });
        const student = await validateStudent(studentId, transaction, true);

        const startDate = moment().startOf('day');
        const endDate = moment().add(1, 'year').endOf('day');
        const { totalBaseCost, totalSessionCount } = calculateRecurringCost(selectedRecurringPatterns, tutor, student, startDate, endDate);

        if (totalSessionCount === 0 || totalBaseCost === 0) {
            throw new AppError('No future recurring sessions found for the selected patterns. Cannot create a payment order.', 400);
        }

        const amountToCharge = addPlatformCommission(totalBaseCost);
        const orderOptions = prepareRazorpayOrderOptions(tutor, student, totalBaseCost, selectedRecurringPatterns, amountToCharge, totalSessionCount);

        const razorpayOrder = await razorpay.orders.create(orderOptions);
        return {
            statusCode: 200,
            message: 'Razorpay order created successfully.',
            data: {
                orderId: razorpayOrder.id,
                amount: razorpayOrder.amount / 100,
                currency: razorpayOrder.currency,
                receipt: razorpayOrder.receipt,
                notes: razorpayOrder.notes
            }
        };
    });
};

module.exports = {
    createSlotService,
    getGeneratedAvailableSlotsService,
    getonewithpaginationservice,
    statuschangeservice,
    assignTutorAndBookSlotsService,
    createRazorpayOrderService
};
