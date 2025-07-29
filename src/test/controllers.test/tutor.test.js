// src/test/controllers.test/tutor.controllers.test.js

const tutorController = require('../../controllers/tutor.controllers');
const tutorServices = require('../../services/tutor.services');
const AppError = require('../../utils/AppError');

// FIX: Use a manual mock to ensure all service functions are defined as jest.fn()
jest.mock('../../services/tutor.services', () => ({
    createtutorservice: jest.fn(),
    updatetutorservice: jest.fn(),
    getonetutorservice: jest.fn(),
    getonewithpaginationtutorservice: jest.fn(),
    deletetutorservice: jest.fn(),
    updateRateHistory: jest.fn(),
    assignstudentservices: jest.fn(),
    tutormastersservice: jest.fn(),
    removeStudentService: jest.fn(),
}));

// Mock the catchAsync utility to test the controller logic directly
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => fn(req, res, next));


describe('Tutor Controllers', () => {
    let req, res, next;

    beforeEach(() => {
        // Reset mocks and create fresh req, res, next objects for each test
        jest.clearAllMocks();
        req = { params: {}, body: {}, user: { id: 'user123' }, query: {} };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        next = jest.fn();
    });

    describe('createtutor', () => {
        it('should create a tutor and return 201', async () => {
            const serviceResponse = { statusCode: 201, message: 'Tutor created successfully.' };
            tutorServices.createtutorservice.mockResolvedValue(serviceResponse);

            await tutorController.createtutor(req, res, next);

            expect(tutorServices.createtutorservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('updatetutor', () => {
        it('should update a tutor and return 200', async () => {
            req.params.id = 'tutor123';
            const serviceResponse = { statusCode: 200, message: 'Tutor updated successfully', data: { _id: 'tutor123' } };
            tutorServices.updatetutorservice.mockResolvedValue(serviceResponse);

            await tutorController.updatetutor(req, res, next);

            expect(tutorServices.updatetutorservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('getone', () => {
        it('should get a single tutor and return 200', async () => {
            req.params.id = 'tutor123';
            const serviceResponse = { statusCode: 200, data: { _id: 'tutor123' } };
            tutorServices.getonetutorservice.mockResolvedValue(serviceResponse);

            await tutorController.getone(req, res, next);

            expect(tutorServices.getonetutorservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    // --- ADDED MISSING TEST SUITE ---
    describe('getonewithpagination', () => {
        it('should get paginated tutors and return 200', async () => {
            const serviceResponse = { statusCode: 200, data: [{ _id: 'tutor123' }] };
            tutorServices.getonewithpaginationtutorservice.mockResolvedValue(serviceResponse);

            await tutorController.getonewithpagination(req, res, next);

            expect(tutorServices.getonewithpaginationtutorservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('deletetutor', () => {
        it('should delete a tutor and return 200', async () => {
            req.params.id = 'tutor123';
            const serviceResponse = { statusCode: 200, message: 'Tutor deleted successfully' };
            tutorServices.deletetutorservice.mockResolvedValue(serviceResponse);

            await tutorController.deletetutor(req, res, next);

            expect(tutorServices.deletetutorservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('updateTutorRate', () => {
        it('should update a tutor\'s rate and return 200', async () => {
            req.params.tutorId = 'tutor123';
            const serviceResponse = { statusCode: 200, message: 'Rate updated' };
            // FIX: Corrected service function name
            tutorServices.updateRateHistory.mockResolvedValue(serviceResponse);

            await tutorController.updateTutorRate(req, res, next);

            expect(tutorServices.updateRateHistory).toHaveBeenCalledWith(req.params.tutorId, req);
            expect(res.status).toHaveBeenCalledWith(200);
            // FIX: Assert the specific response structure from the controller
            expect(res.json).toHaveBeenCalledWith({ result: serviceResponse });
        });
    });

    describe('assignstudent', () => {
        it('should assign a student to a tutor and return 200', async () => {
            req.params.tutorId = 'tutor123';
            const serviceResponse = { statusCode: 200, message: 'Student assigned' };
            tutorServices.assignstudentservices.mockResolvedValue(serviceResponse);

            await tutorController.assignstudent(req, res, next);

            expect(tutorServices.assignstudentservices).toHaveBeenCalledWith(req.params.tutorId, req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: serviceResponse.message });
        });
    });

    describe('tutormaster', () => {
        it('should return a list of tutors', async () => {
            const serviceResponse = { statusCode: 200, message: 'tutor fetched successfully...!', data: [{ _id: 'tutor1' }] };
            // FIX: Corrected service function name
            tutorServices.tutormastersservice.mockResolvedValue(serviceResponse);

            await tutorController.tutormaster(req, res, next);

            expect(tutorServices.tutormastersservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: serviceResponse.message, data: serviceResponse.data });
        });
    });

    describe('removestudent', () => {
        it('should remove a student from a tutor and return 200', async () => {
            req.params.id = 'tutor123';
            const serviceResponse = { statusCode: 200, message: 'Student removed' };
            tutorServices.removeStudentService.mockResolvedValue(serviceResponse);

            await tutorController.removestudent(req, res, next);

            expect(tutorServices.removeStudentService).toHaveBeenCalledWith(req, req.params.id);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: serviceResponse.message });
        });
    });
});
