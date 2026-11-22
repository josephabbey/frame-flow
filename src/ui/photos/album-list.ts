import { Task } from "@lit/task";
import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { map } from "lit/directives/map.js";

import { FLOW_CLIENT } from "../../flow";

import "@material/web/labs/card/elevated-card";
import "@material/web/progress/linear-progress";

export interface Album {
  id: string;
  title: string;
  cover_photo_url: string;
}

interface ListAlbumsResponse {
  albums: Album[];
}

interface PickerSelectResponse {
  pickerUri: string;
}

function isAlbum(value: unknown): value is Album {
  if (typeof value !== "object" || value === null) return false;
  const album = value as Record<string, unknown>;
  return (
    typeof album.id === "string" &&
    typeof album.title === "string" &&
    typeof album.cover_photo_url === "string"
  );
}

function isListAlbumsResponse(value: unknown): value is ListAlbumsResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return Array.isArray(response.albums) && response.albums.every(isAlbum);
}

function isPickerSelectResponse(value: unknown): value is PickerSelectResponse {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Record<string, unknown>).pickerUri === "string";
}

@customElement("album-list")
export class AlbumList extends LitElement {
  private _albums = new Task(this, {
    task: async () => {
      await FLOW_CLIENT.deviceConnected.wait();
      const response = await FLOW_CLIENT.sendMessageRequest(
        "data.photos.list_albums",
      );
      if (!isListAlbumsResponse(response)) {
        throw new Error("Invalid album list response");
      }
      return response.albums;
    },
    args: () => [],
  });

  async addToAlbum(albumId: string) {
    const response = await FLOW_CLIENT.sendMessageRequest(
      "google.picker.select",
      {
        albumId,
      },
    );
    if (!isPickerSelectResponse(response)) {
      throw new Error("Invalid picker response");
    }
    const { pickerUri } = response;

    window.open(`${pickerUri}/autoclose`);
  }

  render() {
    return this._albums.render({
      pending: () =>
        html`<md-linear-progress indeterminate></md-linear-progress>`,
      complete: (albums) => html`
        <div class="album-list">
          ${map(
            albums,
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
      gap: 1em;

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
