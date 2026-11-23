import nodemailer from "nodemailer";
export function mailer(origin) {
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM) return null;
  const transport = nodemailer.createTransport(process.env.SMTP_URL, {
    requireTLS: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return async (email, kind, token) => {
    const link = origin + "/#" + kind + "=" + token;
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject:
        kind === "verify"
          ? "Verify your Quarrix email"
          : "Reset your Quarrix password",
      text: `Open this link to ${kind === "verify" ? "verify your email" : "reset your password"}: ${link}\nThe link expires in 30 minutes. Ignore this message if you did not request it.`,
    });
  };
}
