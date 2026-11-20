# Frame Flow WebSocket API

## Transport

- Endpoint: `/api/socket?role=<device|phone>&key=<frameKey>`
- WebSocket upgrade; server validates key length 24–256 and role.
- Server indexes live connections by SHA-256 digest of key (`hash(key)`).
- Each role has one active socket per key; a newer connection replaces the previous one (close code 4001).
- Both sides subscribe to a pub/sub channel named by the hash (Bun `socket.subscribe`).
- Server sends `{ "type": "connected" }` on open.
- Messages are JSON objects. Relay behavior:
  - device → server: special-cased types handled by server; otherwise relayed to phone.
  - phone → server: relayed to device.
- Request/response correlation via `req_id`: sender sets `req_id`, receiver responds with same `req_id`; device client resolves outstanding futures.

## Participants

- Device: Python frame (`src/frame/flow/client.py`), role=device.
- Server: Bun (`api/server.ts`).
- Phone/Web: browser (`src/flow/index.ts`, `src/ui/AppRoot.ts`), role=phone.

## Message types

### Lifecycle

- `connected` (server → both): relay acknowledged connection.

### Google OAuth

Device → server (relayed to phone? Actually device sends to server, server relays to phone? Let's note):

- `google.account.authorization_url[get]`? Device registers and when phone requests? Actually device listens for `google.account.authorization_url[get]`? Let's see: device registers listener for "google.account.authorization_url[get]" and responds by sending `google.account.authorization_url` with url. Phone? The web gui? Current phone code only handles `google.account.authorization_url` by redirecting. Who sends get? Possibly phone sends `{type: "google.account.authorization_url[get]"}`? Not in web code currently. But device registration expects it.

- `google.account.authorization_url` (device → phone via server): `{ type, url }`. Server replaces `__CLIENT_ID`, `__REDIRECT_URI`, `__KEY`? Actually server replaces placeholders in url and adds state. Phone redirects browser to url (replacing `__KEY` with key).
- `google.account.authorization_code` (server → device): On OAuth callback, server sends to device (indexed by hash(state)) `{ type, code }`. Device calls on_authorization_code → exchange_code.
- Device → server via `web.request_json` (server handles, not relayed): `{ type: "web.request_json", method, url, data, headers?, req_id }`. Server proxies HTTP request, with placeholder replacement for googleapis.com, returns `{ type: "web.request[res]", data, req_id }` to device.

### Web request proxy

- `web.request_json` (device → server): proxied HTTP request.
- `web.request[res]` (server → device): response `{ data, req_id }`.

## Server handling locations

- `api/server.ts`: fetch upgrade, open/close, message switch, OAuth callback `/oauth/google/callback` sends `google.account.authorization_code` to device.
- Special device cases: `google.account.authorization_url` placeholder replacement; `web.request_json` proxy.

## Additional message types (new device protocol)

Request/response (device handlers):
- `settings.list_components` → `{ components: {key: {name,details}} }`
- `settings.set` → `{ component, key, value }`
- `data.photos.list_albums` → `{ albums: [...] }`
- `google.account.authorization_url` → `{ url }`
- `google.picker.select` → `{ albumId?, title?, maxItemCount? }` returns `{ albumId, title, sessionId, pickerUri }`

One-way device → phone:
- `google.photos.picker.cancelled`: `{ albumId }`
- `google.photos.picker.completed`: `{ albumId, title?, photoCount, addedCount }` or `{ albumId: null, photoCount: 0 }`
- `google.photos.picker.error`: `{ albumId?, message }`
- `pong`

## Device handling locations

- `src/frame/flow/client.py`: connection lifecycle, dispatch by type, req_id resolution.
- `src/frame/google/account.py`: registers handlers, OAuth flow, token exchange via web.request_json.

## Phone handling locations

- `src/flow/index.ts`: connectPhone, message switch for `connected`, `google.account.authorization_url`.
- `src/ui/AppRoot.ts`: UI.

## Google Photos Picker

Phone → device (server relays):

- `google.photos.picker.select[post]`: `{ type, albumId?, title?, maxItemCount? }`
- `google.photos.picker.albums[get]`: `{ type }`

Device → phone (via server):

- `google.photos.picker.session`: `{ type, albumId, title, sessionId, url, pickerUri }`
- `google.photos.picker.cancelled`: `{ type, albumId }`
- `google.photos.picker.completed`: `{ type, albumId, title?, photoCount, addedCount? }` or `{ albumId: null, photoCount: 0 }`
- `google.photos.picker.albums`: `{ type, albums: [{id,title,coverPhotoId}] }`
- `google.photos.picker.error`: `{ type, albumId?, message }`

## Notes

- Volatile in-memory maps; not production distributed.
- Reconnect with backoff on both? Device yes. Phone should reconnect.
