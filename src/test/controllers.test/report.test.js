const reportController = require('../../controllers/report.controllers');
const reportServices = require('../../services/report.services');
const AppError = require('../../utils/AppError');

// Mock the entire report services module
jest.mock('../../services/report.services');

describe('Report Controllers', () => {
    let req, res, next;

    beforeEach(() => {
        // Reset mocks and create fresh req, res, next objects for each test
        jest.clearAllMocks();
        req = { params: {}, query: {} };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        next = jest.fn();
    });

    describe('getTutorReport', () => {
        it('should return a tutor performance report successfully', async () => {
            req.params.tutorId = 'tutor123';
            const mockReport = { tutorName: 'John Doe', totalSessions: 10 };
            // Mock the service function to resolve with the mock report
            reportServices.getTutorPerformanceReport.mockResolvedValue(mockReport);

            // Call the correct controller function
            await reportController.getTutorReport(req, res, next);

            // Assertions
            expect(reportServices.getTutorPerformanceReport).toHaveBeenCalledWith(req.params.tutorId);
            expect(res.status).toHaveBeenCalledWith(200);
            // Assert the correct response structure
            expect(res.json).toHaveBeenCalledWith({
                status: 'success',
                data: mockReport,
            });
            expect(next).not.toHaveBeenCalled();
        });

    });

    describe('getStudentReport', () => {
        it('should return a student performance report successfully', async () => {
            req.params.studentId = 'student123';
            const mockReport = { studentName: 'Jane Doe', totalSessions: 5 };
            // Mock the service function
            reportServices.getStudentPerformanceReport.mockResolvedValue(mockReport);

            // Call the correct controller function
            await reportController.getStudentReport(req, res, next);

            // Assertions
            expect(reportServices.getStudentPerformanceReport).toHaveBeenCalledWith(req.params.studentId);
            expect(res.status).toHaveBeenCalledWith(200);
            // Assert the correct response structure
            expect(res.json).toHaveBeenCalledWith({
                status: 'success',
                data: mockReport,
            });
        });
    });
});
