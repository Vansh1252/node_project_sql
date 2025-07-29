const userServices = require('../../services/user.services');
const { db } = require('../../utils/db');
const AppError = require('../../utils/AppError');
const { roles, userStatus, slotstatus } = require('../../constants/sequelizetableconstants');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mailer = require('../../utils/mailer');
const { generateToken } = require('../../utils/genratetoken');
const { Op } = require('sequelize');

// Mock dependencies
jest.mock('../../utils/db', () => ({
    db: {
        sequelize: {
            transaction: jest.fn(),
            Op: { or: Symbol('or'), like: Symbol('like'), ne: Symbol('ne'), gt: Symbol('gt'), in: Symbol('in') },
            models: {
                TutorStudents: { destroy: jest.fn().mockResolvedValue(1) },
            },
        },
        User: {
            findOne: jest.fn(),
            findByPk: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            destroy: jest.fn(),
        },
        Student: {
            findByPk: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            destroy: jest.fn(),
        },
        Tutor: {
            findByPk: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            destroy: jest.fn(),
        },
        AvailabilitySlot: {
            destroy: jest.fn(),
        },
        Slot: {
            findAll: jest.fn(),
            destroy: jest.fn(),
        },
    },
}));
jest.mock('bcrypt', () => ({
    hash: jest.fn(),
    compare: jest.fn(),
}));
jest.mock('crypto', () => ({
    randomBytes: jest.fn(() => ({ toString: jest.fn(() => 'mocked-token') })),
    createHash: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => 'mocked-hash'),
    })),
}));
jest.mock('../../utils/mailer', () => ({
    sendMail: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../utils/genratetoken', () => ({
    generateToken: jest.fn(),
}));

describe('User Services (Sequelize)', () => {
    let mockUser, mockStudent, mockTutor, mockTransaction, req;

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
            str_fullName: 'John Doe',
            str_email: 'john.doe@example.com',
            str_password: 'hashed_password',
            str_role: roles.ADMIN,
            str_status: userStatus.ACTIVE,
            obj_profileId: null,
            obj_profileType: null,
            update: jest.fn().mockResolvedValue(true),
            destroy: jest.fn().mockResolvedValue(true),
            save: jest.fn().mockResolvedValue(true),
        };

        mockStudent = {
            id: 'student-uuid-456',
            str_firstName: 'John',
            str_lastName: 'Doe',
            objectId_createdBy: 'user-uuid-123',
            objectId_assignedTutor: null,
            update: jest.fn().mockResolvedValue(true),
            destroy: jest.fn().mockResolvedValue(true),
        };

        mockTutor = {
            id: 'tutor-uuid-789',
            str_firstName: 'John',
            str_lastName: 'Doe',
            objectId_createdBy: 'user-uuid-123',
            update: jest.fn().mockResolvedValue(true),
            destroy: jest.fn().mockResolvedValue(true),
        };

        req = {
            body: {
                fullName: 'John Doe',
                email: 'john.doe@example.com',
                password: 'Password123!',
                role: roles.ADMIN,
            },
            user: { id: 'user-uuid-123' },
            query: {},
        };
    });

    describe('registerUser', () => {
        it('should register a user with admin role', async () => {
            db.User.findOne.mockResolvedValue(null);
            db.User.create.mockResolvedValue(mockUser);
            bcrypt.hash.mockResolvedValue('hashed_password');
            mailer.sendMail.mockResolvedValue(true);

            const result = await userServices.registerUser({
                fullName: 'John Doe',
                email: 'john.doe@example.com',
                password: 'Password123!',
                role: roles.ADMIN,
            });

            expect(result).toEqual({
                statusCode: 201,
                message: 'User registered successfully',
            });
            expect(db.User.findOne).toHaveBeenCalledWith({
                where: { str_email: 'john.doe@example.com' },
            });
            expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 12);
            expect(db.User.create).toHaveBeenCalledWith({
                str_fullName: 'John Doe',
                str_email: 'john.doe@example.com',
                str_password: 'hashed_password',
                str_role: roles.ADMIN,
            });
            expect(mailer.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'john.doe@example.com',
                    subject: 'Welcome to Our Platform!',
                })
            );
        });

        it('should register a student with profile', async () => {
            db.User.findOne.mockResolvedValue(null);
            db.User.create.mockResolvedValue(mockUser);
            db.Student.create.mockResolvedValue(mockStudent);
            bcrypt.hash.mockResolvedValue('hashed_password');
            mailer.sendMail.mockResolvedValue(true);
            mockUser.update.mockResolvedValue(true);

            const result = await userServices.registerUser({
                fullName: 'John Doe',
                email: 'john.doe@example.com',
                password: 'Password123!',
                role: roles.STUDENT,
            });

            expect(result).toEqual({
                statusCode: 201,
                message: 'User registered successfully',
            });
            expect(db.Student.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    str_firstName: 'John',
                    str_lastName: 'Doe',
                    objectId_createdBy: mockUser.id,
                })
            );
            expect(mockUser.update).toHaveBeenCalledWith({
                profileId: mockStudent.id,
                profileType: roles.STUDENT,
            });
        });

        it('should register a tutor with profile', async () => {
            db.User.findOne.mockResolvedValue(null);
            db.User.create.mockResolvedValue(mockUser);
            db.Tutor.create.mockResolvedValue(mockTutor);
            bcrypt.hash.mockResolvedValue('hashed_password');
            mailer.sendMail.mockResolvedValue(true);
            mockUser.update.mockResolvedValue(true);

            const result = await userServices.registerUser({
                fullName: 'John Doe',
                email: 'john.doe@example.com',
                password: 'Password123!',
                role: roles.TUTOR,
            });

            expect(result).toEqual({
                statusCode: 201,
                message: 'User registered successfully',
            });
            expect(db.Tutor.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    str_firstName: 'John',
                    str_lastName: 'Doe',
                    objectId_createdBy: mockUser.id,
                })
            );
            expect(mockUser.update).toHaveBeenCalledWith({
                profileId: mockTutor.id,
                profileType: roles.TUTOR,
            });
        });

        it('should throw error if user already exists', async () => {
            db.User.findOne.mockResolvedValue(mockUser);

            await expect(
                userServices.registerUser({
                    fullName: 'John Doe',
                    email: 'john.doe@example.com',
                    password: 'Password123!',
                    role: roles.ADMIN,
                })
            ).rejects.toThrow(new AppError('User already exists', 409));
        });
    });

    describe('loginUser', () => {
        it('should login user successfully', async () => {
            db.User.findOne.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            generateToken.mockReturnValue('mocked-token');

            const result = await userServices.loginUser({
                body: { email: 'john.doe@example.com', password: 'Password123!' },
            });

            expect(result).toEqual({
                token: 'mocked-token',
                user: {
                    id: mockUser.id,
                    email: mockUser.str_email,
                    fullName: mockUser.str_fullName,
                    role: mockUser.str_role,
                },
            });
            expect(db.User.findOne).toHaveBeenCalledWith({
                where: { str_email: 'john.doe@example.com' },
            });
            expect(bcrypt.compare).toHaveBeenCalledWith('Password123!', mockUser.str_password);
            expect(generateToken).toHaveBeenCalledWith({
                id: mockUser.id,
                role: mockUser.str_role,
                email: mockUser.str_email,
            });
        });

        it('should throw error for invalid email', async () => {
            db.User.findOne.mockResolvedValue(null);

            await expect(
                userServices.loginUser({
                    body: { email: 'john.doe@example.com', password: 'Password123!' },
                })
            ).rejects.toThrow(new AppError('Invalid email', 400));
        });

        it('should throw error for invalid password', async () => {
            db.User.findOne.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(false);

            await expect(
                userServices.loginUser({
                    body: { email: 'john.doe@example.com', password: 'WrongPassword' },
                })
            ).rejects.toThrow(new AppError('Invalid email or password', 400));
        });
    });

    describe('updateUser', () => {
        it('should update user successfully', async () => {
            db.User.findOne.mockResolvedValue(null); // No duplicate email
            db.User.findByPk.mockResolvedValue(mockUser);

            const result = await userServices.updateUser('user-uuid-123', {
                body: {
                    fullName: 'Jane Doe',
                    email: 'jane.doe@example.com',
                    status: userStatus.ACTIVE,
                },
            });
        });

        it('should update student profile', async () => {
            mockUser.str_role = roles.STUDENT;
            mockUser.obj_profileId = mockStudent.id;
            db.User.findOne.mockResolvedValue(null);
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.update.mockResolvedValue([1]);

            const result = await userServices.updateUser('user-uuid-123', {
                body: { fullName: 'Jane Doe', profileId: mockStudent.id },
            });

            // expect(db.Student.update).toHaveBeenCalledWith(
            //     { str_firstName: 'Jane Doe' },
            //     { where: { id: mockStudent.id } }
            // );
            // expect(mockUser.update).toHaveBeenCalledWith({
            //     str_fullName: 'Jane Doe',
            //     obj_profileId: mockStudent.id,
            //     obj_profileType: roles.STUDENT,
            // });
        });

        it('should update tutor profile', async () => {
            mockUser.str_role = roles.TUTOR;
            mockUser.obj_profileId = mockTutor.id;
            db.User.findOne.mockResolvedValue(null);
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.update.mockResolvedValue([1]);

            const result = await userServices.updateUser('user-uuid-123', {
                body: { fullName: 'Jane Doe', profileId: mockTutor.id },
            });
        });

        it('should throw error if userId is missing', async () => {
            await expect(userServices.updateUser(null, req)).rejects.toThrow(
                new AppError('Unauthorized access', 401)
            );
        });

        it('should throw error if user not found', async () => {
            db.User.findByPk.mockResolvedValue(null);

            await expect(userServices.updateUser('user-uuid-123', req)).rejects.toThrow(
                new AppError('User not found', 404)
            );
        });

        it('should throw error if email already exists', async () => {
            db.User.findOne.mockResolvedValue({ id: 'other-user-id' });

            await expect(
                userServices.updateUser('user-uuid-123', {
                    body: { email: 'john.doe@example.com' },
                })
            ).rejects.toThrow(new AppError('Email already exists', 409));
        });
    });

    describe('sendPasswordResetLink', () => {
        it('should send password reset link', async () => {
            db.User.findOne.mockResolvedValue(mockUser);
            crypto.randomBytes.mockReturnValue({ toString: jest.fn(() => 'mocked-token') });
            crypto.createHash.mockReturnValue({
                update: jest.fn().mockReturnThis(),
                digest: jest.fn(() => 'mocked-hash'),
            });
            mailer.sendMail.mockResolvedValue(true);

            const result = await userServices.sendPasswordResetLink('john.doe@example.com');

            expect(result).toEqual({ message: 'Password reset link sent to your email.' });
            expect(db.User.findOne).toHaveBeenCalledWith({
                where: { str_email: 'john.doe@example.com' },
            });
            expect(mockUser.update).toHaveBeenCalledWith({
                str_resetToken: 'mocked-hash',
                str_resetTokenExpiration: expect.any(Date),
            });
            expect(mailer.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'john.doe@example.com',
                    subject: 'Password Reset',
                })
            );
        });

        it('should throw error if user not found', async () => {
            db.User.findOne.mockResolvedValue(null);

            await expect(userServices.sendPasswordResetLink('john.doe@example.com')).rejects.toThrow(
                new AppError('User not found', 404)
            );
        });
    });

    describe('setNewPassword', () => {
        it('should set new password successfully', async () => {
            db.User.findOne.mockResolvedValue(mockUser);
            bcrypt.hash.mockResolvedValue('new_hashed_password');

            const result = await userServices.setNewPassword('mocked-token', 'NewPassword123!');
        });

        it('should throw error for invalid or expired token', async () => {
            db.User.findOne.mockResolvedValue(null);

            await expect(userServices.setNewPassword('mocked-token', 'NewPassword123!')).rejects.toThrow(
                new AppError('Token is invalid or has expired', 400)
            );
        });
    });
    describe('updatePassword', () => {
        it('should update password successfully', async () => {
            db.User.findByPk.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            bcrypt.hash.mockResolvedValue('hashed_password');

            const result = await userServices.updatePassword(
                'user-uuid-123',
                'Password123!',
                'NewPassword123!'
            );

            expect(result).toEqual({ statusCode: 200, message: 'Password updated successfully' });
            expect(db.User.findByPk).toHaveBeenCalledWith('user-uuid-123');
            expect(bcrypt.compare).toHaveBeenCalledWith('Password123!', mockUser.str_password);
            expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123!', 12);
            expect(mockUser.save).toHaveBeenCalled();
        });

        it('should throw error if user not found', async () => {
            db.User.findByPk.mockResolvedValue(null);

            await expect(
                userServices.updatePassword('user-uuid-123', 'Password123!', 'NewPassword123!')
            ).rejects.toThrow(new AppError('User not found', 404));
        });

        it('should throw error if current password is incorrect', async () => {
            db.User.findByPk.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(false);

            await expect(
                userServices.updatePassword('user-uuid-123', 'WrongPassword', 'NewPassword123!')
            ).rejects.toThrow(new AppError('Current password is incorrect', 401));
        });
    });

    describe('refreshToken', () => {
        it('should refresh token successfully', async () => {
            db.User.findByPk.mockResolvedValue(mockUser);
            generateToken.mockReturnValue('new-mocked-token');

            const result = await userServices.refreshToken('user-uuid-123');

            expect(result).toEqual({ statusCode: 200, token: 'new-mocked-token' });
            expect(db.User.findByPk).toHaveBeenCalledWith('user-uuid-123');
            expect(generateToken).toHaveBeenCalledWith({
                id: mockUser.id,
                role: mockUser.str_role,
                email: mockUser.str_email,
            });
        });

        it('should throw error if user not found', async () => {
            db.User.findByPk.mockResolvedValue(null);

            await expect(userServices.refreshToken('user-uuid-123')).rejects.toThrow(
                new AppError('User not found', 404)
            );
        });
    });

    describe('deleteUser', () => {
        it('should delete admin user successfully', async () => {
            db.User.findByPk.mockResolvedValue(mockUser);
            mockUser.destroy.mockResolvedValue(true);

            const result = await userServices.deleteUser('user-uuid-123');

            expect(result).toEqual({
                statusCode: 200,
                message: 'User and all associated data deleted successfully.',
            });
            expect(db.User.findByPk).toHaveBeenCalledWith('user-uuid-123', { transaction: expect.any(Object) });
            expect(mockUser.destroy).toHaveBeenCalledWith({ transaction: expect.any(Object) });
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should delete student user and associated data', async () => {
            mockUser.obj_profileId = mockStudent.id;
            mockUser.obj_profileType = roles.STUDENT;
            mockStudent.objectId_assignedTutor = 'tutor-uuid-789';
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findByPk.mockResolvedValue(mockStudent);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.sequelize.models.TutorStudents.destroy.mockResolvedValue(1);
            db.AvailabilitySlot.destroy.mockResolvedValue(1);
            db.Slot.destroy.mockResolvedValue(1);

            const result = await userServices.deleteUser('user-uuid-123');

            expect(result).toEqual({
                statusCode: 200,
                message: 'User and all associated data deleted successfully.',
            });
            expect(db.Student.findByPk).toHaveBeenCalledWith(mockStudent.id, { transaction: expect.any(Object) });
            expect(db.Tutor.findByPk).toHaveBeenCalledWith('tutor-uuid-789', { transaction: expect.any(Object) });
            expect(db.sequelize.models.TutorStudents.destroy).toHaveBeenCalledWith({
                where: { obj_tutorId: mockTutor.id, obj_studentId: mockStudent.id },
                transaction: expect.any(Object),
            });
            expect(db.AvailabilitySlot.destroy).toHaveBeenCalledWith({
                where: { obj_entityId: mockStudent.id, obj_entityType: roles.STUDENT },
                transaction: expect.any(Object),
            });
            expect(mockStudent.destroy).toHaveBeenCalledWith({ transaction: expect.any(Object) });
            expect(db.Slot.destroy).toHaveBeenCalledWith({
                where: { objectId_createdBy: 'user-uuid-123' },
                transaction: expect.any(Object),
            });
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should delete tutor user and associated data', async () => {
            mockUser.obj_profileId = mockTutor.id;
            mockUser.obj_profileType = roles.TUTOR;
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.update.mockResolvedValue([1]);
            db.sequelize.models.TutorStudents.destroy.mockResolvedValue(1);
            db.AvailabilitySlot.destroy.mockResolvedValue(1);
            db.Slot.destroy.mockResolvedValue(1);

            const result = await userServices.deleteUser('user-uuid-123');

            expect(result).toEqual({
                statusCode: 200,
                message: 'User and all associated data deleted successfully.',
            });
            expect(db.Tutor.findByPk).toHaveBeenCalledWith(mockTutor.id, { transaction: expect.any(Object) });
            expect(db.Student.update).toHaveBeenCalledWith(
                { objectId_assignedTutor: null },
                { where: { objectId_assignedTutor: mockTutor.id }, transaction: expect.any(Object) }
            );
            expect(db.sequelize.models.TutorStudents.destroy).toHaveBeenCalledWith({
                where: { obj_tutorId: mockTutor.id },
                transaction: expect.any(Object),
            });
            expect(db.AvailabilitySlot.destroy).toHaveBeenCalledWith({
                where: { obj_entityId: mockTutor.id, obj_entityType: roles.TUTOR },
                transaction: expect.any(Object),
            });
            expect(mockTutor.destroy).toHaveBeenCalledWith({ transaction: expect.any(Object) });
            expect(db.Slot.destroy).toHaveBeenCalledWith({
                where: { objectId_createdBy: 'user-uuid-123' },
                transaction: expect.any(Object),
            });
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if userId is missing', async () => {
            await expect(userServices.deleteUser(null)).rejects.toThrow(
                new AppError('User ID is required for deletion.', 400)
            );
            expect(mockTransaction.rollback).not.toHaveBeenCalled();
        });

        it('should throw error if user not found', async () => {
            db.User.findByPk.mockResolvedValue(null);

            await expect(userServices.deleteUser('user-uuid-123')).rejects.toThrow(
                new AppError('Failed to delete user: User not found', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if deletion fails', async () => {
            db.User.findByPk.mockResolvedValue(mockUser);
            mockUser.destroy.mockRejectedValue(new Error('Delete failed'));

            await expect(userServices.deleteUser('user-uuid-123')).rejects.toThrow(
                new AppError('Failed to delete user: Delete failed', 500)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });
});