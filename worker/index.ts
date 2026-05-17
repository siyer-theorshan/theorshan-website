type Env = {
  ASSETS: Fetcher;
  ZEPTOMAIL_TOKEN?: string;
  ZEPTOMAIL_API_URL?: string;
  ZEPTOMAIL_BOUNCE_ADDRESS?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  CONTACT_FROM_NAME?: string;
};

type ContactStatus = "sent" | "error";

const allowedInquiryTypes = new Set([
  "Book an Artist",
  "Request Artist Services",
  "Ticket Request",
  "General Inquiry",
]);

const clean = (value: FormDataEntryValue | null) =>
  String(value || "")
    .replace(/\r|\n/g, " ")
    .trim();

const phoneCountryDetails = (value: string) => {
  const [country = "", dialCode = ""] = value.split("|");
  return { country, dialCode };
};

const redirectToContact = (request: Request, status: ContactStatus) => {
  const url = new URL(request.url);
  url.pathname = "/contact";
  url.search = status === "sent" ? "?sent=1" : "?error=1";
  return Response.redirect(url.toString(), 303);
};

const handleContactPost = async (request: Request, env: Env) => {
  try {
    const form = await request.formData();
    const honeypot = clean(form.get("company"));

    if (honeypot) {
      return redirectToContact(request, "sent");
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
      return redirectToContact(request, "error");
    }

    if (phone && isNorthAmericanPhone && phoneDigits.length !== 10) {
      return redirectToContact(request, "error");
    }

    if (phone && (phone !== phoneDigits || !/^[1-9]/.test(phoneDigits))) {
      return redirectToContact(request, "error");
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
        subject: `Theorshan contact form: ${idea}`,
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
      return redirectToContact(request, "error");
    }

    return redirectToContact(request, "sent");
  } catch {
    return redirectToContact(request, "error");
  }
};

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method === "GET") {
        return new Response("Theorshan contact endpoint is active.", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      if (request.method === "POST") {
        return handleContactPost(request, env);
      }

      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, POST" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
