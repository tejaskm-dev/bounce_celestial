import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";
const SENDER_EMAIL = Deno.env.get("EMAIL_FROM") || "tejaskm2508@gmail.com";
const SENDER_NAME = Deno.env.get("EMAIL_FROM_NAME") || "BOUNCE";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const payload = await req.json();
    const { user, email_data } = payload;
    const recipientEmail = user?.email;
    const token = email_data?.token || "";
    const actionType = email_data?.email_action_type || "verification";

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "Missing recipient email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0B0E14; color: #FFFFFF; border-radius: 12px; border: 1px solid rgba(200,168,104,0.3);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 24px; letter-spacing: 0.15em; color: #D4AF37; margin: 0;">BOUNCE</h1>
          <p style="font-size: 11px; letter-spacing: 0.2em; color: rgba(255,255,255,0.5); text-transform: uppercase; margin-top: 4px;">Celestial Runner Authentication</p>
        </div>
        <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="font-size: 13px; color: rgba(255,255,255,0.8); margin: 0 0 16px 0;">Your security verification code is:</p>
          <div style="font-size: 32px; font-weight: 700; letter-spacing: 0.25em; color: #FFFFFF; font-family: monospace; padding: 12px; background: rgba(0,0,0,0.4); border-radius: 6px; border: 1px solid rgba(200,168,104,0.4);">${token}</div>
        </div>
        <p style="font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; margin: 0;">This code expires shortly. If you did not request this, please ignore this email.</p>
      </div>
    `;

    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: recipientEmail }],
        subject: `Your BOUNCE verification code: ${token}`,
        htmlContent: htmlContent,
      }),
    });

    if (!brevoResponse.ok) {
      const errText = await brevoResponse.text();
      console.error("Brevo API error:", errText);
      return new Response(JSON.stringify({ error: errText }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Hook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
