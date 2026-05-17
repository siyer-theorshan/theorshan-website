type Env = {
  ZEPTOMAIL_TOKEN?: string;
  ZEPTOMAIL_API_URL?: string;
  ZEPTOMAIL_BOUNCE_ADDRESS?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  CONTACT_FROM_NAME?: string;
};

type PagesFunctionContext = {
  request: Request;
  env: Env;
};

const redirectTo = (request: Request, status: "sent" | "error") => {
  const url = new URL(request.url);
  url.pathname = "/contact";
  url.search = status === "sent" ? "?sent=1" : "?error=1";
  return Response.redirect(url.toString(), 303);
};

const clean = (value: FormDataEntryValue | null) =>
  String(value || "")
    .replace(/\r|\n/g, " ")
    .trim();

const phoneCountryDetails = (value: string) => {
  const [country = "", dialCode = ""] = value.split("|");
  return { country, dialCode };
};

const allowedInquiryTypes = new Set([
  "Book an Artist",
  "Request Artist Services",
  "Ticket Request",
  "General Inquiry",
]);

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  try {
    const form = await request.formData();
    const honeypot = clean(form.get("company"));

    if (honeypot) {
      return redirectTo(request, "sent");
    }

    const name = clean(form.get("name"));
    const email = clean(form.get("email"));
    const phoneCountry = clean(form.get("phone_country"));
    const phone = clean(form.get("phone"));
    const idea = clean(form.get("event_or_collaboration"));
    const message = clean(form.get("message"));
    const { country, dialCode } = phoneCountryDetails(phoneCountry);
    const phoneDigits = phone.replace(/\D/g, "");
    const isNorthAmericanPhone = country === "US" || country === "CA";

    if (
      !name ||
      !email ||
      !idea ||
      !allowedInquiryTypes.has(idea) ||
      !message ||
      !env.ZEPTOMAIL_TOKEN ||
      !env.ZEPTOMAIL_BOUNCE_ADDRESS ||
      !env.CONTACT_TO_EMAIL ||
      !env.CONTACT_FROM_EMAIL
    ) {
      return redirectTo(request, "error");
    }

    if (phone && isNorthAmericanPhone && phoneDigits.length !== 10) {
      return redirectTo(request, "error");
    }

    if (phone && (phone !== phoneDigits || !/^[1-9]/.test(phoneDigits))) {
      return redirectTo(request, "error");
    }

    const response = await fetch(env.ZEPTOMAIL_API_URL || "https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Zoho-enczapikey ${env.ZEPTOMAIL_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "Theorshan contact form",
      },
      body: JSON.stringify({
        bounce_address: env.ZEPTOMAIL_BOUNCE_ADDRESS,
        from: {
          address: env.CONTACT_FROM_EMAIL,
          name: env.CONTACT_FROM_NAME || "Theorshan",
        },
        to: [
          {
            email_address: {
              address: env.CONTACT_TO_EMAIL,
              name: "Theorshan",
            },
          },
        ],
        subject: `Theorshan contact form: ${idea || "New inquiry"}`,
        textbody: [
          `Name: ${name}`,
          `Email: ${email}`,
          `Phone: ${phone ? `${dialCode} ${phone}` : "Not provided"}`,
          `Event / collaboration: ${idea}`,
          "",
          message,
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      return redirectTo(request, "error");
    }

    return redirectTo(request, "sent");
  } catch {
    return redirectTo(request, "error");
  }
};
