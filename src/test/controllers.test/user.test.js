// src/test/controllers.test/user.controllers.test.js

const userController = require('../../controllers/user.controllers');
const userServices = require('../../services/user.services');
const { db } = require('../../utils/db'); // Import db for mocking
const AppError = require('../../utils/AppError');

// FIX: Use a manual mock to ensure all service functions are defined as jest.fn()
jest.mock('../../services/user.services', () => ({
    registerUser: jest.fn(),
    loginUser: jest.fn(),
    updateUser: jest.fn(),
    sendPasswordResetLink: jest.fn(),
    setNewPassword: jest.fn(),
    updatePassword: jest.fn(),
    getAdminDashboard: jest.fn(),
    refreshToken: jest.fn(),
    deleteUser: jest.fn(), // Added missing mock
}));

// Mock the db utility for the getProfile controller
jest.mock('../../utils/db', () => ({
    db: {
        User: {
            findByPk: jest.fn(),
        },
    },
}));

// Mock the catchAsync utility
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => fn(req, res, next));


describe('User Controllers', () => {
    let req, res, next;

    beforeEach(() => {
        jest.clearAllMocks();
        req = { params: {}, body: {}, user: { id: 'user123' }, query: {} };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        next = jest.fn();
    });

    describe('register', () => {
        it('should register a user and return 201', async () => {
            const serviceResponse = { statusCode: 201, message: 'User registered' };
            userServices.registerUser.mockResolvedValue(serviceResponse);

            await userController.register(req, res, next);

            expect(userServices.registerUser).toHaveBeenCalledWith(req.body);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('login', () => {
        it('should log in a user and return 200 with token', async () => {
            const serviceResponse = { token: 'jwt-token', user: { email: 'test@test.com' } };
            userServices.loginUser.mockResolvedValue(serviceResponse);

            await userController.login(req, res, next);

            expect(userServices.loginUser).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('getProfile', () => {
        it('should get the user profile and return 200', async () => {
            // FIX: Correctly mock for Sequelize and its response structure
            const mockUser = { id: 'user123', str_email: 'test@test.com', str_fullName: 'Test User', str_role: 'student' };
            db.User.findByPk.mockResolvedValue(mockUser);

            await userController.getProfile(req, res, next);

            expect(db.User.findByPk).toHaveBeenCalledWith(req.user.id, {
                attributes: ['id', 'str_email', 'str_fullName', 'str_role']
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                id: mockUser.id,
                email: mockUser.str_email,
                fullName: mockUser.str_fullName,
                role: mockUser.str_role
            });
        });

        it('should return 404 if user is not found', async () => {
            db.User.findByPk.mockResolvedValue(null);

            await userController.getProfile(req, res, next);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
        });
    });

    describe('updateProfile', () => {
        it('should update a user profile and return 200', async () => {
            const serviceResponse = { statusCode: 200, message: 'User updated', data: { id: 'user123' } };
            userServices.updateUser.mockResolvedValue(serviceResponse);

            await userController.updateProfile(req, res, next);

            expect(userServices.updateUser).toHaveBeenCalledWith(req.user.id, req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('sendPasswordResetLink', () => {
        it('should send a password reset link and return 200', async () => {
            const serviceResponse = { statusCode: 200, message: 'Token sent' };
            userServices.sendPasswordResetLink.mockResolvedValue(serviceResponse);

            await userController.sendPasswordResetLink(req, res, next);

            expect(userServices.sendPasswordResetLink).toHaveBeenCalledWith(req.body.email);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('setNewPassword', () => {
        it('should set a new password and return 200', async () => {
            const serviceResponse = { statusCode: 200, message: 'Password reset' };
            userServices.setNewPassword.mockResolvedValue(serviceResponse);

            await userController.setNewPassword(req, res, next);

            expect(userServices.setNewPassword).toHaveBeenCalledWith(req.body.token, req.body.newPassword);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('updatePassword', () => {
        it('should update the current user\'s password and return 200', async () => {
            const serviceResponse = { statusCode: 200, message: 'Password updated' };
            userServices.updatePassword.mockResolvedValue(serviceResponse);

            await userController.updatePassword(req, res, next);

            expect(userServices.updatePassword).toHaveBeenCalledWith(req.user.id, req.body.currentPassword, req.body.newPassword);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: serviceResponse.message });
        });
    });

    describe('getAdminDashboard', () => {
        it('should return admin dashboard data with status 200', async () => {
            const serviceResponse = { statusCode: 200, data: { totalUsers: 10 } };
            userServices.getAdminDashboard.mockResolvedValue(serviceResponse);

            await userController.getAdminDashboard(req, res, next);

            expect(userServices.getAdminDashboard).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse.data);
        });
    });

    describe('refreshToken', () => {
        it('should refresh the token and return 200', async () => {
            const serviceResponse = { statusCode: 200, token: 'new-jwt-token' };
            userServices.refreshToken.mockResolvedValue(serviceResponse);

            await userController.refreshToken(req, res, next);

            expect(userServices.refreshToken).toHaveBeenCalledWith(req.user.id);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ token: serviceResponse.token });
        });
    });

    describe('logout', () => {
        it('should return a 200 status with a logout message', () => {
            userController.logout(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Token-based logout: just delete token from client.' });
        });
    });

    // --- ADDED MISSING TEST SUITE ---
    describe('deleteUser', () => {
        it('should delete a user and return 200', async () => {
            req.params.id = 'user-to-delete-123';
            const serviceResponse = { statusCode: 200, message: 'User deleted' };
            userServices.deleteUser.mockResolvedValue(serviceResponse);

            await userController.deleteUser(req, res, next);

            expect(userServices.deleteUser).toHaveBeenCalledWith(req.params.id);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });
});
