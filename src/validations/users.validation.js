const { body, param } = require('express-validator');
const { roles, status } = require('../constants/sequelizetableconstants'); // Ensure this path is correct relative to this file

exports.registeruser = [
    body('fullName').isString().withMessage('fullName should not be numbers'),
    body('email').isEmail().withMessage('email is not valid'),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[\d]/).withMessage('Password must contain at least one number')
        .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character'),
    body('role').isIn([roles.ADMIN, roles.STUDENT, roles.TUTOR]).withMessage('Invalid user role') // <--- This line is essential
];

exports.validateUpdateUser = [
    param('userId') 
        .exists().withMessage('User ID is required in parameters.'),

    body('fullName')
        .optional()
        .isString().withMessage('Full name must be a string.')
        .trim() // Trim whitespace
        .notEmpty().withMessage('Full name cannot be empty if provided.'),

    body('email')
        .optional()
        .isEmail().withMessage('Invalid email format.')
        .normalizeEmail(), // Standardize email format

    body('phoneNumber')
        .optional()
        .isString().withMessage('Phone number must be a string.')
        .trim()
        .notEmpty().withMessage('Phone number cannot be empty if provided.'),

    body('status')
        .optional()
        .isIn(['active', 'inactive']).withMessage('Status must be "active" or "inactive".'),

    body('profileId')
        .optional()
];
