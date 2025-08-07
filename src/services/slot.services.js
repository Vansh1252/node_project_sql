const { Op } = require('sequelize'); // Sequelize operators for queries
const { sequelize, db } = require('../utils/db');
const moment = require('moment'); // For date manipulation
const AppError = require('../utils/AppError');
const { tables, status, slotstatus, attendnace, userStatus } = require('../constants/sequelizetableconstants'); // Ensure correct constants
const razorpay = require('../utils/razerpaysetup')
// --- Helper Functions (Adjusted for Sequelize context) ---

const _convertToMinutes = (timeString) => {
    if (!timeString || !/^\d{2}:\d{2}$/.test(String(timeString))) {
        throw new Error(`Invalid time string format: ${timeString}. Expected HH:MM.`);
    }
    const [hours, minutes] = String(timeString).split(':').map(Number);
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


const _generatePotentialSlots = (weeklyHourBlock, date, durationMinutes) => {
    const potentialSlots = [];
    let currentStartMinutes = weeklyHourBlock.int_startMinutes;

    while (currentStartMinutes + durationMinutes <= weeklyHourBlock.int_endMinutes) {
        const currentEndMinutes = currentStartMinutes + durationMinutes;
        potentialSlots.push({
            date: moment(date).format('YYYY-MM-DD'), // Keep date as string for consistency in output
            startTime: _convertMinutesToTime(currentStartMinutes),
            endTime: _convertMinutesToTime(currentEndMinutes),
            startMinutes: currentStartMinutes, // Pass along for easy comparison
            endMinutes: currentEndMinutes,     // Pass along for easy comparison
        });
        currentStartMinutes += durationMinutes;
    }
    return potentialSlots;
};


const _checkSlotConflict = async (tutorId, studentId, slotDate, startMinutes, endMinutes, excludeSlotId = null, transaction = null) => {
    const normalizedDate = moment(slotDate).startOf('day').toDate();

    const findQuery = {
        dt_date: normalizedDate,
        str_status: { [Op.in]: [slotstatus.BOOKED, slotstatus.COMPLETED] }, // Only check booked or completed slots
        [Op.or]: [
            { obj_tutor: tutorId }, // Conflict with this tutor's bookings
            ...(studentId ? [{ obj_student: studentId }] : []) // Conflict with this student's other bookings (if studentId provided)
        ],
        int_startMinutes: { [Op.lt]: endMinutes },   // The existing slot must start BEFORE the new slot ends
        int_endMinutes: { [Op.gt]: startMinutes }    // AND the existing slot must end AFTER the new slot starts
    };

    if (excludeSlotId) {
        findQuery.id = { [Op.ne]: excludeSlotId }; // Use 'id' for Sequelize PK
    }

    const conflictingSlot = await db.Slot.findOne({ where: findQuery, transaction }); // Pass transaction
    return !!conflictingSlot;
};

// --- Main Service Functions ---


const validateInputs = (slotsData, requestingUserId) => {
    if (!requestingUserId) throw new AppError("Unauthorized access.", 401);
    if (!Array.isArray(slotsData) || slotsData.length === 0) {
        throw new AppError("No slot data provided for creation.", 400);
    };
}

// Helper function to validate slot data
const validateSlotData = ({ tutorId, date, startTime, endTime, studentId, obj_recurringPatternId }) => {
    if (!mongoose.Types.ObjectId.isValid(tutorId)) throw new AppError("Invalid Tutor ID format.", 400);
    if (!date || !startTime || !endTime) throw new AppError("Missing required fields for slot creation.", 400);
    if (studentId && !mongoose.Types.ObjectId.isValid(studentId)) throw new AppError("Invalid Student ID format provided for slot.", 400);
    if (obj_recurringPatternId && !mongoose.Types.ObjectId.isValid(obj_recurringPatternId)) {
        throw new AppError("Invalid Recurring Pattern ID format provided for slot.", 400);
    }
};

// Helper function to validate time range
const validateTimeRange = (startTime, endTime) => {
    const startMinutes = _convertToMinutes(startTime);
    const endMinutes = _convertToMinutes(endTime);
    if (startMinutes >= endMinutes) throw new AppError("Slot end time must be after start time.", 400);
    return { startMinutes, endMinutes };
};

// Helper function to validate tutor
const validateTutor = async (tutorId, transaction) => {
    const tutor = await db.Tutor.findByPk(tutorId, { transaction });
    if (!tutor) throw new AppError(`Tutor with ID ${tutorId} not found.`, 404);
    if (tutor.str_status !== status.ACTIVE) throw new AppError(`Tutor ${tutor.str_firstName} is not active.`, 400);
    return tutor;
};

// Helper function to validate student
const validateStudent = async (studentId, transaction) => {
    if (!studentId) return null;
    const student = await db.Student.findByPk(studentId, { transaction });
    if (!student) throw new AppError(`Student with ID ${studentId} not found.`, 404);
    if (student.str_status !== userStatus.ACTIVE) throw new AppError(`Student ${student.str_firstName} is not active.`, 400);
    return student;
};

// Helper function to check for slot conflicts
const checkSlotConflict = async (tutorId, studentId, slotDate, startMinutes, endMinutes, transaction) => {
    const isConflict = await _checkSlotConflict(tutorId, studentId, slotDate, startMinutes, endMinutes, null, transaction);
    if (isConflict) {
        throw new AppError(`Time conflict: Slot ${startTime}-${endTime} on ${moment(slotDate).format('YYYY-MM-DD')} is already booked or overlaps with existing sessions for this tutor/student.`, 409);
    }
};

// Helper function to create a slot
const createSlot = async (slotData, requestingUserId, transaction) => {
    const { tutorId, date, startTime, endTime, studentId, status: slot_status_from_payload = slotstatus.AVAILABLE, obj_recurringPatternId = null } = slotData;
    const slotDate = moment(date).startOf('day').toDate();
    const { startMinutes, endMinutes } = validateTimeRange(startTime, endTime);

    await validateTutor(tutorId, transaction);
    await validateStudent(studentId, transaction);
    await checkSlotConflict(tutorId, studentId, slotDate, startMinutes, endMinutes, transaction);

    const newSlot = await db.Slot.create({
        obj_tutor: tutorId,
        obj_student: studentId || null,
        obj_recurringPatternId: obj_recurringPatternId || null,
        dt_date: slotDate,
        str_startTime: startTime,
        str_endTime: endTime,
        int_startMinutes: startMinutes,
        int_endMinutes: endMinutes,
        str_status: slot_status_from_payload,
        objectId_createdBy: requestingUserId
    }, { transaction });

    return newSlot.id;
};

// Main service function
exports.createSlotService = async (slotsData, requestingUserId, externalTransaction = null) => {
    const transaction = externalTransaction || await sequelize.transaction();
    try {
        validateInputs(slotsData, requestingUserId);

        const createdSlotIds = [];
        for (const slotData of slotsData) {
            validateSlotData(slotData);
            const slotId = await createSlot(slotData, requestingUserId, transaction);
            createdSlotIds.push(slotId);
        }

        if (!externalTransaction) await transaction.commit();
        return {
            statusCode: 201,
            message: `Successfully created ${createdSlotIds.length} slot(s).`,
            data: { createdSlotsCount: createdSlotIds.length, createdSlotIds }
        };
    } catch (error) {
        if (!externalTransaction) await transaction.rollback();
        console.error("Error in createSlotService:", error.message);
        throw error;
    } finally {
        if (!externalTransaction) await transaction.end();
    }
};


// === getGeneratedAvailableSlotsService (This is now the ONLY service for display generation) ===
const fetchBookedSlots = async (tutorId, studentId, startMoment, endMoment, transaction) => {
    const slots = await db.Slot.findAll({
        where: {
            [Op.or]: [{ obj_tutor: tutorId }, { obj_student: studentId }],
            dt_date: {
                [Op.gte]: startMoment.toDate(),
                [Op.lte]: endMoment.toDate()
            },
            str_status: { [Op.in]: [slotstatus.BOOKED, slotstatus.COMPLETED] }
        },
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'int_startMinutes', 'int_endMinutes', 'str_status', 'obj_tutor', 'obj_student'],
        transaction
    });
    const bookedSlotsByDateMap = new Map();
    slots.forEach(slot => {
        const dateKey = moment(slot.dt_date).startOf('day').toDate().getTime();
        if (!bookedSlotsByDateMap.has(dateKey)) {
            bookedSlotsByDateMap.set(dateKey, []);
        }
        bookedSlotsByDateMap.get(dateKey).push(slot);
    });
    return bookedSlotsByDateMap;
};

// Helper function to create recurring slot template
const createSlotTemplate = (dayName, pSlot, tutor) => ({
    dayOfWeek: dayName,
    startTime: pSlot.startTime,
    endTime: pSlot.endTime,
    status: slotstatus.AVAILABLE,
    tutorId: tutor.id,
    tutorName: `${tutor.str_firstName} ${tutor.str_lastName}`,
    conflictDetails: []
});

// Helper function to check slot instance conflicts
const checkSlotInstance = (pSlot, currentCheckDay, bookedSlotsByDateMap, today) => {
    const checkDateNormalized = currentCheckDay.startOf('day').toDate();
    const checkDateFormatted = currentCheckDay.format('YYYY-MM-DD');
    const dateKey = checkDateNormalized.getTime();
    const bookedSlotsOnThisDate = bookedSlotsByDateMap.get(dateKey) || [];

    let instanceIsPast = false;
    let conflict = null;

    if (currentCheckDay.isSame(today, 'day') && pSlot.endMinutes <= _convertToMinutes(moment().format('HH:mm'))) {
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

// Helper function to process slot recurrences
const processSlotRecurrences = (pSlot, dayName, startMoment, endMoment, bookedSlotsByDateMap, today) => {
    let hasPastConflictForAllRecurrences = false;
    let hasActualBookingConflictForAllRecurrences = false;
    const allConflictInstancesForThisPattern = [];

    let currentCheckDay = moment(startMoment).day(dayName);
    if (currentCheckDay.isBefore(startMoment, 'day')) {
        currentCheckDay.add(1, 'week');
    }

    while (currentCheckDay.isSameOrBefore(endMoment, 'day')) {
        const { instanceIsPast, conflict } = checkSlotInstance(pSlot, currentCheckDay, bookedSlotsByDateMap, today);
        if (conflict) {
            allConflictInstancesForThisPattern.push(conflict);
            if (conflict.status === slotstatus.BOOKED || conflict.status === slotstatus.COMPLETED) {
                hasActualBookingConflictForAllRecurrences = true;
            }
        }
        if (instanceIsPast) {
            hasPastConflictForAllRecurrences = true;
        }
        currentCheckDay.add(1, 'week');
    }

    return {
        status: hasPastConflictForAllRecurrences ? slotstatus.COMPLETED :
            hasActualBookingConflictForAllRecurrences ? slotstatus.BOOKED :
                slotstatus.AVAILABLE,
        conflictDetails: allConflictInstancesForThisPattern
    };
};

// Helper function to process day availability
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
        int_startMinutes: tutorDayAvailability.int_start_minutes,
        int_endMinutes: tutorDayAvailability.int_end_minutes
    };
    const dummyDate = moment('2000-01-01').day(dayName);
    const potentialSlots = _generatePotentialSlots(block, dummyDate.toDate(), duration);

    return potentialSlots.map(pSlot => {
        const template = createSlotTemplate(dayName, pSlot, tutor);
        const { status, conflictDetails } = processSlotRecurrences(pSlot, dayName, startMoment, endMoment, bookedSlotsByDateMap, today);
        template.status = status;
        template.conflictDetails = conflictDetails;
        return template;
    });
};
const validateInputsforslots = (requestingUserId, durationMinutes) => {
    if (!requestingUserId) throw new AppError("Unauthorized access.", 401);
    const duration = parseInt(durationMinutes);
    if (isNaN(duration) || duration <= 0) {
        throw new AppError("Invalid durationMinutes. Must be a positive number.", 400);
    }
    return duration;
}
// Main service function
exports.getGeneratedAvailableSlotsService = async (tutorId, studentId, durationMinutes, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        const duration = validateInputsforslots(requestingUserId, durationMinutes);
        const tutor = await validateTutor(tutorId, transaction);
        const student = await validateStudent(studentId, transaction);

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

        await transaction.commit();
        return { statusCode: 200, data: generatedRecurringSlotsWithStatus };
    } catch (error) {
        await transaction.rollback();
        console.error("Error in getGeneratedAvailableSlotsService (for Specific Student):", error.message);
        throw error;
    }
};

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
            if (!mongoose.Types.ObjectId.isValid(tutorId)) throw new AppError("Invalid Tutor ID format.", 400); // This should be UUID validation
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
                    as: 'assignedTutor', // Alias defined in models/index.js
                    attributes: ['id', 'str_firstName', 'str_lastName'], // Select attributes needed for tutor name
                    required: false // LEFT JOIN
                }
            ],
            transaction // Pass transaction
        });

        const formattedStudents = students.map(student => ({
            _id: student.id, // Use 'id' for Sequelize PK
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
            // ... (other specific student fields from model if needed)
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
    } finally {
        session.end();
    }
};



// STATUS CHANGE
exports.statuschangeservice = async (studentId, newStatus, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access", 401);
        // Validate studentId as UUID instead of Mongoose ObjectId
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
            throw new AppError("Invalid student ID format (expected UUID).", 400);
        }
        if (![userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED].includes(newStatus)) throw new AppError("Invalid status value provided.", 400);

        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) throw new AppError("Student not found", 404);

        await student.update({ str_status: newStatus }, { transaction });

        if (newStatus === userStatus.INACTIVE || newStatus === userStatus.PAUSED) {
            await tutorServices.adjustTutorAvailability(student.id, transaction); // Pass student.id and transaction
        }

        await transaction.commit();
        return { statusCode: 200, message: `Student status changed to ${newStatus} successfully.`, data: student.toJSON() }; // Return JSON

    } catch (error) {
        await transaction.rollback();
        console.error("Error in statuschangeservice:", error);
        throw error;
    } finally {
        transaction.end();
    }
};


// ASSIGN TUTOR AND BOOK SLOTS
const validateInputsforBooking = (studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, requestingUserId) => {
    if (!requestingUserId) throw new AppError("Unauthorized access.", 401);
    if (!Array.isArray(selectedRecurringPatterns) || selectedRecurringPatterns.length === 0) {
        throw new AppError("No recurring slot patterns provided for booking.", 400);
    }
    if (!initialPaymentForBooking) {
        throw new AppError("Payment details are required for recurring slot booking.", 400);
    }
};

// Helper function to validate student
const validateStudents = async (studentId, session) => {
    const student = await db.Student.findByPk(studentId, { transaction: session });
    if (!student) throw new AppError("Student not found.", 404);
    if (student.str_status !== userStatus.ACTIVE) {
        throw new AppError(`Student ${student.str_firstName} is not active and cannot be assigned sessions.`, 400);
    }
    return student;
};

// Helper function to validate tutor
const validateTutors = async (tutorId, session) => {
    const tutor = await db.Tutor.findByPk(tutorId, { transaction: session });
    if (!tutor) throw new AppError("Tutor not found.", 404);
    if (tutor.str_status !== status.ACTIVE) {
        throw new AppError(`Tutor ${tutor.str_firstName} is not active and cannot be assigned sessions.`, 400);
    }
    const tutorWeeklyHours = await db.WeeklyHourBlock.findAll({ where: { tutorId: tutor.id }, transaction: session });
    if (!tutorWeeklyHours || tutorWeeklyHours.length === 0) {
        throw new AppError(`Tutor ${tutor.str_firstName} has no weekly hours defined. Cannot book recurring slots.`, 400);
    }
    return { tutor, tutorWeeklyHours };
};

// Helper function to assign student to tutor
const assignStudentToTutor = async (student, tutor, session) => {
    const oldAssignedTutorId = student.objectId_assignedTutor;
    if (oldAssignedTutorId && !oldAssignedTutorId.equals(tutor.id)) {
        const oldTutor = await db.Tutor.findByPk(oldAssignedTutorId, { transaction: session });
        if (oldTutor) await oldTutor.removeAssignedStudent(student, { transaction: session });
    }
    await tutor.addAssignedStudent(student, { transaction: session });
    await student.update({ objectId_assignedTutor: tutor.id }, { transaction: session });
};

// Helper function to validate and create payment
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

// Helper function to validate recurring pattern
const validateRecurringPattern = (pattern, tutorWeeklyHours) => {
    const { dayOfWeek, startTime, endTime, durationMinutes } = pattern;
    if (!dayOfWeek || !startTime || !endTime || !durationMinutes) {
        throw new AppError("Each recurring pattern must have dayOfWeek, startTime, endTime, and durationMinutes.", 400);
    }
    const duration = parseInt(durationMinutes);
    if (isNaN(duration) || duration <= 0) {
        throw new AppError(`Invalid durationMinutes for pattern ${dayOfWeek} ${startTime}.`, 400);
    }
    const tutorDayAvailability = tutorWeeklyHours.find(d => d.str_day.toLowerCase() === dayOfWeek.toLowerCase());
    if (!tutorDayAvailability?.arr_slots.some(block => {
        const patternStartMinutes = _convertToMinutes(startTime);
        const patternEndMinutes = _convertToMinutes(endTime);
        return patternStartMinutes >= block.int_startMinutes && patternEndMinutes <= block.int_endMinutes;
    })) {
        throw new AppError(`Pattern ${dayOfWeek} ${startTime}-${endTime} is outside of tutor's general availability.`, 400);
    }
    return duration;
};

// Helper function to create recurring pattern
const createRecurringPattern = async (pattern, student, tutor, studentStartDate, studentDischargeDate, paymentId, requestingUserId, session) => {
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
        int_startMinutes: _convertToMinutes(startTime),
        int_endMinutes: _convertToMinutes(endTime),
        obj_paymentId: paymentId,
        str_status: status.ACTIVE,
        objectId_createdBy: requestingUserId,
        int_initialBatchSizeMonths: 3,
        dt_lastExtensionDate: moment().toDate()
    }, { transaction: session });
};

// Helper function to book slots for a recurring pattern
const bookSlotsForPattern = async (pattern, student, tutor, studentStartDate, studentDischargeDate, recurringPatternId, requestingUserId, session) => {
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
            tutorId: tutor.id,
            date: moment(slotDate).format('YYYY-MM-DD'),
            startTime: pattern.startTime,
            endTime: pattern.endTime,
            studentId: student.id,
            status: slotstatus.BOOKED,
            obj_recurringPatternId: recurringPatternId
        }];

        const createdSlotResult = await slotService.createSlotService(createSlotPayload, requestingUserId, session);
        if (createdSlotResult?.data.createdSlotIds?.length > 0) {
            bookedSlotIds.push(createdSlotResult.data.createdSlotIds[0]);
        }
        currentDayInstance.add(1, 'week');
    }
    return bookedSlotIds;
};

// Main service function
exports.assignTutorAndBookSlotsService = async (studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, requestingUserId, externalSession = null) => {
    const session = externalSession || await sequelize.transaction();
    try {
        // Validate inputs
        validateInputsforBooking(studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, requestingUserId);

        // Validate student and tutor
        const student = await validateStudents(studentId, session);
        const { tutor, tutorWeeklyHours } = await validateTutors(tutorId, session);

        // Assign student to tutor
        await assignStudentToTutor(student, tutor, session);

        // Create payment record
        const mainPaymentRecord = await createPaymentRecord(initialPaymentForBooking, student, tutor, session);

        // Process recurring patterns and book slots
        const studentStartDate = moment(student.dt_startDate).startOf('day');
        const studentDischargeDate = student.dt_dischargeDate ? moment(student.dt_dischargeDate).endOf('day') : moment().add(1, 'year').endOf('day');
        const createdRecurringPatternIds = [];
        const bookedSlotIds = [];

        for (const pattern of selectedRecurringPatterns) {
            validateRecurringPattern(pattern, tutorWeeklyHours);
            const newRecurringPattern = await createRecurringPattern(pattern, student, tutor, studentStartDate, studentDischargeDate, mainPaymentRecord.id, requestingUserId, session);
            createdRecurringPatternIds.push(newRecurringPattern.id);
            const slotIds = await bookSlotsForPattern(pattern, student, tutor, studentStartDate, studentDischargeDate, newRecurringPattern.id, requestingUserId, session);
            bookedSlotIds.push(...slotIds);
        }

        // Update payment record with first slot ID if applicable
        if (bookedSlotIds.length > 0) {
            await mainPaymentRecord.update({ obj_slotId: bookedSlotIds[0] }, { transaction: session });
        }

        if (!externalSession) await session.commit();
        return {
            statusCode: 200,
            message: `Successfully booked ${bookedSlotIds.length} recurring slots across ${createdRecurringPatternIds.length} patterns for ${student.str_firstName}.`,
            data: { bookedSlotIds, totalBookedCount: bookedSlotIds.length, createdRecurringPatternIds }
        };
    } catch (error) {
        if (!externalSession) await session.rollback();
        console.error("Error in assignTutorAndBookSlotsService:", error);
        throw error;
    } finally {
        if (!externalSession) await session.end();
    }
};

// Helper function to validate inputs
const validateInputsrazopay = (userId, tutorId, studentId, selectedRecurringPatterns) => {
    if (!userId) throw new AppError('Unauthorized access.', 401);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tutorId)) {
        throw new AppError('Invalid Tutor ID format.', 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
        throw new AppError('Invalid Student ID format.', 400);
    }
    if (!Array.isArray(selectedRecurringPatterns) || selectedRecurringPatterns.length === 0) {
        throw new AppError('No recurring slot patterns provided for order creation.', 400);
    }
    for (const pattern of selectedRecurringPatterns) {
        const { dayOfWeek, startTime, endTime, durationMinutes } = pattern;
        if (!dayOfWeek || !startTime || !endTime || !durationMinutes) {
            throw new AppError('Each recurring pattern must have dayOfWeek, startTime, endTime, and durationMinutes.', 400);
        }
        const duration = parseInt(durationMinutes);
        if (isNaN(duration) || duration <= 0) {
            throw new AppError(`Invalid durationMinutes for pattern ${dayOfWeek} ${startTime}.`, 400);
        }
    }
};

// Helper function to fetch and validate tutor
const getValidTutor = async (tutorId) => {
    const tutor = await db.Tutor.findByPk(tutorId, {
        attributes: ['id', 'int_rate', 'str_firstName', 'str_lastName', 'str_email', 'str_status'],
    });
    if (!tutor) throw new AppError('Tutor not found.', 404);
    if (tutor.str_status !== userStatus.ACTIVE) {
        throw new AppError(`Tutor ${tutor.str_firstName} is not active.`, 400);
    }
    console.log(tutor)
    return tutor;
};

// Helper function to fetch and validate student
const getValidStudent = async (studentId) => {
    const student = await db.Student.findByPk(studentId, {
        attributes: ['id', 'int_studentNumber', 'str_firstName', 'str_lastName', 'str_email'],
    });
    if (!student) throw new AppError('Student not found.', 404);
    return student;
};

// Helper function to calculate recurring cost
const calculateRecurringCost = (selectedRecurringPatterns, tutor, student) => {
    const defaultOrderStartDate = moment().startOf('day');
    const defaultOrderEndDate = moment().add(1, 'year').endOf('day');
    let totalBaseCost = 0;
    let totalSessionCount = 0;

    for (const pattern of selectedRecurringPatterns) {
        const { dayOfWeek, durationMinutes } = pattern;
        const duration = parseInt(durationMinutes);
        const costPerMinute = tutor.int_rate / 60; // Assuming int_rate is per hour
        const baseCostPerInstance = costPerMinute * duration;

        let recurrencesCount = 0;
        let currentDayInstance = moment(defaultOrderStartDate).day(dayOfWeek);
        if (currentDayInstance.isBefore(defaultOrderStartDate, 'day')) {
            currentDayInstance.add(1, 'week');
        }

        while (currentDayInstance.isSameOrBefore(defaultOrderEndDate, 'day')) {
            if (currentDayInstance.isSameOrAfter(moment().startOf('day'), 'day')) {
                recurrencesCount++;
            }
            currentDayInstance.add(1, 'week');
        }

        totalBaseCost += baseCostPerInstance * recurrencesCount;
        totalSessionCount += recurrencesCount;
    }

    return { totalBaseCost, totalSessionCount };
};

// Helper function to add platform commission
const addPlatformCommission = (totalBaseCost) => {
    const PLATFORM_COMMISSION_PERCENTAGE = 0.10; // 10%
    return totalBaseCost * (1 + PLATFORM_COMMISSION_PERCENTAGE);
};

// Helper function to prepare Razorpay order options
const prepareRazorpayOrderOptions = (tutor, student, totalBaseCost, selectedRecurringPatterns, amountToCharge, totalSessionCount) => {
    return {
        amount: Math.round(amountToCharge * 100), // Amount in paisa/cents
        currency: 'INR',
        receipt: `receipt_stud_${student.str_studentNumber}_${Date.now()}`,
        notes: {
            tutorId: tutor.id.toString(),
            studentNumber: student.int_studentNumber,
            studentName: `${student.str_firstName} ${student.str_lastName}`,
            studentEmail: student.str_email,
            totalBaseCost: totalBaseCost.toFixed(2),
            platformCommission: (amountToCharge - totalBaseCost).toFixed(2),
            sessionCount: totalSessionCount,
            patterns: JSON.stringify(selectedRecurringPatterns.map((p) => ({ day: p.dayOfWeek, start: p.startTime }))),
        },
        payment_capture: 1, // Auto capture payment
    };
};

// Main service function
exports.createRazorpayOrderService = async (tutorId, studentId, selectedRecurringPatterns, userId) => {
    validateInputsrazopay(userId, tutorId, studentId, selectedRecurringPatterns);

    const tutor = await getValidTutor(tutorId);
    const student = await getValidStudent(studentId);

    const { totalBaseCost, totalSessionCount } = calculateRecurringCost(selectedRecurringPatterns, tutor, student);

    if (totalSessionCount === 0 || totalBaseCost === 0) {
        throw new AppError('No future recurring sessions found for the selected patterns. Cannot create a payment order.', 400);
    }

    const amountToCharge = addPlatformCommission(totalBaseCost);
    const orderOptions = prepareRazorpayOrderOptions(tutor, student, totalBaseCost, selectedRecurringPatterns, amountToCharge, totalSessionCount);

    try {
        const razorpayOrder = await razorpay.orders.create(orderOptions);
        return {
            statusCode: 200,
            message: 'Razorpay order created successfully.',
            data: {
                orderId: razorpayOrder.id,
                amount: razorpayOrder.amount / 100,
                currency: razorpayOrder.currency,
                receipt: razorpayOrder.receipt,
                notes: razorpayOrder.notes,
            },
        };
    } catch (razorpayError) {
        console.error('Error creating Razorpay order:', razorpayError);
        throw new AppError(`Failed to create Razorpay order: ${razorpayError.message}`, 500);
    }
};
