import { Task } from "@lit/task";
import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { FLOW_CLIENT } from "../../flow";

import "@material/web/labs/card/elevated-card";
import "@material/web/progress/linear-progress";

@customElement("album-list")
export class AlbumList extends LitElement {
  private _albums = new Task(this, {
    task: async () => {
      await FLOW_CLIENT.deviceConnected.wait();
      return (await FLOW_CLIENT.sendMessageRequest("data.photos.list_albums"))
        .albums as {}[];
    },
    args: () => [],
  });

  async addToAlbum(albumId: string) {
    const { pickerUri } = await FLOW_CLIENT.sendMessageRequest(
      "google.picker.select",
      {
        albumId,
      },
    );

    window.open(`${pickerUri}/autoclose`);
  }

  render() {
    return this._albums.render({
      pending: () =>
        html`<md-linear-progress indeterminate></md-linear-progress>`,
      complete: (albums) => html`
        <div class="album-list">
          ${albums.map(
            ({ id, title, cover_photo_url }) =>
              html`<md-elevated-card
                role="button"
                @click=${() => this.addToAlbum(id)}
              >
                <div
                  data-img="${cover_photo_url}"
                  style="background-image: url('${cover_photo_url}');"
                >
                  ${title}
                </div>
              </md-elevated-card>`,
          )}
        </div>
      `,
      error: (e) => html`<p>Error: ${e}</p>`,
    });
  }

  static styles = css`
    .album-list {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;

      > md-elevated-card {
        width: 10em;
        height: 10em;
        overflow: hidden;
        cursor: pointer;
        > div {
          /*background-image: url(attr(data-img));*/
          background-size: cover;

          width: 100%;
          height: 100%;
          padding: 0.5em;
          box-sizing: border-box;

          display: flex;
          align-items: flex-end;
          justify-content: center;

          color: white;
        }
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "album-list": AlbumList;
  }
}
