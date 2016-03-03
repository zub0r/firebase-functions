/// <reference path="../../typings/main.d.ts" />

import {env} from "../index";
import * as _ from "lodash";
import {normalizePath, pathParts, applyChange, valAt} from "../utils";

export default class DatabaseDeltaSnapshot {
  private _adminRef: Firebase;
  private _ref: Firebase;
  private _path: string;
  private _authToken: string;
  private _oldData: any;
  private _change: any;
  private _newData: any;

  private _childPath: string;
  private _isPrior: boolean;

  private static _populateRef(path: string, token?: string, context?: string) {
    let ref = new Firebase(env().get("firebase.database.url"), context || token).child(path);
    if (token) {
      ref.authWithCustomToken(token, () => {});
    }
    return ref;
  }

  constructor(eventData?: GCFDatabasePayload) {
    if (eventData) {
      this._path = eventData.path;
      this._authToken = eventData.authToken;
      this._oldData = eventData.oldData;
      this._change = eventData.change;
      this._newData = applyChange(this._oldData, this._change);
    }
  }

  ref(): Firebase {
    this._ref = this._ref || this._authToken ?
      DatabaseDeltaSnapshot._populateRef(this._fullPath(), this._authToken) :
      DatabaseDeltaSnapshot._populateRef(this._fullPath(), null, "__noauth__");
    return this._ref;
  }

  adminRef(): Firebase {
    this._adminRef = this._adminRef || DatabaseDeltaSnapshot._populateRef(
      this._fullPath(), env().get("firebase.database.secret"), "__admin__"
    );
    return this._adminRef;
  }

  val(): any {
    let parts = pathParts(this._childPath);
    let source = this._isPrior ? this._oldData : this._newData;
    return _.cloneDeep(parts.length ? _.get(source, parts, null) : source);
  }

  exists(): boolean {
    return !_.isNull(this.val());
  }

  child(childPath?: string): DatabaseDeltaSnapshot {
    if (!childPath) {
      return this;
    }
    return this._dup(this._isPrior, childPath);
  }

  prior(): DatabaseDeltaSnapshot {
    return this._isPrior ? this : this._dup(true);
  }

  changed(): boolean {
    return valAt(this._change, this._childPath) !== undefined;
  }

  forEach(childAction: Function) {
    let val = this.val();
    if (_.isPlainObject(val)) {
      _.keys(val).forEach(key => childAction(this.child(key)));
    }
  }

  hasChild(childPath: string): boolean {
    return this.child(childPath).exists();
  }

  hasChildren(): boolean {
    let val = this.val();
    return _.isPlainObject(val) && _.keys(val).length > 0;
  }

  key(): string {
    let fullPath = this._fullPath();
    return _.last(fullPath) || null;
  }

  name(): string {
    return this.key();
  }

  numChildren(): number {
    let val = this.val();
    return _.isPlainObject(val) ? Object.keys(val).length : 0;
  }

  private _dup(prior?: boolean, childPath?: string): DatabaseDeltaSnapshot {
    let dup = new DatabaseDeltaSnapshot();
    [dup._path, dup._authToken, dup._oldData, dup._change, dup._childPath, dup._newData] =
      [this._path, this._authToken, this._oldData, this._change, this._childPath, this._newData];

    if (prior) {
      dup._isPrior = true;
    }

    if (childPath) {
      dup._childPath = dup._childPath || "";
      dup._childPath += normalizePath(childPath);
    }

    return dup;
  }

  private _fullPath(): string {
    return this._path + (this._childPath || "");
  }
}
