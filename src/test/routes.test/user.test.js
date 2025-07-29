const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../../app'); // Adjust path to your main app file
const { roles } = require('../../constants/sequelizetableconstants');
const AppError = require('../../utils/AppError'); // FIX: Import AppError
const { v4: uuidv4 } = require('uuid');

// Mock the service layer to isolate route/controller logic
jest.mock('../../services/user.services', () => ({
    registerUser: jest.fn(),
    login: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    sendPasswordResetLink: jest.fn(),
    setNewPassword: jest.fn(),
    logout: jest.fn(),
    updatePassword: jest.fn(),
    refreshToken: jest.fn(),
    getAdminDashboard: jest.fn(),
}));
const userServices = require('../../services/user.services');

let mongoServer;
let adminToken, tutorToken, studentToken;
let adminId, tutorId, studentId, slotId;

// Helper to generate JWT tokens for different roles
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
};

beforeAll(async () => {

    // Create mock IDs
    adminId = uuidv4();
    tutorId = uuidv4();
    studentId = uuidv4();
    slotId = uuidv4();

    // Generate tokens for each role
    adminToken = `Bearer ${generateToken(adminId, roles.ADMIN)}`;
    tutorToken = `Bearer ${generateToken(tutorId, roles.TUTOR)}`;
    studentToken = `Bearer ${generateToken(studentId, roles.STUDENT)}`;
});


beforeEach(() => {
    jest.clearAllMocks();
});

describe('User Routes (/api/auth)', () => {
    it('POST /register - should register a user successfully', async () => {
        userServices.registerUser.mockResolvedValue({ statusCode: 201, message: 'User registered' });
        const res = await request(app)
            .post('/api/auth/register')
            .send({ fullName: 'Test', email: 'test@example.com', password: 'Password@123', role: 'admin' });
        expect(res.statusCode).toBe(201);
    });

    it('GET /me - should fail for unauthenticated user', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.statusCode).toBe(401);
    });

    it('GET /dashboard/admin - should be forbidden for non-admin user', async () => {
        const res = await request(app)
            .get('/api/auth/dashboard/admin')
            .set('Authorization', tutorToken);
        expect(res.statusCode).toBe(403);
    });
});