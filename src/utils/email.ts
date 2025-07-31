import nodemailer, { Transporter } from 'nodemailer';
import hbs from 'nodemailer-express-handlebars';
import path from 'path';

// Define transporter type
let transporter: Transporter;

// Create transporter
transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Setup handlebars
transporter.use(
  'compile',
  hbs({
    viewEngine: {
      partialsDir: path.resolve('./src/views/'),
    },
    viewPath: path.resolve('./src/views/'),
    extName: '.handlebars',
  })
);

// Define function to send welcome email
export async function sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
  const mailOptions = {
    from: '"QuikWrk Admin" <your-email@gmail.com>',
    to: userEmail,
    subject: 'Welcome!',
    template: 'welcome', // matches views/welcome.handlebars
    context: {
      name: userName,
    },
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${userEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${userEmail}:`, error);
    throw error;
  }
}

export async function sendOtp(userEmail: string, otp: string | number, username: string): Promise<void> {
  const mailOptions = {
    from: '"QuikWrk Admin" <your-email@gmail.com>',
    to: userEmail,
    subject: 'Your One-Time Password (OTP)',
    template: 'otp',
    context: {
      name: username,
      otp: otp,
      appName: 'QuikWrk Admin'
    }
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${userEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${userEmail}:`, error);
    throw error;
  }
}
