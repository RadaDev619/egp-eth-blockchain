import { env } from "../config/env.js";

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

export async function getNdiAccessToken(): Promise<string> {
  if (env.NDI_MODE === "mock") {
    return "mock-ndi-access-token";
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  if (!env.NDI_CLIENT_ID || !env.NDI_CLIENT_SECRET) {
    throw new Error("NDI credentials are required outside mock mode.");
  }

  const body = new URLSearchParams({
    client_id: env.NDI_CLIENT_ID,
    client_secret: env.NDI_CLIENT_SECRET,
    grant_type: "client_credentials"
  });

  const response = await fetch(`${env.NDI_AUTH_BASE_URL}/authentication/v1/authenticate`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error("Failed to authenticate with Bhutan NDI verifier service.");
  }

  const payload = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000
  };

  return cachedToken.accessToken;
}
