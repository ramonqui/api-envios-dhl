// /Users/macbookpro/proyectos/dhl-guias-api/src/services/emailService.js

const Brevo = require('@getbrevo/brevo');

const apiKey = process.env.BREVO_API_KEY;
const senderEmail = process.env.BREVO_SENDER_EMAIL;
const senderName = process.env.BREVO_SENDER_NAME || 'API DHL';

const apiInstance = new Brevo.TransactionalEmailsApi();

if (apiKey) {
  apiInstance.setApiKey(
    Brevo.TransactionalEmailsApiApiKeys.apiKey,
    apiKey
  );
}

/**
 * Envía un correo usando Brevo
 * @param {string} toEmail
 * @param {string} subject
 * @param {string} htmlContent
 */
async function sendEmail(toEmail, subject, htmlContent) {
  if (!apiKey) {
    console.warn('BREVO_API_KEY no está configurada. No se envió el correo.');
    return;
  }

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.sender = { name: senderName, email: senderEmail };
  sendSmtpEmail.to = [{ email: toEmail }];

  await apiInstance.sendTransacEmail(sendSmtpEmail);
}

/**
 * Email específico para recuperación de contraseña
 * @param {string} toEmail
 * @param {string} resetLink
 */
async function sendPasswordResetEmail(toEmail, resetLink) {
  const subject = 'Recupera tu contraseña - DHL Guías API';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5;">
      <h2>Recuperación de contraseña</h2>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
      <p>
        <a href="${resetLink}" style="background:#007bff;color:#fff;padding:10px 15px;text-decoration:none;border-radius:4px;">
          Restablecer contraseña
        </a>
      </p>
      <p>Si no fuiste tú, puedes ignorar este mensaje.</p>
      <p>Este enlace expira en 1 hora.</p>
    </div>
  `;
  await sendEmail(toEmail, subject, html);
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail
};
