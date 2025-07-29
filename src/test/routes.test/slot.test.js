// src/test/routes.test/slot.test.js

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../../app'); // Adjust path to your main app file
const slotController = require('../../controllers/slot.controllers');

// --- Mock Controller and Middleware ---
jest.mock('../../controllers/slot.controllers');
jest.mock('../../middleware/auth', () => {
    const { roles } = require('../../constants/sequelizetableconstants');
    // FIX: Import 'jwt' inside the mock factory to avoid the ReferenceError
    const jwt = require('jsonwebtoken');
    return {
        protect: (req, res, next) => {
            // A flexible mock for the protect middleware.
            // We'll extract the token and decode it to simulate real auth.
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ message: 'No token provided' });
            }
            const token = authHeader.split(' ')[1];
            try {
                // Use the same secret as in the tests to decode
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'a-secure-test-secret');
                req.user = decoded; // Attach decoded user to request
                next();
            } catch (err) {
                return res.status(401).json({ message: 'Invalid token' });
            }
        },
        restrictTo: (...allowedRoles) => (req, res, next) => {
            // A flexible mock for role restriction.
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


describe('Slot Routes (/api/slot)', () => {

    let adminToken, tutorToken, studentToken;
    const mockSlotId = new mongoose.Types.ObjectId().toString();
    const { roles } = require('../../constants/sequelizetableconstants');

    beforeAll(() => {
        process.env.JWT_SECRET = 'a-secure-test-secret';
        // Generate tokens with specific roles for testing authorization
        adminToken = `Bearer ${jwt.sign({ id: 'admin-id', role: roles.ADMIN }, process.env.JWT_SECRET)}`;
        tutorToken = `Bearer ${jwt.sign({ id: 'tutor-id', role: roles.TUTOR }, process.env.JWT_SECRET)}`;
        studentToken = `Bearer ${jwt.sign({ id: 'student-id', role: roles.STUDENT }, process.env.JWT_SECRET)}`;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Test each route defined in slot.routes.js ---

    describe('POST /payment/create-order', () => {
        it('should call bookSlot controller', async () => {
            slotController.bookSlot.mockImplementation((req, res) => res.status(200).send());
            await request(app).post('/api/slot/payment/create-order').send({});
            expect(slotController.bookSlot).toHaveBeenCalled();
        });
    });

    describe('POST /payment/verify', () => {
        it('should call verifyRazorpayPayment controller', async () => {
            slotController.verifyRazorpayPayment.mockImplementation((req, res) => res.status(200).send());
            await request(app).post('/api/slot/payment/verify').send({});
            expect(slotController.verifyRazorpayPayment).toHaveBeenCalled();
        });
    });

    describe('POST /reschedule', () => {
        it('should call rescheduleSlot controller for a STUDENT', async () => {
            slotController.rescheduleSlot.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).post('/api/slot/reschedule').set('Authorization', studentToken).send({});
            expect(res.statusCode).toBe(200);
            expect(slotController.rescheduleSlot).toHaveBeenCalled();
        });

        it('should be forbidden for an ADMIN', async () => {
            const res = await request(app).post('/api/slot/reschedule').set('Authorization', adminToken).send({});
            expect(res.statusCode).toBe(403);
        });
    });

    describe('POST /cancel/:id', () => {
        it('should call cancelSlot controller for a STUDENT', async () => {
            slotController.cancelSlot.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).post(`/api/slot/cancel/${mockSlotId}`).set('Authorization', studentToken).send({});
            expect(res.statusCode).toBe(200);
            expect(slotController.cancelSlot).toHaveBeenCalled();
        });
    });

    describe('GET /my', () => {
        it('should call getMySlots controller for a STUDENT', async () => {
            slotController.getMySlots.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).get('/api/slot/my').set('Authorization', studentToken);
            expect(res.statusCode).toBe(200);
            expect(slotController.getMySlots).toHaveBeenCalled();
        });
    });

    describe('GET /available', () => {
        it('should call getAvailableSlotsForStudents for any authenticated user', async () => {
            slotController.getAvailableSlotsForStudents.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).get('/api/slot/available').set('Authorization', studentToken);
            expect(res.statusCode).toBe(200);
            expect(slotController.getAvailableSlotsForStudents).toHaveBeenCalled();
        });
    });

    describe('GET /details/:id', () => {
        it('should call getoneslot controller for an ADMIN', async () => {
            slotController.getoneslot.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).get(`/api/slot/details/${mockSlotId}`).set('Authorization', adminToken);
            expect(res.statusCode).toBe(200);
            expect(slotController.getoneslot).toHaveBeenCalled();
        });

        it('should be forbidden for a STUDENT', async () => {
            const res = await request(app).get(`/api/slot/details/${mockSlotId}`).set('Authorization', studentToken);
            expect(res.statusCode).toBe(403);
        });
    });

    describe('POST /manual/create', () => {
        it('should call createManualSlot controller for an ADMIN', async () => {
            slotController.createManualSlot.mockImplementation((req, res) => res.status(201).send());
            const res = await request(app).post('/api/slot/manual/create').set('Authorization', adminToken).send({});
            expect(res.statusCode).toBe(201);
            expect(slotController.createManualSlot).toHaveBeenCalled();
        });
    });

    describe('PUT /manual/update/:id', () => {
        it('should call updateManualSlot controller for an ADMIN', async () => {
            slotController.updateManualSlot.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).put(`/api/slot/manual/update/${mockSlotId}`).set('Authorization', adminToken).send({});
            expect(res.statusCode).toBe(200);
            expect(slotController.updateManualSlot).toHaveBeenCalled();
        });
    });

    describe('GET /', () => {
        it('should call getslotswithpagination controller for a TUTOR', async () => {
            slotController.getslotswithpagination.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).get('/api/slot/').set('Authorization', tutorToken);
            expect(res.statusCode).toBe(200);
            expect(slotController.getslotswithpagination).toHaveBeenCalled();
        });
    });

    describe('DELETE /:id', () => {
        it('should call deleteslot controller for an ADMIN', async () => {
            slotController.deleteslot.mockImplementation((req, res) => res.status(204).send());
            const res = await request(app).delete(`/api/slot/${mockSlotId}`).set('Authorization', adminToken);
            expect(res.statusCode).toBe(204);
            expect(slotController.deleteslot).toHaveBeenCalled();
        });
    });

    describe('POST /generate-weekly', () => {
        it('should call generateWeeklySlotsForAllTutors controller for an ADMIN', async () => {
            slotController.generateWeeklySlotsForAllTutors.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).post('/api/slot/generate-weekly').set('Authorization', adminToken);
            expect(res.statusCode).toBe(200);
            expect(slotController.generateWeeklySlotsForAllTutors).toHaveBeenCalled();
        });
    });

    describe('POST /attendance/:slotId', () => {
        it('should call markAttendance controller for a TUTOR', async () => {
            slotController.markAttendance.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).post(`/api/slot/attendance/${mockSlotId}`).set('Authorization', tutorToken).send({});
            expect(res.statusCode).toBe(200);
            expect(slotController.markAttendance).toHaveBeenCalled();
        });
    });

    describe('GET /calendar', () => {
        it('should call getCalendarSlots controller for an ADMIN', async () => {
            slotController.getCalendarSlots.mockImplementation((req, res) => res.status(200).send());
            const res = await request(app).get('/api/slot/calendar').set('Authorization', adminToken);
            expect(res.statusCode).toBe(200);
            expect(slotController.getCalendarSlots).toHaveBeenCalled();
        });
    });
});
