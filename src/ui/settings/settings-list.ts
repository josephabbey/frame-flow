import { Task } from "@lit/task";
import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { map } from "lit/directives/map.js";

import { FLOW_CLIENT } from "../../flow";

import "@material/web/progress/linear-progress";
import "@material/web/textfield/outlined-text-field";

export interface ComponentDetail {
  name: string;
  value: string | number;
  type: string;
}

export interface Component {
  name: string;
  details: Record<string, ComponentDetail>;
}

interface ListComponentsResponse {
  components: Record<string, Component>;
}

function isComponentDetail(value: unknown): value is ComponentDetail {
  if (typeof value !== "object" || value === null) return false;
  const detail = value as Record<string, unknown>;
  return (
    typeof detail.name === "string" &&
    (typeof detail.value === "string" || typeof detail.value === "number") &&
    typeof detail.type === "string"
  );
}

function isListComponentsResponse(
  value: unknown,
): value is ListComponentsResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  if (typeof response.components !== "object" || response.components === null)
    return false;
  return Object.values(response.components).every((component) => {
    if (typeof component !== "object" || component === null) return false;
    const item = component as Record<string, unknown>;
    if (
      typeof item.name !== "string" ||
      typeof item.details !== "object" ||
      item.details === null
    )
      return false;
    return Object.values(item.details).every(isComponentDetail);
  });
}

@customElement("settings-list")
export class SettingsList extends LitElement {
  private _components = new Task(this, {
    task: async () => {
      await FLOW_CLIENT.deviceConnected.wait();
      const response = await FLOW_CLIENT.sendMessageRequest(
        "settings.list_components",
      );
      if (!isListComponentsResponse(response)) {
        throw new Error("Invalid settings component response");
      }
      return response.components;
    },
    args: () => [],
  });

  render() {
    return this._components.render({
      pending: () =>
        html`<md-linear-progress indeterminate></md-linear-progress>`,
      complete: (components) =>
        html`${map(
          Object.entries(components),
          ([component_key, component]) =>
            html`<h3>${component.name}</h3>
              ${map(
                Object.entries(component.details),
                ([key, { name, value, type }]) =>
                  html`<md-outlined-text-field
                    label="${name}"
                    value="${String(value)}"
                    type="${type === "int" || type === "float" ? "number" : "text"}"
                    @change=${(e: InputEvent) => {
                      const input = e.target as HTMLInputElement | null;
                      const nextValue = input?.value ?? "";
                      FLOW_CLIENT.sendMessageRequest("settings.set", {
                        component: component_key,
                        key: key,
                        value:
                          type === "int" || type === "float"
                            ? parseFloat(nextValue)
                            : nextValue,
                      });
                    }}
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
