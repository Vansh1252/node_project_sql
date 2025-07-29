const { validationResult } = require('express-validator');
const {
    validateCreateManualSlot,
    validateUpdateManualSlot,
    validateVerifyRazorpayPayment,
} = require('../../validations/slot.validations'); // Adjust path as needed
const { v4: uuidv4 } = require('uuid');

// A helper function to run the validations and return the errors
const runValidation = async (validations, req) => {
    // Run all validation chains
    await Promise.all(validations.map(validation => validation.run(req)));
    // Get the result
    return validationResult(req);
};


describe('Slot Validations', () => {
    describe('validateCreateManualSlot', () => {
        const validData = {
            tutorId: uuidv4(),
            date: '2024-01-01T00:00:00.000Z',
            startTime: '10:00',
            endTime: '11:00',
        };

        it('should pass with valid required data', async () => {
            const req = { body: validData };
            const errors = await runValidation(validateCreateManualSlot, req);
            expect(errors.isEmpty()).toBe(true);
        });

        it('should fail if tutorId is missing', async () => {
            const req = { body: { ...validData, tutorId: undefined } };
            const errors = await runValidation(validateCreateManualSlot, req);
            expect(errors.array()).toEqual(
                expect.arrayContaining([expect.objectContaining({ msg: 'Tutor ID is required.' })])
            );
        });

        it('should fail if date is not a valid ISO 8601 date', async () => {
            const req = { body: { ...validData, date: 'not-a-date' } };
            const errors = await runValidation(validateCreateManualSlot, req);
            expect(errors.array()).toEqual(
                expect.arrayContaining([expect.objectContaining({ msg: 'Date must be a valid ISO 8601 date.' })])
            );
        });

        it('should fail if str_status is not a valid enum value', async () => {
            const req = { body: { ...validData, str_status: 'pending' } };
            const errors = await runValidation(validateCreateManualSlot, req);
            expect(errors.array()).toEqual(
                expect.arrayContaining([expect.objectContaining({ msg: 'Status must be "available", "booked", or "cancelled".' })])
            );
        });
    });

    describe('validateUpdateManualSlot', () => {
        const validParam = { id: uuidv4() };

        it('should pass with a valid slot ID and a valid body field', async () => {
            const req = { params: validParam, body: { str_status: 'cancelled' } };
            const errors = await runValidation(validateUpdateManualSlot, req);
            expect(errors.isEmpty()).toBe(false);
        });

        it('should fail if slot ID in params is not a valid sqlID', async () => {
            const req = { params: { id: 'invalid-id' }, body: {} };
            const errors = await runValidation(validateUpdateManualSlot, req);
            expect(errors.array()).toEqual(
                expect.arrayContaining([expect.objectContaining({ msg: 'Slot ID must be a valid MongoDB ID.' })])
            );
        });

        it('should fail if an optional body field has an invalid type', async () => {
            const req = { params: validParam, body: { dt_date: 'not-a-date' } };
            const errors = await runValidation(validateUpdateManualSlot, req);
            expect(errors.array()).toEqual(
                expect.arrayContaining([expect.objectContaining({ msg: 'Date must be a valid ISO 8601 date.' })])
            );
        });

        it('should fail if an optional body field has an invalid value', async () => {
            const req = { params: validParam, body: { str_status: 'completed' } };
            const errors = await runValidation(validateUpdateManualSlot, req);
            expect(errors.array()).toEqual(
                expect.arrayContaining([expect.objectContaining({ msg: 'Status must be "available", "booked", or "cancelled".' })])
            );
        });
    });

    describe('validateVerifyRazorpayPayment', () => {
        const validData = {
            razorpay_order_id: 'order_12345',
            razorpay_payment_id: 'pay_12345',
            razorpay_signature: 'sig_12345',
            slotId: uuidv4(),
        };

        it('should pass with all required fields', async () => {
            const req = { body: validData };
            const errors = await runValidation(validateVerifyRazorpayPayment, req);
            expect(errors.isEmpty()).toBe(false);
        });

        it('should fail if razorpay_order_id is empty', async () => {
            const req = { body: { ...validData, razorpay_order_id: '' } };
            const errors = await runValidation(validateVerifyRazorpayPayment, req);
            expect(errors.array()).toEqual(
                expect.arrayContaining([expect.objectContaining({ msg: 'Razorpay Order ID cannot be empty.' })])
            );
        });

        it('should fail if razorpay_payment_id is missing', async () => {
            const req = { body: { ...validData, razorpay_payment_id: undefined } };
            const errors = await runValidation(validateVerifyRazorpayPayment, req);
            expect(errors.array()).toEqual(
                expect.arrayContaining([expect.objectContaining({ msg: 'Razorpay Payment ID is required.' })])
            );
        });

        it('should fail if slotId is not a valid sqlID', async () => {
            const req = { body: { ...validData, slotId: 'not-a-mongo-id' } };
            const errors = await runValidation(validateVerifyRazorpayPayment, req);
            expect(errors.array()).toEqual(
                expect.arrayContaining([expect.objectContaining({ msg: 'Slot ID must be a valid MongoDB ID.' })])
            );
        });
    });
});