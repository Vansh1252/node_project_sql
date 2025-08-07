const { Op } = require('sequelize'); // Sequelize operators for queries
const { sequelize, db } = require('../utils/db');
const moment = require('moment'); // For date manipulation
const AppError = require('../utils/AppError');
const { tables, status, slotstatus, attendnace, userStatus } = require('../constants/sequelizetableconstants'); // Ensure correct constants

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


exports.createSlotService = async (slotsData, requestingUserId, externalTransaction = null) => {
    const transaction = externalTransaction || await sequelize.transaction(); // Use 'transaction' variable
    if (!externalTransaction) transaction.start(); // Start a new transaction if not external

    try {
        if (!requestingUserId) throw new AppError("Unauthorized access.", 401);
        if (!Array.isArray(slotsData) || slotsData.length === 0) {
            throw new AppError("No slot data provided for creation.", 400);
        }

        const createdSlotIds = [];

        for (const slotData of slotsData) {
            const {
                tutorId, date, startTime, endTime, studentId = null,
                status: slot_status_from_payload = slotstatus.AVAILABLE,
                obj_recurringPatternId = null // This field is optional
            } = slotData;

            // 1. Basic Validation
            if (!mongoose.Types.ObjectId.isValid(tutorId)) throw new AppError("Invalid Tutor ID format.", 400); // Retain Mongoose/UUID validation
            if (!date || !startTime || !endTime) throw new AppError("Missing required fields for slot creation.", 400);
            if (studentId && !mongoose.Types.ObjectId.isValid(studentId)) throw new AppError("Invalid Student ID format provided for slot.", 400);
            if (obj_recurringPatternId && !mongoose.Types.ObjectId.isValid(obj_recurringPatternId)) throw new AppError("Invalid Recurring Pattern ID format provided for slot.", 400);

            const slotDate = moment(date).startOf('day').toDate();
            const startMinutes = _convertToMinutes(startTime);
            const endMinutes = _convertToMinutes(endTime);

            if (startMinutes >= endMinutes) {
                throw new AppError("Slot end time must be after start time.", 400);
            }

            // 2. Fetch Tutor and Student (within transaction)
            const tutor = await db.Tutor.findByPk(tutorId, { transaction });
            if (!tutor) throw new AppError(`Tutor with ID ${tutorId} not found.`, 404);
            if (tutor.str_status !== status.ACTIVE) throw new AppError(`Tutor ${tutor.str_firstName} is not active.`, 400); // Use 'status' constant

            let student = null;
            if (studentId) {
                student = await db.Student.findByPk(studentId, { transaction });
                if (!student) throw new AppError(`Student with ID ${studentId} not found.`, 404);
                if (student.str_status !== userStatus.ACTIVE) throw new AppError(`Student ${student.str_firstName} is not active.`, 400); // Use 'userStatus' constant
            }

            // 3. Perform Conflict Check (pass transaction)
            const isConflict = await _checkSlotConflict(tutorId, studentId, slotDate, startMinutes, endMinutes, null, transaction);
            if (isConflict) {
                throw new AppError(`Time conflict: Slot ${startTime}-${endTime} on ${moment(slotDate).format('YYYY-MM-DD')} is already booked or overlaps with existing sessions for this tutor/student.`, 409);
            }

            // 4. Create the new Slot document (within transaction)
            const newSlot = await db.Slot.create({
                obj_tutor: tutorId, // Foreign key directly
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
            createdSlotIds.push(newSlot.id); // Use .id for Sequelize PK

            // 5. Update associated Student and Tutor records (managed via associations)
            if (newSlot.str_status === slotstatus.BOOKED && studentId) {
                // Sequelize manages these via the associations setup in models/index.js
                // Add student to the Slot's student association (if Slot has belongsTo Student with alias)
                // or ensure Student hasMany Slot.
                // The main update is already done by setting obj_student in newSlot.
                // For Tutor.assignedStudents (hasMany Student), the student is added in assignTutorAndBookSlotsService.
                // For Student.arr_slotsId (hasMany Slot), the slot is added when creating slot.
            }
        }

        if (!externalTransaction) await transaction.commit(); // Commit only if this is the top-level transaction
        return { statusCode: 201, message: `Successfully created ${createdSlotIds.length} slot(s).`, data: { createdSlotsCount: createdSlotIds.length, createdSlotIds } };

    } catch (error) {
        if (!externalTransaction) await transaction.rollback(); // Abort only if top-level
        console.error("Error in createSlotService:", error.message);
        throw error;
    } finally {
        if (!externalTransaction) transaction.end(); // Use .end() for Sequelize transaction
    }
};


// === getGeneratedAvailableSlotsService (This is now the ONLY service for display generation) ===
exports.getGeneratedAvailableSlotsService = async (tutorId, studentId, durationMinutes, requestingUserId) => {
    const transaction = await sequelize.transaction(); // Use 'transaction' variable
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access.", 401);

        const duration = parseInt(durationMinutes);
        if (isNaN(duration) || duration <= 0) {
            throw new AppError("Invalid durationMinutes. Must be a positive number.", 400);
        }

        // Use 'include' for weeklyHours in Tutor
        const tutor = await db.Tutor.findByPk(tutorId, {
            include: [{ model: db.WeeklyHourBlock, as: 'weeklyHours' }],
            transaction
        });
        if (!tutor) throw new AppError("Tutor not found.", 404);
        if (tutor.str_status !== userStatus.ACTIVE) throw new AppError(`Tutor ${tutor.str_firstName} is not active.`, 400);
        if (!tutor.weeklyHours || tutor.weeklyHours.length === 0) { // Access via alias
            throw new AppError(`Tutor ${tutor.str_firstName} has no weekly hours defined.`, 404);
        }

        const student = await db.Student.findByPk(studentId, {
            attributes: ['id', 'dt_startDate', 'dt_dischargeDate'], // Select specific attributes for efficiency
            transaction
        });
        if (!student) throw new AppError("Student not found.", 404);
        if (!student.dt_startDate) throw new AppError("Student has no start date defined for recurring booking.", 400);

        const startMoment = moment(student.dt_startDate).startOf('day');
        const endMoment = student.dt_dischargeDate ? moment(student.dt_dischargeDate).endOf('day') : moment().add(1, 'year').endOf('day');

        const generatedRecurringSlotsWithStatus = [];
        const today = moment().startOf('day');

        // Fetch all existing booked/completed slots for this tutor AND student within the relevant date range
        const existingBookedSlots = await db.Slot.findAll({ // Use findAll for Sequelize
            where: {
                [Op.or]: [{ obj_tutor: tutorId }, { obj_student: studentId }],
                dt_date: {
                    [Op.gte]: startMoment.toDate(),
                    [Op.lte]: endMoment.toDate()
                },
                str_status: { [Op.in]: [slotstatus.BOOKED, slotstatus.COMPLETED] }
            },
            attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'int_startMinutes', 'int_endMinutes', 'str_status', 'obj_tutor', 'obj_student'], // Select attributes needed
            transaction // Pass transaction
        });

        // CRITICAL CHANGE: bookedSlotsByDateMap now maps date (timestamp) to an array of all booked slots on that date
        const bookedSlotsByDateMap = new Map();
        existingBookedSlots.forEach(bSlot => {
            const dateKey = moment(bSlot.dt_date).startOf('day').toDate().getTime();
            if (!bookedSlotsByDateMap.has(dateKey)) {
                bookedSlotsByDateMap.set(dateKey, []);
            }
            bookedSlotsByDateMap.get(dateKey).push(bSlot);
        });

        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        for (const dayName of daysOfWeek) {
            const tutorDayAvailability = tutor.weeklyHours.find(
                (day) => day.str_day.toLowerCase() === dayName.toLowerCase()
            );
            if (tutorDayAvailability) {
                if (tutorDayAvailability.int_start_minutes === undefined || tutorDayAvailability.int_end_minutes === undefined) {
                    console.warn(`Tutor ${tutorId} weekly hours block missing int_startMinutes/endMinutes for ${dayName}. Skipping.`);
                    continue;
                }
                const block = {
                    int_startMinutes: tutorDayAvailability.int_start_minutes,
                    int_endMinutes: tutorDayAvailability.int_end_minutes,
                };
                const dummyDate = moment('2000-01-01').day(dayName);
                const potentialSlotsInBlock = _generatePotentialSlots(block, dummyDate.toDate(), duration);

                for (const pSlot of potentialSlotsInBlock) {
                    const recurringSlotTemplate = {
                        dayOfWeek: dayName,
                        startTime: pSlot.startTime,
                        endTime: pSlot.endTime,
                        status: slotstatus.AVAILABLE,
                        tutorId: tutor.id,
                        tutorName: `${tutor.str_firstName} ${tutor.str_lastName}`,
                        conflictDetails: [],
                    };

                    let overallTemplateStatus = slotstatus.AVAILABLE;
                    let hasPastConflictForAllRecurrences = false;
                    let hasActualBookingConflictForAllRecurrences = false;
                    const allConflictInstancesForThisPattern = [];

                    let currentCheckDay = moment(startMoment);
                    currentCheckDay = currentCheckDay.day(dayName);
                    if (currentCheckDay.isBefore(startMoment, 'day')) {
                        currentCheckDay.add(1, 'week');
                    }

                    while (currentCheckDay.isSameOrBefore(endMoment, 'day')) {
                        const checkDateNormalized = currentCheckDay.startOf('day').toDate();
                        const checkDateFormatted = currentCheckDay.format('YYYY-MM-DD');
                        const dateKey = checkDateNormalized.getTime();
                        const bookedSlotsOnThisDate = bookedSlotsByDateMap.get(dateKey) || [];

                        let instanceIsPast = false;
                        if (currentCheckDay.isSame(today, 'day') && pSlot.endMinutes <= _convertToMinutes(moment().format('HH:mm'))) {
                            instanceIsPast = true;
                            allConflictInstancesForThisPattern.push({ date: checkDateFormatted, status: slotstatus.COMPLETED, reason: 'In the past today' });
                        } else if (currentCheckDay.isBefore(today, 'day')) {
                            instanceIsPast = true;
                            allConflictInstancesForThisPattern.push({ date: checkDateFormatted, status: slotstatus.COMPLETED, reason: 'In the past' });
                        }

                        let isOverlappingWithBookedSlot = false;
                        let overlappingBookedSlotInfo = null;

                        if (!instanceIsPast) {
                            for (const bSlot of bookedSlotsOnThisDate) {
                                if (pSlot.startMinutes < bSlot.int_endMinutes && pSlot.endMinutes > bSlot.int_startMinutes) {
                                    isOverlappingWithBookedSlot = true;
                                    overlappingBookedSlotInfo = bSlot;
                                    break;
                                }
                            }
                        }

                        if (isOverlappingWithBookedSlot) {
                            hasActualBookingConflictForAllRecurrences = true;
                            allConflictInstancesForThisPattern.push({
                                date: checkDateFormatted,
                                status: overlappingBookedSlotInfo.str_status,
                                slotId: overlappingBookedSlotInfo.id,
                                bookedByTutorId: overlappingBookedSlotInfo.obj_tutor,
                                bookedByStudentId: overlappingBookedSlotInfo.obj_student,
                            });
                        }

                        if (instanceIsPast) {
                            hasPastConflictForAllRecurrences = true;
                        }

                        currentCheckDay.add(1, 'week');
                    }

                    if (hasPastConflictForAllRecurrences) {
                        overallTemplateStatus = slotstatus.COMPLETED;
                    } else if (hasActualBookingConflictForAllRecurrences) {
                        overallTemplateStatus = slotstatus.BOOKED;
                    } else {
                        overallTemplateStatus = slotstatus.AVAILABLE;
                    }

                    recurringSlotTemplate.status = overallTemplateStatus;
                    recurringSlotTemplate.conflictDetails = allConflictInstancesForThisPattern;
                    generatedRecurringSlotsWithStatus.push(recurringSlotTemplate);
                }
            }
        }

        await transaction.commit(); // Commit transaction for read consistency
        return { statusCode: 200, data: generatedRecurringSlotsWithStatus };

    } catch (error) {
        await transaction.rollback(); // Rollback on error
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
exports.assignTutorAndBookSlotsService = async (studentId, tutorId, selectedRecurringPatterns, initialPaymentForBooking, requestingUserId, externalSession = null) => {
    const session = externalSession || await sequelize.transaction();
    if (!externalSession) session.start(); // Use .start() for Sequelize transaction

    try {
        // ... (existing validations) ...

        const student = await db.Student.findByPk(studentId, { transaction: session });
        if (!student) throw new AppError("Student not found.", 404);
        if (student.str_status !== userStatus.ACTIVE) throw new AppError(`Student ${student.str_firstName} is not active and cannot be assigned sessions.`, 400);

        const tutor = await db.Tutor.findByPk(tutorId, { transaction: session });
        if (!tutor) throw new AppError("Tutor not found.", 404);
        if (tutor.str_status !== status.ACTIVE) throw new AppError(`Tutor ${tutor.str_firstName} is not active and cannot be assigned sessions.`, 400);
        // Note: tutor.weeklyHours will be an array of WeeklyHourBlock instances
        const tutorWeeklyHours = await db.WeeklyHourBlock.findAll({ where: { tutorId: tutor.id }, transaction: session });
        if (!tutorWeeklyHours || tutorWeeklyHours.length === 0) {
            throw new AppError(`Tutor ${tutor.str_firstName} has no weekly hours defined. Cannot book recurring slots.`, 400);
        }

        const studentStartDate = moment(student.dt_startDate).startOf('day');
        const studentDischargeDate = student.dt_dischargeDate ? moment(student.dt_dischargeDate).endOf('day') : moment().add(1, 'year').endOf('day');

        // Update high-level tutor-student assignment
        const oldAssignedTutorId = student.objectId_assignedTutor;
        if (oldAssignedTutorId && !oldAssignedTutorId.equals(tutorId)) {
            const oldTutor = await db.Tutor.findByPk(oldAssignedTutorId, { transaction: session });
            if (oldTutor) await oldTutor.removeAssignedStudent(student, { transaction: session }); // Sequelize remove association
        }
        await tutor.addAssignedStudent(student, { transaction: session }); // Sequelize add association
        await student.update({ objectId_assignedTutor: tutorId }, { transaction: session });

        // Process Payment Details
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

        // Create RecurringBookingPattern(s)
        const createdRecurringPatternIds = [];
        const bookedSlotIds = [];

        for (const pattern of selectedRecurringPatterns) {
            const { dayOfWeek, startTime, endTime, durationMinutes } = pattern;
            if (!dayOfWeek || !startTime || !endTime || !durationMinutes) throw new AppError("Each recurring pattern must have dayOfWeek, startTime, endTime, and durationMinutes.", 400);
            const duration = parseInt(durationMinutes);
            if (isNaN(duration) || duration <= 0) throw new AppError(`Invalid durationMinutes for pattern ${dayOfWeek} ${startTime}.`, 400);

            const tutorDayAvailability = tutorWeeklyHours.find(d => d.str_day.toLowerCase() === dayOfWeek.toLowerCase());
            if (!tutorDayAvailability?.arr_slots.some(block => { // arr_slots is still Mongoose-style
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

            // Create Initial Batch of Concrete Slot Documents for this pattern
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
    } finally {
        session.end();
    }
};


exports.createRazorpayOrderService = async (tutorId, studentProfileData, selectedRecurringPatterns, requestingUserId) => {
    try {
        // --- 1. Basic Validations ---
        if (!requestingUserId) throw new AppError("Unauthorized access.", 401);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tutorId)) throw new AppError("Invalid Tutor ID format.", 400);
        if (!studentProfileData?.studentNumber || !studentProfileData?.firstName || !studentProfileData?.email) {
            throw new AppError("Missing essential student profile data for order creation.", 400);
        }
        if (!Array.isArray(selectedRecurringPatterns) || selectedRecurringPatterns.length === 0) {
            throw new AppError("No recurring slot patterns provided for order creation.", 400);
        }

        // --- 2. Fetch Tutor & Student Context ---
        const tutor = await db.Tutor.findByPk(tutorId, { attributes: ['id', 'int_rate', 'str_firstName', 'str_lastName', 'str_email', 'str_status'] });
        if (!tutor) throw new AppError("Tutor not found.", 404);
        if (tutor.str_status !== status.ACTIVE) throw new AppError(`Tutor ${tutor.str_firstName} is not active.`, 400);

        // Calculate a reasonable booking window for costing (e.g., 1 year from now)
        // This is separate from student's actual start/discharge dates, used only for order calculation.
        const defaultOrderStartDate = moment().startOf('day');
        const defaultOrderEndDate = moment().add(1, 'year').endOf('day');

        let totalBaseCost = 0; // Cost before platform commission
        let totalSessionCount = 0;

        // --- 3. Calculate Total Amount to Charge ---
        for (const pattern of selectedRecurringPatterns) {
            const { dayOfWeek, startTime, endTime, durationMinutes } = pattern;
            if (!dayOfWeek || !startTime || !endTime || !durationMinutes) throw new AppError("Each recurring pattern must have dayOfWeek, startTime, endTime, and durationMinutes.", 400);
            const duration = parseInt(durationMinutes);
            if (isNaN(duration) || duration <= 0) throw new AppError(`Invalid durationMinutes for pattern ${dayOfWeek} ${startTime}.`, 400);

            const costPerMinute = tutor.int_rate / 60; // Assuming int_rate is per hour
            const baseCostPerInstance = costPerMinute * duration;

            let recurrencesCount = 0;
            let currentDayInstance = moment(defaultOrderStartDate).day(dayOfWeek);
            if (currentDayInstance.isBefore(defaultOrderStartDate, 'day')) {
                currentDayInstance.add(1, 'week');
            }

            while (currentDayInstance.isSameOrBefore(defaultOrderEndDate, 'day')) {
                if (currentDayInstance.isSameOrAfter(moment().startOf('day'), 'day')) { // Only count future slots
                    recurrencesCount++;
                }
                currentDayInstance.add(1, 'week');
            }
            totalBaseCost += baseCostPerInstance * recurrencesCount;
            totalSessionCount += recurrencesCount;
        }

        if (totalSessionCount === 0 || totalBaseCost === 0) {
            throw new AppError("No future recurring sessions found for the selected patterns. Cannot create a payment order.", 400);
        }

        const PLATFORM_COMMISSION_PERCENTAGE = 0.10; // 10%
        const amountToChargeCustomer = totalBaseCost * (1 + PLATFORM_COMMISSION_PERCENTAGE);

        // --- 4. Create Razorpay Order ---
        const orderOptions = {
            amount: Math.round(amountToChargeCustomer * 100), // Amount in paisa/cents
            currency: 'INR', // Default currency
            receipt: `receipt_stud_${studentProfileData.studentNumber}_${Date.now()}`, // Unique receipt
            notes: {
                tutorId: tutor.id.toString(),
                studentNumber: studentProfileData.studentNumber.toString(), // Use studentNumber as ID
                studentName: `${studentProfileData.firstName} ${studentProfileData.lastName}`,
                studentEmail: studentProfileData.email,
                totalBaseCost: totalBaseCost.toFixed(2),
                platformCommission: (amountToChargeCustomer - totalBaseCost).toFixed(2),
                sessionCount: totalSessionCount,
                patterns: JSON.stringify(selectedRecurringPatterns.map(p => ({ day: p.dayOfWeek, start: p.startTime })))
            },
            payment_capture: 1 // Auto capture payment
        };

        const razorpayOrder = await razorpay.orders.create(orderOptions);

        return {
            statusCode: 200,
            message: "Razorpay order created successfully.",
            data: {
                orderId: razorpayOrder.id,
                amount: razorpayOrder.amount / 100, // Return amount in actual currency unit
                currency: razorpayOrder.currency,
                receipt: razorpayOrder.receipt,
                notes: razorpayOrder.notes
            }
        };
    } catch (error) {
        console.error("Error in createRazorpayOrderService:", error);
        throw new AppError(`Failed to create Razorpay order: ${error.message}`, 500);
    }
};
