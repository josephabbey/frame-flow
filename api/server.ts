import type { ServerWebSocket } from "bun";
import { createHash } from "crypto";
import homepage from "../index.html";

const GOOGLE_CLIENT_ID = Bun.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = Bun.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = Bun.env.GOOGLE_REDIRECT_URI!;

type SocketData = { hash: string; role: "device" | "phone" };

const devices = new Map<string, ServerWebSocket<SocketData>>();
const phones = new Map<string, ServerWebSocket<SocketData>>();

const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  routes: {
    "/": homepage,
  },
  async fetch(request, server) {
    const url = new URL(request.url);

    if (url.pathname === "/api/socket") {
      const key = url.searchParams.get("key") || "";
      const role = url.searchParams.get("role");
      if (
        key.length < 24 ||
        key.length > 256 ||
        (role !== "device" && role !== "phone")
      ) {
        return new Response("Invalid websocket credentials", { status: 401 });
      }
      const data: SocketData = { hash: hash(key), role };
      if (server.upgrade(request, { data })) return undefined;
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    // TODO: better validation
    if (url.pathname === "/oauth/google/callback") {
      devices.get(hash(url.searchParams.get("state"))).send(
        JSON.stringify({
          type: "google.account.authorization_code",
          code: url.searchParams.get("code"),
        }),
      );
      return Response.redirect(`/?key=${url.searchParams.get("state")}`);
    }

    console.log(
      `[404 NOT FOUND] ${request.method} ${new URL(request.url).pathname}`,
    );
    return Response.json(
      { error: "not_found" },
      {
        status: 404,
      },
    );
  },
  websocket: {
    data: {} as SocketData,
    open(socket) {
      console.log("Connection", socket.data);
      if (socket.data.role === "device") {
        const previous = devices.get(socket.data.hash);
        previous?.close(4001, "replaced by a newer connection");
        devices.set(socket.data.hash, socket);
        socket.subscribe(socket.data.hash);
        phones
          .get(socket.data.hash)
          ?.send(JSON.stringify({ type: "device_connected" }));
      } else if (socket.data.role === "phone") {
        const previous = phones.get(socket.data.hash);
        previous?.close(4001, "replaced by a newer connection");
        phones.set(socket.data.hash, socket);
        socket.subscribe(socket.data.hash);
        devices
          .get(socket.data.hash)
          ?.send(JSON.stringify({ type: "phone_connected" }));
      }
    },
    message(socket, msg) {
      const message = JSON.parse(msg.toString()) as unknown;
      console.log("Message", socket.data, message);
      if (socket.data.role === "device") {
        // Handle specific cases
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          typeof message.type === "string"
        ) {
          switch (message.type) {
            case "web.request_json":
              if (
                "method" in message &&
                typeof message.method === "string" &&
                "url" in message &&
                typeof message.url === "string" &&
                "data" in message &&
                "req_id" in message
              ) {
                const method = message.method ?? "GET";
                let url = new URL(message.url);
                let body = JSON.stringify(message.data);
                const headers = message.headers ?? undefined;
                console.log(
                  `Request: ${method} ${url} ${headers} ${message.data}`,
                );

                if (url.origin.endsWith(".googleapis.com")) {
                  url = new URL(
                    url
                      .toString()
                      .replace("__CLIENT_ID", GOOGLE_CLIENT_ID)
                      .replace("__CLIENT_SECRET", GOOGLE_CLIENT_SECRET)
                      .replace("__REDIRECT_URI", GOOGLE_REDIRECT_URI),
                  );
                  body = body
                    .replace("__CLIENT_ID", GOOGLE_CLIENT_ID)
                    .replace("__CLIENT_SECRET", GOOGLE_CLIENT_SECRET)
                    .replace("__REDIRECT_URI", GOOGLE_REDIRECT_URI);
                }
                (async () => {
                  const res = await fetch(url, {
                    method: method,
                    body: body,
                    headers: headers,
                  });
                  const reply = {
                    data: await res.json(),
                    res_req_id: message.req_id,
                  };
                  console.log(reply);
                  socket.send(JSON.stringify(reply));
                })();
              }
              return; // don't relay
          }
        }

        const phone = phones.get(socket.data.hash);
        if (phone) phone.send(JSON.stringify(message));
      } else if (socket.data.role === "phone") {
        const device = devices.get(socket.data.hash);
        if (device) device.send(JSON.stringify(message));
      }
    },
    close(socket) {
      console.log("Disconnection", socket.data);
      if (
        socket.data.role === "device" &&
        devices.get(socket.data.hash) === socket
      ) {
        devices.delete(socket.data.hash);
        socket.unsubscribe(socket.data.hash);
        phones
          .get(socket.data.hash)
          ?.send(JSON.stringify({ type: "device_disconnected" }));
      } else if (
        socket.data.role === "phone" &&
        phones.get(socket.data.hash) === socket
      ) {
        phones.delete(socket.data.hash);
        socket.unsubscribe(socket.data.hash);
        devices
          .get(socket.data.hash)
          ?.send(JSON.stringify({ type: "phone_disconnected" }));
      }
    },
  },
});

function hash(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export default server;
