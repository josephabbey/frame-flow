import { Task } from "@lit/task";
import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { FLOW_CLIENT } from "../../flow";

import "@material/web/progress/linear-progress";
import "@material/web/textfield/outlined-text-field";

@customElement("settings-list")
export class SettingsList extends LitElement {
  private _components = new Task(this, {
    task: async () => {
      await FLOW_CLIENT.deviceConnected.wait();
      return (await FLOW_CLIENT.sendMessageRequest("settings.list_components"))
        .components as {};
    },
    args: () => [],
  });

  render() {
    return this._components.render({
      pending: () =>
        html`<md-linear-progress indeterminate></md-linear-progress>`,
      complete: (components) =>
        html`${Object.entries(components).map(
          ([component_key, component]) =>
            html`<h3>${component.name}</h3>
              ${Object.entries(component.details).map(
                ([key, { name, value, type }]) =>
                  html`<md-outlined-text-field
                    label="${name}"
                    value="${value}"
                    type="${type === "int" || type === "float" ? "number" : "text"}"
                    @change=${(e: InputEvent) =>
                      FLOW_CLIENT.sendMessageRequest("settings.set", {
                        component: component_key,
                        key: key,
                        value:
                          type === "int" || type === "float"
                            ? parseFloat(e.target!.value)
                            : e.target!.value,
                      })}
                  ></md-outlined-text-field>`,
              )}`,
        )}`,
      error: (e) => html`<p>Error: ${e}</p>`,
    });
  }

  static styles = css`
    md-outlined-text-field {
      width: 100%;
      margin-bottom: 1em;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-list": SettingsList;
  }
}
