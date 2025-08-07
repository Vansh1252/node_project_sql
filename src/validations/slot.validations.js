const { body, param } = require('express-validator');

exports.validateCreateManualSlot = [
    // Validate tutorId: must exist and be a string (or adjust if it's a specific format like ObjectId)
    body('tutorId')
        .exists().withMessage('Tutor ID is required.')
        .isString().withMessage('Tutor ID must be a string.'),

    // Validate date: must exist and be an ISO 8601 date string
    body('date')
        .exists().withMessage('Date is required.')
        .isISO8601().toDate().withMessage('Date must be a valid ISO 8601 date.'), // .toDate() converts it to a Date object

    // Validate startTime: must exist and be a string (you might add regex for HH:MM format)
    body('startTime')
        .exists().withMessage('Start time is required.')
        .isString().withMessage('Start time must be a string.'),

    // Validate endTime: must exist and be a string
    body('endTime')
        .exists().withMessage('End time is required.')
        .isString().withMessage('End time must be a string.'),

    // Validate obj_student: optional, can be null or a string
    body('obj_student')
        .optional() // Allows the field to be absent
        .isString().withMessage('Student object must be a string.')
        .bail() // Stop validation if it's not a string
        .if(body('obj_student').exists()) // Only if it exists, check if it's null
        .not().isEmpty().withMessage('Student object cannot be empty if provided.')
        .customSanitizer(value => (value === '' ? null : value)), // Convert empty string to null

    // Validate str_status: optional, must be one of the allowed values
    body('str_status')
        .optional()
        .isIn(['available', 'booked', 'cancelled']).withMessage('Status must be "available", "booked", or "cancelled".'),
]



exports.validateVerifyRazorpayPayment = [
    // Validate razorpay_order_id: must exist and be a string
    body('razorpay_order_id')
        .exists().withMessage('Razorpay Order ID is required.')
        .isString().withMessage('Razorpay Order ID must be a string.')
        .notEmpty().withMessage('Razorpay Order ID cannot be empty.'),

    // Validate razorpay_payment_id: must exist and be a string
    body('razorpay_payment_id')
        .exists().withMessage('Razorpay Payment ID is required.')
        .isString().withMessage('Razorpay Payment ID must be a string.')
        .notEmpty().withMessage('Razorpay Payment ID cannot be empty.'),

    // Validate razorpay_signature: must exist and be a string
    body('razorpay_signature')
        .exists().withMessage('Razorpay Signature is required.')
        .isString().withMessage('Razorpay Signature must be a string.')
        .notEmpty().withMessage('Razorpay Signature cannot be empty.'),

    // Validate slotId: must exist, be a string, and a valid MongoDB ID
    body('slotId')
        .exists().withMessage('Slot ID is required.')
        .isString().withMessage('Slot ID must be a string.')
        .notEmpty().withMessage('Slot ID cannot be empty.'),
];