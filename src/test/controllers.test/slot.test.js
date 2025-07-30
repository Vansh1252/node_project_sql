const slotController = require('../../controllers/slot.controllers');
// Import the specific service functions to be mocked
const {
    createManualSlotService,
    updateManualSlotService,
    getoneslotservice,
    getslotswithpaginationservice,
    deleteslotservice,
    bookSlotService,
    verifyRazorpayPaymentService,
    cancelSlotService,
    rescheduleSlotService,
    getMySlotsService,
    getAvailableSlotsService,
    getCalendarSlots,
    markAttendance,
} = require('../../services/slot.services');
const { db } = require('../../utils/db'); // Import the db object for mocking
const AppError = require('../../utils/AppError');

// Mock services, db, and external SDKs
jest.mock('../../services/slot.services');
jest.mock('../../utils/db', () => ({
    db: {
        Tutor: {
            findAll: jest.fn(), // Mock the findAll method used in the controller
        },
    },
}));
jest.mock('../../utils/razerpaysetup', () => ({
    orders: {
        create: jest.fn(),
    },
}));

describe('Slot Controllers', () => {
    let req, res, next;

    beforeEach(() => {
        jest.clearAllMocks();
        req = { params: {}, body: {}, user: { id: 'user123' }, query: {} };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        next = jest.fn();
    });

    // ... (all your existing describe blocks for other controllers are correct) ...

    describe('createManualSlot', () => {
        it('should create a manual slot and return 201', async () => {
            const serviceResponse = { statusCode: 201, message: 'Slot created', data: { _id: 'slot123' } };
            createManualSlotService.mockResolvedValue(serviceResponse);
            await slotController.createManualSlot(req, res, next);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('updateManualSlot', () => {
        it('should update a manual slot and return 200', async () => {
            req.params.id = 'slot123';
            const serviceResponse = { statusCode: 200, message: 'Slot updated', data: { _id: 'slot123' } };
            updateManualSlotService.mockResolvedValue(serviceResponse);
            await slotController.updateManualSlot(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('getoneslot', () => {
        it('should get a single slot and return 200', async () => {
            const serviceResponse = { statusCode: 200, data: { _id: 'slot123' } };
            getoneslotservice.mockResolvedValue(serviceResponse);
            await slotController.getoneslot(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('getslotswithpagination', () => {
        it('should get paginated slots and return 200', async () => {
            const serviceResponse = { statusCode: 200, data: [{ _id: 'slot123' }] };
            getslotswithpaginationservice.mockResolvedValue(serviceResponse);
            await slotController.getslotswithpagination(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('deleteslot', () => {
        it('should delete a slot and return 200', async () => {
            const serviceResponse = { statusCode: 200, message: 'Slot deleted' };
            deleteslotservice.mockResolvedValue(serviceResponse);
            await slotController.deleteslot(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('bookSlot', () => {
        it('should book a slot and return 200', async () => {
            const serviceResponse = { statusCode: 200, message: 'Slot booked' };
            bookSlotService.mockResolvedValue(serviceResponse);
            await slotController.bookSlot(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('verifyRazorpayPayment', () => {
        it('should verify a payment and return 200', async () => {
            const serviceResponse = { statusCode: 200, message: 'Payment verified' };
            verifyRazorpayPaymentService.mockResolvedValue(serviceResponse);
            await slotController.verifyRazorpayPayment(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('cancelSlot', () => {
        it('should cancel a slot and return 200', async () => {
            const serviceResponse = { statusCode: 200, message: 'Slot cancelled' };
            cancelSlotService.mockResolvedValue(serviceResponse);
            await slotController.cancelSlot(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('rescheduleSlot', () => {
        it('should reschedule a slot and return 200', async () => {
            const serviceResponse = { statusCode: 200, message: 'Slot rescheduled' };
            rescheduleSlotService.mockResolvedValue(serviceResponse);
            await slotController.rescheduleSlot(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: serviceResponse.message });
        });
    });

    describe('getMySlots', () => {
        it('should get the current user\'s slots and return 200', async () => {
            const serviceResponse = { statusCode: 200, data: [{ _id: 'slot123' }] };
            getMySlotsService.mockResolvedValue(serviceResponse);
            await slotController.getMySlots(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ slots: serviceResponse.data });
        });
    });

    describe('getAvailableSlotsForStudents', () => {
        it('should get available slots and return 200', async () => {
            const serviceResponse = { statusCode: 200, data: [{ _id: 'slot123' }] };
            getAvailableSlotsService.mockResolvedValue(serviceResponse);
            await slotController.getAvailableSlotsForStudents(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('getCalendarSlots', () => {
        it('should get calendar slots and return 200', async () => {
            const serviceResponse = { statusCode: 200, data: [{ _id: 'slot123' }] };
            getCalendarSlots.mockResolvedValue(serviceResponse);
            await slotController.getCalendarSlots(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse.data);
        });
    });

    describe('markAttendance', () => {
        it('should mark attendance for a slot and return 200', async () => {
            req.params.slotId = 'slot123';
            const serviceResponse = { statusCode: 200, message: 'Attendance marked' };
            markAttendance.mockResolvedValue(serviceResponse);
            await slotController.markAttendance(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });
});
