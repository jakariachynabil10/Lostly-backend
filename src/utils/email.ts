export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function emailDeliveryError(message: string): Error & {
  statusCode: number;
  code: string;
} {
  return Object.assign(new Error(message), {
    statusCode: 503,
    code: "EMAIL_DELIVERY_UNAVAILABLE",
  });
}

export async function sendEmailSafely(options: SendEmailOptions): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Email Preview to: ${options.to}] Subject: ${options.subject}\nBody:\n${options.text}`,
      );
      return;
    }

    throw emailDeliveryError("Email delivery is not configured.");
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
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
  } catch {
    throw emailDeliveryError("Email delivery is unavailable. Please try again later.");
  }

  if (!response.ok) {
    throw emailDeliveryError("Email delivery is unavailable. Please try again later.");
  }
}
