const request = require('supertest');
const app = require('../../app');
const db = require('./models'); // Sequelize models from index.js
const { generateAuthToken } = require('./utlis'); // Assuming utils is in the same directory

jest.mock('../services/tutor.services', () => ({
    createtutorservice: jest.fn(),
    updatetutorservice: jest.fn(),
    getonetutorservice: jest.fn(),
    getonewithpaginationtutorservice: jest.fn(),
    deletetutorservice: jest.fn(),
    tutormaster: jest.fn(),
    removeStudentService: jest.fn(),
    adjustTutorAvailability: jest.fn(),
    calculateTutorPayments: jest.fn()
}));

jest.mock('../services/tutor.services', () => ({
    getTutorGeneralAvailabilityService: jest.fn()
}));

jest.mock('', () => ({
    protect: (req, res, next) => {
        req.user = { id: 'mockAdminId', role: 'admin' };
        next();
    },
    restrictTo: () => (req, res, next) => next(),
}));

jest.mock('../middleware/validate', () => ({
    validate: (req, res, next) => next(),
}));

describe('Tutor Routes (Sequelize Style)', () => {
    beforeEach(async () => {
        console.log("Syncing and cleaning database");
        await db.sequelize.sync({ force: true }); // Resets all tables
        console.log("Database synced");
        jest.resetModules(); // Reset module registry to re-apply mocks
        jest.clearAllMocks();
    });

    describe('POST /api/tutor/create', () => {
        it('should create a tutor and return 201', async () => {
            tutorService.createtutorservice.mockResolvedValue({
                statusCode: 201,
                message: 'Tutor created successfully'
            });

            const tutorData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                phoneNumber: '1234567890',
                address: '123 Street',
                city: 'Cityville',
                province: 'Province',
                postalCode: '12345',
                country: 'Country',
                rate: 50,
                weeklyHours: [{ day: 'monday', slots: [{ start: '09:00', end: '09:30' }] }]
            };

            const res = await request(app)
                .post('/api/tutor/create')
                .send(tutorData)
                .expect(201);

            expect(res.body.message).toBe('Tutor created successfully');
            expect(tutorService.createtutorservice).toHaveBeenCalledWith(tutorData, 'mockAdminId');
        });

        it('should return 400 if required fields are missing', async () => {
            tutorService.createtutorservice.mockImplementation(() => {
                throw new Error("Missing required fields"); // Assuming Error for validation
            });

            const res = await request(app)
                .post('/api/tutor/create')
                .send({ firstName: 'John' })
                .expect(400);

            expect(res.body.message).toBe('Missing required fields');
        });

        it('should return 400 if email or phone is duplicate', async () => {
            tutorService.createtutorservice.mockImplementation(() => {
                throw new Error("Email or Phone Number already used for another tutor");
            });

            const res = await request(app)
                .post('/api/tutor/create')
                .send({ firstName: 'John', email: 'duplicate@example.com', phoneNumber: '1234567890' })
                .expect(400);

            expect(res.body.message).toBe('Email or Phone Number already used for another tutor');
        });

        it('should return 400 if user email already exists', async () => {
            tutorService.createtutorservice.mockImplementation(() => {
                throw new Error("A user account with this email already exists");
            });

            const res = await request(app)
                .post('/api/tutor/create')
                .send({ firstName: 'John', email: 'existing@example.com', phoneNumber: '1234567890' })
                .expect(400);

            expect(res.body.message).toBe('A user account with this email already exists');
        });

        it('should return 400 if weeklyHours has invalid time', async () => {
            tutorService.createtutorservice.mockImplementation(() => {
                throw new Error("Invalid time format or start time not before end time");
            });

            const res = await request(app)
                .post('/api/tutor/create')
                .send({
                    firstName: 'John',
                    email: 'john@example.com',
                    phoneNumber: '1234567890',
                    weeklyHours: [{ day: 'monday', slots: [{ start: '09:00', end: '08:00' }] }]
                })
                .expect(400);

            expect(res.body.message).toBe('Invalid time format or start time not before end time');
        });

        it('should return 500 if mailer fails', async () => {
            tutorService.createtutorservice.mockImplementation(() => {
                throw new Error("Failed to send welcome email");
            });

            const res = await request(app)
                .post('/api/tutor/create')
                .send({
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john@example.com',
                    phoneNumber: '1234567890',
                    address: '123 Street'
                })
                .expect(500);

            expect(res.body.message).toBe('Failed to send welcome email');
        });
    });

    describe('PUT /api/tutor/update/:id', () => {
        const tutorId = 'mockTutorId123'; // Using string ID for Sequelize

        it('should update a tutor and return 200', async () => {
            tutorService.updatetutorservice.mockResolvedValue({
                statusCode: 200,
                message: 'Tutor updated successfully',
                data: { id: tutorId, firstName: 'Updated' }
            });

            const updateData = { firstName: 'Updated' };

            const res = await request(app)
                .put(`/api/tutor/update/${tutorId}`)
                .send(updateData)
                .expect(200);

            expect(res.body.message).toBe('Tutor updated successfully');
            expect(res.body.data.id).toBe(tutorId);
            expect(tutorService.updatetutorservice).toHaveBeenCalledWith(tutorId, updateData, 'mockAdminId');
        });

        it('should return 400 if tutor ID is invalid', async () => {
            tutorService.updatetutorservice.mockImplementation(() => {
                throw new Error("Invalid Tutor ID format");
            });

            const res = await request(app)
                .put('/api/tutor/update/invalidId')
                .send({ firstName: 'Fail' })
                .expect(400);

            expect(res.body.message).toBe('Invalid Tutor ID format');
        });

        it('should return 404 if tutor not found', async () => {
            tutorService.updatetutorservice.mockImplementation(() => {
                throw new Error("Tutor not found");
            });

            const res = await request(app)
                .put(`/api/tutor/update/${tutorId}`)
                .send({ firstName: 'Fail' })
                .expect(404);

            expect(res.body.message).toBe('Tutor not found');
        });

        it('should return 400 if duplicate email or phone', async () => {
            tutorService.updatetutorservice.mockImplementation(() => {
                throw new Error("Email or Phone Number already used by another tutor");
            });

            const res = await request(app)
                .put(`/api/tutor/update/${tutorId}`)
                .send({ email: 'duplicate@example.com' })
                .expect(400);

            expect(res.body.message).toBe('Email or Phone Number already used by another tutor');
        });

        it('should return 400 if weeklyHours has invalid time', async () => {
            tutorService.updatetutorservice.mockImplementation(() => {
                throw new Error("Invalid time format or start time not before end time");
            });

            const res = await request(app)
                .put(`/api/tutor/update/${tutorId}`)
                .send({ weeklyHours: [{ day: 'monday', slots: [{ start: '10:00', end: '09:00' }] }] })
                .expect(400);

            expect(res.body.message).toBe('Invalid time format or start time not before end time');
        });

        it('should return 500 if syncUserWithTutor fails', async () => {
            tutorService.updatetutorservice.mockImplementation(() => {
                throw new Error("Failed to sync user with tutor: No user account found");
            });

            const res = await request(app)
                .put(`/api/tutor/update/${tutorId}`)
                .send({ firstName: 'Fail' })
                .expect(500);

            expect(res.body.message).toBe('Failed to sync user with tutor: No user account found');
        });
    });

    describe('GET /api/tutor/', () => {
        it('should return a list of tutors with pagination', async () => {
            tutorService.getonewithpaginationtutorservice.mockResolvedValue({
                statusCode: 200,
                data: [{ id: 't1', tutorName: 'John Doe', email: 'john@example.com', assignedStudentsCount: 0, status: 'active', rate: 50 }],
                currentPage: 1,
                totalPages: 1,
                totalRecords: 1
            });

            const res = await request(app)
                .get('/api/tutor/')
                .query({ page: 1, limit: 10 })
                .expect(200);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.currentPage).toBe(1);
            expect(tutorService.getonewithpaginationtutorservice).toHaveBeenCalledWith({ page: "1", limit: "10" }, 'mockAdminId');
        });

        it('should return 400 if invalid page or limit', async () => {
            tutorService.getonewithpaginationtutorservice.mockImplementation(() => {
                throw new Error("Invalid pagination parameters");
            });

            const res = await request(app)
                .get('/api/tutor/')
                .query({ page: 0, limit: -1 })
                .expect(400);

            expect(res.body.message).toBe('Invalid pagination parameters');
        });
    });

    describe('GET /api/tutor/details/:id', () => {
        const tutorId = 'mockTutorId123';

        it('should return tutor details', async () => {
            tutorService.getonetutorservice.mockResolvedValue({
                statusCode: 200,
                data: {
                    id: tutorId,
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john@example.com'
                }
            });

            const res = await request(app)
                .get(`/api/tutor/details/${tutorId}`)
                .expect(200);

            expect(res.body.data.id).toBe(tutorId);
            expect(tutorService.getonetutorservice).toHaveBeenCalledWith(tutorId, 'mockAdminId');
        });

        it('should return 400 if tutor ID is invalid', async () => {
            tutorService.getonetutorservice.mockImplementation(() => {
                throw new Error("Invalid Tutor ID format");
            });

            const res = await request(app)
                .get('/api/tutor/details/invalidId')
                .expect(400);

            expect(res.body.message).toBe('Invalid Tutor ID format');
        });

        it('should return 404 if tutor not found', async () => {
            tutorService.getonetutorservice.mockImplementation(() => {
                throw new Error("Tutor not found");
            });

            const res = await request(app)
                .get(`/api/tutor/details/${tutorId}`)
                .expect(404);

            expect(res.body.message).toBe('Tutor not found');
        });
    });

    describe('DELETE /api/tutor/delete/:id', () => {
        const tutorId = 'mockTutorId123';

        it('should delete a tutor and return 200', async () => {
            tutorService.deletetutorservice.mockResolvedValue({
                statusCode: 200,
                message: 'Tutor and associated data deleted successfully'
            });

            const res = await request(app)
                .delete(`/api/tutor/delete/${tutorId}`)
                .expect(200);

            expect(res.body.message).toBe('Tutor and associated data deleted successfully');
            expect(tutorService.deletetutorservice).toHaveBeenCalledWith(tutorId, 'mockAdminId');
        });

        it('should return 400 if tutor ID is invalid', async () => {
            tutorService.deletetutorservice.mockImplementation(() => {
                throw new Error("Invalid Tutor ID format");
            });

            const res = await request(app)
                .delete('/api/tutor/delete/invalidId')
                .expect(400);

            expect(res.body.message).toBe('Invalid Tutor ID format');
        });

        it('should return 404 if tutor not found', async () => {
            tutorService.deletetutorservice.mockImplementation(() => {
                throw new Error("Tutor not found");
            });

            const res = await request(app)
                .delete(`/api/tutor/delete/${tutorId}`)
                .expect(404);

            expect(res.body.message).toBe('Tutor not found');
        });

        it('should return 500 if database operation fails', async () => {
            tutorService.deletetutorservice.mockImplementation(() => {
                throw new Error("Internal server error during tutor deletion");
            });

            const res = await request(app)
                .delete(`/api/tutor/delete/${tutorId}`)
                .expect(500);

            expect(res.body.message).toBe('Internal server error during tutor deletion');
        });
    });

    describe('POST /api/tutor/master', () => {
        it('should return a list of tutors', async () => {
            tutorService.tutormaster.mockResolvedValue({
                statusCode: 200,
                message: 'Tutors fetched successfully',
                data: [{ firstName: 'John', lastName: 'Doe', email: 'john@example.com' }]
            });

            const res = await request(app)
                .post('/api/tutor/master')
                .query({ search: 'John' })
                .expect(200);

            expect(res.body.data).toHaveLength(1);
            expect(tutorService.tutormaster).toHaveBeenCalledWith({ search: 'John' }, 'mockAdminId');
        });
    });

    describe('POST /api/tutor/remove-student/:id', () => {
        const tutorId = 'mockTutorId123';
        const studentId = 'mockStudentId123';

        it('should remove a student and return 200', async () => {
            tutorService.removeStudentService.mockResolvedValue({
                statusCode: 200,
                message: 'Student removed from tutor and associated slots freed successfully'
            });

            const res = await request(app)
                .post(`/api/tutor/remove-student/${tutorId}`)
                .send({ studentId })
                .expect(200);

            expect(res.body.message).toBe('Student removed from tutor and associated slots freed successfully');
            expect(tutorService.removeStudentService).toHaveBeenCalledWith(tutorId, studentId, 'mockAdminId');
        });

        it('should return 400 if IDs are invalid', async () => {
            tutorService.removeStudentService.mockImplementation(() => {
                throw new Error("Invalid Student or Tutor ID format");
            });

            const res = await request(app)
                .post('/api/tutor/remove-student/invalidId')
                .send({ studentId: 'invalidId' })
                .expect(400);

            expect(res.body.message).toBe('Invalid Student or Tutor ID format');
        });

        it('should return 404 if tutor not found', async () => {
            tutorService.removeStudentService.mockImplementation(() => {
                throw new Error("Tutor not found");
            });

            const res = await request(app)
                .post(`/api/tutor/remove-student/${tutorId}`)
                .send({ studentId })
                .expect(404);

            expect(res.body.message).toBe('Tutor not found');
        });

        it('should return 404 if student not found', async () => {
            tutorService.removeStudentService.mockImplementation(() => {
                throw new Error("Student not found");
            });

            const res = await request(app)
                .post(`/api/tutor/remove-student/${tutorId}`)
                .send({ studentId })
                .expect(404);

            expect(res.body.message).toBe('Student not found');
        });

        it('should return 400 if student not assigned', async () => {
            tutorService.removeStudentService.mockImplementation(() => {
                throw new Error("Student not assigned to this tutor");
            });

            const res = await request(app)
                .post(`/api/tutor/remove-student/${tutorId}`)
                .send({ studentId })
                .expect(400);

            expect(res.body.message).toBe('Student not assigned to this tutor');
        });
    });

    describe('POST /api/tutor/adjust-availability', () => {
        const studentId = 'mockStudentId123';

        it('should adjust availability and return 200', async () => {
            tutorService.adjustTutorAvailability.mockResolvedValue({
                statusCode: 200,
                message: 'Tutor availability adjusted successfully'
            });

            const res = await request(app)
                .post('/api/tutor/adjust-availability')
                .send({ studentId })
                .expect(200);

            expect(res.body.message).toBe('Tutor availability adjusted successfully');
            expect(tutorService.adjustTutorAvailability).toHaveBeenCalledWith(studentId);
        });

        it('should return 400 if student ID is invalid', async () => {
            tutorService.adjustTutorAvailability.mockImplementation(() => {
                throw new Error("Invalid Student ID format");
            });

            const res = await request(app)
                .post('/api/tutor/adjust-availability')
                .send({ studentId: 'invalidId' })
                .expect(400);

            expect(res.body.message).toBe('Invalid Student ID format');
        });

        it('should return 404 if student not found', async () => {
            tutorService.adjustTutorAvailability.mockImplementation(() => {
                throw new Error("Student not found");
            });

            const res = await request(app)
                .post('/api/tutor/adjust-availability')
                .send({ studentId })
                .expect(404);

            expect(res.body.message).toBe('Student not found');
        });

        it('should return 500 if mailer fails', async () => {
            tutorService.adjustTutorAvailability.mockImplementation(() => {
                throw new Error("Failed to send availability update email");
            });

            const res = await request(app)
                .post('/api/tutor/adjust-availability')
                .send({ studentId })
                .expect(500);

            expect(res.body.message).toBe('Failed to send availability update email');
        });
    });

    describe('GET /api/tutor/payments/:id', () => {
        const tutorId = 'mockTutorId123';

        it('should calculate payments and return 200', async () => {
            tutorService.calculateTutorPayments.mockResolvedValue({
                statusCode: 200,
                data: {
                    tutor: { id: tutorId, name: 'John Doe', email: 'john@example.com', status: 'active' },
                    weekly: { totalEarnings: 1000, totalPayout: 800, totalProfit: 200, sessions: 5 },
                    monthly: { totalEarnings: 4000, totalPayout: 3200, totalProfit: 800, sessions: 20 }
                }
            });

            const res = await request(app)
                .get(`/api/tutor/payments/${tutorId}`)
                .expect(200);

            expect(res.body.data.tutor.id).toBe(tutorId);
            expect(tutorService.calculateTutorPayments).toHaveBeenCalledWith(tutorId);
        });

        it('should return 400 if tutor ID is invalid', async () => {
            tutorService.calculateTutorPayments.mockImplementation(() => {
                throw new Error("Invalid Tutor ID format");
            });

            const res = await request(app)
                .get('/api/tutor/payments/invalidId')
                .expect(400);

            expect(res.body.message).toBe('Invalid Tutor ID format');
        });

        it('should return 404 if tutor not found', async () => {
            tutorService.calculateTutorPayments.mockImplementation(() => {
                throw new Error("Tutor not found");
            });

            const res = await request(app)
                .get(`/api/tutor/payments/${tutorId}`)
                .expect(404);

            expect(res.body.message).toBe('Tutor not found');
        });
    });
});