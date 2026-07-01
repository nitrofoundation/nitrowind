"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  compile: true,
  compileFromCss: true,
  serializeArtifact: true,
  compileCss: true,
  scanCandidates: true,
  parseContainerQuery: true,
  parseCustomContainerToken: true,
  applyCustomContainerTokens: true,
  containerMarkerFromDeclarations: true,
  isCustomContainerToken: true,
  parseStyles: true,
  classTokenFromSelector: true,
  extractThemes: true,
  toRNProperty: true,
  toRNValue: true,
  parseInsetValue: true,
  lengthToPx: true,
  INSETS_CSS: true,
  generateInsetsCss: true,
  PLATFORMS: true,
  PLATFORM_CSS: true,
  PLATFORM_MARKER: true,
  platformFromSelector: true
};
Object.defineProperty(exports, "INSETS_CSS", {
  enumerable: true,
  get: function () {
    return _insets.INSETS_CSS;
  }
});
Object.defineProperty(exports, "PLATFORMS", {
  enumerable: true,
  get: function () {
    return _platform.PLATFORMS;
  }
});
Object.defineProperty(exports, "PLATFORM_CSS", {
  enumerable: true,
  get: function () {
    return _platform.PLATFORM_CSS;
  }
});
Object.defineProperty(exports, "PLATFORM_MARKER", {
  enumerable: true,
  get: function () {
    return _platform.PLATFORM_MARKER;
  }
});
Object.defineProperty(exports, "applyCustomContainerTokens", {
  enumerable: true,
  get: function () {
    return _container.applyCustomContainerTokens;
  }
});
Object.defineProperty(exports, "classTokenFromSelector", {
  enumerable: true,
  get: function () {
    return _parseStyles.classTokenFromSelector;
  }
});
exports.compile = compile;
Object.defineProperty(exports, "compileCss", {
  enumerable: true,
  get: function () {
    return _compileCss.compileCss;
  }
});
exports.compileFromCss = compileFromCss;
Object.defineProperty(exports, "containerMarkerFromDeclarations", {
  enumerable: true,
  get: function () {
    return _container.containerMarkerFromDeclarations;
  }
});
Object.defineProperty(exports, "extractThemes", {
  enumerable: true,
  get: function () {
    return _themes.extractThemes;
  }
});
Object.defineProperty(exports, "generateInsetsCss", {
  enumerable: true,
  get: function () {
    return _insets.generateInsetsCss;
  }
});
Object.defineProperty(exports, "isCustomContainerToken", {
  enumerable: true,
  get: function () {
    return _container.isCustomContainerToken;
  }
});
Object.defineProperty(exports, "lengthToPx", {
  enumerable: true,
  get: function () {
    return _insetValue.lengthToPx;
  }
});
Object.defineProperty(exports, "parseContainerQuery", {
  enumerable: true,
  get: function () {
    return _container.parseContainerQuery;
  }
});
Object.defineProperty(exports, "parseCustomContainerToken", {
  enumerable: true,
  get: function () {
    return _container.parseCustomContainerToken;
  }
});
Object.defineProperty(exports, "parseInsetValue", {
  enumerable: true,
  get: function () {
    return _insetValue.parseInsetValue;
  }
});
Object.defineProperty(exports, "parseStyles", {
  enumerable: true,
  get: function () {
    return _parseStyles.parseStyles;
  }
});
Object.defineProperty(exports, "platformFromSelector", {
  enumerable: true,
  get: function () {
    return _platform.platformFromSelector;
  }
});
Object.defineProperty(exports, "scanCandidates", {
  enumerable: true,
  get: function () {
    return _compileCss.scanCandidates;
  }
});
exports.serializeArtifact = serializeArtifact;
Object.defineProperty(exports, "toRNProperty", {
  enumerable: true,
  get: function () {
    return _toRNValue.toRNProperty;
  }
});
Object.defineProperty(exports, "toRNValue", {
  enumerable: true,
  get: function () {
    return _toRNValue.toRNValue;
  }
});
var _compileCss = require("./compileCss.js");
var _container = require("./container.js");
var _parseStyles = require("./parseStyles.js");
var _themes = require("./themes.js");
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
var _toRNValue = require("./toRNValue.js");
var _insetValue = require("./insetValue.js");
var _insets = require("./insets.js");
var _platform = require("./platform.js");
/**
 * Compile a Tailwind stylesheet + the app's class usage into the nitrowind
 * runtime artifact (class → RN style buckets + dependency masks + themes).
 */
async function compile(options) {
  const rem = options.rem ?? 16;
  const candidates = (0, _compileCss.scanCandidates)(options);
  const css = await (0, _compileCss.compileCss)(options, candidates);
  const artifact = compileFromCss(css, rem);
  // Materialize the custom container syntax (`[parent-w>230px]:hidden`) by
  // cloning each base utility's compiled style under a container-gated bucket.
  (0, _container.applyCustomContainerTokens)(artifact, candidates, rem);
  return artifact;
}

/** Same as `compile`, but from already-built CSS (useful for tests). */
function compileFromCss(css, rem = 16) {
  const {
    themes,
    themeNames
  } = (0, _themes.extractThemes)(css);
  // Resolve `--spacing` (and other vars) from the base theme so safe-area
  // offset/floor amounts reduce to px at compile time.
  const baseVars = themes[themeNames[0] ?? "light"] ?? {};
  const resolveVar = name => baseVars[name] ?? (name === "--spacing" ? "0.25rem" : undefined) ?? (name === "--tw-border-style" ? "solid" : undefined);
  const {
    classes
  } = (0, _parseStyles.parseStyles)(css, rem, resolveVar);
  return {
    classes,
    themes,
    themeNames: themeNames.length > 0 ? themeNames : ["light"],
    rem
  };
}

/**
 * Serialize the artifact for shipping to the native engine
 * (`NitrowindConfig.setCompiledStyles`).
 */
function serializeArtifact(artifact) {
  return JSON.stringify(artifact);
}
//# sourceMappingURL=index.js.map