const { body, check } = require("express-validator");

// Validation for creating a new student (all required fields)
exports.createStudentValidation = [
    body("studentNumber")
        .isNumeric().withMessage("Student number must be numeric")
        .notEmpty().withMessage("Student number is required"),
    body("firstName").notEmpty().withMessage("First name is required"),
    body("lastName").notEmpty().withMessage("Last name is required"),
    body("familyName").notEmpty().withMessage("Family name is required"),
    body("grade").notEmpty().withMessage("Grade is required"),
    body("year").notEmpty().withMessage("Year is required"),
    body("email")
        .isEmail().withMessage("Valid email is required")
        .notEmpty().withMessage("Email is required"),
    body("phoneNumber")
        .notEmpty().withMessage("Phone number is required")
        .isString().withMessage("Phone number must be a string"),
    body("address").notEmpty().withMessage("Address is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("state").notEmpty().withMessage("State is required"),
    body("country").notEmpty().withMessage("Country is required"),
    body("startDate")
        .isISO8601().toDate().withMessage("Start date is required in YYYY-MM-DD format"),

    // Optional fields on creation, but if provided, validate their types/formats
    body("assignedTutor")
        .optional({ nullable: true }) // Allow null or undefined
        .isUUID().withMessage("Assigned tutor must be a valid UUID"), // ✅ Changed from isMongoId()
    body("timezone")
        .optional()
        .notEmpty().withMessage("Timezone cannot be empty if provided"),
    body("sessionDuration")
        .optional()
        .isNumeric().withMessage("Session duration must be numeric")
        .isIn([25, 26, 30]).withMessage("Invalid session duration. Must be 25, 26, or 30."),
    body("avaliableTime")
        .isArray({ min: 0 }).withMessage("Weekly hours must be an array") // Allow empty array if no hours are set initially
        .custom(value => {
            if (!value || value.length === 0) return true; // Allow empty array
            for (const dayEntry of value) {
                if (!dayEntry.day || typeof dayEntry.day !== 'string' || !["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].includes(dayEntry.day.toLowerCase())) {
                    throw new Error("Each weekly hour entry must have a valid 'day' string (e.g., 'monday').");
                }
                if (!Array.isArray(dayEntry.slots) || dayEntry.slots.length === 0) {
                    throw new Error("Each day in weekly hours must have at least one slot.");
                }
                for (const slot of dayEntry.slots) {
                    if (typeof slot.start !== 'string' || slot.start.trim() === '') {
                        throw new Error("Each slot must have a non-empty 'start' time string.");
                    }
                    if (typeof slot.end !== 'string' || slot.end.trim() === '') {
                        throw new Error("Each slot must have a non-empty 'end' time string.");
                    }
                }
            }
            return true;
        }),
    body("paymentMethodPaypal")
        .optional()
        .isString().withMessage("Payment method (PayPal) must be a string"),
    body("paymentMethodStripe")
        .optional()
        .isString().withMessage("Payment method (Stripe) must be a string"),
    body("transactionFee")
        .optional()
        .isNumeric().withMessage("Transaction fee must be numeric"),
    body("totalAmount")
        .optional()
        .isNumeric().withMessage("Total amount must be numeric"),
    body("tutorPayout")
        .optional()
        .isNumeric().withMessage("Tutor payout must be numeric"),
    body("profitWeek")
        .optional()
        .isNumeric().withMessage("Profit (weekly) must be numeric"),
    body("profitMonth")
        .optional()
        .isNumeric().withMessage("Profit (monthly) must be numeric"),
    body("referralSource")
        .optional()
        .notEmpty().withMessage("Referral source cannot be empty if provided"),
    body("meetingLink")
        .optional()
        .isURL().withMessage("Meeting link must be a valid URL")
        .notEmpty().withMessage("Meeting link cannot be empty if provided"),
    body("accountCreated")
        .optional()
        .isBoolean().withMessage("Account created must be a boolean"),
    body("status")
        .optional()
        .isIn(["active", "inactive", "paused"]).withMessage("Status must be 'active', 'inactive', or 'paused'"),
    body("assessments")
        .optional()
        .isArray().withMessage("Assessments must be an array")
        .custom(value => {
            if (value && value.some(item => typeof item !== 'string')) {
                throw new Error("All assessment items must be strings.");
            }
            return true;
        }),
];

// Validation for updating an existing student (all fields are optional)
exports.updateStudentValidation = [
    // All fields are optional, but if provided, must meet specific criteria
    body("studentNumber")
        .optional()
        .isNumeric().withMessage("Student number must be numeric"),
    body("firstName")
        .optional()
        .notEmpty().withMessage("First name cannot be empty if provided"),
    body("lastName")
        .optional()
        .notEmpty().withMessage("Last name cannot be empty if provided"),
    body("familyName")
        .optional()
        .notEmpty().withMessage("Family name cannot be empty if provided"),
    body("grade")
        .optional()
        .notEmpty().withMessage("Grade cannot be empty if provided"),
    body("year")
        .optional()
        .notEmpty().withMessage("Year cannot be empty if provided"),
    body("email")
        .optional()
        .isEmail().withMessage("Valid email is required"),
    body("phoneNumber")
        .optional()
        .notEmpty().withMessage("Phone number cannot be empty if provided")
        .isString().withMessage("Phone number must be a string"),
    body("address")
        .optional()
        .notEmpty().withMessage("Address cannot be empty if provided"),
    body("city")
        .optional()
        .notEmpty().withMessage("City cannot be empty if provided"),
    body("state")
        .optional()
        .notEmpty().withMessage("State cannot be empty if provided"),
    body("country")
        .optional()
        .notEmpty().withMessage("Country cannot be empty if provided"),
    body("startDate")
        .optional()
        .isISO8601().toDate().withMessage("Start date must be in YYYY-MM-DD format"),
    body("dischargeDate")
        .optional()
        .isISO8601().toDate().withMessage("Discharge date must be in YYYY-MM-DD format"),
    body("assignedTutor")
        .optional({ nullable: true }) // Allow null or undefined
        .isUUID().withMessage("Assigned tutor must be a valid UUID"), // ✅ Changed from isMongoId()
    body("timezone")
        .optional()
        .notEmpty().withMessage("Timezone cannot be empty if provided"),
    body("sessionDuration")
        .optional()
        .isNumeric().withMessage("Session duration must be numeric")
        .isIn([25, 26, 30]).withMessage("Invalid session duration. Must be 25, 26, or 30."),
    body("avaliableTime")
        .optional()
        .isArray().withMessage("Weekly hours must be an array")
        .custom(value => {
            if (!value || value.length === 0) return true; // Allow empty array
            for (const dayEntry of value) {
                if (!dayEntry.day || typeof dayEntry.day !== 'string' || !["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].includes(dayEntry.day.toLowerCase())) {
                    throw new Error("Each weekly hour entry must have a valid 'day' string (e.g., 'monday').");
                }
                if (!Array.isArray(dayEntry.slots) || dayEntry.slots.length === 0) {
                    throw new Error("Each day in weekly hours must have at least one slot.");
                }
                for (const slot of dayEntry.slots) {
                    if (typeof slot.start !== 'string' || slot.start.trim() === '') {
                        throw new Error("Each slot must have a non-empty 'start' time string.");
                    }
                    if (typeof slot.end !== 'string' || slot.end.trim() === '') {
                        throw new Error("Each slot must have a non-empty 'end' time string.");
                    }
                }
            }
            return true;
        }),
    body("paymentMethodPaypal")
        .optional()
        .isString().withMessage("Payment method (PayPal) must be a string"),
    body("paymentMethodStripe")
        .optional()
        .isString().withMessage("Payment method (Stripe) must be a string"),
    body("transactionFee")
        .optional()
        .isNumeric().withMessage("Transaction fee must be numeric"),
    body("totalAmount")
        .optional()
        .isNumeric().withMessage("Total amount must be numeric"),
    body("tutorPayout")
        .optional()
        .isNumeric().withMessage("Tutor payout must be numeric"),
    body("profitWeek")
        .optional()
        .isNumeric().withMessage("Profit (weekly) must be numeric"),
    body("profitMonth")
        .optional()
        .isNumeric().withMessage("Profit (monthly) must be numeric"),
    body("referralSource")
        .optional()
        .notEmpty().withMessage("Referral source cannot be empty if provided"),
    body("meetingLink")
        .optional()
        .isURL().withMessage("Meeting link must be a valid URL")
        .notEmpty().withMessage("Meeting link cannot be empty if provided"),
    body("accountCreated")
        .optional()
        .isBoolean().withMessage("Account created must be a boolean"),
    body("status")
        .optional()
        .isIn(["active", "inactive", "paused"]).withMessage("Status must be 'active', 'inactive', or 'paused'"),
    body("assessments")
        .optional()
        .isArray().withMessage("Assessments must be an array")
        .custom(value => {
            if (value && value.some(item => typeof item !== 'string')) {
                throw new Error("All assessment items must be strings.");
            }
            return true;
        }),
];
