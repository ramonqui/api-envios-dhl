const { sendTestEmail } = require('../services/emailService');

/**
 * POST /api/admin/test-email
 * body: { to }
 */
async function sendAdminTestEmail(req, res) {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ status: 'error', message: 'Debes enviar "to"' });
    }
    const result = await sendTestEmail(to);
    return res.json({ status: result.sent ? 'ok' : 'error', result });
  } catch (error) {
    console.error('Error en sendAdminTestEmail:', error);
    return res.status(500).json({ status: 'error', message: 'Fallo al enviar correo de prueba', error: error.message });
  }
}

module.exports.sendAdminTestEmail = sendAdminTestEmail;
