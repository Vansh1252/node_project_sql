// src/test/controllers.test/student.controllers.test.js

const studentController = require('../../controllers/student.controllers');
// FIX: Import the entire services module as a single object
const {assigntutorservices,createstudentservice,deleteAssessments,deletestudentservice,getAssessments,getonestudentservice,getonewithpaginationservice,statuschangeservice,studentmastesrservice,updatestudentservice} = require('../../services/student.services');
const { db } = require('../../utils/db');
const AppError = require('../../utils/AppError');

// Mock the entire student services module and the db utility
jest.mock('../../services/student.services');
jest.mock('../../utils/db', () => ({
    db: {
        Student: {
            findByPk: jest.fn(),
        },
    },
}));
// Mock the catchAsync utility to test the controller logic directly
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => fn(req, res, next));


describe('Student Controllers', () => {
    let req, res, next;

    beforeEach(() => {
        // Reset mocks and create fresh req, res, next objects for each test
        jest.clearAllMocks();
        req = {
            params: {},
            body: {},
            user: { id: 'user123' },
            query: {},
            file: { filename: 'testfile.pdf' } // Mock file for upload tests
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        next = jest.fn();
    });

    describe('createstudents', () => {
        it('should call the service and return 201 on success', async () => {
            const serviceResponse = { statusCode: 201, message: 'Student created successfully', studentId: 'student123' };
            // FIX: Access the mock function as a property of the imported module
            createstudentservice.mockResolvedValue(serviceResponse);

            await studentController.createstudents(req, res, next);

            expect(createstudentservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('updatestudents', () => {
        it('should call the service and return 200 on success', async () => {
            req.params.id = 'student123';
            const serviceResponse = { statusCode: 200, message: 'Student updated', student: { _id: 'student123' } };
            updatestudentservice.mockResolvedValue(serviceResponse);

            await studentController.updatestudents(req, res, next);

            expect(updatestudentservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('getone', () => {
        it('should call the service and return 200 on success', async () => {
            req.params.id = 'student123';
            const serviceResponse = { statusCode: 200, data: { _id: 'student123' } };
            getonestudentservice.mockResolvedValue(serviceResponse);

            await studentController.getone(req, res, next);

            expect(getonestudentservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('getonewithpagination', () => {
        it('should call the service and return 200 on success', async () => {
            const serviceResponse = { statusCode: 200, data: [{ id: 'student1' }] };
            getonewithpaginationservice.mockResolvedValue(serviceResponse);

            await studentController.getonewithpagination(req, res, next);

            expect(getonewithpaginationservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('deletestudnets', () => {
        it('should call the service and return 200 on success', async () => {
            req.params.id = 'student123';
            const serviceResponse = { statusCode: 200, message: 'Student deleted' };
            deletestudentservice.mockResolvedValue(serviceResponse);

            await studentController.deletestudnets(req, res, next);

            expect(deletestudentservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('uploadAssessment', () => {
        it('should upload an assessment and return 200 on success', async () => {
            req.params.id = 'student123';
            const mockStudent = {
                arr_assessments: [],
                update: jest.fn().mockResolvedValue(true)
            };
            db.Student.findByPk.mockResolvedValue(mockStudent);

            await studentController.uploadAssessment(req, res, next);

            expect(db.Student.findByPk).toHaveBeenCalledWith(req.params.id);
            expect(mockStudent.update).toHaveBeenCalledWith({ arr_assessments: [`/uploads/assessments/${req.file.filename}`] });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Assessment uploaded successfully",
                filePath: `/uploads/assessments/${req.file.filename}`,
            });
        });

        it('should return 404 if student is not found', async () => {
            req.params.id = 'student123';
            db.Student.findByPk.mockResolvedValue(null);

            await studentController.uploadAssessment(req, res, next);

            expect(db.Student.findByPk).toHaveBeenCalledWith(req.params.id);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: "Student not found" });
        });
    });

    describe('statuschange', () => {
        it('should call the service and return 200 on success', async () => {
            req.params.id = 'student123';
            const serviceResponse = { statusCode: 200, message: 'Status updated' };
            statuschangeservice.mockResolvedValue(serviceResponse);

            await studentController.statuschange(req, res, next);

            expect(statuschangeservice).toHaveBeenCalledWith(req.params.id, req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse);
        });
    });

    describe('getAssessments', () => {
        it('should call the service and return student assessments', async () => {
            req.params.id = 'student123';
            const serviceResponse = { statusCode: 200, data: ['file1.pdf'] };
            getAssessments.mockResolvedValue(serviceResponse);

            await studentController.getAssessments(req, res, next);

            expect(getAssessments).toHaveBeenCalledWith(req.params.id);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(serviceResponse.data);
        });
    });

    describe('deleteAssessment', () => {
        it('should call the service and return 200 on success', async () => {
            req.params.id = 'student123';
            req.body.filePath = 'path/to/file.pdf';
            const serviceResponse = { statusCode: 200, message: 'Assessment deleted successfully' };
            deleteAssessments.mockResolvedValue(serviceResponse);

            await studentController.deleteAssessment(req, res, next);

            expect(deleteAssessments).toHaveBeenCalledWith(req.params.id, req.body.filePath);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: serviceResponse.message });
        });
    });

    describe('assigntutor', () => {
        it('should call the service and return 200 on success', async () => {
            req.params.studentId = 'student123';
            const serviceResponse = { statusCode: 200, message: 'student has been assign tutor successfully' };
            assigntutorservices.mockResolvedValue(serviceResponse);

            await studentController.assigntutor(req, res, next);

            expect(assigntutorservices).toHaveBeenCalledWith(req.params.studentId, req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: serviceResponse.message });
        });
    });

    describe('studentmaster', () => {
        it('should call the service and return master data', async () => {
            const serviceResponse = { statusCode: 200, message: "student fetched successfully...!", data: [{ _id: 'student1' }] };
            studentmastesrservice.mockResolvedValue(serviceResponse);

            await studentController.studentmaster(req, res, next);

            expect(studentmastesrservice).toHaveBeenCalledWith(req);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: serviceResponse.message, data: serviceResponse.data });
        });
    });
});
