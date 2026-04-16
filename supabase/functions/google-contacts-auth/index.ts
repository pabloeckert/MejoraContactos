import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function respond(ok: boolean, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok, ...payload }), {
    status: 200, // always 200 so client SDK doesn't swallow the body
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, code, redirectUri } = await req.json();

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return respond(false, { error: "Google OAuth credentials not configured" });
    }

    // Action: get auth URL
    if (action === "auth_url") {
      const scopes = [
        "https://www.googleapis.com/auth/contacts.readonly",
      ].join(" ");

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes,
        access_type: "offline",
        prompt: "consent",
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      return respond(true, { authUrl });
    }

    // Action: exchange code for token
    if (action === "exchange") {
      if (!code) {
        return respond(false, { error: "No code provided" });
      }

      console.log("Exchanging code, redirectUri:", redirectUri);

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("Token exchange failed:", JSON.stringify(tokenData));
        return respond(false, {
          error: tokenData.error_description || tokenData.error || "Token exchange failed",
          details: tokenData,
        });
      }

      return respond(true, {
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
        refresh_token: tokenData.refresh_token,
      });
    }

    // Action: fetch contacts
    if (action === "fetch_contacts") {
      const accessToken = code; // reusing 'code' field for access_token
      if (!accessToken) {
        return respond(false, { error: "No access token" });
      }

      const allContacts: any[] = [];
      let nextPageToken: string | undefined;
      let page = 0;
      const maxPages = 30;

      do {
        const params = new URLSearchParams({
          personFields: "names,emailAddresses,phoneNumbers,organizations",
          pageSize: "1000",
        });
        if (nextPageToken) params.set("pageToken", nextPageToken);

        const res = await fetch(
          `https://people.googleapis.com/v1/people/me/connections?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!res.ok) {
          const err = await res.text();
          return respond(false, { error: `Google API error: ${err}` });
        }

        const data = await res.json();
        const connections = data.connections || [];

        for (const person of connections) {
          const name = person.names?.[0] || {};
          const email = person.emailAddresses?.[0]?.value || "";
          const phone = person.phoneNumbers?.[0]?.value || "";
          const org = person.organizations?.[0] || {};

          allContacts.push({
            firstName: name.givenName || "",
            lastName: name.familyName || "",
            email,
            whatsapp: phone,
            company: org.name || "",
            jobTitle: org.title || "",
            source: "Google Contacts",
          });
        }

        nextPageToken = data.nextPageToken;
        page++;
      } while (nextPageToken && page < maxPages);

      return respond(true, {
        contacts: allContacts,
        total: allContacts.length,
      });
    }

    return respond(false, { error: "Invalid action" });
  } catch (e) {
    console.error("google-contacts-auth error:", e);
    return respond(false, {
      error: e instanceof Error ? e.message : "Unknown error",
    });
  }
});
