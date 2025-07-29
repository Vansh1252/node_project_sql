const studentServices = require('../../services/student.services');
const { db } = require('../../utils/db');
const AppError = require('../../utils/AppError');
const bcrypt = require('bcrypt');
const moment = require('moment-timezone');
const mailer = require('../../utils/mailer');
const randompassword = require('../../utils/randompassword');
const tutorServices = require('../../services/tutor.services');
const { roles, userStatus } = require('../../constants/sequelizetableconstants');

// Mock dependencies
jest.mock('../../utils/db', () => ({
    db: {
        sequelize: {
            transaction: jest.fn(),
            Op: {
                or: Symbol('or'),
                ne: Symbol('ne'),
                like: Symbol('like'),
                gte: Symbol('gte'),
                lte: Symbol('lte'),
            },
            models: {
                TutorStudents: { destroy: jest.fn().mockResolvedValue(1) },
            },
        },
        User: {
            findByPk: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            destroy: jest.fn(),
        },
        Tutor: {
            findByPk: jest.fn(),
            addAssignedStudent: jest.fn().mockResolvedValue(true),
            removeAssignedStudent: jest.fn().mockResolvedValue(true),
        },
        Student: {
            findByPk: jest.fn(),
            findOne: jest.fn(),
            findAll: jest.fn(),
            findAndCountAll: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            destroy: jest.fn(),
        },
        AvailabilitySlot: {
            bulkCreate: jest.fn().mockResolvedValue([]),
            destroy: jest.fn().mockResolvedValue(0),
        },
        Payment: {
            findAll: jest.fn(),
        },
        PaymentHistory: {
            destroy: jest.fn().mockResolvedValue(0),
        },
    },
}));
jest.mock('bcrypt', () => ({
    hash: jest.fn().mockResolvedValue('hashed-password'),
}));
jest.mock('moment-timezone', () => {
    const momentMock = jest.fn((...args) => {
        const instance = {
            format: jest.fn().mockReturnValue('2025-07-30'),
            startOf: jest.fn().mockReturnThis(),
            endOf: jest.fn().mockReturnThis(),
            toDate: jest.fn().mockReturnValue(new Date('2025-07-30')),
            isValid: jest.fn().mockReturnValue(true),
            tz: jest.fn().mockReturnThis(),
        };
        if (args[0] === 'invalid-date') {
            instance.isValid.mockReturnValue(false);
        }
        return instance;
    });
    momentMock.tz = jest.fn().mockReturnValue(momentMock());
    return momentMock;
});
jest.mock('../../utils/mailer', () => ({
    sendMail: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../utils/randompassword', () => jest.fn(() => 'random-password'));
jest.mock('../../services/tutor.services', () => ({
    adjustTutorAvailability: jest.fn().mockResolvedValue(true),
}));

describe('Student Services (Sequelize)', () => {
    let mockUser, mockTutor, mockStudent, mockTransaction, req;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTransaction = {
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            finished: false,
        };
        db.sequelize.transaction.mockResolvedValue(mockTransaction);

        mockUser = {
            id: 'user-uuid-123',
            str_role: roles.ADMIN,
            str_email: 'admin@example.com',
            str_firstName: 'Admin',
            str_lastName: 'User',
        };

        mockTutor = {
            id: 'tutor-uuid-789',
            str_firstName: 'Jane',
            str_lastName: 'Smith',
            addAssignedStudent: jest.fn().mockResolvedValue(true),
            removeAssignedStudent: jest.fn().mockResolvedValue(true),
        };

        mockStudent = {
            id: 'student-uuid-456',
            int_studentNumber: 'STU001',
            str_firstName: 'Alice',
            str_lastName: 'Johnson',
            str_email: 'alice@example.com',
            str_phoneNumber: '1234567890',
            str_status: userStatus.ACTIVE,
            objectId_assignedTutor: null,
            arr_assessments: ['assessment1.pdf'],
            update: jest.fn().mockResolvedValue(true),
            destroy: jest.fn().mockResolvedValue(true),
        };

        req = {
            user: { id: 'user-uuid-123' },
            body: {},
            params: {},
            query: {},
        };
    });

    describe('createstudentservice', () => {
        it('should create a student successfully with account', async () => {
            req.body = {
                studentNumber: 'STU001',
                firstName: 'Alice',
                lastName: 'Johnson',
                email: 'alice@example.com',
                phoneNumber: '1234567890',
                assignedTutor: 'tutor-uuid-789',
                accountCreated: true,
                avaliableTime: [{ day: 'Monday', slots: [{ start: '09:00', end: '10:00' }] }],
            };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findOne.mockResolvedValue(null);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.create.mockResolvedValue(mockStudent);
            db.User.create.mockResolvedValue({ id: 'user-uuid-456' });

            const result = await studentServices.createstudentservice(req);

            expect(result).toEqual({
                statusCode: 201,
                message: 'Student created successfully',
            });
            // expect(db.Student.findOne).toHaveBeenCalledWith({
            //     where: {
            //         [db.sequelize.Op.or]: [
            //             { int_studentNumber: 'STU001' },
            //             { str_email: 'alice@example.com' },
            //             { str_phoneNumber: '1234567890' },
            //         ],
            //     },
            //     transaction: mockTransaction,
            // });
            expect(db.Student.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    int_studentNumber: 'STU001',
                    str_firstName: 'Alice',
                    str_lastName: 'Johnson',
                    str_email: 'alice@example.com',
                    str_phoneNumber: '1234567890',
                    objectId_assignedTutor: 'tutor-uuid-789',
                    bln_accountCreated: true,
                }),
                { transaction: mockTransaction }
            );
            expect(db.AvailabilitySlot.bulkCreate).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        obj_entityId: 'student-uuid-456',
                        obj_entityType: roles.STUDENT,
                        str_day: 'Monday',
                        str_start: '09:00',
                        str_end: '10:00',
                    }),
                ]),
                { transaction: mockTransaction }
            );
            expect(mockTutor.addAssignedStudent).toHaveBeenCalledWith(mockStudent, { transaction: mockTransaction });
            expect(bcrypt.hash).toHaveBeenCalledWith('random-password', 12);
            expect(db.User.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    str_fullName: 'Alice Johnson',
                    str_email: 'alice@example.com',
                    str_password: 'hashed-password',
                    str_role: roles.STUDENT,
                    obj_profileId: 'student-uuid-456',
                    obj_profileType: roles.STUDENT,
                }),
                { transaction: mockTransaction }
            );
            expect(mailer.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'alice@example.com',
                    subject: 'Welcome to Our Platform!',
                })
            );
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if student exists', async () => {
            req.body = { studentNumber: 'STU001', email: 'alice@example.com', phoneNumber: '1234567890' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findOne.mockResolvedValue(mockStudent);

            await expect(studentServices.createstudentservice(req)).rejects.toThrow(
                new AppError('Student with provided email, phone or number already exists.', 400)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should retry on deadlock', async () => {
            req.body = { studentNumber: 'STU001', email: 'alice@example.com', phoneNumber: '1234567890' };
            const deadlockError = new Error('Deadlock');
            deadlockError.parent = { code: 'ER_LOCK_DEADLOCK' };
            db.Student.findOne
                .mockRejectedValueOnce(deadlockError)
                .mockResolvedValue(null);
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.create.mockResolvedValue(mockStudent);

            const result = await studentServices.createstudentservice(req);

            expect(db.Student.findOne).toHaveBeenCalledTimes(2);
            expect(result.statusCode).toBe(201);
            expect(mockTransaction.commit).toHaveBeenCalled();
        });
    });

    describe('updatestudentservice', () => {
        it('should update student successfully', async () => {
            req.params.id = 'student-uuid-456';
            req.body = {
                firstName: 'Alicia',
                email: 'alicia@example.com',
                assignedTutor: 'tutor-uuid-789',
                avaliableTime: [{ day: 'Tuesday', slots: [{ start: '10:00', end: '11:00' }] }],
                totalAmount: 150,
                tutorPayout: 100,
                transactionFee: 10,
                profitWeek: 40,
            };
            db.Student.findByPk.mockResolvedValue(mockStudent);
            db.Student.findOne.mockResolvedValue(null);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.User.findOne.mockResolvedValue({ update: jest.fn().mockResolvedValue(true) });

            const result = await studentServices.updatestudentservice(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Student updated successfully',
                student: mockStudent,
                newAvailabilityTime: expect.arrayContaining([
                    expect.objectContaining({
                        obj_entityId: 'student-uuid-456',
                        obj_entityType: roles.STUDENT,
                        str_day: 'Tuesday',
                        str_start: '10:00',
                        str_end: '11:00',
                    }),
                ]),
            });
            // expect(db.Student.findOne).toHaveBeenCalledWith({
            //     where: {
            //         [db.sequelize.Op.or]: [
            //             { int_studentNumber: undefined },
            //             { str_email: 'alicia@example.com' },
            //             { str_phoneNumber: undefined },
            //         ],
            //         id: { [db.sequelize.Op.ne]: 'student-uuid-456' },
            //     },
            //     transaction: mockTransaction,
            // });
            expect(db.AvailabilitySlot.destroy).toHaveBeenCalledWith({
                where: { obj_entityId: 'student-uuid-456', obj_entityType: roles.STUDENT },
                transaction: mockTransaction,
            });
            expect(db.AvailabilitySlot.bulkCreate).toHaveBeenCalled();
            expect(mockStudent.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    str_firstName: 'Alicia',
                    str_email: 'alicia@example.com',
                    objectId_assignedTutor: 'tutor-uuid-789',
                    int_totalAmount: 150,
                    int_tutorPayout: 100,
                    int_transactionFee: 10,
                    int_profitWeek: 40,
                }),
                { transaction: mockTransaction }
            );
            expect(mockTutor.addAssignedStudent).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error for profit mismatch', async () => {
            req.params.id = 'student-uuid-456';
            req.body = { totalAmount: 150, tutorPayout: 100, transactionFee: 10, profitWeek: 50 };
            db.Student.findByPk.mockResolvedValue(mockStudent);
            db.Student.findOne.mockResolvedValue(null);

            await expect(studentServices.updatestudentservice(req)).rejects.toThrow(
                new AppError('Profit mismatch. Check totalAmount, payout, and fees.', 400)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error for invalid availability format', async () => {
            req.params.id = 'student-uuid-456';
            req.body = { avaliableTime: [{ day: 'Tuesday', slots: [{ start: '10:00' }] }] };
            db.Student.findByPk.mockResolvedValue(mockStudent);

            await expect(studentServices.updatestudentservice(req)).rejects.toThrow(
                new AppError('Each slot must include start and end time', 400)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('getonestudentservice', () => {
        it('should fetch student details', async () => {
            req.params.id = 'student-uuid-456';
            db.Student.findByPk.mockResolvedValue({
                ...mockStudent,
                obj_assignedTutor: mockTutor,
                arr_weeklyAvailability: [{ str_day: 'Monday', str_start: '09:00', str_end: '10:00' }],
            });
            db.Payment.findAll.mockResolvedValue([{ id: 'payment-uuid-123' }]);

            const result = await studentServices.getonestudentservice(req);

            expect(result).toEqual({
                statusCode: 200,
                data: expect.objectContaining({
                    id: 'student-uuid-456',
                    firstName: 'Alice',
                    lastName: 'Johnson',
                    email: 'alice@example.com',
                    assignedTutorName: 'Jane Smith',
                    avaliableTime: expect.any(Array),
                    payoutHistory: expect.any(Array),
                }),
            });
            expect(db.Student.findByPk).toHaveBeenCalledWith(
                'student-uuid-456',
                expect.objectContaining({
                    include: [
                        { model: db.Tutor, as: 'obj_assignedTutor' },
                        { model: db.AvailabilitySlot, as: 'arr_weeklyAvailability' },
                    ],
                })
            );
            expect(db.Payment.findAll).toHaveBeenCalledWith({
                where: { obj_studentId: 'student-uuid-456' },
            });
        });

        it('should throw error if student not found', async () => {
            req.params.id = 'student-uuid-456';
            db.Student.findByPk.mockResolvedValue(null);

            await expect(studentServices.getonestudentservice(req)).rejects.toThrow(
                new AppError('Student not found', 404)
            );
        });
    });

    describe('getonewithpaginationservice', () => {
        it('should fetch paginated students', async () => {
            req.query = { page: '1', limit: '10', name: 'Alice', status: userStatus.ACTIVE, tutorId: 'tutor-uuid-789' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findAndCountAll.mockResolvedValue({
                count: 1,
                rows: [{ ...mockStudent, obj_assignedTutor: mockTutor }],
            });

            const result = await studentServices.getonewithpaginationservice(req);

            expect(result).toEqual({
                statusCode: 200,
                data: expect.arrayContaining([
                    expect.objectContaining({
                        id: 'student-uuid-456',
                        str_firstName: 'Alice',
                        assignedTutorName: 'Jane Smith',
                    }),
                ]),
                currentPage: 1,
                totalPages: 1,
                totalRecords: 1,
            });
        });

        it('should throw error for invalid date', async () => {
            req.query = { date: 'invalid-date' };
            db.User.findByPk.mockResolvedValue(mockUser);

            await expect(studentServices.getonewithpaginationservice(req)).rejects.toThrow(
                new AppError('Invalid date format. Use YYYY-MM-DD.', 400)
            );
        });
    });

    describe('deletestudentservice', () => {
        it('should delete student and associated data', async () => {
            req.params.id = 'student-uuid-456';
            mockStudent.objectId_assignedTutor = 'tutor-uuid-789';
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findByPk.mockResolvedValue(mockStudent);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.User.findOne.mockResolvedValue({ destroy: jest.fn().mockResolvedValue(true) });

            const result = await studentServices.deletestudentservice(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Student and associated data deleted successfully',
            });
            expect(mockTutor.removeAssignedStudent).toHaveBeenCalledWith(mockStudent, { transaction: mockTransaction });
            expect(db.AvailabilitySlot.destroy).toHaveBeenCalledWith({
                where: { obj_entityId: 'student-uuid-456', obj_entityType: roles.STUDENT },
                transaction: mockTransaction,
            });
            expect(db.PaymentHistory.destroy).toHaveBeenCalledWith({
                where: { obj_studentId: 'student-uuid-456' },
                transaction: mockTransaction,
            });
            expect(mockStudent.destroy).toHaveBeenCalledWith({ transaction: mockTransaction });
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if student not found', async () => {
            req.params.id = 'student-uuid-456';
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findByPk.mockResolvedValue(null);

            await expect(studentServices.deletestudentservice(req)).rejects.toThrow(
                new AppError('Student not found', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('statuschangeservice', () => {
        it('should change student status', async () => {
            req.body = { status: userStatus.INACTIVE };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findByPk.mockResolvedValue(mockStudent);

            const result = await studentServices.statuschangeservice('student-uuid-456', req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Status changed successfully!',
            });
            expect(mockStudent.update).toHaveBeenCalledWith(
                { str_status: userStatus.INACTIVE },
                { transaction: mockTransaction }
            );
            expect(tutorServices.adjustTutorAvailability).toHaveBeenCalledWith('student-uuid-456');
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error for invalid status', async () => {
            req.body = { status: 'INVALID' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findByPk.mockResolvedValue(mockStudent);

            await expect(studentServices.statuschangeservice('student-uuid-456', req)).rejects.toThrow(
                new AppError('Invalid status value', 400)
            );
        });
    });

    describe('getAssessments', () => {
        it('should fetch student assessments', async () => {
            db.Student.findByPk.mockResolvedValue(mockStudent);

            const result = await studentServices.getAssessments('student-uuid-456');

            expect(result).toEqual({
                statusCode: 200,
                data: ['assessment1.pdf'],
            });
            expect(db.Student.findByPk).toHaveBeenCalledWith('student-uuid-456', {
                attributes: ['arr_assessments'],
            });
        });

        it('should throw error if student not found', async () => {
            db.Student.findByPk.mockResolvedValue(null);

            await expect(studentServices.getAssessments('student-uuid-456')).rejects.toThrow(
                new AppError('Student not found', 404)
            );
        });
    });

    describe('deleteAssessments', () => {
        it('should delete assessment', async () => {
            db.Student.findByPk.mockResolvedValue(mockStudent);

            const result = await studentServices.deleteAssessments('student-uuid-456', 'assessment1.pdf');

            expect(result).toEqual({
                statusCode: 200,
                message: 'Assessment deleted successfully',
            });
            expect(mockStudent.update).toHaveBeenCalledWith(
                { arr_assessments: [] },
                { transaction: mockTransaction }
            );
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if assessment not found', async () => {
            db.Student.findByPk.mockResolvedValue(mockStudent);

            await expect(studentServices.deleteAssessments('student-uuid-456', 'nonexistent.pdf')).rejects.toThrow(
                new AppError('Assessment not found or already deleted', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('assigntutorservices', () => {
        it('should assign tutor to student', async () => {
            req.body = { tutorId: 'tutor-uuid-789' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findByPk.mockResolvedValue(mockStudent);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);

            const result = await studentServices.assigntutorservices('student-uuid-456', req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Student has been assigned tutor successfully',
            });
            expect(mockStudent.update).toHaveBeenCalledWith(
                { objectId_assignedTutor: 'tutor-uuid-789' },
                { transaction: mockTransaction }
            );
            expect(mockTutor.addAssignedStudent).toHaveBeenCalledWith(mockStudent, { transaction: mockTransaction });
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if student already has tutor', async () => {
            req.body = { tutorId: 'tutor-uuid-789' };
            mockStudent.objectId_assignedTutor = 'tutor-uuid-789';
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findByPk.mockResolvedValue(mockStudent);

            await expect(studentServices.assigntutorservices('student-uuid-456', req)).rejects.toThrow(
                new AppError('Student is already assigned a tutor.', 400)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('studentmastesrservice', () => {
        it('should fetch students with search', async () => {
            req.query = { search: 'Alice' };
            db.Student.findAll.mockResolvedValue([
                { id: 'student-uuid-456', str_firstName: 'Alice', str_lastName: 'Johnson' },
            ]);

            const result = await studentServices.studentmastesrservice(req);

            expect(result).toEqual({
                message: 'Students fetched successfully!',
                statusCode: 200,
                data: expect.arrayContaining([
                    expect.objectContaining({ id: 'student-uuid-456', str_firstName: 'Alice' }),
                ]),
            });
            // expect(db.Student.findAll).toHaveBeenCalledWith({
            //     where: { str_firstName: { [db.sequelize.Op.like]: '%Alice%' } },
            //     attributes: ['id', 'str_firstName', 'str_lastName'],
            //     raw: true,
            // });
        });

        it('should throw error if no students found', async () => {
            req.query = { search: 'Nonexistent' };
            db.Student.findAll.mockResolvedValue([]);

            await expect(studentServices.studentmastesrservice(req)).rejects.toThrow(
                new AppError('No students found matching criteria.', 404)
            );
        });
    });
});
