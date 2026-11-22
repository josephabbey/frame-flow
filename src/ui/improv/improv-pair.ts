/**
 * Frame BLE pairing page component.
 *
 * Wraps the official @improv-wifi/ble-sdk launch button and provision dialog.
 * The SDK handles all BLE packet framing, checksums, capabilities bitfield,
 * WiFi network scanning, device info display, and error codes.
 */

import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

import "@improv-wifi/ble-sdk";
import type { ImprovState } from "@improv-wifi/ble-sdk/dist/const";
import "@material/web/icon/icon.js";

import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";

@customElement("improv-pair")
export class ImprovPair extends LitElement {
  @state() private _provisionedUrl: string | undefined;
  @state() private _state: ImprovState["state"] | undefined;

  private _onStateChanged(e: CustomEvent<ImprovState>) {
    this._state = e.detail.state;
    if (e.detail.state === "PROVISIONED") {
      // The launch button fires this after the dialog closes; the SDK
      // sets nextUrl on the ImprovBluetoothLE instance but doesn't surface
      // it via the event. We'll show a "connected" message and let the
      // device's redirect URL (if any) come through the redirect flow.
      this._provisionedUrl = undefined;
    }
  }

  protected render() {
    return html`
      <div class="container">
        <div class="header">
          <md-icon class="logo">frame_person</md-icon>
          <h1 class="md-typescale-headline-medium">Wi-Fi Setup</h1>
          <p class="md-typescale-body-large hint">
            Power on your Frame — it will advertise itself over Bluetooth when
            it is not connected to Wi-Fi.
          </p>
        </div>

        <improv-wifi-launch-button
          @state-changed=${this._onStateChanged}
        >
          <button slot="activate" class="activate-btn">
            Scan for Frame
          </button>
          <span slot="unsupported">
            Web Bluetooth is required. Please use Chrome or Edge on Android or
            desktop (not iOS).
          </span>
        </improv-wifi-launch-button>

        ${this._state === "PROVISIONED"
          ? html`
              <div class="success">
                <md-icon>wifi</md-icon>
                <p class="md-typescale-body-large">
                  Frame is connected to Wi-Fi!
                  ${this._provisionedUrl
                    ? html`<a href="${this._provisionedUrl}">Continue →</a>`
                    : ""}
                </p>
              </div>
            `
          : ""}
      </div>
    `;
  }

  static styles = [
    typescaleStyles,
    css`
      :host {
        display: block;
        max-width: 480px;
        margin: 0 auto;
        padding: 1.5em 1em;
        font-family: var(--md-ref-typeface-plain, Roboto, sans-serif);
      }

      .container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2em;
      }

      .header {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5em;
      }

      .logo {
        --md-icon-size: 3.5em;
        font-size: 3.5em;
        width: 3.5em;
        height: 3.5em;
        color: var(--md-sys-color-primary, #6750a4);
      }

      h1 {
        margin: 0;
      }

      .hint {
        margin: 0;
        color: var(--md-sys-color-on-surface-variant, #49454f);
        max-width: 36ch;
      }

      /* Style the slotted activate button to match Material 3 filled button */
      .activate-btn {
        background: var(--md-sys-color-primary, #6750a4);
        color: var(--md-sys-color-on-primary, #fff);
        border: none;
        border-radius: 20px;
        padding: 10px 24px;
        font-size: 0.875rem;
        font-weight: 500;
        letter-spacing: 0.00625em;
        cursor: pointer;
        font-family: inherit;
        min-width: 10em;
        line-height: 1.25rem;
      }

      .activate-btn:hover {
        opacity: 0.92;
      }

      .success {
        display: flex;
        align-items: center;
        gap: 0.75em;
        padding: 1em 1.5em;
        border-radius: 12px;
        background: var(--md-sys-color-tertiary-container, #c5eed8);
        color: var(--md-sys-color-on-tertiary-container, #0d3722);
        width: 100%;
        box-sizing: border-box;
      }

      .success md-icon {
        --md-icon-size: 1.5em;
        font-size: 1.5em;
        width: 1.5em;
        height: 1.5em;
        flex-shrink: 0;
      }

      .success p {
        margin: 0;
      }

      .success a {
        color: inherit;
        font-weight: 500;
      }

      /* Ensure the SDK's launch button fills width */
      improv-wifi-launch-button {
        display: contents;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "improv-pair": ImprovPair;
  }
}
