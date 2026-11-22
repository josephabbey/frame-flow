export class AsyncEvent {
  private _isSet = false;
  private _deferred = Promise.withResolvers<void>();
  private _onSetListeners = new Set<() => void | Promise<void>>();
  private _onClearListeners = new Set<() => void | Promise<void>>();

  isSet() {
    return this._isSet;
  }

  set() {
    if (!this._isSet) {
      this._isSet = true;
      this._deferred.resolve(undefined);
      for (const callback of this._onSetListeners) {
        void Promise.resolve(callback()).catch((error) => {
          console.error(error);
        });
      }
    }
  }

  clear() {
    if (this._isSet) {
      this._isSet = false;
      const previous = this._deferred;
      this._deferred = Promise.withResolvers<void>();
      previous.resolve(undefined);
      for (const callback of this._onClearListeners) {
        void Promise.resolve(callback()).catch((error) => {
          console.error(error);
        });
      }
    }
  }

  async wait(): Promise<void> {
    while (!this._isSet) {
      await this._deferred.promise;
    }
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
