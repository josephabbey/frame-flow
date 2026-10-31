import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import type { ServerWebSocket } from "bun";
import homepage from "../index.html";

type SocketData = { frameHash: string; role: "device" | "phone" };
type OAuthState = { frameHash: string; expiresAt: number };

const oauthStates = new Map<string, OAuthState>();
const devices = new Map<string, ServerWebSocket<SocketData>>();

const server = Bun.serve<SocketData>({
  port: Number(process.env.PORT || 3000),
  routes: { "/": homepage },
  async fetch(request, server) {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/socket")) {
      const key = url.searchParams.get("key") || "";
      const role = url.searchParams.get("role");
      if (
        key.length < 24 ||
        key.length > 256 ||
        (role !== "device" && role !== "phone")
      ) {
        return new Response("Invalid websocket credentials", { status: 401 });
      }
      const data: SocketData = { frameHash: hash(key), role };
      if (server.upgrade(request, { data })) return undefined;
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    if (
      url.pathname.endsWith("/oauth/google/start") &&
      request.method === "POST"
    ) {
      let body: { frameKey?: unknown };
      try {
        body = (await request.json()) as { frameKey?: unknown };
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const frameKey = typeof body.frameKey === "string" ? body.frameKey : "";
      if (!frameKey || frameKey.length > 256)
        return json({ error: "invalid_frame_key" }, 400);
      const state = randomBytes(24).toString("base64url");
      oauthStates.set(state, {
        frameHash: hash(frameKey),
        expiresAt: Date.now() + 10 * 60_000,
      });
      const oauth = createOAuthClient(request);
      const authUrl = oauth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/photoslibrary.readonly",
        ],
        state,
      });
      return json({ url: authUrl });
    }

    if (url.pathname.endsWith("/oauth/google/callback")) {
      const state = url.searchParams.get("state") || "";
      const grant = oauthStates.get(state);
      oauthStates.delete(state);
      if (!grant || grant.expiresAt < Date.now())
        return json({ error: "expired_or_invalid_state" }, 400);
      const code = url.searchParams.get("code");
      if (!code) return json({ error: "missing_code" }, 400);
      try {
        const oauth = createOAuthClient(request);
        const { tokens } = await oauth.getToken(code);
        if (!tokens.access_token || !tokens.refresh_token) {
          return json({ error: "google_did_not_return_required_tokens" }, 502);
        }
        const credentials = JSON.stringify({
          type: "google.credentials",
          credentials: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_type: tokens.token_type || "Bearer",
            expiry_date: tokens.expiry_date || null,
            scopes: tokens.scope?.split(" ") || [],
          },
        });
        const recipients = server.publish(grant.frameHash, credentials);
        if (!recipients) return json({ error: "frame_disconnected" }, 409);
        return new Response(successPage, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      } catch {
        return json({ error: "google_oauth_failed" }, 502);
      }
    }

    return json({ error: "not_found" }, 404);
  },
  websocket: {
    open(socket) {
      if (socket.data.role === "device") {
        const previous = devices.get(socket.data.frameHash);
        previous?.close(4001, "replaced by a newer connection");
        devices.set(socket.data.frameHash, socket);
        socket.subscribe(socket.data.frameHash);
        socket.send(JSON.stringify({ type: "connected" }));
      } else {
        const device = devices.get(socket.data.frameHash);
        if (device) socket.send(JSON.stringify({ type: "connected" }));
      }
    },
    message(socket, message) {
      if (socket.data.role !== "phone") return;
      const device = devices.get(socket.data.frameHash);
      if (device) device.send(message);
    },
    close(socket) {
      if (
        socket.data.role === "device" &&
        devices.get(socket.data.frameHash) === socket
      ) {
        devices.delete(socket.data.frameHash);
        socket.unsubscribe(socket.data.frameHash);
      }
    },
  },
});

function hash(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function createOAuthClient(request: Request): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error("Google OAuth credentials are not configured");
  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  return new OAuth2Client(
    clientId,
    clientSecret,
    `${protocol}://${forwardedHost}/api/oauth/google/callback`,
  );
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const successPage = `<!doctype html><meta name="viewport" content="width=device-width"><title>Connected</title><style>body{font:16px system-ui;background:#f6f3f1;color:#252522;display:grid;place-items:center;min-height:90vh}main{max-width:420px;padding:32px;background:#fffefa;border-radius:20px}h1{font-size:28px}p{color:#77756f;line-height:1.6}</style><main><h1>Google is connected</h1><p>Your credentials have been sent to your frame. You can close this window.</p></main>`;

export default server;
