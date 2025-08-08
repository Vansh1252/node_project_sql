const { body,param } = require("express-validator");

// Shared validation rules
const validators = {
    studentNumber: body("studentNumber")
        .isNumeric().withMessage("Student number must be numeric"),
    firstName: body("firstName")
        .notEmpty().withMessage("First name is required"),
    lastName: body("lastName")
        .notEmpty().withMessage("Last name is required"),
    familyName: body("familyName")
        .notEmpty().withMessage("Family name is required"),
    grade: body("grade")
        .notEmpty().withMessage("Grade is required"),
    year: body("year")
        .notEmpty().withMessage("Year is required"),
    email: body("email")
        .isEmail().withMessage("Valid email is required"),
    phoneNumber: body("phoneNumber")
        .isString().withMessage("Phone number must be a string")
        .notEmpty().withMessage("Phone number is required"),
    address: body("address").notEmpty().withMessage("Address is required"),
    city: body("city").notEmpty().withMessage("City is required"),
    state: body("state").notEmpty().withMessage("State is required"),
    country: body("country").notEmpty().withMessage("Country is required"),
    startDate: body("startDate")
        .isISO8601().toDate().withMessage("Start date must be in YYYY-MM-DD format"),
    dischargeDate: body("dischargeDate")
        .isISO8601().toDate().withMessage("Discharge date must be in YYYY-MM-DD format"),
    assignedTutor: body("assignedTutor")
        .isMongoId().withMessage("Assigned tutor must be a valid ID"),
    timezone: body("timezone")
        .notEmpty().withMessage("Timezone cannot be empty"),
    sessionDuration: body("sessionDuration")
        .isNumeric().withMessage("Session duration must be numeric")
        .isIn([25, 26, 30]).withMessage("Invalid session duration. Must be 25, 26, or 30."),
    availabileTime: body("availabileTime")
        .isArray().withMessage("Selected slots must be an array")
        .custom(value => {
            if (!value || value.length === 0) return true;
            for (const slot of value) {
                if (!slot.day || typeof slot.day !== 'string') {
                    throw new Error("Each selected slot must include a 'day' string.");
                }
                if (!Array.isArray(slot.times) || slot.times.some(t => typeof t !== 'string' || t.trim() === '')) {
                    throw new Error("Each selected slot's 'times' must be an array of non-empty strings.");
                }
            }
            return true;
        }),
    paymentMethodPaypal: body("paymentMethodPaypal").isString().withMessage("Payment method (PayPal) must be a string"),
    paymentMethodStripe: body("paymentMethodStripe").isString().withMessage("Payment method (Stripe) must be a string"),
    transactionFee: body("transactionFee").isNumeric().withMessage("Transaction fee must be numeric"),
    totalAmount: body("totalAmount").isNumeric().withMessage("Total amount must be numeric"),
    tutorPayout: body("tutorPayout").isNumeric().withMessage("Tutor payout must be numeric"),
    profitWeek: body("profitWeek").isNumeric().withMessage("Profit (weekly) must be numeric"),
    profitMonth: body("profitMonth").isNumeric().withMessage("Profit (monthly) must be numeric"),
    referralSource: body("referralSource").notEmpty().withMessage("Referral source cannot be empty"),
    meetingLink: body("meetingLink")
        .notEmpty().withMessage("Meeting link cannot be empty"),
    accountCreated: body("accountCreated").isBoolean().withMessage("Account created must be a boolean"),
    status: body("status").isIn(["active", "inactive", "paused"]).withMessage("Status must be 'active', 'inactive', or 'paused'"),
    assessments: body("assessments")
        .isArray().withMessage("Assessments must be an array")
};

// Validation for creating a new student (all required + optional)
exports.createStudentValidation = [
    validators.studentNumber.notEmpty().withMessage("Student number is required"),
    validators.firstName,
    validators.lastName,
    validators.familyName,
    validators.grade,
    validators.year,
    validators.email.notEmpty().withMessage("Email is required"),
    validators.phoneNumber,
    validators.address,
    validators.city,
    validators.state,
    validators.country,
    validators.startDate,
    validators.assignedTutor.optional({ nullable: true }),
    validators.timezone.optional(),
    validators.sessionDuration.optional(),
    validators.availabileTime,
    validators.paymentMethodPaypal.optional(),
    validators.paymentMethodStripe.optional(),
    validators.transactionFee.optional(),
    validators.totalAmount.optional(),
    validators.tutorPayout.optional(),
    validators.profitWeek.optional(),
    validators.profitMonth.optional(),
    validators.referralSource.optional(),
    validators.meetingLink.optional(),
    validators.accountCreated.optional(),
    validators.status.optional(),
    validators.assessments.optional(),
];

// Validation for updating an existing student (all optional)
exports.updateStudentValidation = [
    validators.studentNumber.optional(),
    validators.firstName.optional(),
    validators.lastName.optional(),
    validators.familyName.optional(),
    validators.grade.optional(),
    validators.year.optional(),
    validators.email.optional(),
    validators.phoneNumber.optional(),
    validators.address.optional(),
    validators.city.optional(),
    validators.state.optional(),
    validators.country.optional(),
    validators.startDate.optional(),
    validators.dischargeDate.optional(),
    validators.assignedTutor.optional({ nullable: true }),
    validators.timezone.optional(),
    validators.sessionDuration.optional(),
    validators.availabileTime.optional(),
    validators.paymentMethodPaypal.optional(),
    validators.paymentMethodStripe.optional(),
    validators.transactionFee.optional(),
    validators.totalAmount.optional(),
    validators.tutorPayout.optional(),
    validators.profitWeek.optional(),
    validators.profitMonth.optional(),
    validators.referralSource.optional(),
    validators.meetingLink.optional(),
    validators.accountCreated.optional(),
    validators.status.optional(),
    validators.assessments.optional(),
];
