const { body } = require('express-validator');

exports.registerUserValidation = [ // Renamed for clarity and consistency
    body('fullName')
        .isString().withMessage('Full name must be a string')
        .notEmpty().withMessage('Full name is required'),
    body('email')
        .isEmail().withMessage('Valid email is required')
        .notEmpty().withMessage('Email is required'),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number')
        .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character'),
    body('role')
        .optional()
        .isIn(['admin', 'student', 'tutor']).withMessage('Invalid role provided')
];

// You might add other user-related validations here, e.g., for login, password reset etc.
exports.loginUserValidation = [
    body('email')
        .isEmail().withMessage('Valid email is required')
        .notEmpty().withMessage('Email is required'),
    body('password')
        .notEmpty().withMessage('Password is required')
];

exports.forgotPasswordValidation = [
    body('email')
        .isEmail().withMessage('Valid email is required')
        .notEmpty().withMessage('Email is required')
];

exports.resetPasswordValidation = [
    body('token')
        .notEmpty().withMessage('Reset token is required'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('New password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('New password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('New password must contain at least one number')
        .matches(/[^A-Za-z0-9]/).withMessage('New password must contain at least one special character'),
];

exports.updatePasswordValidation = [
    body('currentPassword')
        .notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('New password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('New password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('New password must contain at least one number')
        .matches(/[^A-Za-z0-9]/).withMessage('New password must contain at least one special character'),
];
