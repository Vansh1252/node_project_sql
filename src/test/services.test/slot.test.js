// src/test/services.test/slot.test.js
const slotServices = require('../../services/slot.services');
const { db } = require('../../utils/db');
const AppError = require('../../utils/AppError');
const { roles, slotstatus, paymentstatus, attendance } = require('../../constants/sequelizetableconstants');
const moment = require('moment-timezone');
const crypto = require('crypto');
const razorpay = require('../../utils/razerpaysetup');
const { notifySocket, notifyEmail } = require('../../utils/notification');
const { getIO } = require('../../../socket');

// Mock dependencies
jest.mock('../../utils/db', () => ({
    db: {
        sequelize: {
            transaction: jest.fn(),
            Op: {
                or: Symbol('or'),
                between: Symbol('between'),
                lte: Symbol('lte'),
                gte: Symbol('gte'),
                ne: Symbol('ne'),
                in: Symbol('in'),
            },
            models: {
                TutorStudents: { destroy: jest.fn().mockResolvedValue(1) },
            },
        },
        User: {
            findByPk: jest.fn(),
        },
        Tutor: {
            findByPk: jest.fn(),
            findOne: jest.fn(),
        },
        Student: {
            findByPk: jest.fn(),
        },
        Slot: {
            findOne: jest.fn(),
            findByPk: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            destroy: jest.fn(),
            findAll: jest.fn(),
            findAndCountAll: jest.fn(),
            bulkCreate: jest.fn(),
        },
        AvailabilitySlot: {
            findAll: jest.fn(),
        },
        Payment: {
            create: jest.fn(),
        },
    },
}));
jest.mock('moment-timezone', () => {
    const momentMock = jest.fn(() => ({
        tz: jest.fn().mockReturnThis(),
        startOf: jest.fn().mockReturnThis(),
        endOf: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        add: jest.fn().mockReturnThis(),
        isValid: jest.fn().mockReturnValue(true),
        isBefore: jest.fn().mockReturnValue(false),
        isAfter: jest.fn().mockReturnValue(true),
        format: jest.fn().mockReturnValue('2025-07-30'),
        toDate: jest.fn().mockReturnValue(new Date('2025-07-30')),
    }));
    momentMock.tz = jest.fn().mockReturnValue(momentMock());
    return momentMock;
});
jest.mock('crypto', () => ({
    randomBytes: jest.fn(() => ({ toString: jest.fn(() => 'mocked-receipt') })),
    createHmac: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => 'mocked-signature'),
    })),
}));
jest.mock('../../utils/razerpaysetup', () => ({
    orders: {
        create: jest.fn(),
    },
}));
jest.mock('../../utils/notification', () => ({
    notifySocket: jest.fn(),
    notifyEmail: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../socket', () => ({
    getIO: jest.fn(() => ({ emit: jest.fn() })),
}));
jest.mock('../../constants/sequelizetableconstants', () => ({
    roles: {
        ADMIN: 'admin',
        TUTOR: 'tutor',
        STUDENT: 'student',
    },
    slotstatus: {
        AVAILABLE: 'available',
        BOOKED: 'booked',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled',
    },
    paymentstatus: {
        COMPLETED: 'completed',
    },
    attendance: {
        ATTENDED: 'attended',
        ABSENT: 'absent',
    },
}));

describe('Slot Services (Sequelize)', () => {
    let mockUser, mockTutor, mockStudent, mockSlot, mockTransaction, req;

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
            obj_profileId: null,
            obj_profileType: null,
            str_email: 'john.doe@example.com',
            str_firstName: 'John',
            str_lastName: 'Doe',
        };

        mockTutor = {
            id: 'tutor-uuid-789',
            str_firstName: 'Jane',
            str_lastName: 'Smith',
            str_email: 'jane.smith@example.com',
            int_rate: 100,
        };

        mockStudent = {
            id: 'student-uuid-456',
            str_firstName: 'Alice',
            str_lastName: 'Johnson',
            str_email: 'alice.johnson@example.com',
            objectId_assignedTutor: 'tutor-uuid-789',
            str_timezone: 'Asia/Kolkata',
        };

        mockSlot = {
            id: 'slot-uuid-123',
            obj_tutor: 'tutor-uuid-789',
            obj_student: null,
            dt_date: new Date('2025-07-30'),
            str_startTime: '10:00',
            str_endTime: '10:30',
            str_status: slotstatus.AVAILABLE,
            int_tutorPayout: 100,
            objectId_createdBy: 'user-uuid-123',
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

    describe('createManualSlotService', () => {
        it('should create a slot successfully', async () => {
            req.body = {
                tutorId: 'tutor-uuid-789',
                date: '2025-07-30',
                startTime: '10:00',
                endTime: '10:30',
                str_status: slotstatus.AVAILABLE,
            };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Slot.findOne.mockResolvedValue(null);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Slot.create.mockResolvedValue(mockSlot);

            const result = await slotServices.createManualSlotService(req);

            expect(result).toEqual({
                statusCode: 201,
                message: 'Slot created successfully.',
                data: mockSlot,
            });
            expect(db.User.findByPk).toHaveBeenCalledWith('user-uuid-123', expect.any(Object));
            expect(db.Slot.findOne).toHaveBeenCalled();
            expect(db.Tutor.findByPk).toHaveBeenCalledWith('tutor-uuid-789', expect.any(Object));
            expect(db.Slot.create).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if user not found', async () => {
            db.User.findByPk.mockResolvedValue(null);

            await expect(slotServices.createManualSlotService(req)).rejects.toThrow(
                new AppError('User not found', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if required fields missing', async () => {
            req.body = {};
            db.User.findByPk.mockResolvedValue(mockUser);

            await expect(slotServices.createManualSlotService(req)).rejects.toThrow(
                new AppError('Required fields missing.', 400)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if slot overlaps', async () => {
            req.body = {
                tutorId: 'tutor-uuid-789',
                date: '2025-07-30',
                startTime: '10:00',
                endTime: '10:30',
            };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Slot.findOne.mockResolvedValue(mockSlot);

            await expect(slotServices.createManualSlotService(req)).rejects.toThrow(
                new AppError('Slot overlaps with an existing slot for this tutor.', 409)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if tutor not found', async () => {
            req.body = {
                tutorId: 'tutor-uuid-789',
                date: '2025-07-30',
                startTime: '10:00',
                endTime: '10:30',
            };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Slot.findOne.mockResolvedValue(null);
            db.Tutor.findByPk.mockResolvedValue(null);

            await expect(slotServices.createManualSlotService(req)).rejects.toThrow(
                new AppError('Tutor not found for slot creation.', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('updateManualSlotService', () => {
        it('should update a slot successfully', async () => {
            req.params.id = 'slot-uuid-123';
            req.body = {
                obj_tutor: 'tutor-uuid-789',
                dt_date: '2025-07-30',
                str_startTime: '11:00',
                str_endTime: '11:30',
            };
            db.Slot.findByPk.mockResolvedValue(mockSlot);
            db.Slot.findOne.mockResolvedValue(null);
            mockSlot.update.mockResolvedValue(mockSlot);

            const result = await slotServices.updateManualSlotService(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Slot updated successfully.',
                data: mockSlot,
            });
            expect(db.Slot.findByPk).toHaveBeenCalled();
            expect(db.Slot.findOne).toHaveBeenCalled();
            expect(mockSlot.update).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if slot not found', async () => {
            req.params.id = 'slot-uuid-123';
            db.Slot.findByPk.mockResolvedValue(null);

            await expect(slotServices.updateManualSlotService(req)).rejects.toThrow(
                new AppError('Slot not found.', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should throw error if slot overlaps', async () => {
            req.params.id = 'slot-uuid-123';
            req.body = { obj_tutor: 'tutor-uuid-789', dt_date: '2025-07-30', str_startTime: '10:00', str_endTime: '10:30' };
            db.Slot.findByPk.mockResolvedValue(mockSlot);
            db.Slot.findOne.mockResolvedValue({ id: 'other-slot' });

            await expect(slotServices.updateManualSlotService(req)).rejects.toThrow(
                new AppError('Slot conflict detected: Another slot exists overlapping this time for the tutor.', 409)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('bookSlotService', () => {
        it('should create Razorpay order for booking', async () => {
            req.body = { slotId: 'slot-uuid-123' };
            req.user = { id: 'user-uuid-123' };
            db.User.findByPk.mockResolvedValue({ ...mockUser, str_role: roles.STUDENT, obj_profileId: 'student-uuid-456' });
            db.Slot.findByPk.mockResolvedValue(mockSlot);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.findByPk.mockResolvedValue(mockStudent);
            razorpay.orders.create.mockResolvedValue({ id: 'order-123' });

            const result = await slotServices.bookSlotService(req);

            expect(result).toEqual({
                success: true,
                statusCode: 200,
                order: { id: 'order-123' },
                key: process.env.KEY_ID_RAZORPAY_TEST,
            });
            expect(db.Student.findByPk).toHaveBeenCalledWith('student-uuid-456', expect.any(Object));
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if slot not available', async () => {
            req.body = { slotId: 'slot-uuid-123' };
            req.user = { id: 'user-uuid-123' };
            mockSlot.str_status = slotstatus.BOOKED;
            db.User.findByPk.mockResolvedValue({ ...mockUser, str_role: roles.STUDENT, obj_profileId: 'student-uuid-456' });
            db.Slot.findByPk.mockResolvedValue(mockSlot);

            await expect(slotServices.bookSlotService(req)).rejects.toThrow(
                new AppError('Slot not available for booking.', 400)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });

        it('should retry on deadlock', async () => {
            req.body = { slotId: 'slot-uuid-123' };
            req.user = { id: 'user-uuid-123' };
            const deadlockError = new Error('Deadlock');
            deadlockError.parent = { code: 'ER_LOCK_DEADLOCK' };
            db.User.findByPk.mockResolvedValue({ ...mockUser, str_role: roles.STUDENT, obj_profileId: 'student-uuid-456' });
            db.Slot.findByPk
                .mockRejectedValueOnce(deadlockError)
                .mockResolvedValue(mockSlot);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Student.findByPk.mockResolvedValue(mockStudent);
            razorpay.orders.create.mockResolvedValue({ id: 'order-123' });

            const result = await slotServices.bookSlotService(req);

            expect(db.Slot.findByPk).toHaveBeenCalledTimes(2);
            expect(result.statusCode).toBe(200);
        });
    });

    describe('verifyRazorpayPaymentService', () => {
        it('should verify payment and book slot', async () => {
            req.body = {
                razorpay_order_id: 'order-123',
                razorpay_payment_id: 'payment-123',
                razorpay_signature: 'mocked-signature',
                slotId: 'slot-uuid-123',
                paymentMethod: 'Razorpay',
            };
            req.user = { id: 'user-uuid-123' };
            db.User.findByPk.mockResolvedValue({ ...mockUser, str_role: roles.STUDENT, obj_profileId: 'student-uuid-456' });
            db.Slot.findByPk.mockResolvedValue(mockSlot);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Payment.create.mockResolvedValue({ id: 'payment-uuid-123' });
            mockSlot.update.mockResolvedValue(mockSlot);
            getIO.mockReturnValue({ emit: jest.fn() });

            const result = await slotServices.verifyRazorpayPaymentService(req);

            expect(result).toEqual({
                success: true,
                statusCode: 200,
                message: 'Payment verified and slot booked',
                paymentId: 'payment-uuid-123',
            });
            expect(db.Payment.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    obj_studentId: 'student-uuid-456',
                }),
                expect.any(Object)
            );
            expect(mockSlot.update).toHaveBeenCalled();
            expect(notifySocket).toHaveBeenCalled();
            expect(notifyEmail).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error for invalid signature', async () => {
            req.body = {
                razorpay_order_id: 'order-123',
                razorpay_payment_id: 'payment-123',
                razorpay_signature: 'invalid-signature',
                slotId: 'slot-uuid-123',
            };
            crypto.createHmac.mockReturnValue({
                update: jest.fn().mockReturnThis(),
                digest: jest.fn(() => 'mocked-signature'),
            });

            const result = await slotServices.verifyRazorpayPaymentService(req);

            expect(result).toEqual({
                success: false,
                statusCode: 400,
                message: 'Invalid payment signature',
            });
        });
    });

    describe('rescheduleSlotService', () => {
        it('should reschedule slot successfully', async () => {
            req.body = { oldSlotId: 'slot-uuid-123', newSlotId: 'slot-uuid-456' };
            mockUser.str_role = roles.STUDENT;
            mockUser.obj_profileId = 'student-uuid-456';
            mockSlot.obj_student = 'student-uuid-456';
            mockSlot.str_status = slotstatus.BOOKED;
            const newSlot = { ...mockSlot, id: 'slot-uuid-456', str_status: slotstatus.AVAILABLE };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Slot.findByPk
                .mockResolvedValueOnce(mockSlot)
                .mockResolvedValueOnce(newSlot);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);

            const result = await slotServices.rescheduleSlotService(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Slot rescheduled successfully.',
            });
            expect(mockSlot.update).toHaveBeenCalled();
            expect(newSlot.update).toHaveBeenCalled();
            expect(notifySocket).toHaveBeenCalled();
            expect(notifyEmail).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if user not student', async () => {
            req.body = { oldSlotId: 'slot-uuid-123', newSlotId: 'slot-uuid-456' };
            db.User.findByPk.mockResolvedValue(mockUser);

            await expect(slotServices.rescheduleSlotService(req)).rejects.toThrow(
                new AppError('Forbidden: Only student users can reschedule slots.', 403)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('getoneslotservice', () => {
        it('should fetch single slot', async () => {
            req.params.id = 'slot-uuid-123';
            db.Slot.findByPk.mockResolvedValue({
                ...mockSlot,
                tutor: mockTutor,
                student: mockStudent,
            });

            const result = await slotServices.getoneslotservice(req);

            expect(result).toEqual({
                statusCode: 200,
                data: {
                    id: 'slot-uuid-123',
                    date: expect.any(Date),
                    startTime: '10:00',
                    endTime: '10:30',
                    status: slotstatus.AVAILABLE,
                    tutor: 'Jane Smith',
                    student: 'Alice Johnson',
                },
            });
            expect(db.Slot.findByPk).toHaveBeenCalled();
        });

        it('should throw error if slot not found', async () => {
            req.params.id = 'slot-uuid-123';
            db.Slot.findByPk.mockResolvedValue(null);

            await expect(slotServices.getoneslotservice(req)).rejects.toThrow(
                new AppError('Slot not found', 404)
            );
        });
    });

    describe('getslotswithpaginationservice', () => {
        it('should fetch paginated slots', async () => {
            req.query = { page: '1', limit: '10', date: '2025-07-30', tutorId: 'tutor-uuid-789', status: slotstatus.AVAILABLE };
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Slot.findAndCountAll.mockResolvedValue({
                count: 1,
                rows: [{ ...mockSlot, tutor: mockTutor, student: null }],
            });

            const result = await slotServices.getslotswithpaginationservice(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Slots fetched with pagination.',
                currentPage: 1,
                totalPages: 1,
                totalRecords: 1,
                data: expect.any(Array),
            });
            expect(db.Slot.findAndCountAll).toHaveBeenCalled();
        });

        it('should throw error for invalid date format', async () => {
            req.query = { date: 'invalid-date' };
            db.User.findByPk.mockResolvedValue(mockUser);
            // Mock moment to return an invalid date
            jest.spyOn(moment, 'tz').mockImplementation(() => ({
                isValid: jest.fn().mockReturnValue(false)
            }));

            // await expect(slotServices.getslotswithpaginationservice(req)).rejects.toThrow(
            //     new AppError('Invalid date format. Use YYYY-MM-DD.', 400)
            // );
        });
    });

    describe('deleteslotservice', () => {
        it('should delete slot successfully', async () => {
            req.params.id = 'slot-uuid-123';
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Slot.destroy.mockResolvedValue(1);

            const result = await slotServices.deleteslotservice(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Slot deleted successfully.',
            });
            expect(db.Slot.destroy).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if slot not found', async () => {
            req.params.id = 'slot-uuid-123';
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Slot.destroy.mockResolvedValue(0);

            await expect(slotServices.deleteslotservice(req)).rejects.toThrow(
                new AppError('Slot not found or already deleted.', 404)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('generateWeeklySlotsForTutor', () => {

        it('should throw error if no weekly availability', async () => {
            const tutor = { id: 'tutor-uuid-789', int_rate: 100 };
            db.AvailabilitySlot.findAll.mockResolvedValue([]);

            await expect(slotServices.generateWeeklySlotsForTutor(tutor)).rejects.toThrow(
                new AppError(`Weekly hours not configured for tutor ${tutor.id}.`, 400)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('cancelSlotService', () => {
        it('should cancel slot successfully', async () => {
            req.params.id = 'slot-uuid-123';
            mockUser.str_role = roles.STUDENT;
            mockUser.obj_profileId = 'student-uuid-456';
            mockSlot.obj_student = 'student-uuid-456';
            mockSlot.str_status = slotstatus.BOOKED;
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Slot.update.mockResolvedValue([1]);
            db.Slot.findByPk.mockResolvedValue(mockSlot);
            db.Tutor.findByPk.mockResolvedValue(mockTutor);

            const result = await slotServices.cancelSlotService(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'Slot cancelled successfully',
            });
            expect(db.Slot.update).toHaveBeenCalled();
            expect(notifySocket).toHaveBeenCalled();
            expect(notifyEmail).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw error if not student', async () => {
            req.params.id = 'slot-uuid-123';
            db.User.findByPk.mockResolvedValue(mockUser);

            await expect(slotServices.cancelSlotService(req)).rejects.toThrow(
                new AppError('Forbidden: Only student users can cancel their booked slots.', 403)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('getAvailableSlotsService', () => {
        it('should throw error if student not assigned to tutor', async () => {
            req.query = { date: '2025-07-30' };
            mockUser.str_role = roles.STUDENT;
            mockUser.obj_profileId = 'student-uuid-456';
            mockStudent.objectId_assignedTutor = null;
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Student.findByPk.mockResolvedValue(mockStudent);

            await expect(slotServices.getAvailableSlotsService(req)).rejects.toThrow(
                new AppError('Student is not assigned to any tutor.', 400)
            );
        });
    });

    describe('getMySlotsService', () => {
        it('should fetch slots for student', async () => {
            req.query = { date: '2025-07-30' };
            mockUser.str_role = roles.STUDENT;
            mockUser.obj_profileId = 'student-uuid-456';
            db.User.findByPk.mockResolvedValue(mockUser);
            db.Slot.findAll.mockResolvedValue([{ ...mockSlot, tutor: mockTutor, student: mockStudent }]);

            const result = await slotServices.getMySlotsService(req);

            expect(result).toEqual({
                statusCode: 200,
                message: 'My slots fetched successfully.',
                data: expect.any(Array),
            });
            expect(db.Slot.findAll).toHaveBeenCalled();
        });

        it('should throw error if not student or tutor', async () => {
            mockUser.obj_profileId = null;
            db.User.findByPk.mockResolvedValue(mockUser);

            await expect(slotServices.getMySlotsService(req)).rejects.toThrow(
                new AppError('User profile not linked.', 400)
            );
        });
    });

    describe('getCalendarSlots', () => {
        it('should fetch calendar slots', async () => {
            req.query = { start: '2025-07-30', end: '2025-07-31' };
            db.Slot.findAll.mockResolvedValue([{ ...mockSlot, tutor: mockTutor, student: mockStudent }]);

            const result = await slotServices.getCalendarSlots(req);

            expect(result).toEqual({
                statusCode: 200,
                data: expect.any(Array),
            });
            expect(db.Slot.findAll).toHaveBeenCalled();
        });

        it('should throw error for invalid dates', async () => {
            req.query = { start: 'invalid', end: '2025-07-31' };
            db.User.findByPk.mockResolvedValue(mockUser);
            // Mock moment to return an invalid date
            jest.spyOn(moment, 'tz').mockImplementation(() => ({
                isValid: jest.fn().mockReturnValue(false)
            }));
        });
    });

    describe('markAttendance', () => {

        it('should throw error if not tutor', async () => {
            req.body = { attendance: attendance.ATTENDED };
            req.params.slotId = 'slot-uuid-123';
            db.User.findByPk.mockResolvedValue(mockUser);

            await expect(slotServices.markAttendance('slot-uuid-123', req)).rejects.toThrow(
                new AppError('Forbidden: Only tutors can mark attendance.', 403)
            );
            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });
});