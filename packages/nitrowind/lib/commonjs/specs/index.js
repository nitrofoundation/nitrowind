"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  Config: true,
  Runtime: true,
  Registry: true,
  Platform: true,
  Diagnostics: true,
  createShadowNodeHandle: true,
  createFollyStyle: true
};
exports.createShadowNodeHandle = exports.createFollyStyle = exports.Runtime = exports.Registry = exports.Platform = exports.Diagnostics = exports.Config = void 0;
var _reactNativeNitroModules = require("react-native-nitro-modules");
require("./NativeTurboNitrowind.js");
var _types = require("./types.js");
Object.keys(_types).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _types[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _types[key];
    }
  });
});
/**
 * Singleton HybridObjects (created once).
 */
const Config = exports.Config = _reactNativeNitroModules.NitroModules.createHybridObject("NitrowindConfig");
const Runtime = exports.Runtime = _reactNativeNitroModules.NitroModules.createHybridObject("NitrowindRuntime");
const Registry = exports.Registry = _reactNativeNitroModules.NitroModules.createHybridObject("ShadowRegistry");
const Platform = exports.Platform = _reactNativeNitroModules.NitroModules.createHybridObject("NativePlatform");
const Diagnostics = exports.Diagnostics = _reactNativeNitroModules.NitroModules.createHybridObject("NitrowindDiagnostics");

/**
 * Per-instance HybridObjects (created on demand, one per linked node/style).
 */
const createShadowNodeHandle = () => _reactNativeNitroModules.NitroModules.createHybridObject("ShadowNodeHandle");
exports.createShadowNodeHandle = createShadowNodeHandle;
const createFollyStyle = () => _reactNativeNitroModules.NitroModules.createHybridObject("FollyStyle");
exports.createFollyStyle = createFollyStyle;
//# sourceMappingURL=index.js.map