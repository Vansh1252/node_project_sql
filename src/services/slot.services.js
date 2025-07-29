// src/services/slot.services.js
const { db } = require('../utils/db'); // ✅ Import the db object
const AppError = require("../utils/AppError");
const { getIO } = require('../../socket'); // Adjust path if needed
const moment = require('moment-timezone'); // For date parsing and timezone handling
const { Op } = require('sequelize'); // ✅ Import Sequelize Operators
const crypto = require('crypto');
const { slotstatus, roles, paymentstatus } = require('../constants/sequelizetableconstants'); // ✅ Use Sequelize constants
const { notifySocket, notifyEmail } = require('../utils/notification'); // Assuming these are correctly implemented
const razorpay = require('../utils/razerpaysetup');
// Create a manual slot (admin/tutor)
exports.createManualSlotService = async (req) => {
    const {
        tutorId,
        date,
        startTime,
        endTime,
        obj_student = null,
        str_status = slotstatus.AVAILABLE
    } = req.body;

    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new AppError("User not found", 404);
    }
    if (!tutorId || !date || !startTime || !endTime) {
        throw new AppError("Required fields missing.", 400);
    }

    const transaction = await db.sequelize.transaction();

    try {
        const dateOnly = moment(date).startOf('day').toDate();

        // Check overlapping slot
        const existing = await db.Slot.findOne({
            where: {
                obj_tutor: tutorId,
                dt_date: dateOnly,
                [Op.or]: [
                    {
                        str_startTime: { [Op.between]: [startTime, endTime] }
                    },
                    {
                        str_endTime: { [Op.between]: [startTime, endTime] }
                    },
                    {
                        str_startTime: { [Op.lte]: startTime },
                        str_endTime: { [Op.gte]: endTime }
                    }
                ]
            },
            transaction
        });

        if (existing) {
            throw new AppError("Slot overlaps with an existing slot for this tutor.", 409);
        }

        const tutor = await db.Tutor.findByPk(tutorId, { attributes: ['int_rate'], transaction });
        if (!tutor) {
            throw new AppError("Tutor not found for slot creation.", 404);
        }

        const newSlot = await db.Slot.create({
            obj_tutor: tutorId,
            dt_date: dateOnly,
            str_startTime: startTime,
            str_endTime: endTime,
            obj_student: obj_student,
            str_status,
            objectId_createdBy: userId,
            int_tutorPayout: tutor.int_rate || 0
        }, { transaction });

        await transaction.commit();

        return {
            statusCode: 201,
            message: "Slot created successfully.",
            data: newSlot
        };
    } catch (error) {
        await transaction.rollback();
        console.error("Error creating manual slot:", error);
        throw new AppError(`Failed to create manual slot: ${error.message}`, 500);
    }
};

// update a manual slot (admin/tutor)
exports.updateManualSlotService = async (req) => {
    const slotId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const {
        obj_tutor,
        dt_date,
        str_startTime,
        str_endTime,
        obj_student,
        str_status
    } = req.body;

    const transaction = await db.sequelize.transaction();

    try {
        const slot = await db.Slot.findByPk(slotId, { transaction });
        if (!slot) {
            throw new AppError("Slot not found.", 404);
        }

        const updateData = {};
        if (obj_tutor) updateData.obj_tutor = obj_tutor;
        if (dt_date) updateData.dt_date = moment(dt_date).startOf('day').toDate();
        if (str_startTime) updateData.str_startTime = str_startTime;
        if (str_endTime) updateData.str_endTime = str_endTime;
        if (obj_student !== undefined) updateData.obj_student = obj_student;
        if (str_status) updateData.str_status = str_status;

        // Check for overlapping slot conflicts if relevant fields changed
        if (obj_tutor || dt_date || str_startTime || str_endTime) {
            const dateToCheck = updateData.dt_date || slot.dt_date;
            const tutorToCheck = updateData.obj_tutor || slot.obj_tutor;
            const startTimeToCheck = updateData.str_startTime || slot.str_startTime;
            const endTimeToCheck = updateData.str_endTime || slot.str_endTime;

            const existingConflict = await db.Slot.findOne({
                where: {
                    id: { [Op.ne]: slotId }, // Exclude current slot
                    obj_tutor: tutorToCheck,
                    dt_date: dateToCheck,
                    [Op.or]: [
                        {
                            str_startTime: { [Op.between]: [startTimeToCheck, endTimeToCheck] }
                        },
                        {
                            str_endTime: { [Op.between]: [startTimeToCheck, endTimeToCheck] }
                        },
                        {
                            str_startTime: { [Op.lte]: startTimeToCheck },
                            str_endTime: { [Op.gte]: endTimeToCheck }
                        }
                    ]
                },
                transaction
            });

            if (existingConflict) {
                throw new AppError("Slot conflict detected: Another slot exists overlapping this time for the tutor.", 409);
            }
        }

        await slot.update(updateData, { transaction });

        await transaction.commit();

        return {
            statusCode: 200,
            message: "Slot updated successfully.",
            data: slot
        };
    } catch (error) {
        await transaction.rollback();
        console.error("Error updating manual slot:", error);
        throw new AppError(`Failed to update manual slot: ${error.message}`, 500);
    }
};

// Book a slot for a student
exports.bookSlotService = async (req) => {
    const { slotId, } = req.body;
    // const userId = req.user?.id; // User who is booking

    // if (!userId) {
    //     throw new AppError("Unauthorized access", 401);
    // }

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const transaction = await db.sequelize.transaction();
        try {
            // const user = await db.User.findByPk(userId, { transaction });
            // if (!user) {
            //     throw new AppError("User not found!", 404);
            // }
            const studentId = '394bf32e-3d80-4add-bb38-5af96ab34126';

            const slot = await db.Slot.findByPk(slotId, { transaction });
            if (!slot || slot.str_status !== slotstatus.AVAILABLE) {
                throw new AppError("Slot not available for booking.", 400);
            }

            // Get tutor for rate
            const tutor = await db.Tutor.findByPk(slot.obj_tutor, {
                attributes: ['id', 'str_email', 'str_firstName', 'int_rate'],
                transaction
            });
            if (!tutor) {
                throw new AppError("Tutor not found for slot.", 404);
            }

            const student = await db.Student.findByPk(studentId, {
                attributes: ['id', 'str_firstName', 'str_lastName'],
                transaction
            });
            if (!student) {
                throw new AppError("Student profile not found.", 404);
            }

            // Calculate payment details
            const payout = tutor.int_rate;
            const transactionFee = payout * 0.05; // 5% fee, or adjust your logic
            const totalAmount = payout + transactionFee;

            const receiptId = `receipt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
            const razorpayOrder = await razorpay.orders.create({
                amount: Math.round(totalAmount * 100), // in paisa
                currency: 'INR',
                receipt: receiptId,
                notes: {
                    tutorId: tutor.id.toString(),
                    studentId: studentId.toString(),
                    slotId: slot.id.toString(),
                },
            });
            return {
                success: true,
                statusCode: 200,
                order: razorpayOrder,
                key: process.env.KEY_ID_RAZORPAY_TEST,
            };
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();

            const isDeadlock = error?.parent?.code === 'ER_LOCK_DEADLOCK';
            if (isDeadlock && attempt < MAX_RETRIES) {
                console.warn(`⚠️ Deadlock detected. Retrying attempt ${attempt}...`);
                await new Promise(r => setTimeout(r, 200 * attempt)); // backoff
                continue;
            }

            console.error(`❌ Error on attempt ${attempt}:`, error);
            throw new AppError(`Failed to create student: ${error.message}`, 500);
        }
    }
};

// verfiy payments api
exports.verifyRazorpayPaymentService = async (req) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        slotId,
        paymentMethod
    } = req.body;
    console.log(req.body);
    const studentId = '394bf32e-3d80-4add-bb38-5af96ab34126';

    const expectedSignature = crypto
        .createHmac("sha256", process.env.KEY_SECRET_RAZORPAY_TEST)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

    if (expectedSignature !== razorpay_signature) {
        return {
            success: false,
            statusCode: 400,
            message: "Invalid payment signature"
        };
    }
    const transaction = await db.sequelize.transaction();

    const slot = await db.Slot.findByPk(slotId, { transaction });
    if (!slot) {
        throw new AppError("Slot not found.", 404);
    }
    const tutor = await db.Tutor.findByPk(slot.obj_tutor, { transaction });
    if (!tutor) {
        throw new AppError("Tutor not found.", 404);
    }

    const payout = tutor.int_rate;
    const transactionFee = Math.round(payout * 0.05);
    const totalAmount = payout + transactionFee;

    // Create payment record
    const payment = await db.Payment.create({
        str_razorpayOrderId: razorpay_order_id,
        str_razorpayPaymentId: razorpay_payment_id,
        str_razorpaySignature: razorpay_signature,
        obj_studentId: studentId,
        obj_tutorId: tutor.id,
        int_amount: payout,
        int_transactionFee: transactionFee,
        int_totalAmount: totalAmount,
        str_paymentMethod: paymentMethod || 'Razorpay',
        obj_slotId: slot.id,
        str_status: paymentstatus.COMPLETED
    }, { transaction });

    // Update slot status to CONFIRMED or PAID (adjust as per your business logic)
    await slot.update({
        str_status: slotstatus.BOOKED,
        obj_student: studentId,
        int_tutorPayout: payout
    }, { transaction });

    await transaction.commit();

    // Notify socket and email outside transaction
    const io = getIO();
    if (io) {
        notifySocket('slotBooked', {
            slotId: slot.id,
            status: 'confirmed',
            studentId: studentId
        });
    }

    await notifyEmail(
        tutor.str_email,
        'Slot Booked via Razorpay',
        `Hello ${tutor.str_firstName},\n\nA slot has been booked by a student on ${slot.dt_date} from ${slot.str_startTime} to ${slot.str_endTime}.`
    );

    return {
        success: true,
        statusCode: 200,
        message: "Payment verified and slot booked",
        paymentId: payment.id
    };
}


// Reschedule slot for student
exports.rescheduleSlotService = async (req) => {
    const { oldSlotId, newSlotId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized: User not logged in.", 401);
    }
    if (!oldSlotId || !newSlotId) {
        throw new AppError("Old slot ID and new slot ID are required for rescheduling.", 400);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user || user.str_role !== roles.STUDENT || !user.profileId) {
            throw new AppError("Forbidden: Only student users can reschedule slots.", 403);
        }
        const studentId = user.profileId;

        const [oldSlot, newSlot] = await Promise.all([
            db.Slot.findByPk(oldSlotId, { transaction }),
            db.Slot.findByPk(newSlotId, { transaction })
        ]);

        if (!oldSlot) {
            throw new AppError("Original slot not found.", 404);
        }
        if (!newSlot) {
            throw new AppError("New slot not found.", 404);
        }

        // Validate old slot status and student ownership
        if (oldSlot.str_status !== slotstatus.BOOKED || oldSlot.obj_student !== studentId) {
            throw new AppError("Original slot is not booked by this student or has an invalid status for rescheduling.", 400);
        }

        // Validate new slot status
        if (newSlot.str_status !== slotstatus.AVAILABLE) {
            throw new AppError(`New slot is not available for booking. Current status: ${newSlot.str_status}.`, 400);
        }

        // Validate new slot date/time is in the future
        const newSlotDateTime = moment(`${moment(newSlot.dt_date).format('YYYY-MM-DD')} ${newSlot.str_startTime}`, 'YYYY-MM-DD HH:mm');
        if (newSlotDateTime.isBefore(moment())) {
            throw new AppError("Cannot reschedule to a slot that is in the past.", 400);
        }

        // Perform the reschedule
        await oldSlot.update({ obj_student: null, str_status: slotstatus.AVAILABLE }, { transaction });
        await newSlot.update({ obj_student: studentId, str_status: slotstatus.BOOKED }, { transaction });

        await transaction.commit();

        // Notify sockets and emails
        notifySocket('slotRescheduled', {
            oldSlotId: oldSlot.id,
            newSlotId: newSlot.id,
            studentId: studentId,
            oldStatus: slotstatus.AVAILABLE,
            newStatus: slotstatus.BOOKED
        });

        const tutorForOldSlot = await db.Tutor.findByPk(oldSlot.obj_tutor, { attributes: ['str_email', 'str_firstName'] });
        if (tutorForOldSlot) {
            await notifyEmail(
                tutorForOldSlot.str_email,
                'Slot Rescheduled (Old Slot Freed)',
                `Hello ${tutorForOldSlot.str_firstName},\n\nA slot on ${moment(oldSlot.dt_date).format('YYYY-MM-DD')} from ${oldSlot.str_startTime} to ${oldSlot.str_endTime} has been freed due to a reschedule.`
            );
        }

        const tutorForNewSlot = await db.Tutor.findByPk(newSlot.obj_tutor, { attributes: ['str_email', 'str_firstName'] });
        if (tutorForNewSlot) {
            await notifyEmail(
                tutorForNewSlot.str_email,
                'Slot Rescheduled (New Slot Booked)',
                `Hello ${tutorForNewSlot.str_firstName},\n\nA slot on ${moment(newSlot.dt_date).format('YYYY-MM-DD')} from ${newSlot.str_startTime} to ${newSlot.str_endTime} has been booked by a student.`
            );
        }

        return { statusCode: 200, message: "Slot rescheduled successfully." };
    } catch (error) {
        await transaction.rollback();
        console.error("Error rescheduling slot:", error);
        throw new AppError(`Failed to reschedule slot: ${error.message}`, 500);
    }
};

// Get one slot information
exports.getoneslotservice = async (req) => {
    const slotId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const slot = await db.Slot.findByPk(slotId, {
        include: [
            {
                model: db.Tutor,
                as: 'tutor', // Alias from Slot model association
                attributes: ['str_firstName', 'str_lastName'],
                required: false // LEFT JOIN
            },
            {
                model: db.Student,
                as: 'student', // Alias from Slot model association
                attributes: ['str_firstName', 'str_lastName'],
                required: false // LEFT JOIN
            }
        ]
    });

    if (!slot) {
        throw new AppError("Slot not found", 404);
    }

    // Format the response data
    const formattedSlot = {
        id: slot.id, // Include slot ID
        date: slot.dt_date,
        startTime: slot.str_startTime,
        endTime: slot.str_endTime,
        status: slot.str_status,
        tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null,
        student: slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : null
    };

    return { statusCode: 200, data: formattedSlot };
};

// Get slots with pagination
exports.getslotswithpaginationservice = async (req) => {
    const { page = 1, limit = 10, date = '', tutorId = '', status: queryStatus = '' } = req.query; // Added status filter
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const currentPage = Math.max(parseInt(page), 1);
    const itemsPerPage = Math.max(parseInt(limit), 1);
    const filter = {};

    // Date Filter
    if (date) {
        const filterDate = moment(date, 'YYYY-MM-DD', true);
        if (!filterDate.isValid()) {
            throw new AppError("Invalid date format. Use YYYY-MM-DD.", 400);
        }
        filter.dt_date = {
            [Op.gte]: filterDate.startOf('day').toDate(),
            [Op.lte]: filterDate.endOf('day').toDate()
        };
    }

    // Tutor Filter
    if (tutorId) {
        filter.obj_tutor = tutorId; // Tutor ID is a UUID string
    }

    // Status Filter
    if (queryStatus) {
        filter.str_status = queryStatus;
    }

    const { count: totalRecords, rows: slots } = await db.Slot.findAndCountAll({
        where: filter,
        offset: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
        order: [['dt_date', 'ASC'], ['str_startTime', 'ASC']], // Order by date then start time
        include: [
            {
                model: db.Tutor,
                as: 'tutor',
                attributes: ['str_firstName', 'str_lastName'],
                required: false
            },
            {
                model: db.Student,
                as: 'student',
                attributes: ['str_firstName', 'str_lastName'],
                required: false
            }
        ],
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'str_status'], // Select core slot attributes
        raw: true, // Return plain data objects
        nest: true // Nest included data under their alias
    });

    // Manually format names since raw:true + nest:true might not give exactly what you want
    const formattedSlots = slots.map(slot => ({
        id: slot.id,
        date: moment(slot.dt_date).format('YYYY-MM-DD'),
        startTime: slot.str_startTime,
        endTime: slot.str_endTime,
        status: slot.str_status,
        tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null,
        student: slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : null
    }));

    if (tutorId && tutorId.trim() !== '') filter.obj_tutor = tutorId;
    if (queryStatus && queryStatus.trim() !== '') filter.str_status = queryStatus;
    return {
        statusCode: 200,
        message: "Slots fetched with pagination.",
        currentPage,
        totalPages: Math.ceil(totalRecords / itemsPerPage),
        totalRecords,
        data: formattedSlots
    };
};

// Delete slot
exports.deleteslotservice = async (req) => {
    const slotId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const deletedCount = await db.Slot.destroy({
            where: { id: slotId },
            transaction
        });

        if (deletedCount === 0) {
            throw new AppError("Slot not found or already deleted.", 404);
        }

        await transaction.commit();
        return {
            statusCode: 200,
            message: "Slot deleted successfully."
        };
    } catch (error) {
        await transaction.rollback();
        console.error("Error deleting slot:", error);
        throw new AppError(`Failed to delete slot: ${error.message}`, 500);
    }
};


exports.generateWeeklySlotsForTutor = async (tutor) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { id: tutorId, int_rate } = tutor;
        console.log(`[Slot Gen Debug] Starting slot generation for Tutor ID: ${tutorId}, Current Rate: ${int_rate}`);

        const weeklyAvailability = await db.AvailabilitySlot.findAll({
            where: { obj_entityId: tutorId, obj_entityType: roles.TUTOR },
            attributes: ['str_day', 'str_start', 'str_end'],
            raw: true,
            transaction
        });
        console.log(`[Slot Gen Debug] Fetched weeklyAvailability for ${tutorId}:`, weeklyAvailability);

        const int_sessionDuration = 30;
        console.log(`[Slot Gen Debug] Session Duration: ${int_sessionDuration} minutes`);

        if (!tutorId) {
            throw new AppError("Invalid tutor ID for slot generation.", 400);
        }
        if (!Array.isArray(weeklyAvailability) || weeklyAvailability.length === 0) {
            console.log(`[Slot Gen Debug] No weekly availability configured for tutor ${tutorId}. Throwing error.`);
            throw new AppError(`Weekly hours not configured for tutor ${tutorId}.`, 400);
        }

        const today = moment().startOf('isoWeek');
        console.log(`[Slot Gen Debug] Start of ISO Week (Monday): ${today.format('YYYY-MM-DD')}`);

        const slotsToInsert = [];

        // --- ADD A HARDCODED TEST SLOT ---
        const testSlotDate = moment().add(1, 'year').startOf('day').toDate(); // A date far in the future
        const testSlotStartTime = '00:00';
        const testSlotEndTime = '00:30';
        const testSlotUniqueId = 'test-slot-12345'; // A unique identifier for this test

        slotsToInsert.push({
            obj_tutor: tutorId,
            dt_date: testSlotDate,
            str_startTime: testSlotStartTime,
            str_endTime: testSlotEndTime,
            int_tutorPayout: int_rate,
            str_status: slotstatus.AVAILABLE,
            objectId_createdBy: tutorId
            // We can't set the 'id' directly here if it's UUIDV4, but we can query by other unique fields
        });
        console.log(`[Slot Gen Debug] Added hardcoded test slot for insertion: ${moment(testSlotDate).format('YYYY-MM-DD')} ${testSlotStartTime}-${testSlotEndTime}`);
        // --- END HARDCODED TEST SLOT ---


        for (let i = 0; i < 7; i++) {
            const currentDay = moment(today).add(i, 'days');
            const weekday = currentDay.format('dddd').toLowerCase();
            console.log(`[Slot Gen Debug] Processing Day: ${currentDay.format('YYYY-MM-DD')} (${weekday})`);

            const dayEntries = weeklyAvailability.filter(d => d.str_day.toLowerCase() === weekday);
            console.log(`[Slot Gen Debug] Found dayEntries for ${weekday}:`, dayEntries);

            if (!dayEntries || dayEntries.length === 0) {
                console.log(`[Slot Gen Debug] No availability entries for ${weekday}. Skipping.`);
                continue;
            }

            for (const { str_start, str_end } of dayEntries) {
                console.log(`[Slot Gen Debug]   Processing time range: ${str_start} - ${str_end}`);
                let slotStart = moment(`${currentDay.format('YYYY-MM-DD')} ${str_start}`, 'YYYY-MM-DD HH:mm');
                const slotEnd = moment(`${currentDay.format('YYYY-MM-DD')} ${str_end}`, 'YYYY-MM-DD HH:mm');

                if (!slotStart.isValid() || !slotEnd.isValid()) {
                    console.warn(`[Slot Gen Debug] Invalid time format for tutor ${tutorId} on ${currentDay.format('YYYY-MM-DD')}: ${str_start}-${str_end}. Skipping this range.`);
                    continue;
                }
                console.log(`[Slot Gen Debug]   Parsed slotStart: ${slotStart.format()}, slotEnd: ${slotEnd.format()}`);

                let currentSlotIteration = 0;
                while (slotStart.clone().add(int_sessionDuration, 'minutes').isSameOrBefore(slotEnd)) {
                    currentSlotIteration++;
                    const startFormatted = slotStart.format('HH:mm');
                    const endFormatted = slotStart.clone().add(int_sessionDuration, 'minutes').format('HH:mm');
                    const slotDate = currentDay.clone().startOf('day').toDate();

                    console.log(`[Slot Gen Debug]     Attempting to create sub-slot: ${startFormatted} - ${endFormatted} on ${moment(slotDate).format('YYYY-MM-DD')}`);

                    // We are relying on `ignoreDuplicates: true` in bulkCreate.
                    // The findOne check here is redundant if `ignoreDuplicates` is the primary strategy.
                    // However, it can be useful for debugging *why* a slot might be skipped.
                    // For production, you might remove this findOne for performance if you trust the unique index.
                    const alreadyExists = await db.Slot.findOne({
                        where: {
                            obj_tutor: tutorId,
                            dt_date: slotDate,
                            str_startTime: startFormatted,
                            str_endTime: endFormatted
                        },
                        transaction
                    });

                    if (!alreadyExists) {
                        console.log(`[Slot Gen Debug]       Slot does NOT exist. Adding to batch.`);
                        slotsToInsert.push({
                            obj_tutor: tutorId,
                            dt_date: slotDate,
                            str_startTime: startFormatted,
                            str_endTime: endFormatted,
                            int_tutorPayout: int_rate,
                            str_status: slotstatus.AVAILABLE,
                            objectId_createdBy: tutorId
                        });
                    } else {
                        console.log(`[Slot Gen Debug]       Slot ALREADY EXISTS in DB: ${alreadyExists.id}. Will be skipped by bulkCreate if unique index is active.`);
                    }
                    slotStart.add(int_sessionDuration, 'minutes');
                }
                if (currentSlotIteration === 0) {
                    console.log(`[Slot Gen Debug]   No sub-slots generated for range ${str_start}-${str_end}. Duration might be too short.`);
                }
            }
        }

        let generatedCount = 0;
        if (slotsToInsert.length > 0) {
            console.log(`[Slot Gen Debug] Attempting to bulkCreate ${slotsToInsert.length} slots.`);
            const createdSlots = await db.Slot.bulkCreate(slotsToInsert, {
                ignoreDuplicates: true,
                transaction
            });
            generatedCount = createdSlots.length;
            console.log(`[Slot Gen Debug] Successfully created ${generatedCount} slots.`);
            console.log(`[Slot Gen Debug] Details of created slots (if any):`, createdSlots.map(s => s.get({ plain: true })));

            notifySocket('slotsGenerated', { tutorId, count: generatedCount });

            const tutorForEmail = await db.Tutor.findByPk(tutorId, { attributes: ['str_email', 'str_firstName'], transaction });
            if (tutorForEmail) {
                await notifyEmail(
                    tutorForEmail.str_email,
                    'Weekly Slots Generated',
                    `Hello ${tutorForEmail.str_firstName},\n\n${generatedCount} new slots have been generated for the week.`
                );
            }
        } else {
            console.log(`[Slot Gen Debug] No slots to insert after all checks. generatedCount remains 0.`);
        }

        await transaction.commit();
        console.log(`[Slot Gen Debug] Transaction committed successfully.`);

        // --- VERIFY THE TEST SLOT AFTER COMMIT ---
        console.log(`[Slot Gen Debug] Verifying hardcoded test slot after commit...`);
        const verifiedTestSlot = await db.Slot.findOne({
            where: {
                obj_tutor: tutorId,
                dt_date: testSlotDate,
                str_startTime: testSlotStartTime,
                str_endTime: testSlotEndTime
            }
            // No transaction here, as we are checking after commit
        });

        if (verifiedTestSlot) {
            console.log(`[Slot Gen Debug] SUCCESS: Hardcoded test slot found in DB by Node.js app! ID: ${verifiedTestSlot.id}`);
        } else {
            console.error(`[Slot Gen Debug] FAILURE: Hardcoded test slot NOT found in DB by Node.js app after commit.`);
        }
        // --- END VERIFICATION ---


        return {
            statusCode: 201,
            message: `${generatedCount} slots generated successfully.`,
            generatedCount: generatedCount
        };

    } catch (error) {
        await transaction.rollback();
        console.error(`[Slot Gen Debug] Transaction rolled back due to error:`, error);
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(error.message || "Failed to generate weekly slots.", error.statusCode || 500);
    }
};


// Cancel slot from student
exports.cancelSlotService = async (req) => {
    const slotId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user || user.str_role !== roles.STUDENT || !user.obj_profileId) {
            throw new AppError("Forbidden: Only student users can cancel their booked slots.", 403);
        }
        const studentId = user.obj_profileId;

        // Find and update the slot
        const [affectedRows] = await db.Slot.update(
            { str_status: slotstatus.AVAILABLE, obj_student: null },
            {
                where: {
                    id: slotId,
                    obj_student: studentId,
                    str_status: slotstatus.BOOKED
                },
                transaction
            }
        );

        if (affectedRows === 0) {
            throw new AppError("Slot not found, not booked by this student, or not authorized to cancel.", 404);
        }

        // Fetch the updated slot to get details for notifications
        const slot = await db.Slot.findByPk(slotId, { transaction });

        await transaction.commit();

        notifySocket('slotCancelled', { slotId: slot.id, status: slotstatus.AVAILABLE });

        const tutor = await db.Tutor.findByPk(slot.obj_tutor, { attributes: ['str_email', 'str_firstName'] });
        if (tutor) {
            await notifyEmail(
                tutor.str_email,
                'Slot Cancelled',
                `Hello ${tutor.str_firstName},\n\nA slot on ${moment(slot.dt_date).format('YYYY-MM-DD')} from ${slot.str_startTime} to ${slot.str_endTime} has been cancelled by the student.`
            );
        }

        return { statusCode: 200, message: "Slot cancelled successfully" };
    } catch (error) {
        await transaction.rollback();
        console.error("Error cancelling slot:", error);
        throw new AppError(`Failed to cancel slot: ${error.message}`, 500);
    }
};

// Get all available slots for student to select
exports.getAvailableSlotsService = async (req) => {
    const { date } = req.query;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new AppError("User not found", 404);
    }

    // Ensure the user is a student and get their profile ID
    if (user.str_role !== roles.STUDENT || !user.obj_profileId) {
        throw new AppError("Forbidden: Only student users can view available slots for their assigned tutor.", 403);
    }
    const studentId = user.obj_profileId;

    const student = await db.Student.findByPk(studentId, {
        attributes: ['objectId_assignedTutor']
    });

    if (!student || !student.objectId_assignedTutor) {
        throw new AppError("Student is not assigned to any tutor.", 400);
    }

    const filter = {
        str_status: slotstatus.AVAILABLE, // Only available slots
        obj_tutor: student.objectId_assignedTutor // Only slots for the assigned tutor
    };

    const studentTimezone = student.str_timezone || "Asia/Kolkata"; // Use student's timezone or default

    if (date) {
        const filterDate = moment.tz(date, 'YYYY-MM-DD', studentTimezone);
        if (!filterDate.isValid()) {
            throw new AppError("Invalid date format. Use YYYY-MM-DD.", 400);
        }
        filter.dt_date = {
            [Op.gte]: filterDate.clone().startOf('day').toDate(),
            [Op.lte]: filterDate.clone().endOf('day').toDate()
        };
    } else {
        // If no date provided, get slots from today onwards
        filter.dt_date = { [Op.gte]: moment.tz(studentTimezone).startOf('day').toDate() };
    }

    const availableSlots = await db.Slot.findAll({
        where: filter,
        order: [['dt_date', 'ASC'], ['str_startTime', 'ASC']],
        include: [
            {
                model: db.Tutor,
                as: 'tutor',
                attributes: ['str_firstName', 'str_lastName'],
                required: false
            }
        ],
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'str_status'],
        raw: true,
        nest: true
    });

    const now = moment.tz(studentTimezone); // Current time in student's timezone
    const futureSlots = availableSlots.filter(slot => {
        const slotDateTime = moment.tz(`${moment(slot.dt_date).format('YYYY-MM-DD')} ${slot.str_startTime}`, 'YYYY-MM-DD HH:mm', studentTimezone);
        return slotDateTime.isAfter(now);
    }).map(slot => ({ // Format output
        id: slot.id,
        date: slot.dt_date,
        startTime: slot.str_startTime,
        endTime: slot.str_endTime,
        status: slot.str_status,
        tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null,
    }));

    return {
        statusCode: 200,
        message: "Available slots fetched successfully.",
        data: futureSlots
    };
};

// Get his own booked slots
exports.getMySlotsService = async (req) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized: User not logged in.", 401);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new AppError("User not found", 404);
    }

    // Determine if user is student or tutor to fetch relevant slots
    let profileId = user.obj_profileId;
    let isStudent = user.str_role === roles.STUDENT;
    let isTutor = user.str_role === roles.TUTOR;

    if (!profileId) {
        throw new AppError("User profile not linked.", 400);
    }

    const filter = {};
    if (isStudent) {
        filter.obj_student = profileId;
        filter.str_status = { [Op.in]: [slotstatus.BOOKED, slotstatus.COMPLETED] };
    } else if (isTutor) {
        filter.obj_tutor = profileId;
        // Tutors might see all their slots, or only booked/completed ones
        // For now, mirroring Mongoose: booked/completed
        filter.str_status = { [Op.in]: [slotstatus.BOOKED, slotstatus.COMPLETED, slotstatus.AVAILABLE, slotstatus.CANCELLED] };
    } else {
        throw new AppError("Forbidden: Only students or tutors can view their slots.", 403);
    }


    const { date, status: queryStatus } = req.query;

    if (date) {
        const filterDate = moment(date, 'YYYY-MM-DD', true);
        if (!filterDate.isValid()) {
            throw new AppError("Invalid date format. Use YYYY-MM-DD.", 400);
        }
        filter.dt_date = {
            [Op.gte]: filterDate.startOf('day').toDate(),
            [Op.lte]: filterDate.endOf('day').toDate()
        };
    } else {
        // Default to slots from today onwards if no date is specified
        filter.dt_date = { [Op.gte]: moment().startOf('day').toDate() };
    }

    if (queryStatus && Object.values(slotstatus).includes(queryStatus)) { // Validate status against enum
        filter.str_status = queryStatus;
    }

    const mySlots = await db.Slot.findAll({
        where: filter,
        order: [['dt_date', 'ASC'], ['str_startTime', 'ASC']],
        include: [
            {
                model: db.Tutor,
                as: 'tutor',
                attributes: ['str_firstName', 'str_lastName'],
                required: false
            },
            {
                model: db.Student,
                as: 'student',
                attributes: ['str_firstName', 'str_lastName'],
                required: false
            }
        ],
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'str_status', 'obj_tutor', 'obj_student'],
        raw: true,
        nest: true
    });

    // Format output
    const formattedMySlots = mySlots.map(slot => ({
        id: slot.id,
        date: slot.dt_date,
        startTime: slot.str_startTime,
        endTime: slot.str_endTime,
        status: slot.str_status,
        tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null,
        student: slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : null,
        // Include raw IDs for debugging or further processing if needed
        tutorId: slot.obj_tutor,
        studentId: slot.obj_student
    }));

    return {
        statusCode: 200,
        message: "My slots fetched successfully.",
        data: formattedMySlots
    };
};

// Dynamic calendar service
exports.getCalendarSlots = async (req) => {
    const { start, end } = req.query;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const startDate = moment(start, 'YYYY-MM-DD', true);
    const endDate = moment(end, 'YYYY-MM-DD', true);

    if (!startDate.isValid() || !endDate.isValid()) {
        throw new AppError("Invalid date format. Use YYYY-MM-DD.", 400);
    }
    if (endDate.isBefore(startDate)) {
        throw new AppError("End date must be after start date", 400);
    }

    const slots = await db.Slot.findAll({
        where: {
            dt_date: {
                [Op.gte]: startDate.toDate(),
                [Op.lte]: endDate.toDate()
            }
        },
        include: [
            {
                model: db.Tutor,
                as: 'tutor',
                attributes: ['str_firstName', 'str_lastName'],
                required: false
            },
            {
                model: db.Student,
                as: 'student',
                attributes: ['str_firstName', 'str_lastName'],
                required: false
            }
        ],
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'str_status'],
        order: [['dt_date', 'ASC'], ['str_startTime', 'ASC']],
        raw: true,
        nest: true
    });

    return {
        statusCode: 200,
        data: slots.map(slot => ({
            slotId: slot.id,
            date: slot.dt_date,
            startTime: slot.str_startTime,
            endTime: slot.str_endTime,
            status: slot.str_status,
            tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null,
            student: slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : null
        }))
    };
};

// Student mark attendance for payment (Tutor marks attendance for a slot)
exports.markAttendance = async (slotId, req) => {
    const { attendance } = req.body;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }
    if (![attendance.ATTENDED, attendance.MISSED].includes(attendance)) {
        throw new AppError("Invalid attendance status", 400);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user || user.str_role !== roles.TUTOR || !user.profileId) {
            throw new AppError("Forbidden: Only tutors can mark attendance.", 403);
        }
        const tutorId = user.profileId;

        // Find and verify the slot belongs to the tutor
        const slot = await db.Slot.findOne({
            where: {
                id: slotId,
                obj_tutor: tutorId
            },
            transaction
        });
        if (!slot) {
            throw new AppError("Slot not found or not authorized for this tutor.", 404);
        }

        // Update slot status to COMPLETED if not already, and set payout if not set
        if (slot.str_status !== slotstatus.COMPLETED) {
            await slot.update({ str_status: slotstatus.COMPLETED }, { transaction });

            if (!slot.int_tutorPayout) {
                const tutorDetails = await db.Tutor.findByPk(tutorId, { attributes: ['int_rate'], transaction });
                await slot.update({ int_tutorPayout: tutorDetails?.int_rate || 10 }, { transaction }); // Default to 10 if no rate
            }
        }

        // Set attendance
        await slot.update({ str_attendance: attendance }, { transaction });

        await transaction.commit();

        notifySocket('attendanceUpdated', { slotId: slot.id, attendance, tutorId });

        if (attendance === attendance.ATTENDED && slot.obj_student) {
            const student = await db.Student.findByPk(slot.obj_student, { attributes: ['str_email', 'str_firstName'] });
            if (student) {
                await notifyEmail(
                    student.str_email,
                    'Attendance Marked',
                    `Hello ${student.str_firstName},\n\nYour attendance for the session on ${moment(slot.dt_date).format('YYYY-MM-DD')} from ${slot.str_startTime} to ${slot.str_endTime} has been marked as attended.`
                );
            }
        }

        return { statusCode: 200, message: `Attendance marked as ${attendance}` };
    } catch (error) {
        await transaction.rollback();
        console.error("Error marking attendance:", error);
        throw new AppError(`Failed to mark attendance: ${error.message}`, 500);
    }
};
