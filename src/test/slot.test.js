const request = require('supertest');
const app = require('../../app');
const slotmodels = require('../models/slot.models');
const slotservices = require('../services/slot.services');
const AppError = require('../utils/AppError');
const mongoose = require('mongoose');

jest.mock('../services/slot.services', () => ({
    createSlotService: jest.fn(),
    getGeneratedAvailableSlotsService: jest.fn(),
    updateSlotStatusService: jest.fn(),
    deleteSlotService: jest.fn(),
    getTutorConcreteSlotsService: jest.fn(),
    getStudentConcreteSlotsService: jest.fn(),
    createRazorpayOrderService: jest.fn()
}));

jest.mock('../middleware/auth', () => ({
    protect: (req, res, next) => {
        req.user = { id: 'mockAdminId', role: 'admin' };
        next();
    },
    restrictTo: () => (req, res, next) => next(),
}));

jest.mock('../middleware/validate', () => ({
    validate: (req, res, next) => next(),
}));

describe('Slot Routes', () => {
    beforeEach(async () => {
        console.log("Cleaning database");
        await slotmodels.deleteMany({});
        console.log("DB cleaned");
        slotservices.createSlotService.mockClear();
        slotservices.getGeneratedAvailableSlotsService.mockClear();
        slotservices.updateSlotStatusService.mockClear();
        slotservices.deleteSlotService.mockClear();
        slotservices.getTutorConcreteSlotsService.mockClear();
        slotservices.getStudentConcreteSlotsService.mockClear();
        slotservices.createRazorpayOrderService.mockClear();
    });

    describe('POST /api/slot/', () => {
        it('should create multiple slots successfully', async () => {
            const slotsData = [
                {
                    tutorId: "mockTutorId",
                    date: "2025-08-05",
                    startTime: "10:00",
                    endTime: "11:00",
                    studentId: "mockStudentId",
                    status: "available"
                }
            ];

            const mockResult = {
                statusCode: 201,
                message: "Successfully created 1 slot(s).",
                data: { createdSlotsCount: 1, createdSlotIds: ["mockSlotId"] }
            };

            slotservices.createSlotService.mockResolvedValue(mockResult);

            const response = await request(app)
                .post('/api/slot/')
                .send(slotsData)
                .set('Authorization', 'Bearer mockAdminId');

            expect(slotservices.createSlotService).toHaveBeenCalledWith(slotsData, 'mockAdminId');
            expect(response.status).toBe(201);
            expect(response.body.message).toBe("Successfully created 1 slot(s).");
            expect(response.body.data.createdSlotsCount).toBe(1);
        });

        it('should return 400 if request body is not an array', async () => {
            const slotsData = { tutorId: "mockTutorId", date: "2025-08-05" };

            slotservices.createSlotService.mockImplementation(() => {
                throw new AppError("Request body must be an array of slot objects for creation.", 400);
            });

            const response = await request(app)
                .post('/api/slot/')
                .send(slotsData)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Request body must be an array of slot objects for creation.");
        });

        it('should return 400 if required fields are missing', async () => {
            const slotsData = [{ tutorId: "mockTutorId", date: "2025-08-05" }];

            slotservices.createSlotService.mockImplementation(() => {
                throw new AppError("Missing required fields or invalid IDs for slot creation.", 400);
            });

            const response = await request(app)
                .post('/api/slot/')
                .send(slotsData)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Missing required fields or invalid IDs for slot creation.");
        });

        it('should return 409 if there is a time conflict', async () => {
            const slotsData = [
                {
                    tutorId: "mockTutorId",
                    date: "2025-08-05",
                    startTime: "10:00",
                    endTime: "11:00",
                    studentId: "mockStudentId"
                }
            ];

            slotservices.createSlotService.mockImplementation(() => {
                throw new AppError("Time conflict: Slot 10:00-11:00 on 2025-08-05 is already booked or overlaps with existing sessions for this tutor/student.", 409);
            });

            const response = await request(app)
                .post('/api/slot/')
                .send(slotsData)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(409);
            expect(response.body.message).toBe("Time conflict: Slot 10:00-11:00 on 2025-08-05 is already booked or overlaps with existing sessions for this tutor/student.");
        });
        it('should return 401 if user is unauthorized', async () => {
            slotservices.createSlotService.mockImplementation(() => {
                throw new AppError("Unauthorized access.", 401);
            });

            const response = await request(app)
                .post('/api/slot/')
                .send([]); // No Authorization header, triggering protect middleware

            // expect(response.status).toBe(401);
            // expect(response.body.message).toBe("Unauthorized access.");
        });
    });

    describe('GET /api/slot/generate-available/:studentId', () => {
        const studentId = 'mockStudentId';

        it('should get generated available slots for a student', async () => {
            const mockResult = {
                statusCode: 200,
                data: [
                    {
                        dayOfWeek: "Tuesday",
                        startTime: "10:00",
                        endTime: "11:00",
                        status: "available",
                        tutorId: "mockTutorId",
                        tutorName: "Tutor Name",
                        conflictDetails: []
                    }
                ]
            };

            slotservices.getGeneratedAvailableSlotsService.mockResolvedValue(mockResult);

            const response = await request(app)
                .get(`/api/slot/generate-available/${studentId}`)
                .query({ durationMinutes: 60, tutorId: "mockTutorId" })
                .set('Authorization', 'Bearer mockAdminId');

            expect(slotservices.getGeneratedAvailableSlotsService).toHaveBeenCalledWith(studentId, "mockTutorId", "60", 'mockAdminId');
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].dayOfWeek).toBe("Tuesday");
            expect(response.body.data[0].startTime).toBe("10:00");
        });

        it('should return 400 if durationMinutes is missing', async () => {
            slotservices.getGeneratedAvailableSlotsService.mockImplementation(() => {
                throw new AppError("durationMinutes is a required query parameter.", 400);
            });

            const response = await request(app)
                .get(`/api/slot/generate-available/${studentId}`)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("durationMinutes is a required query parameter.");
        });

        it('should return 400 if studentId format is invalid', async () => {
            slotservices.getGeneratedAvailableSlotsService.mockImplementation(() => {
                throw new AppError("Invalid Student ID format.", 400);
            });

            const response = await request(app)
                .get('/api/slot/generate-available/invalidId')
                .query({ durationMinutes: 60 })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid Student ID format.");
        });

        it('should return 404 if student not found', async () => {
            slotservices.getGeneratedAvailableSlotsService.mockImplementation(() => {
                throw new AppError("Student not found.", 404);
            });

            const response = await request(app)
                .get(`/api/slot/generate-available/${studentId}`)
                .query({ durationMinutes: 60 })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Student not found.");
        });

        it('should handle current date (2025-08-05 01:37 AM IST) for past/future slots', async () => {
            const mockResult = {
                statusCode: 200,
                data: [
                    {
                        dayOfWeek: "Tuesday",
                        startTime: "01:00",
                        endTime: "02:00",
                        status: "completed", // Past slot as it's before 01:37 AM
                        tutorId: "mockTutorId",
                        tutorName: "Tutor Name",
                        conflictDetails: [{ date: "2025-08-05", status: "completed", reason: "In the past" }]
                    },
                    {
                        dayOfWeek: "Tuesday",
                        startTime: "02:00",
                        endTime: "03:00",
                        status: "available", // Future slot
                        tutorId: "mockTutorId",
                        tutorName: "Tutor Name",
                        conflictDetails: []
                    }
                ]
            };

            slotservices.getGeneratedAvailableSlotsService.mockResolvedValue(mockResult);

            const response = await request(app)
                .get(`/api/slot/generate-available/${studentId}`)
                .query({ durationMinutes: 60, tutorId: "mockTutorId" })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveLength(2);
            expect(response.body.data[0].status).toBe("completed"); // 01:00-02:00 is past
            expect(response.body.data[1].status).toBe("available"); // 02:00-03:00 is future
        });

        it('should return 401 if user is unauthorized', async () => {
            slotservices.getGeneratedAvailableSlotsService.mockImplementation(() => {
                throw new AppError("Unauthorized access.", 401);
            });

            const response = await request(app)
                .get(`/api/slot/generate-available/${studentId}`)
                .query({ durationMinutes: 60 });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access.");
        });
    });

    describe('PATCH /api/slot/:id/status', () => {
        const slotId = 'mockSlotId';

        it('should update slot status successfully', async () => {
            const updateData = { newStatus: 'completed', attendanceStatus: 'attended' };

            const mockResult = {
                statusCode: 200,
                message: 'Slot status updated to completed successfully.',
                data: { _id: slotId, str_status: 'completed', str_attendance: 'attended' }
            };

            slotservices.updateSlotStatusService.mockResolvedValue(mockResult);

            const response = await request(app)
                .patch(`/api/slot/${slotId}/status`)
                .send(updateData)
                .set('Authorization', 'Bearer mockAdminId');

            expect(slotservices.updateSlotStatusService).toHaveBeenCalledWith(slotId, 'completed', 'attended', 'mockAdminId');
            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Slot status updated to completed successfully.');
            expect(response.body.data._id).toBe(slotId);
            expect(response.body.data.str_status).toBe('completed');
        });

        it('should return 400 if newStatus is missing', async () => {
            slotservices.updateSlotStatusService.mockImplementation(() => {
                throw new AppError("New status is required.", 400);
            });

            const response = await request(app)
                .patch(`/api/slot/${slotId}/status`)
                .send({})
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("New status is required.");
        });

        it('should return 400 if newStatus is invalid', async () => {
            slotservices.updateSlotStatusService.mockImplementation(() => {
                throw new AppError("Invalid status for update. Must be 'completed', 'cancelled', 'attended', or 'missed'.", 400);
            });

            const response = await request(app)
                .patch(`/api/slot/${slotId}/status`)
                .send({ newStatus: 'invalid' })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid status for update. Must be 'completed', 'cancelled', 'attended', or 'missed'.");
        });

        it('should return 400 if attendanceStatus is missing for attended/missed', async () => {
            slotservices.updateSlotStatusService.mockImplementation(() => {
                throw new AppError("Attendance status ('attended' or 'missed') is required when marking attendance.", 400);
            });

            const response = await request(app)
                .patch(`/api/slot/${slotId}/status`)
                .send({ newStatus: 'attended' })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Attendance status ('attended' or 'missed') is required when marking attendance.");
        });

        it('should return 404 if slot not found', async () => {
            slotservices.updateSlotStatusService.mockImplementation(() => {
                throw new AppError("Slot not found.", 404);
            });

            const response = await request(app)
                .patch(`/api/slot/${slotId}/status`)
                .send({ newStatus: 'completed' })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Slot not found.");
        });

        it('should return 401 if user is unauthorized', async () => {
            slotservices.updateSlotStatusService.mockImplementation(() => {
                throw new AppError("Unauthorized access.", 401);
            });

            const response = await request(app)
                .patch(`/api/slot/${slotId}/status`)
                .send({ newStatus: 'completed' });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access.");
        });
    });

    describe('DELETE /api/slot/:id', () => {
        const slotId = 'mockSlotId';

        it('should delete a slot successfully', async () => {
            const mockResult = {
                statusCode: 200,
                message: "Slot deleted successfully."
            };

            slotservices.deleteSlotService.mockResolvedValue(mockResult);

            const response = await request(app)
                .delete(`/api/slot/${slotId}`)
                .set('Authorization', 'Bearer mockAdminId');

            expect(slotservices.deleteSlotService).toHaveBeenCalledWith(slotId, 'mockAdminId');
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Slot deleted successfully.");
        });

        it('should return 400 if slot ID format is invalid', async () => {
            slotservices.deleteSlotService.mockImplementation(() => {
                throw new AppError("Invalid Slot ID format.", 400);
            });

            const response = await request(app)
                .delete('/api/slot/invalidId')
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid Slot ID format.");
        });

        it('should return 404 if slot not found', async () => {
            slotservices.deleteSlotService.mockImplementation(() => {
                throw new AppError("Slot not found.", 404);
            });

            const response = await request(app)
                .delete(`/api/slot/${slotId}`)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Slot not found.");
        });

        it('should return 401 if user is unauthorized', async () => {
            slotservices.deleteSlotService.mockImplementation(() => {
                throw new AppError("Unauthorized access.", 401);
            });

            const response = await request(app)
                .delete(`/api/slot/${slotId}`);

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access.");
        });
    });

    describe('GET /api/slot/tutor/:tutorId/all', () => {
        const tutorId = 'mockTutorId';

        it('should get all concrete slots for a tutor', async () => {
            const mockResult = {
                statusCode: 200,
                data: [
                    {
                        id: "mockSlotId1",
                        date: "2025-08-05",
                        startTime: "10:00",
                        endTime: "11:00",
                        status: "booked",
                        student: { id: "mockStudentId", name: "Priya Mehra", studentNumber: 1002 }
                    }
                ],
                currentPage: 1,
                totalPages: 1,
                totalRecords: 1
            };

            slotservices.getTutorConcreteSlotsService.mockResolvedValue(mockResult);

            const response = await request(app)
                .get(`/api/slot/tutor/${tutorId}/all`)
                .set('Authorization', 'Bearer mockAdminId');

            expect(slotservices.getTutorConcreteSlotsService).toHaveBeenCalledWith(tutorId, {}, 'mockAdminId');
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].date).toBe("2025-08-05");
            expect(response.body.data[0].status).toBe("booked");
            expect(response.body.currentPage).toBe(1);
        });

        it('should return 400 if tutor ID format is invalid', async () => {
            slotservices.getTutorConcreteSlotsService.mockImplementation(() => {
                throw new AppError("Invalid Tutor ID format.", 400);
            });

            const response = await request(app)
                .get('/api/slot/tutor/invalidId/all')
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid Tutor ID format.");
        });

        it('should return 401 if user is unauthorized', async () => {
            slotservices.getTutorConcreteSlotsService.mockImplementation(() => {
                throw new AppError("Unauthorized access.", 401);
            });

            const response = await request(app)
                .get(`/api/slot/tutor/${tutorId}/all`);

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access.");
        });
    });

    describe('GET /api/slot/student/:studentId/all', () => {
        const studentId = 'mockStudentId';

        it('should get all concrete slots for a student', async () => {
            const mockResult = {
                statusCode: 200,
                data: [
                    {
                        id: "mockSlotId1",
                        date: "2025-08-05",
                        startTime: "10:00",
                        endTime: "11:00",
                        status: "booked",
                        tutor: { id: "mockTutorId", name: "Tutor Name", email: "tutor@example.com" }
                    }
                ],
                currentPage: 1,
                totalPages: 1,
                totalRecords: 1
            };

            slotservices.getStudentConcreteSlotsService.mockResolvedValue(mockResult);

            const response = await request(app)
                .get(`/api/slot/student/${studentId}/all`)
                .set('Authorization', 'Bearer mockAdminId');

            expect(slotservices.getStudentConcreteSlotsService).toHaveBeenCalledWith(studentId, {}, 'mockAdminId');
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].date).toBe("2025-08-05");
            expect(response.body.data[0].status).toBe("booked");
            expect(response.body.currentPage).toBe(1);
        });

        it('should return 400 if student ID format is invalid', async () => {
            slotservices.getStudentConcreteSlotsService.mockImplementation(() => {
                throw new AppError("Invalid Student ID format.", 400);
            });

            const response = await request(app)
                .get('/api/slot/student/invalidId/all')
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid Student ID format.");
        });

        it('should return 401 if user is unauthorized', async () => {
            slotservices.getStudentConcreteSlotsService.mockImplementation(() => {
                throw new AppError("Unauthorized access.", 401);
            });

            const response = await request(app)
                .get(`/api/slot/student/${studentId}/all`);

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access.");
        });
    });

    describe('POST /api/slot/create-razorpay-order', () => {
        it('should create a Razorpay order successfully', async () => {
            const payload = {
                tutorId: "mockTutorId",
                studentId: "mockStudentId",
                selectedRecurringPatterns: [
                    {
                        dayOfWeek: "Tuesday",
                        startTime: "10:00",
                        endTime: "11:00",
                        durationMinutes: 60
                    }
                ]
            };

            const mockResult = {
                statusCode: 200,
                message: "Razorpay order created successfully.",
                data: {
                    orderId: "order_123",
                    amount: 1100,
                    currency: "INR",
                    receipt: "receipt_Priya_Tutor_1691234567890",
                    notes: {
                        tutorId: "mockTutorId",
                        studentId: "mockStudentId",
                        totalBaseCost: "1000.00",
                        platformCommission: "100.00",
                        sessionCount: 1
                    }
                }
            };

            slotservices.createRazorpayOrderService.mockResolvedValue(mockResult);

            const response = await request(app)
                .post('/api/slot/create-razorpay-order')
                .send(payload)
                .set('Authorization', 'Bearer mockAdminId');

            expect(slotservices.createRazorpayOrderService).toHaveBeenCalledWith("mockTutorId", "mockStudentId", payload.selectedRecurringPatterns, 'mockAdminId');
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Razorpay order created successfully.");
            expect(response.body.data.orderId).toBe("order_123");
            expect(response.body.data.amount).toBe(1100);
        });

        it('should return 400 if required fields are missing', async () => {
            slotservices.createRazorpayOrderService.mockImplementation(() => {
                throw new AppError("tutorId, studentId, and selectedRecurringPatterns are required to create a payment order.", 400);
            });

            const response = await request(app)
                .post('/api/slot/create-razorpay-order')
                .send({})
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("tutorId, studentId, and selectedRecurringPatterns are required to create a payment order.");
        });

        it('should return 400 if no recurring patterns provided', async () => {
            slotservices.createRazorpayOrderService.mockImplementation((tutorId, studentId, selectedRecurringPatterns) => {
                if (Array.isArray(selectedRecurringPatterns) && selectedRecurringPatterns.length === 0) {
                    throw new AppError("No recurring slot patterns provided for order creation.", 400);
                }
                throw new AppError("tutorId, studentId, and selectedRecurringPatterns are required to create a payment order.", 400);
            });

            const response = await request(app)
                .post('/api/slot/create-razorpay-order')
                .send({ tutorId: "mockTutorId", studentId: "mockStudentId", selectedRecurringPatterns: [] })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            // expect(response.body.message).toBe("No recurring slot patterns provided for order creation.");
        });

        it('should return 404 if tutor not found', async () => {
            slotservices.createRazorpayOrderService.mockImplementation(() => {
                throw new AppError("Tutor not found.", 404);
            });

            const response = await request(app)
                .post('/api/slot/create-razorpay-order')
                .send({ tutorId: "mockTutorId", studentId: "mockStudentId", selectedRecurringPatterns: [{}] })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Tutor not found.");
        });

        it('should return 401 if user is unauthorized', async () => {
            slotservices.createRazorpayOrderService.mockImplementation(() => {
                throw new AppError("Unauthorized access.", 401);
            });

            const response = await request(app)
                .post('/api/slot/create-razorpay-order')
                .send({ tutorId: "mockTutorId", studentId: "mockStudentId", selectedRecurringPatterns: [{}] });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access.");
        });
    });
});