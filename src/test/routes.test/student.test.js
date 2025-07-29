// src/test/routes.test/student.test.js

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../../app');
const studentController = require('../../controllers/student.controllers');

// --- Mock Controller and Middleware ---
jest.mock('../../controllers/student.controllers');
jest.mock('../../middleware/auth', () => {
    // FIX: Import 'roles' inside the mock factory to avoid the ReferenceError
    const { roles } = require('../../constants/sequelizetableconstants');
    return {
        protect: (req, res, next) => {
            // Mocking protect middleware to attach a user object
            // This can be customized in each test
            req.user = { id: 'mock-user-id', role: roles.ADMIN };
            next();
        },
        restrictTo: (...roles) => (req, res, next) => {
            // Mocking restrictTo middleware
            if (roles.includes(req.user.role)) {
                next();
            } else {
                res.status(403).json({ message: 'Forbidden' });
            }
        },
    };
});
jest.mock('../../middleware/validate', () => ({
    validate: (req, res, next) => next(),
}));
jest.mock('../../middleware/multer', () => ({
    single: (fieldName) => (req, res, next) => {
        req.file = { filename: 'mock-assessment.pdf' };
        next();
    },
}));


describe('Student Routes (/api/student)', () => {

    let adminToken, tutorToken, studentToken;
    const mockStudentId = new mongoose.Types.ObjectId().toString();
    const mockTutorId = new mongoose.Types.ObjectId().toString();
    // FIX: Import roles here for use within the tests themselves
    const { roles } = require('../../constants/sequelizetableconstants');

    beforeAll(() => {
        process.env.JWT_SECRET = 'a-secure-test-secret';
        adminToken = `Bearer ${jwt.sign({ id: 'admin-id', role: roles.ADMIN }, process.env.JWT_SECRET)}`;
        tutorToken = `Bearer ${jwt.sign({ id: 'tutor-id', role: roles.TUTOR }, process.env.JWT_SECRET)}`;
        studentToken = `Bearer ${jwt.sign({ id: 'student-id', role: roles.STUDENT }, process.env.JWT_SECRET)}`;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- POST /create ---
    describe('POST /create', () => {
        it('should call createstudents controller and return 201 on success', async () => {
            studentController.createstudents.mockImplementation((req, res) => {
                res.status(201).json({ message: 'Student created successfully' });
            });

            const res = await request(app)
                .post('/api/student/create')
                .set('Authorization', adminToken)
                .send({ email: 'new@student.com' });

            expect(res.statusCode).toBe(201);
            expect(studentController.createstudents).toHaveBeenCalled();
        });
    });

    // --- PUT /update/:id ---
    describe('PUT /update/:id', () => {
        it('should call updatestudents controller and return 200 on success', async () => {
            studentController.updatestudents.mockImplementation((req, res) => {
                res.status(200).json({ message: 'Student updated' });
            });

            const res = await request(app)
                .put(`/api/student/update/${mockStudentId}`)
                .set('Authorization', adminToken)
                .send({ firstName: 'Updated' });

            expect(res.statusCode).toBe(200);
            expect(studentController.updatestudents).toHaveBeenCalled();
        });
    });

    // --- GET / ---
    describe('GET /', () => {
        it('should call getonewithpagination controller and return 200', async () => {
            studentController.getonewithpagination.mockImplementation((req, res) => {
                res.status(200).json({ data: [] });
            });

            const res = await request(app)
                .get('/api/student/')
                .set('Authorization', adminToken);

            expect(res.statusCode).toBe(200);
            expect(studentController.getonewithpagination).toHaveBeenCalled();
        });
    });

    // --- GET /details/:id ---
    describe('GET /details/:id', () => {
        it('should call getone controller and return 200', async () => {
            studentController.getone.mockImplementation((req, res) => {
                res.status(200).json({ id: req.params.id });
            });

            const res = await request(app)
                .get(`/api/student/details/${mockStudentId}`)
                .set('Authorization', adminToken);

            expect(res.statusCode).toBe(200);
            expect(studentController.getone).toHaveBeenCalled();
        });
    });

    // --- POST /upload-assessment/:id ---
    describe('POST /upload-assessment/:id', () => {
        it('should call uploadAssessment controller and return 200', async () => {
            studentController.uploadAssessment.mockImplementation((req, res) => {
                res.status(200).json({ message: 'File uploaded' });
            });

            const res = await request(app)
                .post(`/api/student/upload-assessment/${mockStudentId}`)
                .set('Authorization', adminToken); // Assuming any authenticated user can upload

            expect(res.statusCode).toBe(200);
            expect(studentController.uploadAssessment).toHaveBeenCalled();
        });
    });

    // --- DELETE /:id ---
    describe('DELETE /:id', () => {
        it('should call deletestudnets controller and return 204 on success', async () => {
            studentController.deletestudnets.mockImplementation((req, res) => {
                res.status(204).send();
            });

            const res = await request(app)
                .delete(`/api/student/${mockStudentId}`)
                .set('Authorization', adminToken);

            expect(res.statusCode).toBe(204);
            expect(studentController.deletestudnets).toHaveBeenCalled();
        });
    });

    // --- POST /:id/status ---
    describe('POST /:id/status', () => {
        it('should call statuschange controller and return 200', async () => {
            studentController.statuschange.mockImplementation((req, res) => {
                res.status(200).json({ message: 'Status changed' });
            });

            const res = await request(app)
                .post(`/api/student/${mockStudentId}/status`)
                .set('Authorization', adminToken)
                .send({ status: 'inactive' });

            expect(res.statusCode).toBe(200);
            expect(studentController.statuschange).toHaveBeenCalled();
        });
    });

    // --- POST /assign-tutor/:studentId ---
    describe('POST /assign-tutor/:studentId', () => {
        it('should call assigntutor controller and return 200', async () => {
            studentController.assigntutor.mockImplementation((req, res) => {
                res.status(200).json({ message: 'Tutor assigned' });
            });

            const res = await request(app)
                .post(`/api/student/assign-tutor/${mockStudentId}`)
                .set('Authorization', adminToken)
                .send({ tutorId: mockTutorId });

            expect(res.statusCode).toBe(200);
            expect(studentController.assigntutor).toHaveBeenCalled();
        });
    });

    // --- GET /details/:id/assessments ---
    describe('GET /details/:id/assessments', () => {
        it('should call getAssessments controller and return 200', async () => {
            studentController.getAssessments.mockImplementation((req, res) => {
                res.status(200).json({ data: [] });
            });

            const res = await request(app)
                .get(`/api/student/details/${mockStudentId}/assessments`)
                .set('Authorization', adminToken);

            expect(res.statusCode).toBe(200);
            expect(studentController.getAssessments).toHaveBeenCalled();
        });
    });

    // --- DELETE /details/:id/assessments ---
    describe('DELETE /details/:id/assessments', () => {
        it('should call deleteAssessment controller and return 204', async () => {
            studentController.deleteAssessment.mockImplementation((req, res) => {
                res.status(204).send();
            });

            const res = await request(app)
                .delete(`/api/student/details/${mockStudentId}/assessments`)
                .set('Authorization', adminToken)
                .send({ assessmentUrl: 'http://example.com/file.pdf' });

            expect(res.statusCode).toBe(204);
            expect(studentController.deleteAssessment).toHaveBeenCalled();
        });
    });

    // --- POST /master ---
    describe('POST /master', () => {
        it('should call studentmaster controller and return 200', async () => {
            studentController.studentmaster.mockImplementation((req, res) => {
                res.status(200).json({ message: 'Master route hit' });
            });

            const res = await request(app)
                .post('/api/student/master')
                .send({}); // Public route, no token needed

            expect(res.statusCode).toBe(200);
            expect(studentController.studentmaster).toHaveBeenCalled();
        });
    });
});
