// middlewares/validate.js
// Import express-validator's validationResult to check for validation errors
const { validationResult } = require('express-validator');

/**
 * Middleware to handle validation results from express-validator.
 * If there are validation errors, responds with 422 and error details.
 * Otherwise, proceeds to the next middleware/controller.
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({
            success: false,
            message: "Validation error",
            errors: errors.array()
        });
    }
    next();
};


module.exports = { validate }