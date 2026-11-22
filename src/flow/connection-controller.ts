import type { ReactiveController, ReactiveControllerHost } from "lit";
import { FLOW_CLIENT } from ".";

export class ConnectionController implements ReactiveController {
  flowConnected: boolean = FLOW_CLIENT.flowConnected.isSet();
  deviceConnected: boolean = FLOW_CLIENT.deviceConnected.isSet();

  private _dereg1: (() => void) | undefined;
  private _dereg2: (() => void) | undefined;
  private _dereg3: (() => void) | undefined;
  private _dereg4: (() => void) | undefined;

  constructor(public host: ReactiveControllerHost) {
    this.host.addController(this);
  }
  async hostConnected() {
    this._dereg1 = FLOW_CLIENT.flowConnected.onSet(() => {
      this.flowConnected = true;
      this.host.requestUpdate();
    });
    this._dereg2 = FLOW_CLIENT.flowConnected.onClear(() => {
      this.flowConnected = false;
      this.host.requestUpdate();
    });
    this._dereg3 = FLOW_CLIENT.deviceConnected.onSet(() => {
      this.deviceConnected = true;
      this.host.requestUpdate();
    });
    this._dereg4 = FLOW_CLIENT.deviceConnected.onClear(() => {
      this.deviceConnected = false;
      this.host.requestUpdate();
    });
  }
  hostDisconnected() {
    if (this._dereg1) this._dereg1();
    if (this._dereg2) this._dereg2();
    if (this._dereg3) this._dereg3();
    if (this._dereg4) this._dereg4();
  }
}
