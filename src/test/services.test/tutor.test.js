const tutorServices = require('../../services/tutor.services');
const { db } = require('../../utils/db');
const AppError = require('../../utils/AppError');
const { roles } = require('../../constants/sequelizetableconstants');
const mailer = require('../../utils/mailer');
const bcrypt = require('bcrypt');
const randompassword = require('../../utils/randompassword');
const { Op } = require('sequelize');

// Mock dependencies
jest.mock('../../utils/db', () => {
    const mockTransaction = {
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        finished: false,
    };
    return {
        db: {
            sequelize: {
                transaction: jest.fn().mockResolvedValue(mockTransaction),
                Op: { or: Symbol('or'), like: Symbol('like') }, // Mock Sequelize operators
                models: {
                    TutorStudents: { destroy: jest.fn().mockResolvedValue() },
                },
            },
            User: {
                findByPk: jest.fn(),
                create: jest.fn(),
                findOne: jest.fn(),
                update: jest.fn(),
            },
            Tutor: {
                findByPk: jest.fn(),
                create: jest.fn(),
                findOne: jest.fn(),
                findAll: jest.fn(), // Added for tutormastersservice
                findAndCountAll: jest.fn(),
                destroy: jest.fn(),
            },
            Student: {
                findByPk: jest.fn(),
                update: jest.fn(),
                findAll: jest.fn(),
            },
            RateHistory: { create: jest.fn() },
            AvailabilitySlot: { bulkCreate: jest.fn(), destroy: jest.fn() },
            Slot: { findAll: jest.fn(), update: jest.fn() },
            Payment: { findAll: jest.fn() },
        },
    };
});

jest.mock('bcrypt', () => ({
    hash: jest.fn(),
}));
jest.mock('../../utils/randompassword', () => jest.fn());
jest.mock('../../utils/mailer', () => ({
    sendMail: jest.fn().mockResolvedValue(),
}));
jest.mock('../../utils/notification', () => ({
    notifyEmail: jest.fn().mockResolvedValue(),
    notifySocket: jest.fn().mockResolvedValue(),
}));

describe('Tutor Services (Sequelize)', () => {
    let req, mockUser, mockTutor, mockStudent, mockTransaction;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTransaction = {
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            finished: false,
        };
        db.sequelize.transaction.mockResolvedValue(mockTransaction);

        mockUser = {
            id: 'user-uuid-admin',
            str_role: roles.ADMIN,
            update: jest.fn().mockResolvedValue(true),
        };
        mockTutor = {
            id: 'tutor-uuid-123',
            str_firstName: 'John',
            str_lastName: 'Doe',
            str_email: 'john.doe@example.com',
            str_phoneNumber: '123',
            str_address: 'addr',
            str_city: 'city',
            str_province: 'prov',
            str_postalCode: '123',
            str_country: 'country',
            int_rate: 100,
            str_timezone: 'UTC',
            str_status: 'active',
            addArr_assignedStudents: jest.fn().mockResolvedValue(true), // Corrected method name
            removeArr_assignedStudents: jest.fn().mockResolvedValue(true), // Corrected method name
            hasArr_assignedStudents: jest.fn().mockResolvedValue(true), // Corrected method name
            getArr_assignedStudents: jest.fn().mockResolvedValue([]),
            update: jest.fn().mockResolvedValue(true),
            destroy: jest.fn().mockResolvedValue(true),
            reload: jest.fn().mockResolvedValue(true),
        };
        mockStudent = {
            id: 'student-uuid-456',
            str_firstName: 'Jane',
            str_lastName: 'Smith',
            update: jest.fn().mockResolvedValue(true),
        };

        req = {
            params: {},
            body: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com',
                phoneNumber: '123',
                address: 'addr',
                city: 'city',
                province: 'prov',
                postalCode: '123',
                country: 'country',
                rate: 100,
                timezone: 'UTC',
            },
            user: { id: 'user-uuid-admin' },
            query: {},
        };
    });
    describe('createtutorservice', () => {
        it('should create a tutor and a corresponding user account', async () => {
            const mockNewTutor = { id: 'new-tutor-uuid' };
            const mockNewUser = { id: 'new-user-uuid', update: jest.fn().mockResolvedValue(true) };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findOne.mockResolvedValue(null);
            db.Tutor.create.mockResolvedValue(mockNewTutor);
            db.User.create.mockResolvedValue(mockNewUser);
            bcrypt.hash.mockResolvedValue('hashed_password');
            randompassword.mockReturnValue('random_password');
            mailer.sendMail.mockResolvedValue(true);

            const result = await tutorServices.createtutorservice(req);

            expect(result).toEqual({
                statusCode: 201,
                message: 'Tutor created successfully.',
            });
            expect(db.User.findByPk).toHaveBeenCalledWith('user-uuid-admin');
            expect(db.User.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    str_fullName: 'John Doe',
                    str_email: 'john.doe@example.com',
                    str_password: 'hashed_password',
                    str_role: roles.TUTOR,
                }),
                { transaction: mockTransaction }
            );
            expect(db.Tutor.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    str_firstName: 'John',
                    str_lastName: 'Doe',
                    str_email: 'john.doe@example.com',
                    str_phoneNumber: '123',
                    int_rate: 100,
                    str_timezone: 'UTC',
                    str_status: 'active',
                    objectId_createdBy: 'user-uuid-admin',
                }),
                { transaction: mockTransaction }
            );
            expect(mockNewUser.update).toHaveBeenCalledWith(
                { obj_profileId: 'new-tutor-uuid', obj_profileType: roles.TUTOR },
                { transaction: mockTransaction }
            );
            expect(mailer.sendMail).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if requesting user is not found', async () => {
            db.User.findByPk.mockResolvedValue(null);

            await expect(tutorServices.createtutorservice(req)).rejects.toThrow(
                new AppError('User not found', 404)
            );
            // expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if tutor with the same email already exists', async () => {
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findOne.mockResolvedValue({ id: 'existing-tutor-id' });

            await expect(tutorServices.createtutorservice(req)).rejects.toThrow(
                new AppError('Email or Phone Number already used', 400)
            );
            // expect(mockTransaction.rollback).toHaveBeenCalled();
        });
        it('should handle error if tutor creation fails', async () => {
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findOne.mockResolvedValue(null);
            bcrypt.hash.mockResolvedValue('hashed_password');
            randompassword.mockReturnValue('random_password');
            db.Tutor.create.mockRejectedValue(new Error('DB insert failed'));

            await expect(tutorServices.createtutorservice(req)).rejects.toThrow(
                new AppError('Failed to create tutor: DB insert failed', 500)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should handle error if user creation fails after tutor is created', async () => {
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findOne.mockResolvedValue(null);
            db.Tutor.create.mockResolvedValue({ id: 'new-tutor-uuid' });
            bcrypt.hash.mockResolvedValue('hashed_password');
            randompassword.mockReturnValue('random_password');
            db.User.create.mockRejectedValue(new Error('User insert failed'));

            await expect(tutorServices.createtutorservice(req)).rejects.toThrow(
                new AppError('Failed to create tutor: User insert failed', 500)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('updatetutorservice', () => {
        it('should update a tutor, user, and availability slots', async () => {
            req.params.id = 'tutor-uuid-123';
            req.body.weeklyHours = [{ day: 'Monday', slots: [{ start: '10:00', end: '11:00' }] }];
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Tutor.findOne.mockResolvedValue(null);
            db.User.findOne.mockResolvedValue(mockUser);
            db.AvailabilitySlot.destroy.mockResolvedValue(1);
            db.AvailabilitySlot.bulkCreate.mockResolvedValue([{ id: 'slot-1' }]);

            const result = await tutorServices.updatetutorservice(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Tutor updated successfully',
                data: mockTutor,
            });
            expect(db.Tutor.findByPk).toHaveBeenCalledWith('tutor-uuid-123', { transaction: expect.any(Object) });
            expect(db.Tutor.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.any(Object),
                    transaction: expect.any(Object),
                })
            );
            expect(mockTutor.update).toHaveBeenCalled();
            expect(mockUser.update).toHaveBeenCalled();
            expect(db.AvailabilitySlot.destroy).toHaveBeenCalled();
            expect(db.AvailabilitySlot.bulkCreate).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if tutor is not found', async () => {
            req.params.id = 'tutor-uuid-123';
            db.Tutor.findByPk.mockResolvedValue(null);

            await expect(tutorServices.updatetutorservice(req)).rejects.toThrow(
                new AppError('Failed to create student: Tutor not found', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if Sequelize fails during update', async () => {
            req.params.id = 'tutor-uuid-123';
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            mockTutor.update.mockRejectedValue(new Error('DB update failed'));

            await expect(tutorServices.updatetutorservice(req)).rejects.toThrow(
                new AppError('Failed to create student: DB update failed', 500)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if req.params.id is missing', async () => {
            await expect(tutorServices.getonetutorservice({ ...req, params: {} })).rejects.toThrow(
                new AppError('something went wrong', 404)
            );
        });

        it('should not call update if body is empty', async () => {
            req.params.id = 'tutor-uuid-123';
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            const reqWithEmptyBody = { ...req, body: {}, params: { id: 'tutor-uuid-123' } };

            const result = await tutorServices.updatetutorservice(reqWithEmptyBody);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Tutor updated successfully',
                data: mockTutor,
            });
            expect(mockTutor.update).not.toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });
    });

    describe('getonetutorservice', () => {
        it('should retrieve a single tutor with their students and slots', async () => {
            req.params.id = 'tutor-uuid-123';
            const mockTutorWithStudents = {
                ...mockTutor,
                arr_assignedStudents: [mockStudent],
            };
            db.Tutor.findByPk.mockResolvedValue(mockTutorWithStudents);
            db.Slot.findAll.mockResolvedValue([{ id: 'slot-1' }]);
            db.Payment.findAll.mockResolvedValue([{ id: 'payment-1' }]);

            const result = await tutorServices.getonetutorservice(req);

            expect(result).toEqual({
                statusCode: 200,
                data: expect.objectContaining({
                    id: 'tutor-uuid-123',
                    assignedStudents: expect.arrayContaining([
                        expect.objectContaining({ id: 'student-uuid-456' }),
                    ]),
                    slots: expect.any(Array),
                    payments: expect.any(Array),
                }),
            });
            expect(db.Tutor.findByPk).toHaveBeenCalledWith('tutor-uuid-123', expect.any(Object));
            expect(db.Slot.findAll).toHaveBeenCalled();
            expect(db.Payment.findAll).toHaveBeenCalled();
        });

        it('should throw an error if tutor not found', async () => {
            req.params.id = 'tutor-uuid-123';
            db.Tutor.findByPk.mockResolvedValue(null);

            await expect(tutorServices.getonetutorservice(req)).rejects.toThrow(
                new AppError('something went wrong', 404)
            );
        });

        it('should throw error if Sequelize fails', async () => {
            req.params.id = 'tutor-uuid-123';
            db.Tutor.findByPk.mockRejectedValue(new Error('DB Error'));

            await expect(tutorServices.getonetutorservice(req)).rejects.toThrow(
                new AppError('something went wrong', 500)
            );
        });

        it('should throw error if req.params.id is missing', async () => {
            await expect(tutorServices.getonetutorservice({ ...req, params: {} })).rejects.toThrow(
                new AppError('something went wrong', 404)
            );
        });
    });
    describe('getonewithpaginationtutorservice', () => {
        it('should retrieve a paginated list of tutors', async () => {
            const mockResult = { count: 2, rows: [mockTutor, mockTutor] };
            db.Tutor.findAndCountAll.mockResolvedValue(mockResult);

            const result = await tutorServices.getonewithpaginationtutorservice(req);

            expect(result).toEqual({
                statusCode: 200,
                data: mockResult.rows,
                currentPage: 1,
                totalPages: 1,
                totalRecords: 2,
            });
        });

        it('should handle custom page and limit params', async () => {
            req.query.page = '2';
            req.query.limit = '5';
            db.Tutor.findAndCountAll.mockResolvedValue({ count: 10, rows: [mockTutor] });

            const result = await tutorServices.getonewithpaginationtutorservice(req);

            expect(result.currentPage).toBe(2);
            expect(result.totalPages).toBe(2);
        });

        it('should include search filter in query', async () => {
            req.query.search = 'john';
            const mockResult = { count: 1, rows: [mockTutor] };
            db.Tutor.findAndCountAll.mockResolvedValue(mockResult);

            await tutorServices.getonewithpaginationtutorservice(req);
        })
        it('should default to page 1 and limit 10 for invalid values', async () => {
            req.query.page = 'invalid';
            req.query.limit = 'bad';
            db.Tutor.findAndCountAll.mockResolvedValue({ count: 1, rows: [mockTutor] });

            await tutorServices.getonewithpaginationtutorservice(req);

            expect(db.Tutor.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    offset: 0,
                    limit: 10,
                })
            );
        });
    });

    describe('deletetutorservice', () => {
        it('should delete a tutor and all associated data', async () => {
            req.params.id = 'tutor-uuid-123';
            const mockUserToDelete = { id: 'user-to-delete', destroy: jest.fn().mockResolvedValue(true) };
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.User.findOne.mockResolvedValue(mockUserToDelete);
            db.AvailabilitySlot.destroy.mockResolvedValue(1);
            db.Student.update.mockResolvedValue([1]);
            db.sequelize.models.TutorStudents.destroy.mockResolvedValue(1);
            mockTutor.destroy.mockResolvedValue(true);

            const result = await tutorServices.deletetutorservice(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Tutor and associated data deleted successfully',
            });
            expect(db.Tutor.findByPk).toHaveBeenCalledWith('tutor-uuid-123', { transaction: expect.any(Object) });
            expect(db.AvailabilitySlot.destroy).toHaveBeenCalled();
            expect(db.Student.update).toHaveBeenCalled();
            expect(db.sequelize.models.TutorStudents.destroy).toHaveBeenCalled();
            expect(mockTutor.destroy).toHaveBeenCalled();
            expect(mockUserToDelete.destroy).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if tutor is not found', async () => {
            req.params.id = 'tutor-uuid-123';
            db.Tutor.findByPk.mockResolvedValue(null);

            await expect(tutorServices.deletetutorservice(req)).rejects.toThrow(
                new AppError('Failed to delete tutor: Tutor not found', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if DB find fails', async () => {
            req.params.id = 'tutor-uuid-123';
            db.Tutor.findByPk.mockRejectedValue(new Error('DB error'));

            await expect(tutorServices.deletetutorservice(req)).rejects.toThrow(
                new AppError('Failed to delete tutor: DB error', 500)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if delete fails', async () => {
            req.params.id = 'tutor-uuid-123';
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            mockTutor.destroy.mockRejectedValue(new Error('Delete failed'));

            await expect(tutorServices.deletetutorservice(req)).rejects.toThrow(
                new AppError('Failed to delete tutor: Delete failed', 500)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('assignstudentservices', () => {
        it('should assign student to tutor successfully', async () => {
            const tutorId = 'tutor-uuid-123';
            req.body = { studentId: 'student-uuid-456' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.findByPk.mockResolvedValue(mockStudent);

            const result = await tutorServices.assignstudentservices(tutorId, req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Tutor has been assigned student successfully',
            });
            expect(db.User.findByPk).toHaveBeenCalledWith('user-uuid-admin', { transaction: expect.any(Object) });
            expect(db.Tutor.findByPk).toHaveBeenCalledWith(tutorId, { transaction: expect.any(Object) });
            expect(db.Student.findByPk).toHaveBeenCalledWith('student-uuid-456', { transaction: expect.any(Object) });
            expect(mockTutor.addArr_assignedStudents).toHaveBeenCalledWith(mockStudent, { transaction: expect.any(Object) });
            expect(mockStudent.update).toHaveBeenCalledWith(
                { objectId_assignedTutor: tutorId },
                { transaction: expect.any(Object) }
            );
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if tutor not found', async () => {
            const tutorId = 'tutor-uuid-123';
            req.body = { studentId: 'student-uuid-456' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findByPk.mockResolvedValue(null);

            await expect(tutorServices.assignstudentservices(tutorId, req)).rejects.toThrow(
                new AppError('Failed to assign student: Tutor not found!', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if student not found', async () => {
            const tutorId = 'tutor-uuid-123';
            req.body = { studentId: 'student-uuid-456' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.findByPk.mockResolvedValue(null);

            await expect(tutorServices.assignstudentservices(tutorId, req)).rejects.toThrow(
                new AppError('Failed to assign student: Student not found!', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if student already assigned', async () => {
            const tutorId = 'tutor-uuid-123';
            req.body = { studentId: 'student-uuid-456' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.findByPk.mockResolvedValue({ ...mockStudent, objectId_assignedTutor: tutorId });

            await expect(tutorServices.assignstudentservices(tutorId, req)).rejects.toThrow(
                new AppError('Failed to assign student: Student is already assigned to this tutor.', 400)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('removeStudentService', () => {
        it('should remove student from tutor successfully', async () => {
            const tutorId = 'tutor-uuid-123';
            req.body = { studentId: 'student-uuid-456' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.findByPk.mockResolvedValue(mockStudent);
            mockTutor.hasArr_assignedStudents.mockResolvedValue(true);

            const result = await tutorServices.removeStudentService(req, tutorId);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Student removed from tutor successfully!',
            });
            expect(db.User.findByPk).toHaveBeenCalledWith('user-uuid-admin', { transaction: expect.any(Object) });
            expect(db.Tutor.findByPk).toHaveBeenCalledWith(tutorId, { transaction: expect.any(Object) });
            expect(db.Student.findByPk).toHaveBeenCalledWith('student-uuid-456', { transaction: expect.any(Object) });
            expect(mockTutor.hasArr_assignedStudents).toHaveBeenCalledWith(mockStudent, { transaction: expect.any(Object) });
            expect(mockTutor.removeArr_assignedStudents).toHaveBeenCalledWith(mockStudent, { transaction: expect.any(Object) });
            expect(mockStudent.update).toHaveBeenCalledWith(
                { objectId_assignedTutor: null },
                { transaction: expect.any(Object) }
            );
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if tutor not found', async () => {
            const tutorId = 'tutor-uuid-123';
            req.body = { studentId: 'student-uuid-456' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findByPk.mockResolvedValue(null);

            await expect(tutorServices.removeStudentService(req, tutorId)).rejects.toThrow(
                new AppError('Failed to remove student from tutor: Tutor not found!', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if student not found', async () => {
            const tutorId = 'tutor-uuid-123';
            req.body = { studentId: 'student-uuid-456' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.findByPk.mockResolvedValue(null);

            await expect(tutorServices.removeStudentService(req, tutorId)).rejects.toThrow(
                new AppError('Failed to remove student from tutor: Student not found!', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if student not assigned to tutor', async () => {
            const tutorId = 'tutor-uuid-123';
            req.body = { studentId: 'student-uuid-456' };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.findByPk.mockResolvedValue(mockStudent);
            mockTutor.hasArr_assignedStudents.mockResolvedValue(false);

            await expect(tutorServices.removeStudentService(req, tutorId)).rejects.toThrow(
                new AppError('Failed to remove student from tutor: Student is not assigned to this tutor.', 400)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('adjustTutorAvailability', () => {
        it('should adjust tutor availability successfully', async () => {
            const studentId = 'student-uuid-456';
            const tutorId = 'tutor-uuid-123';
            db.Student.findByPk.mockResolvedValue({
                id: studentId,
                str_status: 'inactive',
                objectId_assignedTutor: tutorId,
            });
            db.Tutor.findByPk.mockResolvedValue({
                id: tutorId,
                str_email: 'tutor@example.com',
                str_firstName: 'John',
            });
            db.Slot.update.mockResolvedValue([2]);

            const result = await tutorServices.adjustTutorAvailability(studentId);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Tutor availability adjusted successfully',
            });
            expect(db.Student.findByPk).toHaveBeenCalledWith(studentId, expect.any(Object));
            expect(db.Tutor.findByPk).toHaveBeenCalledWith(tutorId, expect.any(Object));
            expect(db.Slot.update).toHaveBeenCalledWith(
                { str_status: 'available', obj_studentId: null },
                expect.any(Object)
            );
            expect(mockTransaction.commit).toHaveBeenCalled();
        });
    });
    describe('calculateTutorPayments', () => {
        it('should calculate tutor payments successfully', async () => {
            const tutorId = 'tutor-uuid-123';
            db.Tutor.findByPk.mockResolvedValue({
                id: tutorId,
                int_rate: 100,
                arr_assignedStudents: [{ id: 'student-uuid-456' }],
            });
            db.Slot.findAll.mockResolvedValue([
                {
                    obj_studentId: 'student-uuid-456',
                    student: { str_firstName: 'Jane', str_lastName: 'Smith' },
                },
            ]);

            const result = await tutorServices.calculateTutorPayments(tutorId);

            expect(result).toEqual({
                statusCode: 200,
                data: expect.objectContaining({
                    tutorId,
                    totalEarnings: 100,
                    totalSessions: 1,
                    studentEarnings: expect.arrayContaining([
                        expect.objectContaining({
                            studentId: 'student-uuid-456',
                            studentName: 'Jane Smith',
                            totalEarnings: 100,
                            sessionCount: 1,
                        }),
                    ]),
                }),
            });
            expect(db.Tutor.findByPk).toHaveBeenCalledWith(tutorId, expect.any(Object));
            expect(db.Slot.findAll).toHaveBeenCalled();
        });
    });

    describe('tutormastersservice', () => {
        it('should fetch tutors successfully', async () => {
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findAll.mockResolvedValue([mockTutor]);

            const result = await tutorServices.tutormastersservice(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Tutors fetched successfully!',
                data: [mockTutor],
            });
            expect(db.User.findByPk).toHaveBeenCalledWith('user-uuid-admin');
            expect(db.Tutor.findAll).toHaveBeenCalled();
        });
    });
});