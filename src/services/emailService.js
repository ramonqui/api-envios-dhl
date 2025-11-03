// /Users/macbookpro/proyectos/dhl-guias-api/src/services/emailService.js
const Brevo = require('@getbrevo/brevo');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'API DHL';

const api = new Brevo.TransactionalEmailsApi();

if (BREVO_API_KEY) {
  api.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, BREVO_API_KEY);
} else {
  console.warn('[BREVO] Falta BREVO_API_KEY en variables de entorno.');
}

/**
 * Envía un email genérico usando Brevo con logs detallados
 */
async function sendEmail(toEmail, subject, htmlContent) {
  if (!BREVO_API_KEY) {
    console.warn('[BREVO] No hay API KEY; no se envía correo.');
    return { sent: false, reason: 'NO_API_KEY' };
  }
  if (!BREVO_SENDER_EMAIL) {
    console.warn('[BREVO] Falta BREVO_SENDER_EMAIL (remitente verificado).');
    return { sent: false, reason: 'NO_SENDER' };
  }

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.sender = { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL };
  sendSmtpEmail.to = [{ email: toEmail }];
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  try {
    const resp = await api.sendTransacEmail(sendSmtpEmail);
    // resp contiene messageId, etc.
    console.log('[BREVO] Enviado OK:', JSON.stringify(resp, null, 2));
    return { sent: true, response: resp };
  } catch (err) {
    // Log muy explícito para diagnosticar
    const body = err?.response?.body || err?.message || String(err);
    console.error('[BREVO] Error al enviar:', body);
    return { sent: false, error: body };
  }
}

/**
 * Email específico para recuperación de contraseña
 */
async function sendPasswordResetEmail(toEmail, resetLink) {
  const subject = 'Recupera tu contraseña - DHL Guías API';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5; max-width:600px; margin:auto;">
      <h2 style="margin-bottom:8px;">Recuperación de contraseña</h2>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
      <p style="margin:24px 0;">
        <a href="${resetLink}" target="_blank"
           style="display:inline-block;background:#0b5fff;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;">
          Restablecer contraseña
        </a>
      </p>
      <p>Si no fuiste tú, puedes ignorar este mensaje.</p>
      <p style="color:#666;">El enlace expira en 1 hora.</p>
    </div>
  `;
  return sendEmail(toEmail, subject, html);
}

/**
 * Email de prueba
 */
async function sendTestEmail(toEmail) {
  const subject = 'Prueba de correo - DHL Guías API';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5;">
      <h3>¡Hola!</h3>
      <p>Este es un correo de prueba enviado desde tu API con Brevo.</p>
      <p>Hora del servidor: ${new Date().toISOString()}</p>
    </div>
  `;
  return sendEmail(toEmail, subject, html);
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendTestEmail
};
