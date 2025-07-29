// src/services/slot.services.js
const { db } = require('../utils/db');
const AppError = require("../utils/AppError");
const { getIO } = require('../../socket');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const crypto = require('crypto');
const { slotstatus, roles, paymentstatus, attendance } = require('../constants/sequelizetableconstants');
const { notifySocket, notifyEmail } = require('../utils/notification');
const razorpay = require('../utils/razerpaysetup');

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

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) {
            throw new AppError("User not found", 404);
        }
        if (!tutorId || !date || !startTime || !endTime) {
            throw new AppError("Required fields missing.", 400);
        }

        const dateOnly = moment(date).startOf('day').toDate();

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
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(`Failed to create manual slot: ${error.message}`, 500);
    }
};

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

        if (obj_tutor || dt_date || str_startTime || str_endTime) {
            const dateToCheck = updateData.dt_date || slot.dt_date;
            const tutorToCheck = updateData.obj_tutor || slot.obj_tutor;
            const startTimeToCheck = updateData.str_startTime || slot.str_startTime;
            const endTimeToCheck = updateData.str_endTime || slot.str_endTime;

            const existingConflict = await db.Slot.findOne({
                where: {
                    id: { [Op.ne]: slotId },
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
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(`Failed to update manual slot: ${error.message}`, 500);
    }
};

exports.bookSlotService = async (req) => {
    const { slotId } = req.body;
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const transaction = await db.sequelize.transaction();
        try {
            const user = await db.User.findByPk(userId, { transaction });
            if (!user || user.str_role !== roles.STUDENT || !user.obj_profileId) {
                throw new AppError("Forbidden: Only student users can book slots.", 403);
            }
            const studentId = user.obj_profileId;

            const slot = await db.Slot.findByPk(slotId, { transaction });
            if (!slot || slot.str_status !== slotstatus.AVAILABLE) {
                throw new AppError("Slot not available for booking.", 400);
            }

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

            const payout = tutor.int_rate;
            const transactionFee = payout * 0.05;
            const totalAmount = payout + transactionFee;

            const receiptId = `receipt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
            const razorpayOrder = await razorpay.orders.create({
                amount: Math.round(totalAmount * 100),
                currency: 'INR',
                receipt: receiptId,
                notes: {
                    tutorId: tutor.id.toString(),
                    studentId: studentId.toString(),
                    slotId: slot.id.toString(),
                },
            });
            await transaction.commit();
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
                await new Promise(r => setTimeout(r, 200 * attempt));
                continue;
            }
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Failed to book slot: ${error.message}`, 500);
        }
    }
};

exports.verifyRazorpayPaymentService = async (req) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        slotId,
        paymentMethod
    } = req.body;
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user || user.str_role !== roles.STUDENT || !user.obj_profileId) {
            throw new AppError("Forbidden: Only student users can verify payments.", 403);
        }
        const studentId = user.obj_profileId;

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

        await slot.update({
            str_status: slotstatus.BOOKED,
            obj_student: studentId,
            int_tutorPayout: payout
        }, { transaction });

        await transaction.commit();

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
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(`Failed to verify payment: ${error.message}`, 500);
    }
};

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
        if (!user || user.str_role !== roles.STUDENT || !user.obj_profileId) {
            throw new AppError("Forbidden: Only student users can reschedule slots.", 403);
        }
        const studentId = user.obj_profileId;

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

        if (oldSlot.str_status !== slotstatus.BOOKED || oldSlot.obj_student !== studentId) {
            throw new AppError("Original slot is not booked by this student or has an invalid status for rescheduling.", 400);
        }

        if (newSlot.str_status !== slotstatus.AVAILABLE) {
            throw new AppError(`New slot is not available for booking. Current status: ${newSlot.str_status}.`, 400);
        }

        const newSlotDateTime = moment(`${moment(newSlot.dt_date).format('YYYY-MM-DD')} ${newSlot.str_startTime}`, 'YYYY-MM-DD HH:mm');
        if (newSlotDateTime.isBefore(moment())) {
            throw new AppError("Cannot reschedule to a slot that is in the past.", 400);
        }

        await oldSlot.update({ obj_student: null, str_status: slotstatus.AVAILABLE }, { transaction });
        await newSlot.update({ obj_student: studentId, str_status: slotstatus.BOOKED }, { transaction });

        await transaction.commit();

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
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(`Failed to reschedule slot: ${error.message}`, 500);
    }
};

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
        ]
    });

    if (!slot) {
        throw new AppError("Slot not found", 404);
    }

    const formattedSlot = {
        id: slot.id,
        date: slot.dt_date,
        startTime: slot.str_startTime,
        endTime: slot.str_endTime,
        status: slot.str_status,
        tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null,
        student: slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : null
    };

    return { statusCode: 200, data: formattedSlot };
};

exports.getslotswithpaginationservice = async (req) => {
    const { page = 1, limit = 10, date = '', tutorId = '', status: queryStatus = '' } = req.query;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const currentPage = Math.max(parseInt(page), 1);
    const itemsPerPage = Math.max(parseInt(limit), 1);
    const filter = {};

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

    if (tutorId) {
        filter.obj_tutor = tutorId;
    }

    if (queryStatus) {
        filter.str_status = queryStatus;
    }

    const { count: totalRecords, rows: slots } = await db.Slot.findAndCountAll({
        where: filter,
        offset: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
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
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'str_status'],
        raw: true,
        nest: true
    });

    const formattedSlots = slots.map(slot => ({
        id: slot.id,
        date: moment(slot.dt_date).format('YYYY-MM-DD'),
        startTime: slot.str_startTime,
        endTime: slot.str_endTime,
        status: slot.str_status,
        tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null,
        student: slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : null
    }));

    return {
        statusCode: 200,
        message: "Slots fetched with pagination.",
        currentPage,
        totalPages: Math.ceil(totalRecords / itemsPerPage),
        totalRecords,
        data: formattedSlots
    };
};

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
        if (error instanceof AppError) {
            throw error;
        }
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

        const testSlotDate = moment().add(1, 'year').startOf('day').toDate();
        const testSlotStartTime = '00:00';
        const testSlotEndTime = '00:30';
        const testSlotUniqueId = 'test-slot-12345';

        slotsToInsert.push({
            obj_tutor: tutorId,
            dt_date: testSlotDate,
            str_startTime: testSlotStartTime,
            str_endTime: testSlotEndTime,
            int_tutorPayout: int_rate,
            str_status: slotstatus.AVAILABLE,
            objectId_createdBy: tutorId
        });
        console.log(`[Slot Gen Debug] Added hardcoded test slot for insertion: ${moment(testSlotDate).format('YYYY-MM-DD')} ${testSlotStartTime}-${testSlotEndTime}`);

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
            // Modified to avoid calling get() on plain objects
            console.log(`[Slot Gen Debug] Details of created slots (if any):`, createdSlots);
            // Rest of the code

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

        console.log(`[Slot Gen Debug] Verifying hardcoded test slot after commit...`);
        const verifiedTestSlot = await db.Slot.findOne({
            where: {
                obj_tutor: tutorId,
                dt_date: testSlotDate,
                str_startTime: testSlotStartTime,
                str_endTime: testSlotEndTime
            }
        });

        if (verifiedTestSlot) {
            console.log(`[Slot Gen Debug] SUCCESS: Hardcoded test slot found in DB by Node.js app! ID: ${verifiedTestSlot.id}`);
        } else {
            console.error(`[Slot Gen Debug] FAILURE: Hardcoded test slot NOT found in DB by Node.js app after commit.`);
        }

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
        throw new AppError(`Failed to generate weekly slots: ${error.message}`, 500);
    }
};

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
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(`Failed to cancel slot: ${error.message}`, 500);
    }
};

exports.getAvailableSlotsService = async (req) => {
    const { date } = req.query;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) {
            throw new AppError("User not found", 404);
        }

        if (user.str_role !== roles.STUDENT || !user.obj_profileId) {
            throw new AppError("Forbidden: Only student users can view available slots for their assigned tutor.", 403);
        }
        const studentId = user.obj_profileId;

        const student = await db.Student.findByPk(studentId, {
            attributes: ['objectId_assignedTutor', 'str_timezone'],
            transaction
        });

        if (!student || !student.objectId_assignedTutor) {
            throw new AppError("Student is not assigned to any tutor.", 400);
        }

        const filter = {
            str_status: slotstatus.AVAILABLE,
            obj_tutor: student.objectId_assignedTutor
        };

        const studentTimezone = student.str_timezone || "Asia/Kolkata";

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
            filter.dt_date = {
                [Op.gte]: moment().tz(studentTimezone).startOf('day').toDate()
            };
        }

        const slots = await db.Slot.findAll({
            where: filter,
            include: [
                {
                    model: db.Tutor,
                    as: 'tutor',
                    attributes: ['str_firstName', 'str_lastName'],
                    required: true
                }
            ],
            order: [['dt_date', 'ASC'], ['str_startTime', 'ASC']],
            attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'str_status'],
            transaction
        });

        const formattedSlots = slots.map(slot => ({
            id: slot.id,
            date: moment(slot.dt_date).tz(studentTimezone).format('YYYY-MM-DD'),
            startTime: slot.str_startTime,
            endTime: slot.str_endTime,
            status: slot.str_status,
            tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null
        }));

        await transaction.commit();

        return {
            statusCode: 200,
            message: "Available slots fetched successfully.",
            data: formattedSlots
        };
    } catch (error) {
        await transaction.rollback();
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(`Failed to fetch available slots: ${error.message}`, 500);
    }
};

exports.getMySlotsService = async (req) => {
    const { date } = req.query;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new AppError("User not found", 404);
    }

    if (!user.obj_profileId) {
        throw new AppError("User profile not linked.", 400);
    }

    const filter = {};
    if (user.str_role === roles.STUDENT) {
        filter.obj_student = user.obj_profileId;
    } else if (user.str_role === roles.TUTOR) {
        filter.obj_tutor = user.obj_profileId;
    } else {
        throw new AppError("User profile not linked.", 400);
    }

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

    const slots = await db.Slot.findAll({
        where: filter,
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
        order: [['dt_date', 'ASC'], ['str_startTime', 'ASC']],
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'str_status']
    });

    const formattedSlots = slots.map(slot => ({
        id: slot.id,
        date: moment(slot.dt_date).format('YYYY-MM-DD'),
        startTime: slot.str_startTime,
        endTime: slot.str_endTime,
        status: slot.str_status,
        tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null,
        student: slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : null
    }));

    return {
        statusCode: 200,
        message: "My slots fetched successfully.",
        data: formattedSlots
    };
};

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
        throw new AppError("End date must be after start date.", 400);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new AppError("User not found", 404);
    }

    const filter = {
        dt_date: {
            [Op.gte]: startDate.startOf('day').toDate(),
            [Op.lte]: endDate.endOf('day').toDate()
        }
    };

    if (user.str_role === roles.STUDENT && user.obj_profileId) {
        filter.obj_student = user.obj_profileId;
    } else if (user.str_role === roles.TUTOR && user.obj_profileId) {
        filter.obj_tutor = user.obj_profileId;
    }

    const slots = await db.Slot.findAll({
        where: filter,
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
        order: [['dt_date', 'ASC'], ['str_startTime', 'ASC']],
        attributes: ['id', 'dt_date', 'str_startTime', 'str_endTime', 'str_status']
    });

    const formattedSlots = slots.map(slot => ({
        id: slot.id,
        date: moment(slot.dt_date).format('YYYY-MM-DD'),
        startTime: slot.str_startTime,
        endTime: slot.str_endTime,
        status: slot.str_status,
        tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null,
        student: slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : null
    }));

    return {
        statusCode: 200,
        data: formattedSlots
    };
};

exports.markAttendance = async (slotId, req) => {
    const { attendance: attendanceStatus } = req.body;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    if (!slotId) {
        throw new AppError("Slot ID is required.", 400);
    }

    if (!attendanceStatus || ![attendance.ATTENDED, attendance.ABSENT].includes(attendanceStatus)) {
        throw new AppError("Invalid attendance status. Must be 'attended' or 'absent'.", 400);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user || user.str_role !== roles.TUTOR || !user.obj_profileId) {
            throw new AppError("Forbidden: Only tutors can mark attendance.", 403);
        }
        const tutorId = user.obj_profileId;

        const slot = await db.Slot.findOne({
            where: { id: slotId, obj_tutor: tutorId },
            include: [
                { model: db.Tutor, as: 'tutor', attributes: ['str_firstName', 'str_email'] },
                { model: db.Student, as: 'student', attributes: ['str_firstName', 'str_lastName', 'str_email'] }
            ],
            transaction
        });

        if (!slot) {
            throw new AppError("Slot not found or not associated with this tutor.", 404);
        }

        if (!slot.obj_student) {
            throw new AppError("Cannot mark attendance for a slot with no student booked.", 400);
        }

        if (slot.str_status !== slotstatus.BOOKED) {
            throw new AppError("Attendance can only be marked for booked slots.", 400);
        }

        const slotDateTime = moment(`${moment(slot.dt_date).format('YYYY-MM-DD')} ${slot.str_startTime}`, 'YYYY-MM-DD HH:mm');
        if (slotDateTime.isAfter(moment())) {
            throw new AppError("Cannot mark attendance for a future slot.", 400);
        }

        await slot.update(
            {
                str_status: slotstatus.COMPLETED,
                str_attendance: attendanceStatus
            },
            { transaction }
        );

        await transaction.commit();

        notifySocket('attendanceMarked', {
            slotId: slot.id,
            attendance: attendanceStatus,
            studentId: slot.obj_student,
            tutorId: slot.obj_tutor
        });

        if (slot.student) {
            await notifyEmail(
                slot.student.str_email,
                'Attendance Marked',
                `Hello ${slot.student.str_firstName},\n\nYour attendance for the slot on ${moment(slot.dt_date).format('YYYY-MM-DD')} from ${slot.str_startTime} to ${slot.str_endTime} has been marked as ${attendanceStatus}.`
            );
        }

        return {
            statusCode: 200,
            message: `Attendance marked as ${attendanceStatus}`
        };
    } catch (error) {
        await transaction.rollback();
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(`Failed to mark attendance: ${error.message}`, 500);
    }
};