# Frame Flow

Phone setup and account authorization for Frame e-paper photo frames. Lit
provides the web components, and Bun handles frontend bundling, development,
and the API's native WebSocket server.

## Google OAuth

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel project settings.
Register `https://<deployment-host>/api/oauth/google/callback` as an authorized
redirect URI in Google Cloud Console. The phone calls
`POST /api/oauth/google/start` with `{ "frameKey": "..." }`; the key comes from
the frame's pairing QR URL. The callback sends the Google access and refresh
tokens directly over the frame's authenticated websocket. The server does not
write tokens to disk or to a database.

## Device relay protocol

The frame connects to `wss://<deployment-host>/api/socket?role=device&key=<key>`.
The browser uses the same endpoint with `role=phone`. Both sides should reconnect
with backoff. The key is a high-entropy per-frame secret, stored by the frame
and in the browser's local storage; the server indexes live connections by a
SHA-256 digest of that key.

The current relay and OAuth state maps are volatile and local to one function
instance. Vercel pins a websocket to its accepting function instance, but does
not guarantee that another websocket or the OAuth callback reaches that same
instance. Production use therefore needs an ephemeral cross-instance relay and
state store with short TTLs (for example Redis pub/sub and expiring OAuth
state). This keeps the no-persistent-token-storage requirement while allowing
separate instances to coordinate. The current server is a protocol foundation,
not yet a production-safe distributed relay.

## Local development

Install dependencies with `bun install`, then run `bun run dev` for the app and
API together on port 3000, with hot module replacement. Build the static
frontend with `bun run build`. Use `bun run lint`, `bun run format`,
`bun run format:check`, and `bun run typecheck` for code quality checks.
