declare const process: {
  env: Record<string, string | undefined>;
};

function requiredPublicEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const GOOGLE_CLIENT_ID = requiredPublicEnv(
  "BUN_PUBLIC_GOOGLE_CLIENT_ID",
);
export const GOOGLE_REDIRECT_URI = requiredPublicEnv(
  "BUN_PUBLIC_GOOGLE_REDIRECT_URI",
);
