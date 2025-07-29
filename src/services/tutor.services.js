// src/services/tutor.services.js
const bcrypt = require('bcrypt');
const { db } = require('../utils/db'); // ✅ Import the db object
const AppError = require('../utils/AppError');
const mailer = require('../utils/mailer');
const { roles, userStatus, slotstatus, attendnace } = require('../constants/sequelizetableconstants'); // ✅ Use Sequelize constants
const randompassword = require('../utils/randompassword');
const { notifyEmail, notifySocket } = require('../utils/notification');
const { Op } = require('sequelize'); // ✅ Import Sequelize Operators

// CREATE TUTOR SERVICE

exports.createtutorservice = async (req) => {
    const {
        firstName, lastName, email, phoneNumber,
        address, city, province, postalCode,
        country, rate, timezone, weeklyHours
    } = req.body;

    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized access", 401);

    if (!firstName || !lastName || !email || !phoneNumber || !address || !city || !province || !postalCode || !country || rate === undefined || !timezone) {
        throw new AppError("Missing required fields", 400);
    }

    const existingTutor = await db.Tutor.findOne({
        where: {
            [Op.or]: [
                { str_email: email },
                { str_phoneNumber: phoneNumber }
            ]
        }
    });
    if (existingTutor) throw new AppError("Email or Phone Number already used", 400);

    const rawPassword = randompassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    const transaction = await db.sequelize.transaction();

    try {
        const tutorUser = await db.User.create({
            str_fullName: `${firstName} ${lastName}`,
            str_email: email,
            str_password: hashedPassword,
            str_role: roles.TUTOR
        }, { transaction });

        const createTutor = await db.Tutor.create({
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
            str_status: userStatus.ACTIVE,
            objectId_createdBy: userId
        }, { transaction });

        await tutorUser.update({
            obj_profileId: createTutor.id,
            obj_profileType: roles.TUTOR
        }, { transaction });

        if (Array.isArray(weeklyHours) && weeklyHours.length > 0) {
            const availabilitySlots = [];
            for (const dayObj of weeklyHours) {
                if (Array.isArray(dayObj.slots)) {
                    for (const slot of dayObj.slots) {
                        availabilitySlots.push({
                            obj_entityId: createTutor.id,
                            obj_entityType: roles.TUTOR,
                            str_day: dayObj.day,
                            str_start: slot.start,
                            str_end: slot.end
                        });
                    }
                }
            }
            if (availabilitySlots.length > 0) {
                await db.AvailabilitySlot.bulkCreate(availabilitySlots, { transaction });
            }
        }

        await mailer.sendMail({
            to: email,
            from: 'vanshsanklecha36@gmail.com',
            subject: 'Welcome to Our Platform!',
            text: `Hello ${firstName},\n\nWelcome to our platform!\nYour email: ${email}\nPassword: ${rawPassword}\n\nLogin to view your tutor profile and schedule sessions.`
        });

        await transaction.commit();

        return { statusCode: 201, message: "Tutor created successfully." };
    } catch (error) {
        await transaction.rollback();
        console.error("Error creating tutor:", error);
        throw new AppError(`Failed to create tutor: ${error.message}`, 500);
    }
};

// UPDATE TUTOR SERVICE
exports.updatetutorservice = async (req) => {
    const tutorId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const transaction = await db.sequelize.transaction();
        try {
            const tutor = await db.Tutor.findByPk(tutorId, { transaction });
            if (!tutor) {
                throw new AppError("Tutor not found", 404);
            }

            const {
                firstName,
                lastName,
                email,
                phoneNumber,
                address,
                city,
                province,
                postalCode,
                country,
                rate,
                timezone,
                weeklyHours,
                status: newStatus,
                assignedStudents,
            } = req.body;

            // Check for existing email or phone (excluding self)
            const existingTutor = await db.Tutor.findOne({
                where: {
                    [Op.or]: [
                        { str_email: email },
                        { str_phoneNumber: phoneNumber }
                    ],
                    id: { [Op.ne]: tutorId }
                },
                transaction
            });
            if (existingTutor) {
                throw new AppError("Email or Phone Number already used", 400);
            }

            // Prepare update data for Tutor model
            const tutorUpdateData = {};
            if (firstName) tutorUpdateData.str_firstName = firstName;
            if (lastName) tutorUpdateData.str_lastName = lastName;
            if (email) tutorUpdateData.str_email = email;
            if (phoneNumber) tutorUpdateData.str_phoneNumber = phoneNumber;
            if (address) tutorUpdateData.str_address = address;
            if (city) tutorUpdateData.str_city = city;
            if (province) tutorUpdateData.str_province = province;
            if (postalCode) tutorUpdateData.str_postalCode = postalCode;
            if (country) tutorUpdateData.str_country = country;
            if (rate !== undefined) tutorUpdateData.int_rate = rate;
            if (timezone) tutorUpdateData.str_timezone = timezone;
            if (newStatus && [status.ACTIVE, status.INACTIVE].includes(newStatus)) tutorUpdateData.str_status = newStatus;

            // Update Tutor model
            if (Object.keys(tutorUpdateData).length > 0) {
                await tutor.update(tutorUpdateData, { transaction });
            }

            // Sync User model if email or name changed
            const user = await db.User.findOne({
                where: { obj_profileId: tutorId, str_role: roles.TUTOR },
                transaction
            });
            if (user) {
                const userUpdateData = {};
                if (firstName || lastName) userUpdateData.str_fullName = `${firstName || tutor.str_firstName} ${lastName || tutor.str_lastName}`;
                if (email) userUpdateData.str_email = email;
                if (Object.keys(userUpdateData).length > 0) {
                    await user.update(userUpdateData, { transaction });
                }
            }

            // Update weekly availability slots
            if (Array.isArray(weeklyHours)) {
                // Delete existing slots
                await db.AvailabilitySlot.destroy({
                    where: { obj_entityId: tutor.id, obj_entityType: roles.TUTOR },
                    transaction
                });

                const newAvailabilitySlots = [];
                for (const dayObj of weeklyHours) {
                    if (Array.isArray(dayObj.slots)) {
                        for (const slot of dayObj.slots) {
                            newAvailabilitySlots.push({
                                obj_entityId: tutor.id,
                                obj_entityType: roles.TUTOR,
                                str_day: dayObj.day,
                                str_start: slot.start,
                                str_end: slot.end
                            });
                        }
                    }
                }
                if (newAvailabilitySlots.length > 0) {
                    await db.AvailabilitySlot.bulkCreate(newAvailabilitySlots, { transaction });
                }
            }

            // Handle assigned students (many-to-many)
            if (Array.isArray(assignedStudents)) {
                // Fetch current assigned students
                const currentAssignedStudents = await tutor.getArr_assignedStudents({ transaction });
                const currentStudentIds = new Set(currentAssignedStudents.map(s => s.id));
                const newStudentIds = new Set(assignedStudents);

                // Students to add
                const studentsToAdd = [...newStudentIds].filter(id => !currentStudentIds.has(id));
                if (studentsToAdd.length > 0) {
                    await tutor.addArr_assignedStudents(studentsToAdd, { transaction });
                    await db.Student.update(
                        { objectId_assignedTutor: tutor.id },
                        { where: { id: { [Op.in]: studentsToAdd } }, transaction }
                    );
                }

                // Students to remove
                const studentsToRemove = [...currentStudentIds].filter(id => !newStudentIds.has(id));
                if (studentsToRemove.length > 0) {
                    await tutor.removeArr_assignedStudents(studentsToRemove, { transaction });

                    await db.Student.update(
                        { objectId_assignedTutor: null },
                        { where: { id: { [Op.in]: studentsToRemove } }, transaction }
                    );
                }
            }

            // Reload tutor to get updated data
            await tutor.reload({ transaction });

            await transaction.commit();
            return { statusCode: 200, message: "Tutor updated successfully", data: tutor };

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

// GET ONE TUTOR DETAILS SERVICE
exports.getonetutorservice = async (req) => {
    const tutorId = req.params.id;
    const userId = req.user?.id;
    try {

        if (!userId) {
            throw new AppError("Unauthorized access", 401);
        }

        // Fetch tutor with assigned students and payments
        const tutor = await db.Tutor.findByPk(tutorId, {
            include: [
                {
                    model: db.Student,
                    as: 'arr_assignedStudents', // your alias
                    attributes: [
                        'id', 'int_studentNumber', 'str_firstName', 'str_lastName', 'str_familyName',
                        'str_grade', 'str_year', 'str_email', 'str_phoneNumber', 'str_address',
                        'str_city', 'str_state', 'str_country', 'dt_startDate', 'dt_dischargeDate',
                        'bln_accountCreated', 'str_referralSource', 'str_meetingLink',
                        'objectId_assignedTutor', 'str_timezone', 'int_sessionDuration',
                        'arr_assessments', 'str_status'
                    ],
                    through: { attributes: [] }
                }
            ]
        });
        console.log(tutor)

        if (!tutor) {
            throw new AppError("Tutor not found", 404);
        }

        const currentStudentsCount = tutor.arr_assignedStudents.length;

        // Fetch slots related to this tutor (if needed)
        const slots = await db.Slot.findAll({
            where: {
                obj_tutor: tutorId
            },  
            raw: true
        });
        const PaymentHistory = await db.Payment.findAll({
            where: {
                obj_tutorId: tutorId
            },
            raw: true
        });

        const responseData = {
            id: tutor.id,
            firstName: tutor.str_firstName,
            lastName: tutor.str_lastName,
            email: tutor.str_email,
            phoneNumber: tutor.str_phoneNumber,
            address: tutor.str_address,
            city: tutor.str_city,
            province: tutor.str_province,
            country: tutor.str_country,
            timezone: tutor.str_timezone,
            currentStudents: currentStudentsCount,
            rate: tutor.int_rate,
            status: tutor.str_status,
            slots,
            assignedStudents: tutor.arr_assignedStudents.map(student => ({
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
                assignedTutor: student.objectId_assignedTutor,
                timezone: student.str_timezone,
                assessments: student.arr_assessments,
                status: student.str_status
            })),
            payments: PaymentHistory
        };

        return { statusCode: 200, data: responseData };
    } catch (error) {
        console.log(error);
    };
};

// GET ALL TUTORS WITH PAGINATION SERVICE
exports.getonewithpaginationtutorservice = async (req) => {
    const { page = 1, limit = 10, name = '', rate, status: queryStatus } = req.query;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const itemsPerPage = Math.max(1, parseInt(limit, 10) || 10);

    const filter = {};

    if (name && typeof name === 'string' && name.trim() !== '') {
        // Use Op.like for MySQL (case-insensitive depending on collation)
        filter.str_firstName = { [Op.like]: `%${name.trim()}%` };
    }

    if (rate !== undefined) {
        const parsedRate = parseFloat(rate);
        if (!isNaN(parsedRate)) {
            filter.int_rate = { [Op.gte]: parsedRate };
        }
    }

    if (queryStatus) {
        filter.str_status = queryStatus;
    }

    const { count: total, rows: tutors } = await db.Tutor.findAndCountAll({
        where: filter,
        offset: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
        order: [['createdAt', 'DESC']],
        raw: true
    });

    return {
        statusCode: 200,
        data: tutors,
        currentPage,
        totalPages: Math.ceil(total / itemsPerPage),
        totalRecords: total
    };
};

// DELETE TUTOR SERVICE
exports.deletetutorservice = async (req) => {
    const tutorId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const transaction = await db.sequelize.transaction();
    try {
        // Find the tutor
        const tutor = await db.Tutor.findByPk(tutorId, { transaction });
        if (!tutor) {
            throw new AppError("Tutor not found", 404);
        }

        // Delete associated AvailabilitySlots
        await db.AvailabilitySlot.destroy({
            where: { obj_entityId: tutorId, obj_entityType: roles.TUTOR },
            transaction
        });

        // Clear assigned tutor on students
        await db.Student.update(
            { objectId_assignedTutor: null },
            { where: { objectId_assignedTutor: tutorId }, transaction }
        );

        // Delete entries in join table TutorStudents
        await db.sequelize.models.TutorStudents.destroy({
            where: {
                obj_tutor: tutorId
            },
            transaction
        });

        // Delete the tutor record
        await tutor.destroy({ transaction });

        // Delete associated User
        const user = await db.User.findOne({ where: { profileId: tutorId, profileType: roles.TUTOR }, transaction });
        if (user) {
            await user.destroy({ transaction });
        }

        await transaction.commit();
        return { statusCode: 200, message: "Tutor and associated data deleted successfully" };

    } catch (error) {
        await transaction.rollback();
        console.error("Error deleting tutor:", error);
        throw new AppError(`Failed to delete tutor: ${error.message}`, 500);
    }
};

exports.adjustTutorAvailability = async (studentId) => {
    const transaction = await db.sequelize.transaction();
    try {
        const student = await db.Student.findByPk(studentId, {
            attributes: ['str_status', 'objectId_assignedTutor'],
            transaction
        });
        if (!student) {
            throw new AppError("Student not found", 404);
        }

        if (student.str_status === userStatus.INACTIVE && student.objectId_assignedTutor) {
            const tutor = await db.Tutor.findByPk(student.objectId_assignedTutor, {
                attributes: ['id', 'str_email', 'str_firstName'],
                transaction
            });
            if (!tutor) {
                throw new AppError("Tutor not found", 404);
            }

            // Update slots: mark as available and remove student link
            const [affectedRows] = await db.Slot.update(
                { str_status: slotstatus.AVAILABLE, obj_studentId: null },
                {
                    where: {
                        obj_studentId: studentId,
                        str_status: slotstatus.BOOKED
                    },
                    transaction
                }
            );

            if (affectedRows > 0) {
                console.log(`Freed ${affectedRows} slots for tutor ${tutor.id}`);
                await notifyEmail(
                    tutor.str_email,
                    'Slot Availability Updated',
                    `Hello ${tutor.str_firstName},\n\n${affectedRows} slots have been freed due to a student going inactive.`
                );
            }
        }

        await transaction.commit();
        return { statusCode: 200, message: "Tutor availability adjusted successfully" };
    } catch (error) {
        await transaction.rollback();
        console.error("Error adjusting tutor availability:", error);
        throw new AppError(`Failed to adjust tutor availability: ${error.message}`, 500);
    }
};

// CALCULATE TUTOR PAYMENTS
exports.calculateTutorPayments = async (tutorId) => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    try {
        // Fetch tutor with assigned students
        const tutor = await db.Tutor.findByPk(tutorId, {
            attributes: ['id', 'int_rate'], // Current tutor rate
            include: [
                {
                    model: db.Student,
                    as: 'arr_assignedStudents', // From your Tutor model association
                    attributes: ['id'],
                    through: { attributes: [] }
                }
            ]
        });
        if (!tutor) {
            throw new AppError("Tutor not found", 404);
        }

        const assignedStudentIds = tutor.arr_assignedStudents.map(s => s.id);

        // Fetch completed slots for this tutor and their assigned students within the last week
        const completedSlots = await db.Slot.findAll({
            where: {
                obj_tutor: tutorId,
                obj_studentId: { [Op.in]: assignedStudentIds },
                str_status: slotstatus.COMPLETED,
                str_attendance: attendnace.ATTENDED,
                updatedAt: { [Op.gte]: oneWeekAgo }
            },
            include: [
                {
                    model: db.Student,
                    as: 'student',
                    attributes: ['str_firstName', 'str_lastName']
                }
            ]
        });

        const studentEarningsMap = new Map();
        let totalEarnings = 0;

        for (const slot of completedSlots) {
            const studentId = slot.obj_studentId;
            const studentName = slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : 'Unknown Student';

            // Use tutor's current rate per slot (since no rate history)
            const payoutForSlot = tutor.int_rate;

            if (!studentEarningsMap.has(studentId)) {
                studentEarningsMap.set(studentId, {
                    studentId,
                    studentName,
                    totalEarnings: 0,
                    sessionCount: 0
                });
            }
            const stats = studentEarningsMap.get(studentId);
            stats.totalEarnings += payoutForSlot;
            stats.sessionCount += 1;
            totalEarnings += payoutForSlot;
        }

        const studentEarnings = Array.from(studentEarningsMap.values());

        return {
            statusCode: 200,
            data: {
                tutorId: tutor.id,
                totalEarnings,
                totalSessions: completedSlots.length,
                lastUpdated: new Date(),
                studentEarnings
            }
        };
    } catch (error) {
        console.error("Error calculating tutor payments:", error);
        throw new AppError(`Failed to calculate tutor payments: ${error.message}`, 500);
    }
};

// ASSIGN STUDENT TO TUTOR
exports.assignstudentservices = async (tutorId, req) => {
    const { studentId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("User is unauthorized!", 401);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) throw new AppError("User not found!", 404);

        const tutor = await db.Tutor.findByPk(tutorId, { transaction });
        if (!tutor) throw new AppError("Tutor not found!", 404);

        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) throw new AppError("Student not found!", 404);

        // Check if student already assigned by checking student's assignedTutor field
        if (student.objectId_assignedTutor === tutorId) {
            throw new AppError("Student is already assigned to this tutor.", 400);
        }

        // Add student to tutor's assignedStudents via association method
        await tutor.addArr_assignedStudents(student, { transaction });

        // Update student's assignedTutor
        await student.update({ objectId_assignedTutor: tutorId }, { transaction });

        await transaction.commit();
        return { statusCode: 200, message: "Tutor has been assigned student successfully" };

    } catch (error) {
        await transaction.rollback();
        console.error("Error assigning student to tutor:", error);
        throw new AppError(`Failed to assign student: ${error.message}`, 500);
    }
};


exports.tutormastersservice = async (req) => {
    const { search } = req.query;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("User is unauthorized!", 401);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new AppError("User not found!", 404);
    }

    let filter = {};
    if (search) {
        filter.str_firstName = { [Op.like]: `%${search}%` };  // Use Op.like for MySQL
    }

    const tutors = await db.Tutor.findAll({
        where: filter,
        attributes: ['id', 'str_firstName', 'str_lastName'],
        raw: true
    });

    if (tutors.length === 0) {
        throw new AppError("No tutors found matching criteria.", 404);
    }

    return { message: "Tutors fetched successfully!", statusCode: 200, data: tutors };
};

// R3MOVE STUDENT 
exports.removeStudentService = async (req, tutorId) => {
    const { studentId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("User is unauthorized!", 401);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) {
            throw new AppError("User not found!", 404);
        }

        const tutor = await db.Tutor.findByPk(tutorId, { transaction });
        if (!tutor) {
            throw new AppError("Tutor not found!", 404);
        }

        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) {
            throw new AppError("Student not found!", 404);
        }

        // Check if the student is assigned to this tutor
        const isAssigned = await tutor.hasAssignedStudent(student, { transaction }); // pass model instance
        if (!isAssigned) {
            throw new AppError("Student is not assigned to this tutor.", 400);
        }

        // Remove association in the join table
        await tutor.removeAssignedStudent(student, { transaction });

        // Clear assignedTutor on the student
        await student.update({ objectId_assignedTutor: null }, { transaction });

        await transaction.commit();
        return { message: "Student removed from tutor successfully!", statusCode: 200 };

    } catch (error) {
        await transaction.rollback();
        console.error("Error removing student from tutor:", error);
        throw new AppError(`Failed to remove student from tutor: ${error.message}`, 500);
    }
};
