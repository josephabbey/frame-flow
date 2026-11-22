declare const process: {
  env: Record<string, string | undefined>;
};

const clientId = process.env.BUN_PUBLIC_GOOGLE_CLIENT_ID;
const redirectUri = process.env.BUN_PUBLIC_GOOGLE_REDIRECT_URI;

if (!clientId) {
  throw new Error(
    "Missing required environment variable: BUN_PUBLIC_GOOGLE_CLIENT_ID",
  );
}

if (!redirectUri) {
  throw new Error(
    "Missing required environment variable: BUN_PUBLIC_GOOGLE_REDIRECT_URI",
  );
}

export const GOOGLE_CLIENT_ID = clientId;
export const GOOGLE_REDIRECT_URI = redirectUri;
