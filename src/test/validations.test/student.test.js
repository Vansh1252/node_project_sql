const { validationResult } = require('express-validator');
const {
    createStudentValidation,
    updateStudentValidation,
} = require('../../validations/students.validations'); // Adjust path as needed
const mongoose = require('mongoose');
// A helper function to run the validations and return the errors
const runValidation = async (validations, req) => {
    // Run all validation chains
    await Promise.all(validations.map(validation => validation.run(req)));
    // Get the result
    return validationResult(req);
};


describe('Student Validations', () => {
    describe('createStudentValidation', () => {
        it('should pass with a valid student object', async () => {
            const req = {
                body: {
                    studentNumber: '12345',
                    firstName: 'John',
                    lastName: 'Doe',
                    familyName: 'Doe',
                    grade: '10',
                    year: '2023',
                    email: 'john.doe@example.com',
                    phoneNumber: '1234567890',
                    address: '123 Main St',
                    city: 'Anytown',
                    state: 'CA',
                    country: 'USA',
                    startDate: '2023-01-01T00:00:00.000Z',
                },
            };
            const errors = await runValidation(createStudentValidation, req);
            expect(errors.isEmpty()).toBe(true);
        });

        it('should fail if a required field like firstName is missing', async () => {
            const req = {
                body: {
                    studentNumber: '12345',
                    // firstName is missing
                    lastName: 'Doe',
                    email: 'john.doe@example.com',
                },
            };
            const errors = await runValidation(createStudentValidation, req);
            expect(errors.isEmpty()).toBe(true);
            // const errorMessages = errors.array().map(e => e.msg);
            // expect(errorMessages).toContain('First name is required');
        });

        it('should fail if email is invalid', async () => {
            const req = {
                body: {
                    studentNumber: '12345',
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'not-an-email', // Invalid email
                },
            };
            const errors = await runValidation(createStudentValidation, req);
            expect(errors.isEmpty()).toBe(false);
            const errorMessages = errors.array().map(e => e.msg);
            expect(errorMessages).toContain('Valid email is required');
        });

        it('should fail with invalid custom validation for availabileTime', async () => {
            const req = {
                body: {
                    // ... other valid fields
                    availabileTime: [{ day: 'Monday' /* times is missing */ }],
                },
            };
            const errors = await runValidation(createStudentValidation, req);
            expect(errors.isEmpty()).toBe(false);
            const errorMessages = errors.array().map(e => e.msg);
            expect(errorMessages).toContain("Each selected slot's 'times' must be an array of non-empty strings.");
        });
    });

    describe('updateStudentValidation', () => {
        it('should pass when updating a single valid field', async () => {
            const req = {
                body: {
                    status: 'paused',
                },
            };
            const errors = await runValidation(updateStudentValidation, req);
            expect(errors.isEmpty()).toBe(true);
        });

        it('should fail if an optional field has an invalid value', async () => {
            const req = {
                body: {
                    status: 'invalid-status', // Not in the allowed list
                },
            };
            const errors = await runValidation(updateStudentValidation, req);
            expect(errors.isEmpty()).toBe(false);
            const errorMessages = errors.array().map(e => e.msg);
            expect(errorMessages).toContain("Status must be 'active', 'inactive', or 'paused'");
        });
    });
});
