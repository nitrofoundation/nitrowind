"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ContainerProvider = void 0;
exports.useContainer = useContainer;
var _react = require("react");
var _container = require("../core/container.js");
var _native = require("../core/native.js");
const ContainerContext = /*#__PURE__*/(0, _react.createContext)({
  named: {}
});
const ContainerProvider = exports.ContainerProvider = ContainerContext.Provider;
/**
 * Wire container-query behavior for a nitrowind component:
 *
 * - When the className marks a container (`@container` / `@container/name`),
 *   register it, report its measured size via `onLayout`, and provide a context
 *   so descendant queries can resolve it.
 * - When the className has container queries (`@min-[230px]:…`,
 *   `[parent-w>230px]:…`), subscribe to the targeted container's size and return
 *   the merged style of the conditions that currently match.
 *
 * When the native engine is present the C++ `LayoutObserver` reads container
 * sizes straight off the shadow tree post-layout and commits the gated styles
 * with no re-render, so the JS measurement below is skipped entirely. The JS
 * path is the fallback only (web, Expo Go, tests, or before the native module is
 * linked), where it reports size via `onLayout` and re-renders on change.
 */
function useContainer(resolved, userOnLayout) {
  const parent = (0, _react.useContext)(ContainerContext);
  const id = (0, _react.useId)();
  const marker = resolved.container;
  const queries = resolved.containerQueries;
  // In native mode the LayoutObserver owns container queries; disable the JS
  // path so it stays a pure fallback and honors the no-re-render guarantee.
  const native = (0, _native.hasNativeEngine)();

  // --- Marker side: register the container + provide context. ---
  (0, _react.useEffect)(() => {
    if (native || !marker) return;
    (0, _container.registerContainer)(id, marker.name);
    return () => (0, _container.unregisterContainer)(id);
  }, [native, marker, id]);

  // Container size reporter (JS fallback only); `undefined` in native mode or
  // when this node isn't a container.
  const report = (0, _react.useMemo)(() => {
    if (native || !marker) return undefined;
    return event => {
      const {
        width,
        height
      } = event.nativeEvent.layout;
      (0, _container.setContainerSize)(id, {
        width,
        height
      });
    };
  }, [native, marker, id]);

  // Single `onLayout` for the host: the reporter merged with the consumer's own
  // handler so attaching ours never stomps theirs.
  const onLayout = (0, _react.useMemo)(() => {
    if (!report) return userOnLayout;
    if (!userOnLayout) return report;
    return event => {
      report(event);
      userOnLayout(event);
    };
  }, [report, userOnLayout]);
  const provider = (0, _react.useMemo)(() => {
    if (!marker) return undefined;
    return {
      nearestId: id,
      named: marker.name ? {
        ...parent.named,
        [marker.name]: id
      } : parent.named
    };
  }, [marker, id, parent.named]);

  // --- Query side: subscribe to the targeted container(s) + evaluate. ---
  const sizeFor = (0, _react.useCallback)(condition => {
    if (condition.name) {
      return (0, _container.getNamedContainerSize)(condition.name);
    }
    const cid = (0, _container.resolveContainerId)(condition, parent.nearestId, parent.named);
    return cid ? (0, _container.getContainerSize)(cid) : undefined;
  }, [parent.nearestId, parent.named]);
  const [containerStyle, setContainerStyle] = (0, _react.useState)(undefined);
  (0, _react.useEffect)(() => {
    if (native || !queries || queries.length === 0) {
      setContainerStyle(undefined);
      return;
    }
    const recompute = () => setContainerStyle((0, _container.evaluateContainerQueries)(queries, sizeFor));
    recompute();
    const ids = new Set();
    const names = new Set();
    for (const query of queries) {
      if (query.condition.name) {
        names.add(query.condition.name);
        continue;
      }
      const cid = (0, _container.resolveContainerId)(query.condition, parent.nearestId, parent.named);
      if (cid) ids.add(cid);
    }
    const unsubscribes = [...ids].map(cid => (0, _container.subscribeContainer)(cid, recompute));
    unsubscribes.push(...[...names].map(name => (0, _container.subscribeNamedContainer)(name, recompute)));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [native, queries, sizeFor, parent.nearestId, parent.named]);
  return {
    onLayout,
    containerStyle,
    provider
  };
}
//# sourceMappingURL=containerContext.js.map