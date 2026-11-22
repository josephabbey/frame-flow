export class AsyncEvent {
  private _isSet = false;
  private _deferred = Promise.withResolvers();
  private _onSetListeners = new Set<() => void | Promise<void>>();
  private _onClearListeners = new Set<() => void | Promise<void>>();

  isSet() {
    return this._isSet;
  }

  set() {
    if (!this._isSet) {
      this._isSet = true;
      this._deferred.resolve(undefined);
      this._onSetListeners.forEach((c) => {
        c();
      });
    }
  }

  clear() {
    if (this._isSet) {
      this._isSet = false;
      this._deferred = Promise.withResolvers();
      this._onClearListeners.forEach((c) => {
        c();
      });
    }
  }

  async wait() {
    if (this._isSet) return;
    await this._deferred.promise;
  }

  onSet(callback: () => void | Promise<void>) {
    this._onSetListeners.add(callback);
    return () => {
      this._onSetListeners.delete(callback);
    };
  }

  onClear(callback: () => void | Promise<void>) {
    this._onClearListeners.add(callback);
    return () => {
      this._onClearListeners.delete(callback);
    };
  }
}
