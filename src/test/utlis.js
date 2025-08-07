// tests/utils.js

// Mock nodemailer sendMail function
const mailer = {
    sendMail: jest.fn().mockResolvedValue(true),
};

// Mock socket utils
const socket = {
    getIO: jest.fn(() => ({
        emit: jest.fn(),
    })),
};
// Mock secure-random-password to return a fixed password
const randomPassword = jest.fn(() => 'FixedP@ssw0rd!');

// JWT and ObjectId helpers for tests
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const generateAuthToken = (userId, role = 'ADMIN') => {
    return jwt.sign({ id: userId.toString(), role }, JWT_SECRET, {
        expiresIn: '1h',
    });
};

const createObjectId = () => new mongoose.Types.ObjectId();

module.exports = {
    mailer,
    socket,
    randomPassword,
    generateAuthToken,
    createObjectId,
};
