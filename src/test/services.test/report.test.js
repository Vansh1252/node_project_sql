// src/test/services.test/report.services.test.js

const reportServices = require('../../services/report.services');
const { db } = require('../../utils/db');
const AppError = require('../../utils/AppError');
const { attendnace, slotstatus } = require('../../constants/sequelizetableconstants');

// Mock the entire db utility and the AppError class
jest.mock('../../utils/db', () => ({
    db: {
        Tutor: { findByPk: jest.fn() },
        Student: { findByPk: jest.fn() },
        Slot: { findAll: jest.fn() },
        EarningsHistory: { findAll: jest.fn() }, // Assuming this might be needed
    },
}));

jest.mock('../../utils/AppError', () => {
    return class MockAppError extends Error {
        constructor(message, statusCode) {
            super(message);
            this.statusCode = statusCode;
        }
    };
});

describe('Report Services', () => {

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
    });

    describe('getTutorPerformanceReport', () => {
        const mockTutorId = 'tutor-uuid-123';

        it('should generate a full performance report for a tutor with slots and earnings', async () => {
            // Arrange
            const mockTutor = {
                id: mockTutorId,
                str_firstName: 'John',
                str_lastName: 'Doe',
                earningsHistory: [
                    { amount: 100 },
                    { amount: 150 },
                ],
            };

            const mockSlots = [
                { // Attended session with student 1
                    obj_student: 'student-uuid-1',
                    str_attendance: attendnace.ATTENDED,
                    int_tutorPayout: 50,
                    student: { str_firstName: 'Alice', str_lastName: 'Wonder' },
                },
                { // Attended session with student 1
                    obj_student: 'student-uuid-1',
                    str_attendance: attendnace.ATTENDED,
                    int_tutorPayout: 50,
                    student: { str_firstName: 'Alice', str_lastName: 'Wonder' },
                },
                { // Missed session with student 2
                    obj_student: 'student-uuid-2',
                    str_attendance: attendnace.MISSED,
                    int_tutorPayout: 0,
                    student: { str_firstName: 'Bob', str_lastName: 'Builder' },
                },
            ];

            db.Tutor.findByPk.mockResolvedValue(mockTutor);
            db.Slot.findAll.mockResolvedValue(mockSlots);

            // Act
            const result = await reportServices.getTutorPerformanceReport(mockTutorId);

            // Assert
            expect(db.Tutor.findByPk).toHaveBeenCalledWith(mockTutorId, expect.any(Object));
            // FIX: Make the assertion more specific to match the actual query
            expect(db.Slot.findAll).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    obj_tutor: mockTutorId,
                    str_status: slotstatus.COMPLETED
                })
            }));

            expect(result.tutorName).toBe('John Doe');
            expect(result.totalSessions).toBe(3);
            expect(result.attendedSessions).toBe(2);
            expect(result.attendanceRate).toBe(66.67); // (2/3 * 100)
            expect(result.totalEarnings).toBe(250); // 100 + 150 from earnings history
            expect(result.studentPerformance).toHaveLength(2);

            const student1Performance = result.studentPerformance.find(p => p.studentId === 'student-uuid-1');
            expect(student1Performance.studentName).toBe('Alice Wonder');
            expect(student1Performance.sessions).toBe(2);
            expect(student1Performance.attended).toBe(2);
            expect(student1Performance.earnings).toBe(100);

            const student2Performance = result.studentPerformance.find(p => p.studentId === 'student-uuid-2');
            expect(student2Performance.studentName).toBe('Bob Builder');
            expect(student2Performance.sessions).toBe(1);
            expect(student2Performance.attended).toBe(0);
            expect(student2Performance.earnings).toBe(0);
        });

        it('should throw an AppError if the tutor is not found', async () => {
            // Arrange
            db.Tutor.findByPk.mockResolvedValue(null);

            // Act & Assert
            await expect(reportServices.getTutorPerformanceReport('non-existent-id'))
                .rejects.toThrow(new AppError('Tutor not found', 404));
        });
    });

    describe('getStudentPerformanceReport', () => {
        const mockStudentId = 'student-uuid-456';

        it('should generate a full performance report for a student', async () => {
            // Arrange
            const mockStudent = {
                id: mockStudentId,
                str_firstName: 'Carla',
                str_lastName: 'Clay',
            };

            const mockSlots = [
                { // Attended session with tutor 1
                    obj_tutor: 'tutor-uuid-1',
                    str_attendance: attendnace.ATTENDED,
                    tutor: { str_firstName: 'John', str_lastName: 'Doe' },
                },
                { // Attended session with tutor 1
                    obj_tutor: 'tutor-uuid-1',
                    str_attendance: attendnace.ATTENDED,
                    tutor: { str_firstName: 'John', str_lastName: 'Doe' },
                },
                { // Missed session with tutor 2
                    obj_tutor: 'tutor-uuid-2',
                    str_attendance: attendnace.MISSED,
                    tutor: { str_firstName: 'Jane', str_lastName: 'Smith' },
                },
            ];

            db.Student.findByPk.mockResolvedValue(mockStudent);
            db.Slot.findAll.mockResolvedValue(mockSlots);

            // Act
            const result = await reportServices.getStudentPerformanceReport(mockStudentId);

            // Assert
            expect(db.Student.findByPk).toHaveBeenCalledWith(mockStudentId, expect.any(Object));
            // FIX: Make the assertion more specific to match the actual query
            expect(db.Slot.findAll).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    obj_student: mockStudentId,
                    str_status: slotstatus.COMPLETED
                })
            }));

            expect(result.studentName).toBe('Carla Clay');
            expect(result.totalSessions).toBe(3);
            expect(result.attendedSessions).toBe(2);
            expect(result.attendanceRate).toBe(66.67);
            expect(result.tutorPerformance).toHaveLength(2);

            const tutor1Performance = result.tutorPerformance.find(p => p.tutorId === 'tutor-uuid-1');
            expect(tutor1Performance.tutorName).toBe('John Doe');
            expect(tutor1Performance.sessions).toBe(2);
            expect(tutor1Performance.attended).toBe(2);

            const tutor2Performance = result.tutorPerformance.find(p => p.tutorId === 'tutor-uuid-2');
            expect(tutor2Performance.tutorName).toBe('Jane Smith');
            expect(tutor2Performance.sessions).toBe(1);
            expect(tutor2Performance.attended).toBe(0);
        });

        it('should throw an AppError if the student is not found', async () => {
            // Arrange
            db.Student.findByPk.mockResolvedValue(null);

            // Act & Assert
            await expect(reportServices.getStudentPerformanceReport('non-existent-id'))
                .rejects.toThrow(new AppError('Student not found', 404));
        });
    });
});
