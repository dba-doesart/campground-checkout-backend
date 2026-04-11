import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default async function sendEmail({ to, subject, text, html }) {
  const msg = {
    to,
    from: "info@campgroundguides.com", // your verified sender
    subject,
    text,
    html,
  };

  try {
    await sgMail.send(msg);
    console.log("Email sent to:", to);
  } catch (error) {
    console.error("SendGrid error:", error);
    if (error.response) {
      console.error(error.response.body);
    }
    throw error;
  }
}