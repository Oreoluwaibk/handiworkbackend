import nodemailer, { Transporter } from 'nodemailer';
import hbs from 'nodemailer-express-handlebars';
import path from 'path';
import fs from 'fs-extra';
import Handlebars from 'handlebars';
import sgMail from '@sendgrid/mail';


// Define transporter type
let transporter: Transporter;
sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);

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
  const template = await fs.readFile('src/views/welcome.handlebars', 'utf-8');
  const compiled = Handlebars.compile(template);
  const html = compiled({ name: userName,  });

  const msg = {
    to: userEmail,
    from: process.env.FROM_EMAIL as string,
    subject: 'Welcome to QuikWrk!',
    html,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Email sent to ${userEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${userEmail}:`, error);
    throw error;
  }
}

export async function sendOtp(userEmail: string, otp: string | number, userName: string): Promise<void> {
  // const mailOptions = {
  //   from: '"QuikWrk Admin" <your-email@gmail.com>',
  //   to: userEmail,
  //   subject: 'Your One-Time Password (OTP)',
  //   template: 'otp',
  //   context: {
  //     name: username,
  //     otp: otp,
  //     appName: 'QuikWrk Admin'
  //   }
  // };

  // try {
    
  //   await transporter.sendMail(mailOptions);
  //   console.log(`✅ Email sent to ${userEmail}`);
  // } catch (error) {
  //   console.error(`❌ Failed to send email to ${userEmail}:`, error);
  //   throw error;
  // }
  
   const template = await fs.readFile('src/views/otp.handlebars', 'utf-8');
    const compiled = Handlebars.compile(template);
    const html = compiled({ name: userName, otp: otp, appName: 'QuikWrk Admin' });

    const msg = {
      to: userEmail,
      from: process.env.FROM_EMAIL as string,
      subject: 'Your One-Time Password (OTP)',
      html,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ Email sent to ${userEmail}`);
    } catch (error) {
      console.error(`❌ Failed to send email to ${userEmail}:`, error);
      throw error;
    }
}



