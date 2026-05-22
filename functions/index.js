const admin = require('firebase-admin');
admin.initializeApp();

const { validatePDFUpload } = require('./validatePDF');
const { scheduledCleanup }  = require('./scheduledCleanup');

exports.validatePDFUpload = validatePDFUpload;
exports.scheduledCleanup  = scheduledCleanup;
