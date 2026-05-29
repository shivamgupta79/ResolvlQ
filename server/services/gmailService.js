import nodemailer from 'nodemailer';

export async function sendMaintenanceMail({ to, subject, text }) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('Email mock mode. Configure Google OAuth env values to send real mail.');
    return { mocked: true, messageId: `mock-${Date.now()}` };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.MAINTENANCE_EMAIL,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN
    }
  });

  return transporter.sendMail({
    from: process.env.MAINTENANCE_EMAIL,
    to,
    subject,
    text
  });
}
