import { LitElement, css, html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import "./style.css";

type SavedFrame = { key: string; name: string; connected: boolean };
const STORAGE_KEY = "frame.paired.v1";
const params = new URLSearchParams(location.search);
const pairingKey = params.get("key");
const frameName = params.get("name") || "New frame";

function readFrames(): SavedFrame[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]",
    );
    return Array.isArray(value) ? (value as SavedFrame[]) : [];
  } catch {
    return [];
  }
}

@customElement("frame-app")
export class FrameApp extends LitElement {
  static properties = {
    frames: { state: true },
    selected: { state: true },
    dialogOpen: { state: true },
    toast: { state: true },
    busy: { state: true },
  };
  static styles = css`
    :host {
      display: block;
    }
    .pair-dialog {
      width: min(440px, calc(100vw - 36px));
      padding: 32px;
      border: 0;
      border-radius: 20px;
      color: var(--ink);
      background: var(--surface);
      box-shadow: 0 16px 60px #27251f33;
    }
    .pair-dialog::backdrop {
      background: #25252266;
    }
    .pair-dialog h2 {
      margin: 14px 0 10px;
      font:
        700 24px Manrope,
        sans-serif;
    }
    .pair-dialog p {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.65;
      margin-bottom: 20px;
    }
    .dialog-action {
      float: right;
      border: 0;
      border-radius: 100px;
      padding: 10px 18px;
      color: white;
      background: var(--primary);
      font: inherit;
      cursor: pointer;
    }
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      border-radius: 12px;
      padding: 13px 18px;
      background: #302f2a;
      color: white;
      font-size: 13px;
      box-shadow: 0 5px 24px #0003;
    }
    .icon {
      font-family: "Material Symbols Outlined";
      font-weight: normal;
      font-style: normal;
      font-size: 22px;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      display: inline-block;
      white-space: nowrap;
      direction: ltr;
      -webkit-font-feature-settings: "liga";
      -webkit-font-smoothing: antialiased;
    }
    .action-button {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      border-radius: 100px;
      border: 1px solid #c8c8b8;
      padding: 10px 16px;
      color: var(--primary);
      background: transparent;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .primary-button {
      border: 0;
      background: var(--primary);
      color: white;
    }
    .service-card:disabled {
      opacity: 0.55;
      cursor: wait;
    }
  `;

  private frames: SavedFrame[] = readFrames();
  private selected: string | null = this.frames[0]?.key ?? pairingKey;
  private dialogOpen = false;
  private toast = "";
  private busy = false;
  private phoneSocket: WebSocket | null = null;
  private socketFrame = "";

  constructor() {
    super();
    if (pairingKey && !this.frames.some((frame) => frame.key === pairingKey)) {
      this.frames = [
        { key: pairingKey, name: frameName, connected: false },
        ...this.frames,
      ];
      this.persist();
      this.selected = pairingKey;
      history.replaceState({}, "", location.pathname);
    }
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected updated(): void {
    const frame = this.frames.find((item) => item.key === this.selected);
    if (frame) this.connectPhone(frame.key);
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.frames));
  }

  private notify(message: string): void {
    this.toast = message;
    window.setTimeout(() => (this.toast = ""), 3500);
  }

  private connectPhone(key: string): void {
    if (
      this.socketFrame === key &&
      this.phoneSocket &&
      this.phoneSocket.readyState < WebSocket.CLOSING
    )
      return;
    this.phoneSocket?.close();
    this.socketFrame = key;
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    this.phoneSocket = new WebSocket(
      `${scheme}//${location.host}/api/socket?role=phone&key=${encodeURIComponent(key)}`,
    );
    this.phoneSocket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string };
        if (message.type === "connected") {
          this.frames = this.frames.map((frame) =>
            frame.key === key ? { ...frame, connected: true } : frame,
          );
          this.persist();
        }
      } catch {
        // Ignore non-status messages from the relay.
      }
    });
    this.phoneSocket.addEventListener("close", () => {
      if (this.socketFrame !== key) return;
      this.frames = this.frames.map((frame) =>
        frame.key === key ? { ...frame, connected: false } : frame,
      );
      this.persist();
      window.setTimeout(() => {
        if (this.selected === key) this.connectPhone(key);
      }, 2500);
    });
  }

  private async startGoogle(): Promise<void> {
    const frame = this.frames.find((item) => item.key === this.selected);
    if (!frame) return;
    if (!this.phoneSocket || this.phoneSocket.readyState !== WebSocket.OPEN) {
      this.notify(
        "Your frame is offline. Check its Wi-Fi connection and try again.",
      );
      return;
    }
    this.busy = true;
    try {
      const response = await fetch("/api/oauth/google/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frameKey: frame.key }),
      });
      if (!response.ok) throw new Error("OAuth could not start");
      const data = (await response.json()) as { url: string };
      location.assign(data.url);
    } catch {
      this.busy = false;
      this.notify("Could not start Google sign-in. Please try again.");
    }
  }

  private frameCard(frame: SavedFrame) {
    return html`<button
      class="frame-card ${this.selected === frame.key ? "selected" : ""}"
      @click=${() => (this.selected = frame.key)}
    >
      <span class="frame-art"
        ><span class="sun"></span><span class="hill hill-one"></span
        ><span class="hill hill-two"></span>
        <span class="frame-status ${frame.connected ? "online" : ""}"></span
      ></span>
      <span class="frame-copy"
        ><strong>${frame.name}</strong
        ><span
          >${frame.connected ? "Connected" : "Ready to connect"}</span
        ></span
      >
      <span class="icon">chevron_right</span>
    </button>`;
  }

  protected render() {
    const activeFrame = this.frames.find(
      (frame) => frame.key === this.selected,
    );
    return html`
      <header class="topbar">
        <a class="brand" href="/" aria-label="Frame home"
          ><span class="brand-mark">f</span><span>frame</span></a
        ><span class="topbar-caption">A little more of home</span>
      </header>
      <main>
        <section class="intro">
          <div class="eyebrow">YOUR FRAME, YOUR WAY</div>
          <h1>Make room for<br /><span>what matters.</span></h1>
          <p>Connect your frame to the moments and memories you love.</p>
        </section>
        ${
          this.frames.length
            ? html` <section class="frame-section">
                <div class="section-heading">
                  <div>
                    <div class="eyebrow">YOUR DEVICES</div>
                    <h2>Your frames</h2>
                  </div>
                  <button
                    class="action-button"
                    @click=${() => (this.dialogOpen = true)}
                  >
                    <span class="icon">add</span>Add a frame
                  </button>
                </div>
                <div class="frame-grid">
                  ${this.frames.map((frame) => this.frameCard(frame))}
                </div>
              </section>`
            : html` <section class="welcome-card">
                <div class="welcome-art">
                  <span class="sun"></span><span class="hill hill-one"></span
                  ><span class="hill hill-two"></span>
                </div>
                <div class="welcome-copy">
                  <div class="eyebrow">A GOOD PLACE TO START</div>
                  <h2>Bring your first frame to life</h2>
                  <p>
                    Connect your frame, then choose what you’d like to see on
                    it.
                  </p>
                  <button
                    class="action-button primary-button"
                    @click=${() => (this.dialogOpen = true)}
                  >
                    <span class="icon">add</span>Connect a frame
                  </button>
                </div>
              </section>`
        }
        ${
          activeFrame
            ? html` <section class="services">
                <div class="eyebrow">MAKE IT YOURS</div>
                <h2>Bring your memories in</h2>
                <p class="section-description">
                  Choose a service to connect to ${activeFrame.name}.
                </p>
                <button
                  class="service-card"
                  ?disabled=${this.busy}
                  @click=${this.startGoogle}
                >
                  <span class="google-icon"
                    ><svg viewBox="0 0 48 48" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4.1 2-6.8 2-5.2 0-9.7-3.5-11.3-8.2H5.8v5.3A20 20 0 0 0 24 44Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M12.7 27.8a12 12 0 0 1 0-7.6v-5.3H5.8a20 20 0 0 0 0 18.2l6.9-5.3Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.8 29.5 4 24 4A20 20 0 0 0 5.8 14.9l6.9 5.3C14.3 15.5 18.8 12 24 12Z"
                      /></svg
                  ></span>
                  <span class="service-copy"
                    ><strong>Google Photos</strong
                    ><span>Connect albums and shared memories</span></span
                  ><span class="icon">arrow_outward</span>
                </button>
              </section>`
            : nothing
        }
        <footer>
          <span>Made for the moments that make a home.</span
          ><span>Your photos stay yours.</span>
        </footer>
      </main>
      ${
        this.dialogOpen
          ? html`<dialog class="pair-dialog" open>
              <div class="eyebrow">CONNECT A FRAME</div>
              <h2>Scan your frame’s QR code</h2>
              <p>
                On your frame, open <strong>Connect to phone</strong> in
                Settings. Scan the QR code with your phone camera and this page
                will link the frame for you.
              </p>
              <button
                class="dialog-action"
                @click=${() => (this.dialogOpen = false)}
              >
                Got it
              </button>
            </dialog>`
          : nothing
      }
      ${this.toast ? html`<div class="toast" role="status">${this.toast}</div>` : nothing}
    `;
  }
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML =
  "<frame-app></frame-app>";
