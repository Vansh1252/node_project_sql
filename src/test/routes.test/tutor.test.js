// src/test/routes.test/tutor.test.js

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../../app'); // Adjust path to your main app file
const tutorController = require('../../controllers/tutor.controllers');

// --- Mock Controller and Middleware ---
jest.mock('../../controllers/tutor.controllers');
jest.mock('../../middleware/auth', () => {
    const { roles } = require('../../constants/sequelizetableconstants');
    const jwt = require('jsonwebtoken');
    return {
        protect: (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ message: 'No token provided' });
            }
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'a-secure-test-secret');
                req.user = decoded;
                next();
            } catch (err) {
                return res.status(401).json({ message: 'Invalid token' });
            }
        },
        restrictTo: (...allowedRoles) => (req, res, next) => {
            if (req.user && allowedRoles.includes(req.user.role)) {
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


describe('Tutor Routes (/api/tutor)', () => {

    let adminToken, tutorToken, studentToken;
    const mockTutorId = new mongoose.Types.ObjectId().toString();
    const mockStudentId = new mongoose.Types.ObjectId().toString();
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

    // --- Test each route defined in tutor.routes.js ---

    describe('POST /create', () => {
        it('should call createtutor controller for an ADMIN', async () => {
            tutorController.createtutor.mockImplementation((req, res) => res.status(201).send());
            const res = await request(app).post('/api/tutor/create').set('Authorization', adminToken).send({});
            expect(res.statusCode).toBe(201);
            expect(tutorController.createtutor).toHaveBeenCalled();
        });

        it('should be forbidden for a TUTOR', async () => {
            const res = await request(app).post('/api/tutor/create').set('Authorization', tutorToken).send({});
            expect(res.statusCode).toBe(403);
        });
    });

    describe('PUT /update/:id', () => {
        it('should call updatetutor controller for an ADMIN', async () => {
            tutorController.updatetutor.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).put(`/api/tutor/update/${mockTutorId}`).set('Authorization', adminToken).send({});
            expect(res.statusCode).toBe(200);
            expect(tutorController.updatetutor).toHaveBeenCalled();
        });
    });

    describe('GET /', () => {
        it('should call getonewithpagination controller for an ADMIN', async () => {
            tutorController.getonewithpagination.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).get('/api/tutor/').set('Authorization', adminToken);
            expect(res.statusCode).toBe(200);
            expect(tutorController.getonewithpagination).toHaveBeenCalled();
        });
    });

    describe('GET /details/:id', () => {
        it('should call getone controller for an ADMIN', async () => {
            tutorController.getone.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).get(`/api/tutor/details/${mockTutorId}`).set('Authorization', adminToken);
            expect(res.statusCode).toBe(200);
            expect(tutorController.getone).toHaveBeenCalled();
        });

        it('should call getone controller for a TUTOR', async () => {
            tutorController.getone.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).get(`/api/tutor/details/${mockTutorId}`).set('Authorization', tutorToken);
            expect(res.statusCode).toBe(200);
            expect(tutorController.getone).toHaveBeenCalled();
        });

        it('should be forbidden for a STUDENT', async () => {
            const res = await request(app).get(`/api/tutor/details/${mockTutorId}`).set('Authorization', studentToken);
            expect(res.statusCode).toBe(403);
        });
    });

    describe('DELETE /:id', () => {
        it('should call deletetutor controller for an ADMIN', async () => {
            tutorController.deletetutor.mockImplementation((req, res) => res.status(204).send());
            const res = await request(app).delete(`/api/tutor/${mockTutorId}`).set('Authorization', adminToken);
            expect(res.statusCode).toBe(204);
            expect(tutorController.deletetutor).toHaveBeenCalled();
        });
    });

    describe('PATCH /:tutorId/rate', () => {
        it('should call updateTutorRate controller for a TUTOR', async () => {
            tutorController.updateTutorRate.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).patch(`/api/tutor/${mockTutorId}/rate`).set('Authorization', tutorToken).send({ rate: 100 });
            expect(res.statusCode).toBe(200);
            expect(tutorController.updateTutorRate).toHaveBeenCalled();
        });
    });

    describe('POST /assign-student/:tutorId', () => {
        it('should call assignstudent controller for an ADMIN', async () => {
            tutorController.assignstudent.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).post(`/api/tutor/assign-student/${mockTutorId}`).set('Authorization', adminToken).send({ studentId: mockStudentId });
            expect(res.statusCode).toBe(200);
            expect(tutorController.assignstudent).toHaveBeenCalled();
        });
    });

    describe('POST /master', () => {
        it('should call tutormaster controller for an ADMIN', async () => {
            tutorController.tutormaster.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).post('/api/tutor/master').set('Authorization', adminToken).send({});
            expect(res.statusCode).toBe(200);
            expect(tutorController.tutormaster).toHaveBeenCalled();
        });
    });

    describe('POST /remove-student/:id', () => {
        it('should call removestudent controller for an ADMIN', async () => {
            tutorController.removestudent.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).post(`/api/tutor/remove-student/${mockTutorId}`).set('Authorization', adminToken).send({ studentId: mockStudentId });
            expect(res.statusCode).toBe(200);
            expect(tutorController.removestudent).toHaveBeenCalled();
        });
    });
});
