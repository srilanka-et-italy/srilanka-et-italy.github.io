const admin = require('firebase-admin');
admin.initializeApp();

const { validatePDFUpload } = require('./validatePDF');
const { scheduledCleanup }  = require('./scheduledCleanup');
const { menuCard }          = require('./menuCard');

exports.validatePDFUpload = validatePDFUpload;
exports.scheduledCleanup  = scheduledCleanup;
exports.menuCard          = menuCard;
