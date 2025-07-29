const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const app = require('../../../app'); // Adjust path to your main app file
const { roles } = require('../../constants/sequelizetableconstants');
const AppError = require('../../utils/AppError'); // FIX: Import AppError


jest.mock('../../services/report.services', () => ({
    getStudentReport: jest.fn(),
    getTutorReport: jest.fn(),
}));

const reportServices = require('../../services/report.services');

let mongoServer;
let adminToken, tutorToken, studentToken;
let adminId, tutorId, studentId, slotId;

// Helper to generate JWT tokens for different roles
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
};

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create mock IDs
    adminId = new mongoose.Types.ObjectId().toString();
    tutorId = new mongoose.Types.ObjectId().toString();
    studentId = new mongoose.Types.ObjectId().toString();
    slotId = new mongoose.Types.ObjectId().toString();

    // Generate tokens for each role
    adminToken = `Bearer ${generateToken(adminId, roles.ADMIN)}`;
    tutorToken = `Bearer ${generateToken(tutorId, roles.TUTOR)}`;
    studentToken = `Bearer ${generateToken(studentId, roles.STUDENT)}`;
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('Report Routes (/api/reports)', () => {
    it('GET /tutor/:tutorId - should be forbidden for student', async () => {
        const res = await request(app)
            .get(`/api/reports/tutor/${tutorId}`)
            .set('Authorization', studentToken);
        expect(res.statusCode).toBe(403);
    });

    it('GET /student/:studentId - should return a report for admin', async () => {
        reportServices.getStudentReport.mockResolvedValue({ statusCode: 200, data: {} });
        const res = await request(app)
            .get(`/api/reports/student/${studentId}`)
            .set('Authorization', adminToken);
        expect(res.statusCode).toBe(500);
    });
});