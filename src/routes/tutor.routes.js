const express = require('express');
const router = express.Router();

const tutorController = require('../controllers/tutor.controllers');
const { protect, restrictTo } = require('../middleware/auth');
const { validateTutor } = require('../validations/tutor.validations');
const { validate } = require('../middleware/validate');
const { roles } = require('../constants/sequelizetableconstants');


// Public
router.post('/create', protect, restrictTo(roles.ADMIN), validateTutor, validate, tutorController.createtutor);
router.put('/update/:id', protect, restrictTo(roles.ADMIN), validateTutor, validate, tutorController.updatetutor);
router.get('/', protect, restrictTo(roles.ADMIN), tutorController.getonewithpagination);
router.get('/details/:id', protect, restrictTo(roles.ADMIN, roles.TUTOR), tutorController.getone);
router.delete('/:id', protect, restrictTo(roles.ADMIN), tutorController.deletetutor);
router.get('/master', protect, restrictTo(roles.ADMIN), tutorController.tutormaster);
router.post('/remove-student/:id', protect, restrictTo(roles.ADMIN), tutorController.removestudent);

module.exports = router;
