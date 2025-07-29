const cron = require('node-cron');
const tutorModel = require('../models/tutor.models');
const { generateWeeklySlotsForTutor } = require('../services/slot.services');

const runWeeklySlotGenerator = async () => {
    try {
        console.log('📆 Weekly slot generation started...');
        const tutors = await tutorModel.find({});

        for (const tutor of tutors) {
            await generateWeeklySlotsForTutor(tutor);
        }

        console.log(`✅ Weekly slots generated for ${tutors.length} tutors.`);
    } catch (err) {
        console.error('❌ Slot generation error:', err.message);
    }
};

// Run every Monday at 12:05 AM
cron.schedule('5 0 * * 1', () => {
    runWeeklySlotGenerator();
});

module.exports = runWeeklySlotGenerator;
