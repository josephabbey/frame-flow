import { AsyncEvent } from "../utils";

const params = new URLSearchParams(location.search);
const key = params.get("key");
if (!key) throw new Error("Missing flow key");
export const FLOW_KEY = key;

let reqId = 0;

export type FlowMessage = { type: string } & Record<string, unknown>;

function isFlowMessage(message: unknown): message is FlowMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as FlowMessage).type === "string"
  );
}

type RegisteredCallback = (payload: FlowMessage) => void | Promise<void>;

interface OutstandingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

class FlowClient {
  private _connection: WebSocket | null = null;
  flowConnected = new AsyncEvent();
  deviceConnected = new AsyncEvent();

  private registeredListeners: Record<string, RegisteredCallback> = {};
  private outstandingReqs: Record<number, OutstandingRequest> = {};

  // Reconnect-with-backoff state for the phone client. The frame may
  // temporarily drop its Wi-Fi, and the server replaces the previous
  // socket for a key when a newer one connects.
  private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempts = 0;
  private readonly _maxReconnectAttempts = 10;

  websocketUrl(): string {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${location.host}/api/socket?role=phone&key=${encodeURIComponent(FLOW_KEY)}`;
  }

  connect(): void {
    if (this._connection && this._connection.readyState < WebSocket.CLOSING)
      return;
    // Close any old socket explicitly; its close event must not trigger
    // a reconnect because we are about to open a replacement.
    const old = this._connection;
    if (old) old.close();
    this._connection = null;
    const socket = new WebSocket(this.websocketUrl());
    this._connection = socket;
    socket.addEventListener("message", (event) => this._handleMessage(event));
    socket.addEventListener("open", () => {
      this.flowConnected.set();
      // A successful (re)connect resets backoff.
      this._reconnectAttempts = 0;
      this._reconnectTimeout = null;
    });
    socket.addEventListener("close", () => {
      // Only react to the closure of the socket we consider current;
      // a socket closed to make way for a replacement is ignored.
      if (this._connection !== socket) return;
      this.deviceConnected.clear();
      this.flowConnected.clear();
      this._connection = null;
      for (const [reqIdVal, request] of Object.entries(this.outstandingReqs)) {
        clearTimeout(request.timeout);
        request.reject(new Error("Flow connection closed"));
        delete this.outstandingReqs[Number(reqIdVal)];
      }
      this._scheduleReconnect();
    });
  }

  private _scheduleReconnect() {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.warn("Flow: max reconnect attempts reached, giving up");
      return;
    }
    const delay = Math.min(1000 * 2 ** this._reconnectAttempts, 30_000);
    console.info(`Flow: reconnecting in ${delay}ms`);
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectAttempts += 1;
      this.connect();
    }, delay);
  }

  register(msgType: string, callback: RegisteredCallback): () => void {
    this.registeredListeners[msgType] = callback;
    console.info(`New flow registered: ${msgType}`);
    return () => {
      delete this.registeredListeners[msgType];
    };
  }

  async sendJsonNow(payload: Record<string, unknown>): Promise<void> {
    if (!this._connection || this._connection.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this._connection.send(JSON.stringify(payload));
  }

  async sendJson(payload: Record<string, unknown>): Promise<void> {
    await this.flowConnected.wait();
    await this.sendJsonNow(payload);
  }

  async sendMessage(
    messageType: string,
    fields: Record<string, unknown> = {},
  ): Promise<void> {
    return this.sendJson({ type: messageType, ...fields });
  }

  async sendJsonRequestNow(payload: Record<string, unknown>): Promise<unknown> {
    if (!this._connection || this._connection.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    const p = { ...payload };
    reqId += 1;
    p.req_id = reqId;
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    const timeout = setTimeout(() => {
      const request = this.outstandingReqs[reqId];
      if (request) {
        request.reject(new Error("Flow request timed out"));
        delete this.outstandingReqs[reqId];
      }
    }, 15_000);
    this.outstandingReqs[reqId] = { resolve, reject, timeout };
    this._connection.send(JSON.stringify(p));
    return promise;
  }

  async sendJsonRequest<T = unknown>(
    payload: Record<string, unknown>,
  ): Promise<T> {
    await this.flowConnected.wait();
    return (await this.sendJsonRequestNow(payload)) as T;
  }

  async sendMessageRequest<T = unknown>(
    messageType: string,
    fields: Record<string, unknown> = {},
  ): Promise<T> {
    await this.flowConnected.wait();
    return (await this.sendJsonRequestNow({
      type: messageType,
      ...fields,
    })) as T;
  }

  private _handleMessage(event: MessageEvent): void {
    let message: unknown;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    console.log(message);
    if (!isFlowMessage(message)) return;

    const reqIdVal = message.res_req_id as number | undefined;
    if (reqIdVal !== undefined && this.outstandingReqs[reqIdVal]) {
      const { resolve, timeout } = this.outstandingReqs[reqIdVal];
      clearTimeout(timeout);
      delete this.outstandingReqs[reqIdVal];
      resolve(message);
      return;
    }

    const msgType = message.type;
    if (msgType === "device_connected") {
      console.log("Device Connected");
      this.deviceConnected.set();
      this.sendMessage("phone_already_connected");
      return;
    }

    if (msgType === "device_already_connected") {
      console.log("Device Connected");
      this.deviceConnected.set();
      return;
    }

    if (msgType === "device_disconnected") {
      console.log("Device Disconnected");
      this.deviceConnected.clear();
      return;
    }

    // keep special handling for google auth url
    if (msgType === "google.account.authorization_url") {
      if (typeof message.url === "string") {
        console.log(message.url.replace("__KEY", FLOW_KEY));
        window.location.replace(message.url.replace("__KEY", FLOW_KEY));
      }
      return;
    }

    const callback = this.registeredListeners[msgType];
    if (callback) {
      const ret = callback(message);
      if (ret && typeof ret.then === "function") {
        (ret as Promise<void>).catch((e) => console.error(e));
      }
    } else {
      console.warn(`Unhandled Flow message type: ${msgType}`);
    }
  }
}

export const FLOW_CLIENT = new FlowClient();
window.FLOW_CLIENT = FLOW_CLIENT;

declare global {
  interface Window {
    FLOW_CLIENT: FlowClient;
  }
}
