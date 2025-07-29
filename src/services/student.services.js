const bcrypt = require('bcrypt');
const { db } = require('../utils/db');
const AppError = require('../utils/AppError');
const mailer = require('../utils/mailer');
const { roles, userStatus } = require('../constants/sequelizetableconstants');
const randompassword = require('../utils/randompassword');
const { Op } = require('sequelize');
const moment = require('moment-timezone');
const tutorServices = require('./tutor.services');

// STUDENT CREATE SERVICE
exports.createstudentservice = async (req) => {
    const {
        studentNumber, firstName, lastName, familyName,
        grade, year, email, phoneNumber, address, city, state, country,
        startDate, dischargeDate, accountCreated, assignedTutor, timezone,
        sessionDuration, avaliableTime, paymentMethod, transactionFee,
        totalAmount, tutorPayout, profitWeek, profitMonth,
        referralSource, meetingLink
    } = req.body;

    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized access", 401);

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const transaction = await db.sequelize.transaction();
        try {
            const existing = await db.Student.findOne({
                where: {
                    [Op.or]: [
                        { int_studentNumber: studentNumber },
                        { str_email: email },
                        { str_phoneNumber: phoneNumber }
                    ]
                },
                transaction
            });
            if (existing) {
                throw new AppError("Student with provided email, phone or number already exists.", 400);
            }

            let tutorInstance = null;
            if (assignedTutor) {
                tutorInstance = await db.Tutor.findByPk(assignedTutor, { transaction });
                if (!tutorInstance) {
                    throw new AppError("Assigned tutor not found", 404);
                }
            }

            const createStudent = await db.Student.create({
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
                dt_startDate: startDate,
                dt_dischargeDate: dischargeDate,
                objectId_assignedTutor: assignedTutor || null,
                str_timezone: timezone,
                int_sessionDuration: sessionDuration,
                str_paymentMethod: paymentMethod,
                int_transactionFee: transactionFee,
                int_totalAmount: totalAmount,
                int_tutorPayout: tutorPayout,
                int_profitWeek: profitWeek,
                int_profitMonth: profitMonth,
                str_referralSource: referralSource,
                str_meetingLink: meetingLink,
                arr_assessments: [],
                bln_accountCreated: accountCreated,
                str_status: userStatus.ACTIVE,
                objectId_createdBy: userId,
            }, { transaction });

            if (Array.isArray(avaliableTime) && avaliableTime.length > 0) {
                const availabilitySlots = [];
                for (const dayObj of avaliableTime) {
                    if (Array.isArray(dayObj.slots)) {
                        for (const slot of dayObj.slots) {
                            availabilitySlots.push({
                                obj_entityId: createStudent.id,
                                obj_entityType: roles.STUDENT,
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

            if (tutorInstance) {
                await tutorInstance.addAssignedStudent(createStudent, { transaction });
            }

            if (accountCreated) {
                const rawPassword = randompassword();
                const hashedPassword = await bcrypt.hash(rawPassword, 12);
                await db.User.create({
                    str_fullName: `${firstName} ${lastName}`,
                    str_email: email,
                    str_password: hashedPassword,
                    str_role: roles.STUDENT,
                    obj_profileId: createStudent.id,
                    obj_profileType: roles.STUDENT
                }, { transaction });

                await mailer.sendMail({
                    to: email,
                    from: 'vanshsanklecha36@gmail.com',
                    subject: 'Welcome to Our Platform!',
                    text: `Hello ${firstName},\n\nWelcome to our platform! Your login credentials:\n\nEmail: ${email}\nPassword: ${rawPassword}\n\nYou can now log in to access your schedule and slots.`
                });
            }

            await transaction.commit();
            return { statusCode: 201, message: "Student created successfully" };

        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            const isDeadlock = error?.parent?.code === 'ER_LOCK_DEADLOCK';
            if (isDeadlock && attempt < MAX_RETRIES) {
                console.warn(`⚠️ Deadlock detected. Retrying attempt ${attempt}...`);
                await new Promise(r => setTimeout(r, 200 * attempt));
                continue;
            }
            throw error; // Propagate original error
        }
    }
};

// STUDENT UPDATE SERVICE
exports.updatestudentservice = async (req) => {
    const studentId = req.params.id;
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const transaction = await db.sequelize.transaction();
        try {
            const student = await db.Student.findByPk(studentId, { transaction });
            if (!student) {
                throw new AppError("Student not found", 404);
            }

            const {
                studentNumber,
                firstName,
                lastName,
                familyName,
                grade,
                year,
                email,
                phoneNumber,
                address,
                city,
                state,
                country,
                startDate,
                dischargeDate,
                assignedTutor,
                timezone,
                sessionDuration,
                avaliableTime,
                paymentMethodPaypal,
                paymentMethodStripe,
                transactionFee,
                totalAmount,
                tutorPayout,
                profitWeek,
                profitMonth,
                referralSource,
                meetingLink,
                assessments,
                accountCreated,
                status: newStatus
            } = req.body;

            const existing = await db.Student.findOne({
                where: {
                    [Op.or]: [
                        { int_studentNumber: studentNumber },
                        { str_email: email },
                        { str_phoneNumber: phoneNumber }
                    ],
                    id: { [Op.ne]: studentId }
                },
                transaction
            });
            if (existing) {
                throw new AppError("Another student with the same email, phone, or student number already exists.", 400);
            }

            const oldAssignedTutorId = student.objectId_assignedTutor;
            let newAssignedTutorInstance = null;

            if (assignedTutor) {
                newAssignedTutorInstance = await db.Tutor.findByPk(assignedTutor, { transaction });
                if (!newAssignedTutorInstance) {
                    throw new AppError("Assigned tutor not found", 404);
                }

                if (oldAssignedTutorId && oldAssignedTutorId !== assignedTutor) {
                    const oldTutor = await db.Tutor.findByPk(oldAssignedTutorId, { transaction });
                    if (oldTutor) await oldTutor.removeAssignedStudent(student, { transaction });
                }
                if (oldAssignedTutorId !== assignedTutor) {
                    await newAssignedTutorInstance.addAssignedStudent(student, { transaction });
                }
            } else if (oldAssignedTutorId && assignedTutor === null) {
                const oldTutor = await db.Tutor.findByPk(oldAssignedTutorId, { transaction });
                if (oldTutor) await oldTutor.removeAssignedStudent(student, { transaction });
            }

            const newAvailabilityTime = [];
            if (avaliableTime) {
                if (!Array.isArray(avaliableTime)) {
                    throw new AppError("Selected slots must be an array", 400);
                }
                for (const slot of avaliableTime) {
                    if (!slot.day || !Array.isArray(slot.slots)) {
                        throw new AppError("Each selected slot must include a day and an array of slots", 400);
                    }

                    for (const time of slot.slots) {
                        if (!time.start || !time.end) {
                            throw new AppError("Each slot must include start and end time", 400);
                        }
                    }
                }
                await db.AvailabilitySlot.destroy({
                    where: { obj_entityId: student.id, obj_entityType: roles.STUDENT },
                    transaction
                });

                for (const dayObj of avaliableTime) {
                    for (const slot of dayObj.slots) {
                        newAvailabilityTime.push({
                            obj_entityId: student.id,
                            obj_entityType: roles.STUDENT,
                            str_day: dayObj.day,
                            str_start: slot.start,
                            str_end: slot.end
                        });
                    }
                }
                if (newAvailabilityTime.length > 0) {
                    await db.AvailabilitySlot.bulkCreate(newAvailabilityTime, { transaction });
                }
            }

            const currentTotalAmount = totalAmount ?? student.int_totalAmount;
            const currentTutorPayout = tutorPayout ?? student.int_tutorPayout;
            const currentTransactionFee = transactionFee ?? student.int_transactionFee;
            const currentProfitWeek = profitWeek ?? student.int_profitWeek;
            if (
                currentTotalAmount !== undefined &&
                currentTutorPayout !== undefined &&
                currentTransactionFee !== undefined &&
                currentProfitWeek !== undefined
            ) {
                const calculatedProfit = currentTotalAmount - currentTutorPayout - currentTransactionFee;
                if (Math.abs(calculatedProfit - currentProfitWeek) > 1) {
                    throw new AppError("Profit mismatch. Check totalAmount, payout, and fees.", 400);
                }
            }

            const paymentMethod = paymentMethodPaypal || paymentMethodStripe || student.str_paymentMethod || "Unknown";

            const updateFields = {
                int_studentNumber: studentNumber ?? student.int_studentNumber,
                str_firstName: firstName ?? student.str_firstName,
                str_lastName: lastName ?? student.str_lastName,
                str_familyName: familyName ?? student.str_familyName,
                str_grade: grade ?? student.str_grade,
                str_year: year ?? student.str_year,
                str_email: email ?? student.str_email,
                str_phoneNumber: phoneNumber ?? student.str_phoneNumber,
                str_address: address ?? student.str_address,
                str_city: city ?? student.str_city,
                str_state: state ?? student.str_state,
                str_country: country ?? student.str_country,
                dt_startDate: startDate ?? student.dt_startDate,
                dt_dischargeDate: dischargeDate ?? student.dt_dischargeDate,
                objectId_assignedTutor: assignedTutor,
                str_timezone: timezone ?? student.str_timezone,
                int_sessionDuration: sessionDuration ?? student.int_sessionDuration,
                str_paymentMethod: paymentMethod,
                int_transactionFee: transactionFee ?? student.int_transactionFee,
                int_totalAmount: totalAmount ?? student.int_totalAmount,
                int_tutorPayout: tutorPayout ?? student.int_tutorPayout,
                int_profitWeek: profitWeek ?? student.int_profitWeek,
                int_profitMonth: profitMonth ?? student.int_profitMonth,
                str_referralSource: referralSource ?? student.str_referralSource,
                str_meetingLink: meetingLink ?? student.str_meetingLink,
                arr_assessments: assessments ?? student.arr_assessments,
                bln_accountCreated: accountCreated ?? student.bln_accountCreated,
                str_status: newStatus ?? student.str_status,
            };
            Object.keys(updateFields).forEach(k => updateFields[k] === undefined && delete updateFields[k]);

            await student.update(updateFields, { transaction });

            const user = await db.User.findOne({
                where: { obj_profileId: studentId, obj_profileType: roles.STUDENT },
                transaction
            });
            if (user) {
                const userUpdateData = {};
                if (firstName || lastName) {
                    userUpdateData.str_fullName = `${firstName || student.str_firstName} ${lastName || student.str_lastName}`;
                }
                if (email) userUpdateData.str_email = email;
                if (Object.keys(userUpdateData).length > 0) {
                    await user.update(userUpdateData, { transaction });
                }
            }

            await transaction.commit();
            return { statusCode: 200, message: "Student updated successfully", student, newAvailabilityTime };

        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            const isDeadlock = error?.parent?.code === 'ER_LOCK_DEADLOCK';
            if (isDeadlock && attempt < MAX_RETRIES) {
                console.warn(`⚠️ Deadlock detected. Retrying attempt ${attempt}...`);
                await new Promise(r => setTimeout(r, 200 * attempt));
                continue;
            }
            throw error; // Propagate original error
        }
    }
};

// GET ONE STUDENT DETAILS SERVICE
exports.getonestudentservice = async (req) => {
    const studentId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }
    const student = await db.Student.findByPk(studentId, {
        include: [
            { model: db.Tutor, as: 'obj_assignedTutor' },
            { model: db.AvailabilitySlot, as: 'arr_weeklyAvailability' }
        ]
    });

    const studentpayment = await db.Payment.findAll({
        where: { obj_studentId: studentId },
    });

    if (!student) {
        throw new AppError("Student not found", 404);
    }

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
        assignedTutor: student.objectId_assignedTutor,
        assignedTutorName: student.obj_assignedTutor
            ? `${student.obj_assignedTutor.str_firstName} ${student.obj_assignedTutor.str_lastName}`
            : null,
        timezone: student.str_timezone,
        sessionDuration: student.int_sessionDuration,
        avaliableTime: student.arr_weeklyAvailability,
        paymentMethod: student.str_paymentMethod,
        transactionFee: student.int_transactionFee,
        totalAmount: student.int_totalAmount,
        tutorPayout: student.int_tutorPayout,
        profitWeek: student.int_profitWeek,
        profitMonth: student.int_profitMonth,
        referralSource: student.str_referralSource,
        meetingLink: student.str_meetingLink,
        assessments: student.arr_assessments,
        accountCreated: student.bln_accountCreated,
        status: student.str_status,
        payoutHistory: studentpayment
    };

    return { statusCode: 200, data };
};

// GET STUDENTS WITH PAGINATION SERVICE
exports.getonewithpaginationservice = async (req) => {
    const { page = 1, limit = 10, name = '', status: queryStatus, date, tutorId } = req.query;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const currentPage = parseInt(page);
    const itemsPerPage = parseInt(limit);

    if (currentPage < 1) throw new AppError("Page must be a positive integer.", 400);
    if (itemsPerPage < 1) throw new AppError("Limit must be a positive integer.", 400);

    const filter = {};

    if (name && typeof name === 'string') {
        filter.str_firstName = { [Op.like]: `%${name}%` };
    }
    if (queryStatus) {
        filter.str_status = queryStatus;
    }
    if (date) {
        const filterDate = moment(date, 'YYYY-MM-DD', true);
        if (!filterDate.isValid()) {
            throw new AppError("Invalid date format. Use YYYY-MM-DD.", 400);
        }
        filter.dt_startDate = {
            [Op.gte]: filterDate.startOf('day').toDate(),
            [Op.lte]: filterDate.endOf('day').toDate()
        };
    }
    if (tutorId) {
        filter.objectId_assignedTutor = tutorId;
    }

    const { count: total, rows: students } = await db.Student.findAndCountAll({
        where: filter,
        offset: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
        order: [['createdAt', 'DESC']],
        include: [
            {
                model: db.Tutor,
                as: 'obj_assignedTutor',
                attributes: ['str_firstName', 'str_lastName'],
                required: false
            }
        ],
        attributes: [
            'id', 'str_firstName', 'str_lastName', 'str_email', 'str_status', 'createdAt'
        ],
        raw: true,
        nest: true
    });

    const formattedStudents = students.map(student => ({
        ...student,
        assignedTutorName: student.obj_assignedTutor
            ? `${student.obj_assignedTutor.str_firstName} ${student.obj_assignedTutor.str_lastName}`
            : null
    }));

    return {
        statusCode: 200,
        data: formattedStudents,
        currentPage,
        totalPages: Math.ceil(total / itemsPerPage),
        totalRecords: total
    };
};

// DELETE STUDENT SERVICE
exports.deletestudentservice = async (req) => {
    const studentId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) {
            throw new AppError("Student not found", 404);
        }

        if (student.objectId_assignedTutor) {
            const tutor = await db.Tutor.findByPk(student.objectId_assignedTutor, { transaction });
            if (tutor) {
                await tutor.removeAssignedStudent(student, { transaction });
            }
        }

        await db.AvailabilitySlot.destroy({
            where: { obj_entityId: studentId, obj_entityType: roles.STUDENT },
            transaction
        });

        await db.PaymentHistory.destroy({
            where: { obj_studentId: studentId },
            transaction
        });

        const user = await db.User.findOne({
            where: { obj_profileId: studentId, obj_profileType: roles.STUDENT },
            transaction
        });
        if (user) {
            await user.destroy({ transaction });
        }

        await student.destroy({ transaction });

        await transaction.commit();
        return { statusCode: 200, message: "Student and associated data deleted successfully" };

    } catch (error) {
        await transaction.rollback();
        throw error; // Propagate original error
    }
};

// STATUS CHANGE SERVICE OF THE STUDENT
exports.statuschangeservice = async (studentId, req) => {
    const { status: newStatus } = req.body;
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    const validStatuses = [userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED];
    if (!validStatuses.includes(newStatus)) {
        throw new AppError("Invalid status value", 400);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) {
            throw new AppError("Student not found", 404);
        }

        await student.update({ str_status: newStatus }, { transaction });

        await transaction.commit();

        await tutorServices.adjustTutorAvailability(studentId);

        return { statusCode: 200, message: "Status changed successfully!" };
    } catch (error) {
        await transaction.rollback();
        throw error; // Propagate original error
    }
};

// GET STUDENT ASSESSMENTS SERVICE
exports.getAssessments = async (studentId) => {
    try {
        const student = await db.Student.findByPk(studentId, {
            attributes: ['arr_assessments']
        });
        if (!student) {
            throw new AppError("Student not found", 404);
        }
        return { statusCode: 200, data: student.arr_assessments || [] };
    } catch (error) {
        throw error; // Propagate original error
    }
};

// DELETE STUDENT ASSESSMENT SERVICE
exports.deleteAssessments = async (studentId, filePath) => {
    const transaction = await db.sequelize.transaction();
    try {
        const student = await db.Student.findByPk(studentId, { transaction });
        if (!student) {
            throw new AppError("Student not found", 404);
        }

        let currentAssessments = student.arr_assessments || [];
        const initialLength = currentAssessments.length;

        currentAssessments = currentAssessments.filter(item => item !== filePath);

        if (currentAssessments.length === initialLength) {
            throw new AppError("Assessment not found or already deleted", 404);
        }

        await student.update({ arr_assessments: currentAssessments }, { transaction });

        await transaction.commit();
        return { statusCode: 200, message: "Assessment deleted successfully" };
    } catch (error) {
        await transaction.rollback();
        throw error; // Propagate original error
    }
};

// ASSIGN TUTOR TO STUDENT
exports.assigntutorservices = async (studentId, req) => {
    const { tutorId } = req.body;
    const userId = req.user.id;

    if (!userId) {
        throw new AppError("User is unauthorized!", 401);
    }
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const transaction = await db.sequelize.transaction();
        try {
            const student = await db.Student.findByPk(studentId, { transaction });
            if (!student) {
                throw new AppError("Student not found!", 404);
            }

            const tutor = await db.Tutor.findByPk(tutorId, { transaction });
            if (!tutor) {
                throw new AppError("Tutor not found!", 404);
            }

            if (student.objectId_assignedTutor) {
                throw new AppError("Student is already assigned a tutor.", 400);
            }

            await student.update({ objectId_assignedTutor: tutorId }, { transaction });
            await tutor.addAssignedStudent(student, { transaction });

            await transaction.commit();
            return { statusCode: 200, message: "Student has been assigned tutor successfully" };

        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            const isDeadlock = error?.parent?.code === 'ER_LOCK_DEADLOCK';
            if (isDeadlock && attempt < MAX_RETRIES) {
                console.warn(`⚠️ Deadlock detected. Retrying attempt ${attempt}...`);
                await new Promise(r => setTimeout(r, 200 * attempt));
                continue;
            }
            throw error; // Propagate original error
        }
    }
};

// STUDENT MASTER (WITHOUT PAGINATION BUT WITH SEARCH)
exports.studentmastesrservice = async (req) => {
    const { search } = req.query;
    let filter = {};
    if (search) {
        filter.str_firstName = { [Op.like]: `%${search}%` };
    }

    const students = await db.Student.findAll({
        where: filter,
        attributes: ['id', 'str_firstName', 'str_lastName'],
        raw: true
    });

    if (students.length === 0) {
        throw new AppError("No students found matching criteria.", 404);
    }

    return { message: "Students fetched successfully!", statusCode: 200, data: students };
};
