const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Verifies that uploaded files in seasonal-pdfs/ are real PDFs by checking magic bytes.
// Deletes invalid files and their Firestore documents.
exports.validatePDFUpload = functions.storage.object().onFinalize(async (object) => {
  if (!object.name || !object.name.startsWith('seasonal-pdfs/')) return;

  const bucket = admin.storage().bucket(object.bucket);
  const file   = bucket.file(object.name);

  let buffer;
  try {
    [buffer] = await file.download({ start: 0, end: 3 });
  } catch {
    return; // File may have already been deleted
  }

  // PDF: %PDF  PNG: \x89PNG  JPEG: \xFF\xD8\xFF
  const isPDF  = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isPNG  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

  if (!isPDF && !isPNG && !isJPEG) {
    console.warn(`Invalid file rejected (not PDF/PNG/JPEG): ${object.name}`);
    await file.delete().catch(() => {});

    // Find and delete associated Firestore document
    const fileName = object.name.split('/').pop();
    const docId    = fileName.split('_')[0];
    try {
      await admin.firestore().collection('seasonal_pdfs').doc(docId).delete();
    } catch { /* doc may not exist */ }

    await admin.firestore().collection('audit_logs').add({
      action: 'rejected_invalid_mime',
      fileName: object.name,
      userId: 'system',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }
});
