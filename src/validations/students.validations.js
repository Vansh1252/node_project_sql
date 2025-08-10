const { body } = require("express-validator");

exports.createStudentValidation = [
    body("studentNumber")
        .isNumeric().withMessage("Student number must be numeric")
        .notEmpty().withMessage("Student number is required"),

    body("firstName").notEmpty().withMessage("First name is required"),
    body("lastName").notEmpty().withMessage("Last name is required"),
    body("familyName").notEmpty().withMessage("Family name is required"),
    body("grade").notEmpty().withMessage("Grade is required"),
    body("year").notEmpty().withMessage("Year is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phoneNumber").notEmpty().withMessage("Phone number is required"),
    body("address").notEmpty().withMessage("Address is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("state").notEmpty().withMessage("State is required"),
    body("country").notEmpty().withMessage("Country is required"),
    body("startDate").isISO8601().toDate().withMessage("Start date must be in YYYY-MM-DD format"),

    // Optional fields that actually exist in your schema
    body("assignedTutor").optional(),
    body("timezone").optional(),
    body("sessionDuration").optional().isNumeric().isIn([25, 26, 30]).withMessage("Invalid session duration"),
    body("referralSource").optional(),
    body("meetingLink").optional(),
    body("accountCreated").optional().isBoolean(),
    body("status").optional().isIn(["active", "inactive", "paused"]).withMessage("Invalid status"),
];

exports.updateStudentValidation = [
    body("studentNumber").optional().isNumeric().withMessage("Student number must be numeric").notEmpty().withMessage("Student number is required"),
    body("firstName").optional().notEmpty().withMessage("First name is required"),
    body("lastName").optional().notEmpty().withMessage("Last name is required"),
    body("familyName").optional().notEmpty().withMessage("Family name is required"),
    body("grade").optional().notEmpty().withMessage("Grade is required"),
    body("year").optional().notEmpty().withMessage("Year is required"),
    body("email").optional().isEmail().withMessage("Valid email is required"),
    body("phoneNumber").optional().notEmpty().withMessage("Phone number is required"),
    body("address").optional().notEmpty().withMessage("Address is required"),
    body("city").optional().notEmpty().withMessage("City is required"),
    body("state").optional().notEmpty().withMessage("State is required"),
    body("country").optional().notEmpty().withMessage("Country is required"),
    body("startDate").optional().isISO8601().toDate().withMessage("Start date must be in YYYY-MM-DD format"),
    body("assignedTutor").optional(),
    body("timezone").optional(),
    body("referralSource").optional(),
    body("meetingLink").optional(),
    body("accountCreated").optional().isBoolean(),
    body("status").optional().isIn(["active", "inactive", "paused"]).withMessage("Invalid status"),
];
