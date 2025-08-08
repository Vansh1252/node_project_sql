
const { Op } = require('sequelize');
const moment = require('moment');
const { sequelize, db } = require('../utils/db');
const AppError = require('../utils/AppError');
const razorpay = require('../utils/razerpaysetup');
const { tables, slotstatus, userStatus, paymentstatus } = require('../constants/sequelizetableconstants');
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
    if (tutor.str_status !== userStatus.ACTIVE) {
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
        int_start_minutes: { [Op.lt]: endMinutes },
        int_end_minutes: { [Op.gt]: startMinutes }
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
        int_start_minutes: startMinutes,
        int_end_minutes: endMinutes,
        str_status: status,
        objectId_createdBy: requestingUserId
    }, { transaction });
    return newSlot.id;
};

// --- getGeneratedAvailableSlotsService Helpers ---

const generatePotentialSlots = (weeklyHourBlock, date, durationMinutes) => {
    const potentialSlots = [];
    let currentStartMinutes = weeklyHourBlock.int_start_minutes;
    while (currentStartMinutes + durationMinutes <= weeklyHourBlock.int_end_minutes) {
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
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'int_start_minutes', 'int_end_minutes', 'str_status', 'obj_tutor', 'obj_student'],
        transaction
    });

    const bookedSlotsByDateMap = new Map();
    slots.forEach(slot => {
        const dateKey = moment(slot.dt_date).startOf('day').toDate().getTime();
        if (!bookedSlotsByDateMap.has(dateKey)) bookedSlotsByDateMap.set(dateKey, []);
        bookedSlotsByDateMap.get(dateKey).push(slot.dataValues); // Use dataValues to extract plain object
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
    const checkDateNormalized = currentCheckDay.clone().startOf('day').toDate();
    const checkDateFormatted = currentCheckDay.format('YYYY-MM-DD');
    const dateKey = checkDateNormalized.getTime();
    const bookedSlotsOnThisDate = bookedSlotsByDateMap.get(dateKey) || [];

    let instanceIsPast = false;
    let conflict = null;

    const nowMinutes = timeUtils.convertToMinutes(moment().format('HH:mm'));
    if (currentCheckDay.isSame(today, 'day') && pSlot.startMinutes <= nowMinutes) {
        instanceIsPast = true;
        conflict = { date: checkDateFormatted, status: slotstatus.COMPLETED, reason: 'In the past today' };
    } else if (currentCheckDay.isBefore(today, 'day')) {
        instanceIsPast = true;
        conflict = { date: checkDateFormatted, status: slotstatus.COMPLETED, reason: 'In the past' };
    } else {
        for (const bSlot of bookedSlotsOnThisDate) {
            if (
                pSlot.startMinutes < bSlot.int_end_minutes &&
                pSlot.endMinutes > bSlot.int_start_minutes
            ) {
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
    if (allConflictInstancesForThisPattern.some(c => c.status === slotstatus.BOOKED || c.status === slotstatus.COMPLETED)) {
        status = slotstatus.BOOKED;
    } else if (hasPastConflictForAllRecurrences) {
        status = slotstatus.COMPLETED;
    } else {
        status = slotstatus.AVAILABLE;
    }

    return { status, conflictDetails: allConflictInstancesForThisPattern };
};

const processDayAvailability = (tutor, dayName, duration, startMoment, endMoment, bookedSlotsByDateMap, today) => {
    const tutorDayAvailability = tutor.weeklyHours.find(
        day => day.str_day.toLowerCase() === dayName.toLowerCase()
    );
    if (!tutorDayAvailability) return [];

    if (tutorDayAvailability.int_start_minutes === undefined || tutorDayAvailability.int_end_minutes === undefined) {
        console.warn(`Tutor ${tutor.id} weekly hours block missing int_startMinutes/endMinutes for ${dayName}. Skipping.`);
        return [];
    }

    const block = {
        int_start_minutes: tutorDayAvailability.int_start_minutes,
        int_end_minutes: tutorDayAvailability.int_end_minutes
    };

    // Calculate the first date for this weekday after student start date
    let firstAvailableDateForThisDay = moment(startMoment).day(dayName);
    if (firstAvailableDateForThisDay.isBefore(startMoment, 'day')) {
        firstAvailableDateForThisDay.add(1, 'week');
    }

    const potentialSlots = generatePotentialSlots(block, firstAvailableDateForThisDay.toDate(), duration);

    return potentialSlots.map(pSlot => {
        const template = createSlotTemplate(dayName, pSlot, tutor);
        const { status, conflictDetails } = processSlotRecurrences(
            pSlot, dayName, startMoment, endMoment, bookedSlotsByDateMap, today
        );
        template.status = status;
        template.conflictDetails = conflictDetails;
        return template;
    });
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
        console.log(generatedRecurringSlotsWithStatus);
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

// get tutor slots 
const validateInputs = (id, type, requestingUserId, queryParams) => {
    validateuser(requestingUserId);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        throw new AppError(`Invalid ${type} ID format.`, 400);
    }

    const { startDate, endDate } = queryParams;
    if (startDate) {
        const startMoment = moment(startDate, 'YYYY-MM-DD', true).startOf('day');
        if (!startMoment.isValid()) throw new AppError("Invalid startDate format. Use YYYY-MM-DD.", 400);
    }
    if (endDate) {
        const endMoment = moment(endDate, 'YYYY-MM-DD', true).endOf('day');
        if (!endMoment.isValid()) throw new AppError("Invalid endDate format. Use YYYY-MM-DD.", 400);
    }
};

const fetchSlots = async (filter, queryParams, includeModel, includeFields) => {
    const { status: slotStatusFilter, startDate, endDate, page = 1, limit = 10 } = queryParams;
    const currentPage = parseInt(page);
    const itemsPerPage = parseInt(limit);

    const where = { ...filter };
    if (slotStatusFilter && Object.values(slotstatus).includes(slotStatusFilter)) {
        where.str_status = slotStatusFilter;
    }
    if (startDate || endDate) {
        where.dt_date = {};
        if (startDate) {
            where.dt_date[Op.gte] = moment(startDate, 'YYYY-MM-DD').startOf('day').toDate();
        }
        if (endDate) {
            where.dt_date[Op.lte] = moment(endDate, 'YYYY-MM-DD').endOf('day').toDate();
        }
    }

    const [total, slotRecords] = await Promise.all([
        slots.count({ where }),
        slots.findAll({
            where,
            include: [
                {
                    model: includeModel,
                    attributes: includeFields,
                },
                {
                    model: recurring_booking_patterns,
                    attributes: ['id', 'str_day_of_week', 'str_start_time', 'str_end_time'],
                },
            ],
            order: [['dt_date', 'ASC'], ['int_start_minutes', 'ASC']],
            offset: (currentPage - 1) * itemsPerPage,
            limit: itemsPerPage,
            raw: true,
        }),
    ]);

    return { total, slotRecords };
};

const formatSlots = (slotRecords, primaryEntity, primaryEntityName, primaryEntityFields) => {
    return slotRecords.map(slot => {
        const isTutor = primaryEntity.modelName === 'tutors';
        const otherEntityKey = isTutor ? 'students' : 'tutors';

        const primaryEntityData = primaryEntity
            ? {
                id: slot[`${primaryEntity.modelName}.id`],
                name: primaryEntityName,
                ...primaryEntityFields
            }
            : null;

        const otherEntityId = slot[`${otherEntityKey}.id`];
        const otherFirstNameKey = `${otherEntityKey}.str_first_name`;
        const otherLastNameKey = `${otherEntityKey}.str_last_name`;

        const otherEntityData = otherEntityId
            ? {
                id: otherEntityId,
                name: `${slot[otherFirstNameKey]} ${slot[otherLastNameKey]}`,
                ...(isTutor
                    ? { studentNumber: slot['students.int_student_number'] }
                    : { email: slot['tutors.str_email'] }),
            }
            : null;

        const recurringPatternId = slot['recurring_booking_patterns.id'];
        const recurringPattern = recurringPatternId
            ? {
                id: recurringPatternId,
                dayOfWeek: slot['recurring_booking_patterns.str_day_of_week'],
                startTime: slot['recurring_booking_patterns.str_start_time'],
                endTime: slot['recurring_booking_patterns.str_end_time'],
            }
            : null;

        return {
            id: slot.id,
            date: moment(slot.dt_date).format('YYYY-MM-DD'),
            startTime: slot.str_start_time,
            endTime: slot.str_end_time,
            status: slot.str_status,
            attendance: slot.str_attendance || 'N/A',
            [primaryEntity.modelName]: primaryEntityData,
            [isTutor ? 'student' : 'tutor']: otherEntityData,
            createdBy: slot.object_id_created_by,
            recurringPattern
        };
    });
};
exports.getTutorConcreteSlotsService = async (tutorId, queryParams, requestingUserId) => {
    validateInputs(tutorId, 'Tutor', requestingUserId, queryParams);

    const tutor = await tutors.findByPk(tutorId, {
        attributes: ['str_first_name', 'str_last_name'],
        raw: true,
    });
    const tutorName = tutor ? `${tutor.str_first_name} ${tutor.str_last_name}` : 'Unknown Tutor';

    const { total, slotRecords } = await fetchSlots(
        { obj_tutor: tutorId },
        queryParams,
        students,
        ['id', 'str_first_name', 'str_last_name', 'int_student_number']
    );

    const formattedSlots = formatSlots(slotRecords, tutors, tutorName, { id: tutorId });

    return {
        statusCode: 200,
        data: formattedSlots,
        currentPage: parseInt(queryParams.page || 1),
        totalPages: Math.ceil(total / parseInt(queryParams.limit || 10)),
        totalRecords: total,
    };
};

exports.getStudentConcreteSlotsService = async (studentId, queryParams, requestingUserId) => {
    validateInputs(studentId, 'Student', requestingUserId, queryParams);

    const student = await students.findByPk(studentId, {
        attributes: ['str_first_name', 'str_last_name'],
        raw: true,
    });
    const studentName = student ? `${student.str_first_name} ${student.str_last_name}` : 'Unknown Student';

    const { total, slotRecords } = await fetchSlots(
        { obj_student: studentId },
        queryParams,
        tutors,
        ['id', 'str_first_name', 'str_last_name', 'str_email']
    );

    const formattedSlots = formatSlots(slotRecords, students, studentName, { id: studentId });

    return {
        statusCode: 200,
        data: formattedSlots,
        currentPage: parseInt(queryParams.page || 1),
        totalPages: Math.ceil(total / parseInt(queryParams.limit || 10)),
        totalRecords: total,
    };
};

exports.createRazorpayOrderService = async (tutorId, studentId, selectedRecurringPatterns, userId) => {
    return withTransaction(async (transaction) => {
        if (!userId) throw new AppError('Unauthorized access.', 401);
        validateRecurringPatterns(selectedRecurringPatterns, 'order creation');
        console.log(studentId)
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
