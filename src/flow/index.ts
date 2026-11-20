import { AsyncEvent } from "../utils";

const params = new URLSearchParams(location.search);
export const FLOW_KEY = params.get("key")!;

let reqId = 0;

type RegisteredCallback = (payload: unknown) => void | Promise<void>;

class FlowClient {
  private _connection: WebSocket | null = null;
  flowConnected = new AsyncEvent();
  deviceConnected = new AsyncEvent();

  private registeredListeners: Record<string, RegisteredCallback> = {};

  private outstandingReqs: Record<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  > = {};

  websocketUrl(): string {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${location.host}/api/socket?role=phone&key=${encodeURIComponent(FLOW_KEY)}`;
  }

  connect(): void {
    if (this._connection && this._connection.readyState < WebSocket.CLOSING)
      return;
    this._connection?.close();
    const socket = new WebSocket(this.websocketUrl());
    this._connection = socket;
    socket.addEventListener("message", (event) => {
      this._handleMessage(event);
    });
    socket.addEventListener("open", () => {
      this.flowConnected.set();
    });
    socket.addEventListener("close", () => {
      this.deviceConnected.clear();
      this.flowConnected.clear();
      this._connection = null;
    });
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
    const { promise, resolve, reject } = Promise.withResolvers();
    this.outstandingReqs[reqId] = { resolve, reject };
    this._connection.send(JSON.stringify(p));
    return promise;
  }

  async sendJsonRequest(payload: Record<string, unknown>): Promise<unknown> {
    await this.flowConnected.wait();
    return this.sendJsonRequestNow(payload);
  }

  async sendMessageRequest(
    messageType: string,
    fields: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.flowConnected.wait();
    return this.sendJsonRequestNow({ type: messageType, ...fields });
  }

  private _handleMessage(event: MessageEvent): void {
    let message: unknown;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    console.log(message);
    if (typeof message !== "object" || message === null) return;

    const reqIdVal = message.res_req_id;
    if (reqIdVal && this.outstandingReqs[reqIdVal]) {
      const { resolve } = this.outstandingReqs[reqIdVal];
      delete this.outstandingReqs[reqIdVal];
      resolve(message);
      return;
    }

    const msgType = message.type;
    if (typeof msgType !== "string") return;

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
      if ("url" in message && typeof message.url === "string") {
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

export function connect(): void {
  FLOW_CLIENT.connect();
}

declare global {
  interface Window {
    FLOW_CLIENT: FlowClient;
  }
}
