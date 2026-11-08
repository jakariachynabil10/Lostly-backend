"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailSafely = sendEmailSafely;
async function sendEmailSafely(options) {
    const resendApiKey = process.env.RESEND_API_KEY;
    const smtpHost = process.env.SMTP_HOST;
    // If no email service configured, silently skip as requested in specification
    if (!resendApiKey && !smtpHost) {
        if (process.env.NODE_ENV === "development") {
            console.log(`[Email Preview to: ${options.to}] Subject: ${options.subject}\nBody: ${options.text}`);
        }
        return;
    }
    try {
        if (resendApiKey) {
            const response = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${resendApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: process.env.EMAIL_FROM || "Lostly <notifications@lostly.com>",
                    to: [options.to],
                    subject: options.subject,
                    text: options.text,
                    html: options.html || `<p>${options.text.replace(/\n/g, "<br/>")}</p>`,
                }),
            });
            if (!response.ok) {
                console.warn("[EmailService] Resend request returned non-OK status:", response.status);
            }
        }
    }
    catch (err) {
        // Specification: "If env vars are missing, skip silently and never fail the request."
        console.warn("[EmailService] Error sending email (silently handled):", err.message);
    }
}
