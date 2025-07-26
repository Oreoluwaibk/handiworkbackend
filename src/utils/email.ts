
import nodemailer, { createTransport } from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: "ore.ibikunle98@gmail.com",
    pass: "jn7jnAPss4f63QBp6D",
  },
});
// const transporter = createTransport({
//     host: "smtp.ethereal.email",
//     port: 587,
//     secure: false,
//     auth: {
//         user: process.env.SMTP_EMAIL,
//         pass: process.env.SMTP_PASSWORD,
//     }
// })

export const sendMail = async ({ email, token }: { email: string, token: string}) => {
    const info  = await transporter.sendMail({
        from: '"oluwatosin0" <oluwatosin0@admin.com>',
        to: email,
        subject: "Reset Password",
        text: "Click the link to reset password",
        html: `<p><a href='http://localhost:3000/reset-password/${token}'>click</a>here to reset your password</p>`
    });

    console.log("mail sent", info.messageId);
    
}

export const sendOTP = async ({ email, otp }: { email: string, otp: number}) => {
    const info = await transporter.sendMail({
        from: '"handiwork" <handiwork@admin.com>',
        to: "email",
        subject: "OTP from Handiwork",
        text: "Input your OTP to continue your registration",
        html: `<p><strong>${otp}</strong></p>`,
    });

    console.log("✅ Mail sent:", info.messageId); 
}

