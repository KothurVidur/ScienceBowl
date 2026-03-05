const mongoose = require('mongoose');

const reportedSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
    unique: true,
    index: true
  }
}, {
  collection: 'reported'
});

module.exports = mongoose.model('Reported', reportedSchema);
