import type { ServerWebSocket } from "bun";
import { createHash } from "crypto";
import homepage from "../index.html";
import pairpage from "../pair.html";

function requiredEnv(name: string): string {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const GOOGLE_CLIENT_ID = requiredEnv("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = requiredEnv("GOOGLE_CLIENT_SECRET");
const GOOGLE_REDIRECT_URI = requiredEnv("GOOGLE_REDIRECT_URI");

type SocketData = { hash: string; role: "device" | "phone" };

const devices = new Map<string, ServerWebSocket<SocketData>>();
const phones = new Map<string, ServerWebSocket<SocketData>>();

interface WebRequestMessage {
  type: "web.request_json";
  method: string;
  url: string;
  data: unknown;
  req_id: unknown;
  headers?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWebRequestMessage(value: unknown): value is WebRequestMessage {
  if (!isRecord(value) || value.type !== "web.request_json") return false;
  if (
    typeof value.method !== "string" ||
    typeof value.url !== "string" ||
    !("req_id" in value)
  )
    return false;
  if (value.headers !== undefined) {
    if (!isRecord(value.headers)) return false;
    if (
      !Object.values(value.headers).every(
        (header) => typeof header === "string",
      )
    )
      return false;
  }
  return true;
}

async function licenseResponse(): Promise<Response> {
  return new Response(
    await Bun.file(new URL("../LICENSE", import.meta.url)).text(),
  );
}

async function executeWebRequest(
  socket: ServerWebSocket<SocketData>,
  message: WebRequestMessage,
): Promise<void> {
  try {
    let requestUrl = new URL(message.url);
    let body =
      message.data === undefined ? undefined : JSON.stringify(message.data);

    if (requestUrl.origin.endsWith(".googleapis.com")) {
      requestUrl = new URL(
        requestUrl
          .toString()
          .replace("__CLIENT_ID", GOOGLE_CLIENT_ID)
          .replace("__CLIENT_SECRET", GOOGLE_CLIENT_SECRET)
          .replace("__REDIRECT_URI", GOOGLE_REDIRECT_URI),
      );
      body = body
        ?.replace("__CLIENT_ID", GOOGLE_CLIENT_ID)
        .replace("__CLIENT_SECRET", GOOGLE_CLIENT_SECRET)
        .replace("__REDIRECT_URI", GOOGLE_REDIRECT_URI);
    }

    console.log(`Request: ${message.method} ${requestUrl}`);
    const response = await fetch(requestUrl, {
      method: message.method,
      body,
      headers: message.headers,
      signal: AbortSignal.timeout(15_000),
    });

    let data: unknown;
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    socket.send(
      JSON.stringify({
        status: response.status,
        data,
        res_req_id: message.req_id,
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Request failed";
    socket.send(
      JSON.stringify({
        status: 0,
        error: reason,
        res_req_id: message.req_id,
      }),
    );
  }
}

const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  routes: {
    "/": homepage,
    "/pair": pairpage,
    "/LICENSE": licenseResponse,
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
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (!state || !code) {
        return new Response("Missing OAuth callback parameters", {
          status: 400,
        });
      }
      const device = devices.get(hash(state));
      if (device) {
        device.send(
          JSON.stringify({
            type: "google.account.authorization_code",
            code,
          }),
        );
      }
      return Response.redirect(`/?key=${encodeURIComponent(state)}`);
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
      let message: unknown;
      try {
        message = JSON.parse(msg.toString());
      } catch {
        console.warn("Received invalid JSON over WebSocket");
        return;
      }
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
              if (isWebRequestMessage(message)) {
                void executeWebRequest(socket, message);
              } else {
                console.warn("Invalid web.request_json message", message);
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
