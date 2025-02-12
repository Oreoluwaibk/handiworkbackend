import nodemailer, { createTransport } from "nodemailer";

const transporter = createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
    }
})

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
    const info  = await transporter.sendMail({
        from: '"handiwork" <handiwork@admin.com>',
        to: email,
        subject: "OTP fron Handiork",
        text: "Input your otp to continue your registration",
        html: `<p><span>${otp}</a></p>`
    });

    console.log("mail sent", info.messageId);
    
}

