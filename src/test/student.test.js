const request = require('supertest');
const app = require('../../app');
const usermodel = require('../models/user.models');
const studentservices = require('../services/student.services');
const AppError = require('../utils/AppError');
const mongoose = require('mongoose')

jest.mock('../services/student.services', () => ({
    createstudentservice: jest.fn(),
    updatestudentservice: jest.fn(),
    getonestudentservice: jest.fn(),
    getonewithpaginationservice: jest.fn(),
    deletestudentservice: jest.fn(),
    statuschangeservice: jest.fn(),
    assignTutorAndBookSlotsService: jest.fn(),
    studentmastesrservice: jest.fn()
}))

jest.mock('../middleware/auth', () => ({
    protect: (req, res, next) => {
        req.user = { id: 'mockAdminId', role: 'admin' };
        next();
    },
    restrictTo: () => (req, res, next) => next(),
}));

jest.mock('../../src/middleware/validate', () => ({
    validate: (req, res, next) => next(),
}));

describe('Student Routes', () => {
    beforeEach(async () => {
        console.log("Cleaning database");
        await usermodel.deleteMany({});
        console.log("DB cleaned");
    });

    describe('POST /api/student/create', () => {

        it('should create a new student', async () => {
            const studentData = {
                studentNumber: 1002,
                firstName: "Priya",
                lastName: "Mehra",
                familyName: "Mehra",
                grade: "9",
                year: "2025",
                email: "vanvintage1830@gmail.com",
                phoneNumber: "+919876543210",
                address: "456 Park Avenue",
                city: "Mumbai",
                state: "MH",
                country: "India",
                startDate: "2024-08-15",
                dischargeDate: "2025-09-30",
                accountCreated: true,
                referralSource: "Instagram",
                meetingLink: "https://zoom.us/j/987654321"
            };

            const mockResult = {
                statusCode: 201,
                message: "Student created successfully.",
                studentId: "mockStudentId"
            };

            studentservices.createstudentservice.mockResolvedValue(mockResult);

            const response = await request(app)
                .post('/api/student/create')
                .send(studentData)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(201);
            expect(response.body.message).toBe("Student created successfully.");
            expect(response.body.studentId).toBe("mockStudentId");
        });

        it('should return 400 if required fields are missing', async () => {
            const studentData = {
                studentNumber: 1002,
                firstName: "Priya",
                lastName: "Mehra",
                // Missing grade, year, phoneNumber, etc.
            };

            studentservices.createstudentservice.mockImplementation(() => {
                throw new AppError("Missing essential student profile fields.", 400);
            });

            const response = await request(app)
                .post('/api/student/create')
                .send(studentData)

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Missing essential student profile fields.");
        });

        it('should return 400 if student with email/phone/number already exists', async () => {
            const studentData = {
                studentNumber: 1002,
                firstName: "Priya",
                lastName: "Mehra",
                familyName: "Mehra",
                grade: "9",
                year: "2025",
                email: "vanvintage1830@gmail.com",
                phoneNumber: "+919876543210",
                address: "456 Park Avenue",
                city: "Mumbai",
                state: "MH",
                country: "India",
                startDate: "2024-08-15",
                dischargeDate: "2025-09-30",
                accountCreated: true,
                referralSource: "Instagram",
                meetingLink: "https://zoom.us/j/987654321"
            };

            studentservices.createstudentservice.mockImplementation(() => {
                throw new AppError("Student with provided email, phone, or number already exists.", 400);
            });

            const response = await request(app)
                .post('/api/student/create')
                .send(studentData)

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Student with provided email, phone, or number already exists.");
        });
        it('should return 400 if discharge date is before start date', async () => {
            const studentData = {
                studentNumber: 1002,
                firstName: "Priya",
                lastName: "Mehra",
                familyName: "Mehra",
                grade: "9",
                year: "2025",
                email: "vanvintage1830@gmail.com",
                phoneNumber: "+919876543210",
                address: "456 Park Avenue",
                city: "Mumbai",
                state: "MH",
                country: "India",
                startDate: "2024-08-15",
                dischargeDate: "2023-08-10",
                accountCreated: true,
                referralSource: "Instagram",
                meetingLink: "https://zoom.us/j/987654321"
            };
            studentservices.createstudentservice.mockImplementation(() => {
                throw new AppError("Discharge date cannot be before start date.", 400);
            });
            const res = await request(app)
                .post('/api/student/create')
                .send(studentData)
            expect(res.status).toBe(400);
            expect(res.body.message).toBe("Discharge date cannot be before start date.");
        });
    });
    describe('PUT /api/student/update/:id', () => {
        const validUpdateData = {
            studentNumber: 1002,
            firstName: "Priya",
            lastName: "Mehra",
            familyName: "Mehra",
            grade: "9",
            year: "2025",
            email: "vanvintage1830@gmail.com",
            phoneNumber: "+919876543210",
            address: "456 Park Avenue",
            city: "Mumbai",
            state: "MH",
            country: "India",
            startDate: "2024-08-15",
            dischargeDate: "2025-09-30",
            accountCreated: true,
            referralSource: "Instagram",
            meetingLink: "https://zoom.us/j/987654321"
        };
        const studentId = 'mockStudentId';
        it('should update an existing student', async () => {

            const mockResult = {
                statusCode: 200,
                message: "Student updated successfully",
                data: {
                    _id: studentId,
                    studentNumber: 1002,
                    firstName: "Priya",
                    lastName: "Mehra",
                    familyName: "Mehra",
                    grade: "9",
                    year: "2025",
                    email: "vanvintage1830@gmail.com",
                    phoneNumber: "+919876543210",
                    address: "456 Park Avenue",
                    city: "Mumbai",
                    state: "MH",
                    country: "India",
                    startDate: "2024-08-15",
                    dischargeDate: "2025-09-30",
                    accountCreated: true,
                    referralSource: "Instagram",
                    meetingLink: "https://zoom.us/j/987654321"
                }
            };
            studentservices.updatestudentservice.mockResolvedValue(mockResult);

            const response = await request(app)
                .put(`/api/student/update/${studentId}`)
                .send(validUpdateData)
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Student updated successfully");
            expect(response.body.data._id).toBe(studentId)
            expect(response.body.data.studentNumber).toBe(1002);
            expect(response.body.data.firstName).toBe("Priya");
            expect(response.body.data.lastName).toBe("Mehra");
            expect(response.body.data.familyName).toBe("Mehra");
            expect(response.body.data.grade).toBe("9");
            expect(response.body.data.year).toBe("2025");
            expect(response.body.data.email).toBe("vanvintage1830@gmail.com");
            expect(response.body.data.phoneNumber).toBe("+919876543210");
            expect(response.body.data.address).toBe("456 Park Avenue");
            expect(response.body.data.city).toBe("Mumbai");
            expect(response.body.data.state).toBe("MH");
            expect(response.body.data.country).toBe("India");
            expect(response.body.data.startDate).toBe("2024-08-15");
            expect(response.body.data.dischargeDate).toBe("2025-09-30");
            expect(response.body.data.accountCreated).toBe(true);
            expect(response.body.data.referralSource).toBe("Instagram");
        });
        it("should return 404 if student not found", async () => {
            const studentId = "nonexistentId";
            const updateData = {
                studentNumber: 1002,
                firstName: "Priya",
                lastName: "Mehra",
                familyName: "Mehra",
                grade: "9",
                year: "2025",
                email: "vanvintage1830@gmail.com",
                phoneNumber: "+919876543210",
                address: "456 Park Avenue",
                city: "Mumbai",
                state: "MH",
                country: "India",
                startDate: "2024-08-15",
                dischargeDate: "2024-08-30",
                accountCreated: true,
                referralSource: "Instagram",
                meetingLink: "https://zoom.us/j/987654321"
            };
            studentservices.updatestudentservice.mockRejectedValue(new AppError("Student not found", 404));

            const res = await request(app)
                .put(`/api/student/update/${studentId}`)
                .send(updateData);

            expect(res.status).toBe(404);
            expect(res.body.message).toBe("Student not found");
        });
        it("should return 400 if student ID format is invalid", async () => {
            studentservices.updatestudentservice.mockRejectedValue(new AppError("Invalid student ID format", 400));

            const response = await request(app)
                .put(`/api/student/update/invalidId`)
                .send(validUpdateData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid student ID format");
        });
        it("should return 400 for invalid date combination", async () => {
            const invalidDateData = {
                ...validUpdateData,
                startDate: "2025-10-01",
                dischargeDate: "2025-08-01"
            };

            studentservices.updatestudentservice.mockRejectedValue(new AppError("Discharge date must be after start date", 400));

            const response = await request(app)
                .put(`/api/student/update/${studentId}`)
                .send(invalidDateData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Discharge date must be after start date");
        });
        it("should return 400 for duplicate email or phone number", async () => {
            studentservices.updatestudentservice.mockRejectedValue(new AppError("Email or Phone number already exists", 400));

            const response = await request(app)
                .put(`/api/student/update/${studentId}`)
                .send(validUpdateData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Email or Phone number already exists");
        });
        it("should return 400 for invalid assignedTutor ID", async () => {
            const invalidTutorData = { ...validUpdateData, assignedTutor: "invalidTutorId" };

            studentservices.updatestudentservice.mockRejectedValue(new AppError("Invalid Tutor ID format", 400));

            const response = await request(app)
                .put(`/api/student/update/${studentId}`)
                .send(invalidTutorData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid Tutor ID format");
        });
    });
    describe('GET /api/student/details/:id', () => {
        const studentId = 'mockStudentId';

        it('should retrieve a student by ID', async () => {
            const mockResult = {
                statusCode: 200,
                data: {
                    _id: studentId,
                    studentNumber: 1002,
                    firstName: "Priya",
                    lastName: "Mehra",
                    familyName: "Mehra",
                    grade: "9",
                    year: "2025",
                    email: "vanvintage1830@gmail.com",
                    phoneNumber: "+919876543210",
                    address: "456 Park Avenue",
                    city: "Mumbai",
                    state: "MH",
                    country: "India",
                    startDate: "2024-08-15",
                    dischargeDate: "2025-09-30",
                    assignedTutor: "mockTutorId",
                    assignedTutorName: "Tutor Name",
                    timezone: "IST",
                    sessionDuration: 60,
                    availabileTime: [],
                    referralSource: "Instagram",
                    meetingLink: "https://zoom.us/j/987654321",
                    assessments: [],
                    accountCreated: true,
                    status: "Active",
                    payoutHistory: []
                }
            };

            studentservices.getonestudentservice.mockResolvedValue(mockResult);

            const response = await request(app)
                .get(`/api/student/details/${studentId}`)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(200);
            expect(response.body.data._id).toBe(studentId);
            expect(response.body.data.studentNumber).toBe(1002);
            expect(response.body.data.firstName).toBe("Priya");
            expect(response.body.data.email).toBe("vanvintage1830@gmail.com");
            expect(response.body.data.status).toBe("Active");
        });

        it('should return 400 if student ID format is invalid', async () => {
            studentservices.getonestudentservice.mockRejectedValue(new AppError("Invalid student ID format", 400));

            const response = await request(app)
                .get('/api/student/details/invalidId')
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid student ID format");
        });

        it('should return 404 if student not found', async () => {
            studentservices.getonestudentservice.mockRejectedValue(new AppError("Student not found", 404));

            const response = await request(app)
                .get(`/api/student/details/${studentId}`)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Student not found");
        });

        it('should return 401 if user is unauthorized', async () => {
            studentservices.getonestudentservice.mockRejectedValue(new AppError("Unauthorized access", 401));

            const response = await request(app)
                .get(`/api/student/details/${studentId}`);

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access");
        });
    });
    describe('GET /api/student/', () => {
        it('should retrieve a paginated list of students', async () => {
            const mockResult = {
                statusCode: 200,
                data: [
                    {
                        _id: "mockStudentId1",
                        studentNumber: 1002,
                        firstName: "Priya",
                        lastName: "Mehra",
                        email: "vanvintage1830@gmail.com",
                        status: "Active",
                        startDate: "2024-08-15",
                        dischargeDate: "2025-09-30",
                        assignedTutorName: "Tutor Name"
                    }
                ],
                currentPage: 1,
                totalPages: 1,
                totalRecords: 1
            };

            studentservices.getonewithpaginationservice.mockResolvedValue(mockResult);

            const response = await request(app)
                .get('/api/student/')
                .query({ page: 1, limit: 10 })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].firstName).toBe("Priya");
            expect(response.body.currentPage).toBe(1);
            expect(response.body.totalPages).toBe(1);
            expect(response.body.totalRecords).toBe(1);
        });

        it('should return 401 if user is unauthorized', async () => {
            studentservices.getonewithpaginationservice.mockRejectedValue(new AppError("Unauthorized access", 401));

            const response = await request(app)
                .get('/api/student/')
                .query({ page: 1, limit: 10 });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access");
        });

        it('should return 400 if invalid date format is provided', async () => {
            studentservices.getonewithpaginationservice.mockRejectedValue(new AppError("Invalid date format. Use YYYY-MM-DD.", 400));

            const response = await request(app)
                .get('/api/student/')
                .query({ date: "invalid-date" })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid date format. Use YYYY-MM-DD.");
        });

        it('should return 400 if invalid tutor ID format is provided', async () => {
            studentservices.getonewithpaginationservice.mockRejectedValue(new AppError("Invalid Tutor ID format.", 400));

            const response = await request(app)
                .get('/api/student/')
                .query({ tutorId: "invalidTutorId" })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid Tutor ID format.");
        });
    });
    describe('DELETE /api/student/:id', () => {
        const studentId = 'mockStudentId';

        it('should delete a student and associated data', async () => {
            const mockResult = {
                statusCode: 200,
                message: "Student and associated data deleted successfully."
            };

            studentservices.deletestudentservice.mockResolvedValue(mockResult);

            const response = await request(app)
                .delete(`/api/student/${studentId}`)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Student and associated data deleted successfully.");
        });

        it('should return 400 if student ID format is invalid', async () => {
            studentservices.deletestudentservice.mockRejectedValue(new AppError("Invalid student ID format", 400));

            const response = await request(app)
                .delete('/api/student/invalidId')
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid student ID format");
        });

        it('should return 404 if student not found', async () => {
            studentservices.deletestudentservice.mockRejectedValue(new AppError("Student not found", 404));

            const response = await request(app)
                .delete(`/api/student/${studentId}`)
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Student not found");
        });

        it('should return 401 if user is unauthorized', async () => {
            studentservices.deletestudentservice.mockRejectedValue(new AppError("Unauthorized access", 401));

            const response = await request(app)
                .delete(`/api/student/${studentId}`);

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access");
        });
    });
    describe('POST /api/student/:id/status/', () => {
        const studentId = 'mockStudentId';

        it('should change student status successfully', async () => {
            const mockResult = {
                statusCode: 200,
                message: "Student status changed to Active successfully.",
                data: {
                    _id: studentId,
                    str_status: "Active"
                }
            };

            studentservices.statuschangeservice.mockResolvedValue(mockResult);

            const response = await request(app)
                .post(`/api/student/${studentId}/status/`)
                .send({ status: "Active" })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Student status changed to Active successfully.");
            expect(response.body.data.str_status).toBe("Active");
        });
        it('should return 400 if student ID format is invalid', async () => {
            studentservices.statuschangeservice.mockRejectedValue(new AppError("Invalid student ID format", 400));

            const response = await request(app)
                .post('/api/student/invalidId/status')
                .send({ status: "Active" })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid student ID format");
        });

        it('should return 404 if student not found', async () => {
            studentservices.statuschangeservice.mockRejectedValue(new AppError("Student not found", 404));

            const response = await request(app)
                .post(`/api/student/${studentId}/status`)
                .send({ status: "Active" })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Student not found");
        });

        it('should return 401 if user is unauthorized', async () => {
            studentservices.statuschangeservice.mockRejectedValue(new AppError("Unauthorized access", 401));

            const response = await request(app)
                .post(`/api/student/${studentId}/status`)
                .send({ status: "Active" });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access");
        });
    });
    describe('POST /api/student/assign-tutor/:studentId', () => {
        const studentId = 'mockStudentId';

        it('should assign tutor and book slots successfully', async () => {
            const payload = {
                tutorId: "mockTutorId",
                selectedRecurringPatterns: [
                    {
                        dayOfWeek: "Monday",
                        startTime: "10:00",
                        endTime: "11:00",
                        durationMinutes: 60
                    }
                ],
                initialPaymentForBooking: {
                    razorpay_order_id: "order_123",
                    razorpay_payment_id: "payment_123",
                    razorpay_signature: "signature_123",
                    amount: 1000,
                    transactionFee: 50,
                    tutorPayout: 800
                }
            };

            const mockResult = {
                statusCode: 200,
                message: "Successfully booked 1 recurring slots across 1 patterns for Priya.",
                data: {
                    bookedSlotIds: ["slotId1"],
                    totalBookedCount: 1,
                    createdRecurringPatternIds: ["patternId1"]
                }
            };

            studentservices.assignTutorAndBookSlotsService.mockResolvedValue(mockResult);

            const response = await request(app)
                .post(`/api/student/assign-tutor/${studentId}`)
                .send({ ...payload })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Successfully booked 1 recurring slots across 1 patterns for Priya.");
            // expect(response.body.data.totalBookedCount).toBe(1);
        });

        it('should return 400 if student ID format is invalid', async () => {
            studentservices.assignTutorAndBookSlotsService.mockRejectedValue(new AppError("Invalid Student ID format.", 400));
            const invalidId = "invalidId"
            const response = await request(app)
                .post(`/api/student/assign-tutor/${invalidId}`)
                .send({ tutorId: "mockTutorId", selectedRecurringPatterns: [], initialPaymentForBooking: {} })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid Student ID format.");
        });

        it('should return 400 if tutor ID format is invalid', async () => {
            studentservices.assignTutorAndBookSlotsService.mockRejectedValue(new AppError("Invalid Tutor ID format.", 400));

            const response = await request(app)
                .post(`/api/student/assign-tutor/${studentId}`)

                .send({ tutorId: "invalidTutorId", selectedRecurringPatterns: [], initialPaymentForBooking: {} })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Invalid Tutor ID format.");
        });

        it('should return 404 if student not found', async () => {
            studentservices.assignTutorAndBookSlotsService.mockRejectedValue(new AppError("Student not found.", 404));

            const response = await request(app)
                .post(`/api/student/assign-tutor/${studentId}`)

                .send({ tutorId: "mockTutorId", selectedRecurringPatterns: [], initialPaymentForBooking: {} })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Student not found.");
        });

        it('should return 400 if no recurring patterns provided', async () => {
            studentservices.assignTutorAndBookSlotsService.mockRejectedValue(new AppError("No recurring slot patterns provided for booking.", 400));

            const response = await request(app)
                .post(`/api/student/assign-tutor/${studentId}`)

                .send({ tutorId: "mockTutorId", selectedRecurringPatterns: [], initialPaymentForBooking: {} })
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("No recurring slot patterns provided for booking.");
        });

        it('should return 401 if user is unauthorized', async () => {
            studentservices.assignTutorAndBookSlotsService.mockRejectedValue(new AppError("Unauthorized access.", 401));

            const response = await request(app)
                .post(`/api/student/assign-tutor/${studentId}`)
                .send({ tutorId: "mockTutorId", selectedRecurringPatterns: [], initialPaymentForBooking: {} });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access.");
        });
    });
    describe('POST /api/student/master', () => {
        it('should retrieve a list of active students with names', async () => {
            const mockResult = {
                statusCode: 200,
                message: "Students fetched successfully.",
                data: [
                    {
                        str_firstName: "Priya",
                        str_lastName: "Mehra",
                        str_email: "vanvintage1830@gmail.com"
                    }
                ]
            };

            studentservices.studentmastesrservice.mockResolvedValue(mockResult);

            const response = await request(app)
                .post('/api/student/master')
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Students fetched successfully.");
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].str_firstName).toBe("Priya");
        });

        it('should return 404 if no active students found', async () => {
            studentservices.studentmastesrservice.mockRejectedValue(new AppError("No active students found matching criteria.", 404));

            const response = await request(app)
                .post('/api/student/master')
                .set('Authorization', 'Bearer mockAdminId');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("No active students found matching criteria.");
        });

        it('should return 401 if user is unauthorized', async () => {
            studentservices.studentmastesrservice.mockRejectedValue(new AppError("Unauthorized access", 401));

            const response = await request(app)
                .post('/api/student/master');

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Unauthorized access");
        });
    });
});