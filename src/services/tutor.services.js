// services/tutor.services.js

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op } = require('sequelize'); // Import Sequelize's Operators
const { sequelize, db } = require('../utils/db'); // Import sequelize instance and db object with models
const mailer = require('../utils/mailer');
const AppError = require('../utils/AppError');
const { roles, userStatus, slotstatus, tables } = require('../constants/sequelizetableconstants'); // Ensure correct constants
const moment = require('moment');
const slotService = require('../services/slot.services');

const _validateAndFindTutor = async (tutorId, requestingUserId, transaction = null) => {
    if (!requestingUserId) {
        throw new AppError("Unauthorized access", 401);
    }
    const tutor = await db.Tutor.findByPk(tutorId, { transaction });
    if (!tutor) {
        throw new AppError("Tutor not found", 404);
    }
    return tutor;
};

const _checkDuplicateTutorContact = async (tutorId, email, phoneNumber, transaction = null) => {
    const query = {
        id: { [Op.ne]: tutorId }, // Exclude current tutor
        [Op.or]: []
    };
    if (email) query[Op.or].push({ str_email: email });
    if (phoneNumber) query[Op.or].push({ str_phoneNumber: phoneNumber });

    if (query[Op.or].length > 0) {
        const existingTutor = await db.Tutor.findOne({ where: query, transaction });
        if (existingTutor) {
            throw new AppError("Email or Phone Number already used by another tutor", 400);
        }
    }
};

const _applyUpdatesToTutor = async (tutor, updateFields, transaction) => {
    const {
        firstName, lastName, email, phoneNumber, address, city, province,
        postalCode, country, rate, timezone, status: newStatus, weeklyHours // weeklyHours here is array of objects
    } = updateFields;

    const updatedFields = {};

    if (firstName !== undefined) updatedFields.str_firstName = firstName;
    if (lastName !== undefined) updatedFields.str_lastName = lastName;
    if (email !== undefined) updatedFields.str_email = email;
    if (phoneNumber !== undefined) updatedFields.str_phoneNumber = phoneNumber;
    if (address !== undefined) updatedFields.str_address = address;
    if (city !== undefined) updatedFields.str_city = city;
    if (province !== undefined) updatedFields.str_province = province;
    if (postalCode !== undefined) updatedFields.str_postalCode = postalCode;
    if (country !== undefined) updatedFields.str_country = country;
    if (rate !== undefined) updatedFields.int_rate = rate;
    if (timezone !== undefined) updatedFields.str_timezone = timezone;
    if (newStatus && [userStatus.ACTIVE, userStatus.INACTIVE].includes(newStatus)) {
        updatedFields.str_status = newStatus;
    }

    await tutor.update(updatedFields, { transaction });

    // Handle weeklyHours update (replace all existing weekly blocks)
    if (Array.isArray(weeklyHours)) {
        // Delete all existing weekly hour blocks for this tutor
        await db.WeeklyHourBlock.destroy({ where: { tutorId: tutor.id }, transaction });

        // Create new weekly hour blocks
        const newBlocks = weeklyHours.map(dayObj => ({
            str_day: dayObj.day,
            str_start: dayObj.start, // Assuming 'start' from frontend is 'HH:MM'
            str_end: dayObj.end,     // Assuming 'end' from frontend is 'HH:MM'
            int_startMinutes: _convertToMinutes(dayObj.start),
            int_endMinutes: _convertToMinutes(dayObj.end),
            tutorId: tutor.id,
        }));
        await db.WeeklyHourBlock.bulkCreate(newBlocks, { transaction });
    }
};

// Helper to synchronize user model details with tutor updates
const _syncUserWithTutor = async (tutorId, firstName, lastName, email, currentTutor, transaction) => {
    const user = await db.User.findOne({
        where: { obj_profileId: tutorId, str_profileType: tables.TUTOR },
        transaction
    });

    if (user) {
        const updatedFullName = `${firstName !== undefined ? firstName : currentTutor.str_firstName} ${lastName !== undefined ? lastName : currentTutor.str_lastName}`.trim();
        const userUpdateFields = {};
        if (fullName !== undefined) userUpdateFields.str_fullName = updatedFullName;
        if (email !== undefined) userUpdateFields.str_email = email;

        await user.update(userUpdateFields, { transaction });
    }
};


// --- Service Functions ---

// CREATETUTOR
exports.createtutorservice = async (tutorData, requestingUserId) => {
    const transaction = await sequelize.transaction(); // Start transaction
    try {
        const {
            firstName, lastName, email, phoneNumber, address, city, province,
            postalCode, country, rate, timezone, weeklyHours // weeklyHours are now an array of objects
        } = tutorData;

        // 1. Validate required fields
        if (!firstName || !lastName || !email || !phoneNumber || !address || !city || !province || !postalCode || !country || rate === undefined || timezone === undefined) {
            throw new AppError("Missing required fields for tutor profile.", 400);
        }

        // 2. Check for existing tutor contact (email/phone)
        await _checkDuplicateTutorContact(null, email, phoneNumber, transaction); // Pass null for tutorId as it's new

        // 3. Check if a user with this email already exists
        const existingUserWithEmail = await db.User.findOne({ where: { str_email: email }, transaction });
        if (existingUserWithEmail) throw new AppError("A user account with this email already exists.", 400);

        // 4. Generate and hash password for the new tutor's user account
        const rawPassword = crypto.randomBytes(8).toString('hex'); // Generate random password
        const hashedPassword = await bcrypt.hash(rawPassword, 12);

        // 5. Create user account with TUTOR role
        const user = await db.User.create({
            str_fullName: `${firstName} ${lastName}`,
            str_email: email,
            str_password: hashedPassword,
            str_role: roles.TUTOR,
            str_status: userStatus.ACTIVE // Use userStatus for User model
        }, { transaction });

        // 6. Create tutor profile
        const tutor = await db.Tutor.create({
            str_firstName: firstName,
            str_lastName: lastName,
            str_email: email,
            str_phoneNumber: phoneNumber,
            str_address: address,
            str_city: city,
            str_province: province,
            str_postalCode: postalCode,
            str_country: country,
            int_rate: rate,
            str_timezone: timezone,
            str_status: userStatus.ACTIVE, // Use 'status' for Tutor model
            objectId_createdBy: user.id // Link to User ID
        }, { transaction });

        // 7. Update User with profileId and profileType (polymorphic association)
        await user.update({
            obj_profileId: tutor.id,
            str_profileType: tables.TUTOR // Use table name for profile type
        }, { transaction });

        // 8. Create WeeklyHourBlocks for the tutor
        if (Array.isArray(weeklyHours) && weeklyHours.length > 0) {
            const newWeeklyHours = [];

            weeklyHours.forEach(dayObj => {
                // Make sure dayObj.slots exists
                if (Array.isArray(dayObj.slots)) {
                    dayObj.slots.forEach(slot => {
                        const [startHour, startMin] = slot.start.split(':').map(Number);
                        const [endHour, endMin] = slot.end.split(':').map(Number);

                        const startMinutes = startHour * 60 + startMin;
                        const endMinutes = endHour * 60 + endMin;

                        if (isNaN(startMinutes) || isNaN(endMinutes) || startMinutes >= endMinutes) {
                            throw new AppError("Invalid time format or start time not before end time", 400);
                        }

                        newWeeklyHours.push({
                            str_day: dayObj.day,
                            str_start: slot.start,
                            str_end: slot.end,
                            int_start_minutes: startMinutes,
                            int_end_minutes: endMinutes,
                            tutorId: tutor.id
                        });
                    });
                }
            });

            await db.WeeklyHourBlock.bulkCreate(newWeeklyHours, { transaction });
        }


        // 9. Send welcome email
        await mailer.sendMail({
            to: email,
            from: process.env.EMAIL_FROM, // Ensure this is configured
            subject: 'Welcome to Our Platform! Your Tutor Account Details',
            text: `Hello ${firstName},\n\nWelcome to our platform as a tutor!\nYour email: ${email}\nTemporary Password: ${rawPassword}\n\nPlease login and consider changing your password for security.\n\nLogin URL: ${process.env.FRONTEND_URL}/login`
        });

        await transaction.commit(); // Commit transaction
        return { statusCode: 201, message: "Tutor created successfully.", tutorId: tutor.id };

    } catch (error) {
        await transaction.rollback(); // Rollback on error
        console.error("Error in createtutorservice:", error);
        throw error;
    }
};

// UPDATETUTOR
exports.updatetutorservice = async (tutorId, updateData, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        // 1. Validate and find tutor
        const tutor = await _validateAndFindTutor(tutorId, requestingUserId, transaction);

        // 2. Check for duplicate contact info (email/phone)
        const { email, phoneNumber } = updateData;
        if (email || phoneNumber) {
            await _checkDuplicateTutorContact(tutor.id, email, phoneNumber, transaction);
        }

        // 3. Apply updates to the tutor document and manage weekly hours
        await _applyUpdatesToTutor(tutor, updateData, transaction);

        // 4. Sync associated user model (str_fullName and str_email)
        await _syncUserWithTutor(tutor.id, updateData.firstName, updateData.lastName, updateData.email, tutor, transaction);

        await transaction.commit();
        return { statusCode: 200, message: "Tutor updated successfully", data: tutor.toJSON() }; // Return JSON representation

    } catch (error) {
        await transaction.rollback();
        console.error("Error in updatetutorservice:", error);
        throw error;
    }
};

// GETONETUTOR
exports.getonetutorservice = async (tutorId, requestingUserId) => {
    const transaction = await sequelize.transaction(); // Use transaction for consistent read
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access", 401);
        const tutor = await db.Tutor.findByPk(tutorId, {
            include: [
                { model: db.WeeklyHourBlock, as: 'weeklyHours' }, // Include weekly hours
                {
                    model: db.Student,
                    as: 'assignedStudents', // Include assigned students
                    attributes: ['id', 'int_studentNumber', 'str_firstName', 'str_lastName', 'str_status', 'dt_startDate', 'dt_dischargeDate', 'str_timezone', 'int_sessionDuration', 'str_meetingLink'],
                    required: false // LEFT JOIN
                }
            ],
            transaction // Pass transaction to fetch operations
        });

        if (!tutor) throw new AppError('Tutor not found', 404);

        // --- Calculate Summary Metrics ---
        const assignedStudentDetails = tutor.assignedStudents || []; // Ensure it's an array
        const activeAssignedStudentsCount = assignedStudentDetails.filter(s => s.str_status === userStatus.ACTIVE).length; // Use userStatus
        const pausedAssignedStudentsCount = assignedStudentDetails.filter(s => s.str_status === userStatus.PAUSED).length; // Use userStatus
        const totalAssignedStudentsCount = assignedStudentDetails.length;

        const paymentHistory = await db.Payment.findAll({
            where: { obj_tutorId: tutor.id },
            include: [{ model: db.Student, as: 'student', attributes: ['str_firstName', 'str_lastName'] }],
            order: [['createdAt', 'DESC']],
            transaction // Pass transaction
        });

        await transaction.commit();
        return {
            statusCode: 200,
            data: {
                id: tutor.id,
                firstName: tutor.str_firstName,
                lastName: tutor.str_lastName,
                email: tutor.str_email,
                phoneNumber: tutor.str_phoneNumber,
                address: tutor.str_address,
                city: tutor.str_city,
                province: tutor.str_province,
                postalCode: tutor.str_postalCode,
                country: tutor.str_country,
                rate: tutor.int_rate,
                timezone: tutor.str_timezone,
                status: tutor.str_status,
                totalAssignedStudents: totalAssignedStudentsCount,
                activeAssignedStudents: activeAssignedStudentsCount,
                pausedAssignedStudents: pausedAssignedStudentsCount,
                assignedStudentsDetails: assignedStudentDetails.map(s => s.toJSON()), // Convert instances to plain objects
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
                    tutorName: p.student ? `${p.student.str_firstName} ${p.student.str_lastName}` : 'N/A' // Access through 'student' alias
                })),
            }
        };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in getonetutorservice:", error);
        throw new AppError(`Failed to load tutor details: ${error.message}`, 500);
    }
};

// GETALLTUTORSWITHPAGINATION
exports.getonewithpaginationtutorservice = async (queryParams, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        const { page = 1, limit = 10, name = '', rate, status: tutorStatusFilter } = queryParams;

        if (!requestingUserId) throw new AppError("Unauthorized access", 401);

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
        if (rate !== undefined) filter.int_rate = { [Op.gte]: parseInt(rate) };
        if (tutorStatusFilter && [userInfo.ACTIVE, userStatus.INACTIVE].includes(tutorStatusFilter)) { // Use 'status'
            filter.str_status = tutorStatusFilter;
        }

        const { count, rows: tutors } = await db.Tutor.findAndCountAll({
            where: filter,
            limit: itemsPerPage,
            offset: (currentPage - 1) * itemsPerPage,
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: db.Student,
                    as: 'assignedStudents', // Alias defined in models/index.js
                    attributes: ['id', 'str_status'], // Only need status to count active/paused
                    required: false // LEFT JOIN
                }
            ],
            transaction // Pass transaction
        });

        // Manually count active/paused students from the included array
        const formattedTutors = tutors.map(tutor => {
            const assignedStudents = tutor.assignedStudents || [];
            const activeStudents = assignedStudents.filter(s => s.str_status === userStatus.ACTIVE).length; // Use userStatus
            const onPauseStudents = assignedStudents.filter(s => s.str_status === userStatus.PAUSED).length; // Use userStatus

            return {
                _id: tutor.id,
                tutorName: `${tutor.str_firstName} ${tutor.str_lastName}`.trim(),
                email: tutor.str_email,
                assignedStudentsCount: assignedStudents.length,
                activeStudents: activeStudents,
                onPauseStudents: onPauseStudents,
                status: tutor.str_status,
                rate: tutor.int_rate,
            };
        });

        await transaction.commit();
        return {
            statusCode: 200,
            data: formattedTutors,
            currentPage,
            totalPages: Math.ceil(count / itemsPerPage),
            totalRecords: count
        };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in getonewithpaginationservice:", error);
        throw new AppError(`Failed to fetch tutors: ${error.message}`, 500);
    }
};

// DELETETUTOR
exports.deletetutorservice = async (tutorId, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access", 401);

        const tutor = await db.Tutor.findByPk(tutorId, { transaction });
        if (!tutor) throw new AppError("Tutor not found", 404);

        // Delete associated records first to maintain referential integrity
        await db.RefreshToken.destroy({ where: { userId: tutor.objectId_createdBy }, transaction }); // Delete user's refresh tokens
        await db.WeeklyHourBlock.destroy({ where: { tutorId: tutor.id }, transaction }); // Delete tutor's weekly hours
        // Need to update or delete associated Slots and Payments explicitly
        await db.Slot.destroy({ where: { obj_tutor: tutor.id }, transaction });
        await db.Payment.destroy({ where: { obj_tutorId: tutor.id }, transaction });
        await db.RecurringBookingPattern.destroy({ where: { obj_tutor: tutor.id }, transaction });

        // Update students who were assigned to this tutor
        await db.Student.update(
            { objectId_assignedTutor: null },
            { where: { objectId_assignedTutor: tutor.id }, transaction }
        );

        // Finally, delete the tutor and their associated user
        await tutor.destroy({ transaction });
        await db.User.destroy({ where: { id: tutor.objectId_createdBy }, transaction }); // Delete associated user account

        await transaction.commit();
        return { statusCode: 200, message: "Tutor and associated data deleted successfully." };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in deletetutorservice:", error);
        throw error;
    }
};

// REMOVESTUDENT (from high-level assigned list and free slots)
exports.removeStudentService = async (tutorId, studentId, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        if (!requestingUserId) throw new AppError("Unauthorized access.", 401);
        if (!mongoose.Types.ObjectId.isValid(tutorId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            // Mongoose.Types.ObjectId.isValid should be replaced with UUID validation
            throw new AppError("Invalid Student or Tutor ID format.", 400);
        }

        const tutor = await db.Tutor.findByPk(tutorId, { transaction });
        if (!tutor) throw new AppError("Tutor not found.", 404);

        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) throw new AppError("Student not found.", 404);

        const studentUpdated = await db.Student.update(
            { objectId_assignedTutor: null },
            { where: { id: student.id, objectId_assignedTutor: tutor.id }, transaction }
        );

        if (studentUpdated[0] === 0) { // Sequelize update returns array [affectedRows]
            throw new AppError("Student not assigned to this tutor or not found to remove.", 400);
        }

        const freedSlotsCount = await db.Slot.update(
            { obj_student: null, str_status: slotstatus.AVAILABLE },
            {
                where: {
                    obj_student: student.id,
                    obj_tutor: tutor.id,
                    str_status: slotstatus.BOOKED,
                    dt_date: { [Op.gte]: moment().startOf('day').toDate() }
                },
                transaction
            }
        );
        console.log(`Freed ${freedSlotsCount[0]} slots for tutor ${tutor.id}`);
        await transaction.commit();
        return { statusCode: 200, message: "Student removed from tutor and associated slots freed successfully." };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in removeStudentService:", error);
        throw error;
    }
};


// TUTORMASTER (for dropdowns)
exports.tutormaster = async (queryParams, requestingUserId) => {
    const transaction = await sequelize.transaction();
    try {
        const { search } = queryParams;

        if (!requestingUserId) throw new AppError("Unauthorized access", 401);

        const filter = {};
        if (search) {
            filter[Op.or] = [
                { str_firstName: { [Op.like]: `%${search}%` } },
                { str_lastName: { [Op.like]: `%${search}%` } }
            ];
        }

        filter.str_status = userStatus.ACTIVE;

        const tutors = await db.Tutor.findAll({
            where: filter,
            attributes: ['id', 'str_firstName', 'str_lastName'],
            transaction
        });

        if (!tutors || tutors.length === 0) {
            await transaction.rollback(); // rollback before commit
            return {
                statusCode: 404,
                message: "No active tutors found matching criteria.",
                data: []
            };
        }

        await transaction.commit();
        return {
            statusCode: 200,
            message: "Tutors fetched successfully.",
            data: tutors.map(tutor => ({
                _id: tutor.id.toString(), // ⬅ Make sure it's `id`, not `_id`
                tutorName: `${tutor.str_firstName} ${tutor.str_lastName}`,
            })),
        };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in tutormaster:", error);
        throw error;
    }
};


// ADJUSTTUTORAVAILABILITY (called when student status changes)
exports.adjustTutorAvailability = async (studentId, externalSession = null) => { // externalSession might be passed from student.services
    const transaction = externalSession || await sequelize.transaction();
    try {
        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) throw new AppError("Student not found.", 404);

        if ((student.str_status === userStatus.INACTIVE || student.str_status === userStatus.PAUSED) && student.objectId_assignedTutor) {
            const tutor = await db.Tutor.findByPk(student.objectId_assignedTutor, { attributes: ['id', 'str_email', 'str_firstName'], transaction });
            if (!tutor) {
                console.warn(`Tutor ${student.objectId_assignedTutor} not found for student ${studentId} during availability adjustment.`);
                // Continue, as the primary goal is to free slots if possible
            }

            const freedSlotsCount = await db.Slot.update(
                { obj_student: null, str_status: slotstatus.AVAILABLE },
                {
                    where: {
                        obj_student: student.id,
                        obj_tutor: student.objectId_assignedTutor,
                        str_status: slotstatus.BOOKED,
                        dt_date: { [Op.gte]: moment().startOf('day').toDate() }
                    },
                    transaction
                }
            );
            console.log(`Freed ${freedSlotsCount[0]} slots for tutor ${tutor ? tutor.id : 'N/A'} due to student ${student.id} going inactive/paused.`);

            // Optionally, notify tutor
            if (freedSlotsCount[0] > 0 && tutor) {
                await mailer.sendMail({
                    to: tutor.str_email,
                    from: process.env.EMAIL_FROM,
                    subject: 'Slot Availability Updated: Student Inactive/Paused',
                    text: `Hello ${tutor.str_firstName},\n\n${freedSlotsCount[0]} slots have been freed due to student ${student.str_firstName} going inactive or paused. These slots are now available for new bookings.`
                });
            }
        }

        if (!externalSession) await transaction.commit();
        return { statusCode: 200, message: "Tutor availability adjusted successfully." };

    } catch (error) {
        if (!externalSession) await transaction.rollback();
        console.error("Error in adjustTutorAvailability:", error);
        throw error;
    } finally {
        if (!externalSession) transaction.end(); // Use .end() for Sequelize transaction
    }
};