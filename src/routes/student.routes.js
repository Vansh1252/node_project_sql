const express = require('express');
const router = express.Router();

const studentController = require('../controllers/student.controllers');
const { protect, restrictTo } = require('../middleware/auth');
const { createStudentValidation, updateStudentValidation } = require('../validations/students.validations');
const { validate } = require('../middleware/validate');
const upload = require('../middleware/multer');
const { roles } = require('../constants/sequelizetableconstants');



// Public

router.post('/create', protect, restrictTo(roles.ADMIN), createStudentValidation, validate, studentController.createstudents);
router.put('/update/:id', protect, restrictTo(roles.ADMIN), updateStudentValidation, validate, studentController.updatestudents);
router.get('/', protect, restrictTo(roles.ADMIN), studentController.getonewithpagination);
router.get('/details/:id', protect, restrictTo(roles.ADMIN, roles.ADMIN), studentController.getone);
router.post('/upload-assessment/:id', protect, upload.single('file'), studentController.uploadAssessment);
router.delete('/:id', protect, restrictTo(roles.ADMIN), studentController.deletestudnets);
router.post('/:id/status', protect, restrictTo(roles.ADMIN), studentController.statuschange);
router.post('/assign-tutor/:studentId', protect, restrictTo(roles.ADMIN), studentController.assigntutor);
router.get('/details/:id/assessments', protect, restrictTo(roles.ADMIN), studentController.getAssessments);
router.delete('/details/:id/assessments', protect, restrictTo(roles.ADMIN), studentController.deleteAssessment);
router.post('/master', studentController.studentmaster);



module.exports = router;
