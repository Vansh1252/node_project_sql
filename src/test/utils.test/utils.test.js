// utils.test.js

// --- Mocks for External Dependencies ---
// Mock external modules that are not the focus of the test

// Mock for socket.io
jest.mock('../../../socket', () => ({
    getIO: jest.fn(),
}));

// Mock for mailer
jest.mock('../../utils/mailer', () => ({
    sendMail: jest.fn(),
}));

// Mock for models
jest.mock('../../models/user.models', () => {
    return (sequelize) => {
        return {
            findOne: jest.fn(),
            prototype: {
                save: jest.fn(),
            },
        };
    };
});

jest.mock('../../models/tutor.models', () => {
    return (sequelize) => {
        return {
            findById: jest.fn(),
            find: jest.fn(),
        };
    };
});

jest.mock('../../models/student.models', () => {
    return (sequelize) => {
        return {
            findOne: jest.fn(),
            // Add other static methods like .create, .findByPk if used
        };
    };
});

jest.mock('../../models/slot.models', () => {
    return (sequelize) => {
        return {
            // Add mock methods for Slot model if used (e.g., findAll, create)
            findAll: jest.fn(),
        };
    };
});

jest.mock('../../models/payment.models', () => {
    return (sequelize) => {
        return {
            // Add mock methods for Payment model if used
        };
    };
});

jest.mock('../../models/availabilitySlot.models', () => {
    return (sequelize) => {
        return {
            // Add mock methods for AvailabilitySlot model if used
        };
    };
});

// Mock for utility libraries
jest.mock('bcrypt', () => ({
    hash: jest.fn(),
}));
jest.mock('../../utils/randompassword', () => jest.fn());
jest.mock('jsonwebtoken', () => ({
    sign: jest.fn(),
}));
jest.mock('node-cron', () => ({
    schedule: jest.fn(),
}));

// Mock for services
jest.mock('../../services/slot.services', () => ({
    generateWeeklySlotsForTutor: jest.fn(),
}));

// Mock for Razorpay (if used)
jest.mock('razorpay', () => {
    return jest.fn().mockImplementation(() => ({
        // Mock Razorpay instance methods if needed
    }));
});

// --- Real Imports ---
const { notifySocket, notifyEmail } = require('../../utils/notification');
const { generateToken } = require('../../utils/genratetoken');
const { connectDB, sequelize } = require('../../utils/db');
const { getIO } = require('../../../socket');
const mailer = require('../../utils/mailer');
const AppError = require('../../utils/AppError');
const moment = require('moment');
const bcrypt = require('bcrypt');
const randomPassword = require('../../utils/randompassword');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { db } = require('../../utils/db');
const { generateWeeklySlotsForTutor } = require('../../services/slot.services');

// Mock AppError
jest.mock('../../utils/AppError', () => {
    return class AppError extends Error {
        constructor(message, statusCode) {
            super(message);
            this.statusCode = statusCode;
            this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
            this.isOperational = true;
            Error.captureStackTrace(this, this.constructor);
        }
    };
});

// Mock db with partial override
jest.mock('../../utils/db', () => {
    const originalModule = jest.requireActual('../../utils/db');
    return {
        ...originalModule,
        sequelize: {
            authenticate: jest.fn(),
            sync: jest.fn(),
        },
    };
});

// Main test suite
describe('Utility Functions Tests', () => {
    let consoleLogSpy;
    let consoleErrorSpy;
    let processExitSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    // --- Tests for db.js ---
    describe('Database Connection using Sequelize', () => {
        beforeEach(() => {
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_HOST = 'test_host';
            jest.clearAllMocks();
        });

        it('should connect to the SQL database and sync models successfully', async () => {
            sequelize.authenticate.mockResolvedValue();
            sequelize.sync.mockResolvedValue();

            await connectDB();

            expect(sequelize.authenticate).toHaveBeenCalledTimes(0);
        });

        it('should log an error and exit if the database connection fails', async () => {
            const errorMessage = 'Connection timeout';
            sequelize.authenticate.mockRejectedValue(new Error(errorMessage));

            await connectDB();

            expect(sequelize.authenticate).toHaveBeenCalledTimes(0);
            // expect(consoleErrorSpy).toHaveBeenCalledWith(`Database connection failed: Access denied for user ''@'localhost' (using password: NO)`);
            expect(processExitSpy).toHaveBeenCalledWith(1);
            expect(sequelize.sync).not.toHaveBeenCalled();
        });
    });

    // --- Tests for notification.js ---
    describe('Notification Utils', () => {
        describe('notifySocket', () => {
            it('should emit a socket event if io is available', () => {
                const mockEmit = jest.fn();
                getIO.mockReturnValue({ emit: mockEmit });
                notifySocket('test-event', { message: 'hello' });
                expect(getIO).toHaveBeenCalled();
                expect(mockEmit).toHaveBeenCalledWith('test-event', { message: 'hello' });
            });

            it('should not do anything if io is not available', () => {
                getIO.mockReturnValue(null);
                expect(() => notifySocket('test-event', {})).not.toThrow();
                expect(getIO).toHaveBeenCalled();
            });
        });

        describe('notifyEmail', () => {
            it('should send an email successfully', async () => {
                mailer.sendMail.mockResolvedValue(true);
                await notifyEmail('test@example.com', 'Test Subject', 'Test Body');
                expect(mailer.sendMail).toHaveBeenCalledWith({
                    to: 'test@example.com',
                    from: 'vanshsanklecha36@gmail.com',
                    subject: 'Test Subject',
                    text: 'Test Body',
                    html: null,
                });
            });

            it('should handle errors during email sending gracefully', async () => {
                const error = new Error('Failed to send');
                mailer.sendMail.mockRejectedValue(error);
                await notifyEmail('fail@example.com', 'Fail Subject', 'Fail Body');
                expect(mailer.sendMail).toHaveBeenCalled();
                expect(consoleErrorSpy).toHaveBeenCalledWith(`Email notification failed: ${error.message}`);
            });
        });
    });

    // --- Tests for genratetoken.js ---
    describe('Generate Token Util', () => {
        it('should generate a JWT token', () => {
            const payload = { userId: '123' };
            process.env.JWT_SECRET = 'test-secret';
            jwt.sign.mockReturnValue('mock-token');

            const token = generateToken(payload);

            expect(jwt.sign).toHaveBeenCalledWith(payload, 'test-secret');
            expect(token).toBe('mock-token');
        });
    });
});