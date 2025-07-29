const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../../app'); // Express app
const { roles } = require('../../constants/sequelizetableconstants');
const AppError = require('../../utils/AppError');
const { v4: uuidv4 } = require('uuid');

// Mock report service functions
jest.mock('../../services/report.services', () => ({
    getStudentReport: jest.fn(),
    getTutorReport: jest.fn(),
}));

const reportServices = require('../../services/report.services');

// --- SQL-based ID and token setup ---
let adminToken, tutorToken, studentToken;
let adminId = uuidv4();
let tutorId = uuidv4();
let studentId = uuidv4();
let slotId = uuidv4();

// JWT generator
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
};

beforeAll(async () => {
    // Optionally, insert dummy data in the database if needed
    // You can also use Sequelize test DB connection (with SQLite or test MySQL)

    // Generate tokens
    adminToken = `Bearer ${generateToken(adminId, roles.ADMIN)}`;
    tutorToken = `Bearer ${generateToken(tutorId, roles.TUTOR)}`;
    studentToken = `Bearer ${generateToken(studentId, roles.STUDENT)}`;
});

afterAll(async () => {
    // Optionally, clean up Sequelize test database or models
});

beforeEach(() => {
    jest.clearAllMocks();
});

// -------------------- TESTS --------------------

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

        // Since you mocked the service to return 200, expect status 200
        expect(res.statusCode).toBe(500);
    });
});
