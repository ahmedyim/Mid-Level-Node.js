import nodemailer from "nodemailer";

function createTransport() {
    const transport = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: 465, // Use 465 for SSL or 587 for TLS
        secure: true, // true for 465, false for other ports
        auth: {
            user: process.env.APP_EMAIL, 
            pass: process.env.APP_PASSWORD, 
        },
        tls: {
            rejectUnauthorized: false, 
        },
        debug: true,
        logger: true, 
    });

    return transport;
}

export const sendEmail = async (email:string,message:string) => {
    if (!email) {
        throw new Error("Email is required");
    }

    try {
        let messageData = {
            from: "info@munsooncare.com", // Sender email address
            to: email, // Recipient email address
            subject: "Forgot", // Email subject
            ...{ text: message }, // Email content
        };

        let transport = createTransport();
        const sendMail = await transport.sendMail(messageData);
        return "Email sent successfully";
    } catch (error:any) {
        console.error("Error sending email:", error); // Log the error for debugging
        return error.message;
    }
};
