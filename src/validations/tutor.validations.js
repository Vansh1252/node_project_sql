const { body } = require("express-validator");

exports.createTutorValidation = [ // Renamed to be more explicit for creation
    body("firstName").notEmpty().withMessage("First name is required"),
    body("lastName").notEmpty().withMessage("Last name is required"),
    body("email")
        .isEmail().withMessage("Valid email is required")
        .notEmpty().withMessage("Email is required"),
    body("phoneNumber")
        .notEmpty().withMessage("Phone number is required")
        .isString().withMessage("Phone number must be a string"),
    body("address").notEmpty().withMessage("Address is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("province").notEmpty().withMessage("Province is required"),
    body("postalCode").notEmpty().withMessage("Postal code is required"),
    body("country").notEmpty().withMessage("Country is required"),
    body("rate")
        .isNumeric().withMessage("Rate must be a number")
        .notEmpty().withMessage("Rate is required"), // Added notEmpty for rate
    body("timezone").notEmpty().withMessage("Timezone is required"),
    body("weeklyHours")
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
];

exports.updateTutorValidation = [ // Validation for updating (all optional)
    body("firstName").optional().notEmpty().withMessage("First name cannot be empty if provided"),
    body("lastName").optional().notEmpty().withMessage("Last name cannot be empty if provided"),
    body("email").optional().isEmail().withMessage("Valid email is required"),
    body("phoneNumber").optional().notEmpty().withMessage("Phone number cannot be empty if provided").isString().withMessage("Phone number must be a string"),
    body("address").optional().notEmpty().withMessage("Address cannot be empty if provided"),
    body("city").optional().notEmpty().withMessage("City cannot be empty if provided"),
    body("province").optional().notEmpty().withMessage("Province cannot be empty if provided"),
    body("postalCode").optional().notEmpty().withMessage("Postal code cannot be empty if provided"),
    body("country").optional().notEmpty().withMessage("Country cannot be empty if provided"),
    body("rate").optional().isNumeric().withMessage("Rate must be a number"),
    body("timezone").optional().notEmpty().withMessage("Timezone cannot be empty if provided"),
    body("weeklyHours")
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
    body("status")
        .optional()
        .isIn(["active", "inactive"]).withMessage("Status must be 'active' or 'inactive'"),
    body("assignedStudents")
        .optional()
        .isArray().withMessage("Assigned students must be an array of UUIDs")
        .custom(value => {
            if (value && value.some(id => typeof id !== 'string' || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id))) {
                throw new Error("All assigned student IDs must be valid UUID strings.");
            }
            return true;
        }),
    // earningsHistory is typically updated via a separate process/service, not direct body input
    // body("earningsHistory").optional().isArray().withMessage("Earnings history must be an array"),
];
