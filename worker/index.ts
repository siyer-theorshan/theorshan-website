type Env = {
  ASSETS: Fetcher;
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
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
      !env.RESEND_API_KEY ||
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

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "Theorshan contact form",
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL,
        to: [env.CONTACT_TO_EMAIL],
        reply_to: email,
        subject: `Theorshan contact form: ${idea}`,
        text: [
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
