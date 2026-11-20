export class AsyncEvent {
  private _isSet = false;
  private _deferred = Promise.withResolvers();

  isSet() {
    return this._isSet;
  }

  set() {
    if (!this._isSet) {
      this._isSet = true;
      this._deferred.resolve(undefined);
    }
  }

  clear() {
    if (this._isSet) {
      this._isSet = false;
      this._deferred = Promise.withResolvers();
    }
  }

  async wait() {
    if (this._isSet) return;
    await this._deferred.promise;
  }
}
