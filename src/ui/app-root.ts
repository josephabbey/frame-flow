import { customElement } from "lit/decorators.js";
import { css, html, LitElement } from "lit-element";

import "@material/web/button/filled-button";
import "@material/web/divider/divider";
import "@material/web/labs/card/filled-card";
import "@material/web/textfield/outlined-text-field";

import "./photos/album-list";
import "./settings/settings-list";

import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";
import { FLOW_CLIENT, FLOW_KEY } from "../flow";
import { ConnectionController } from "../flow/connection-controller";
import { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } from "../google";

@customElement("app-root")
export class AppRoot extends LitElement {
  private connection = new ConnectionController(this);

  constructor() {
    super();
    FLOW_CLIENT.connect();
  }

  async googleAuth() {
    let { url } = await FLOW_CLIENT.sendMessageRequest(
      "google.account.authorization_url",
    );
    url = url
      .replace("__CLIENT_ID", GOOGLE_CLIENT_ID)
      .replace("__REDIRECT_URI", GOOGLE_REDIRECT_URI);
    window.location.href = `${url}&state=${FLOW_KEY}`;
  }

  protected render() {
    return html`
      <md-filled-card>
        ${
          this.connection.deviceConnected
            ? html`<h2>Frame Settings</h2>
                <div>
                  <md-filled-button @click=${() => this.googleAuth()}>
                    Connect Google
                  </md-filled-button>
                  <md-filled-button
                    @click=${() => FLOW_CLIENT.sendMessage("google.picker.select", { maxItemCount: 5 })}
                  >
                    New Album
                  </md-filled-button>
                </div>

                <h2>Albums</h2>
                <album-list></album-list>

                <h2>Settings</h2>
                <settings-list></settings-list>`
            : html`<h2>Connecting...</h2>`
        }
      </md-filled-card>
    `;
  }

  static styles = [
    typescaleStyles,
    css`
      md-filled-card {
        height: 100%;
        padding: 1em;

        > div {
          display: flex;
          flex-direction: column;
          gap: 1em;
          margin-bottom: 2em;
        }
      }
    `,
  ];
}
