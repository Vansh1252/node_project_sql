const { body } = require("express-validator");

exports.validateTutor = [
    body("firstName").notEmpty().withMessage("First name is required"),
    body("lastName").notEmpty().withMessage("Last name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phoneNumber").notEmpty().withMessage("Phone number is required"),
    body("address").notEmpty().withMessage("Address is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("province").notEmpty().withMessage("Province is required"),
    body("postalCode").notEmpty().withMessage("Postal code is required"),
    body("country").notEmpty().withMessage("Country is required"),
    body("rate").isNumeric().withMessage("Rate must be a number"),
    body("timezone").notEmpty().withMessage("Timezone is required"),
    body("weeklyHours").isArray({ min: 1 }).withMessage("Weekly hours must be an array"),
    body("weeklyHours.*.day")
        .isIn(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"])
        .withMessage("Invalid day in weekly schedule"),
    body("weeklyHours.*.slots").isArray({ min: 1 }).withMessage("Each day must have slots"),
    body("weeklyHours.*.slots.*.start").notEmpty().withMessage("Start time is required"),
    body("weeklyHours.*.slots.*.end").notEmpty().withMessage("End time is required"),
]