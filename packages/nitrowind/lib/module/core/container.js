"use strict";

/** A container's measured content-box size in px. */

const byId = new Map();
const nameToId = new Map();
const byName = new Map();

/** Register a node as a queryable container (idempotent). */
export function registerContainer(id, name) {
  let entry = byId.get(id);
  if (!entry) {
    entry = {
      size: {
        width: 0,
        height: 0
      },
      listeners: new Set(),
      name
    };
    byId.set(id, entry);
  }
  const previousName = entry.name;
  if (previousName && previousName !== name && nameToId.get(previousName) === id) {
    nameToId.delete(previousName);
    notifyName(previousName);
  }
  entry.name = name;
  if (name) {
    nameToId.set(name, id);
    notifyName(name);
  }
}
export function unregisterContainer(id) {
  const entry = byId.get(id);
  if (entry?.name && nameToId.get(entry.name) === id) {
    nameToId.delete(entry.name);
    notifyName(entry.name);
  }
  byId.delete(id);
}

/** Update a container's size and notify subscribers if it changed. */
export function setContainerSize(id, size) {
  const entry = byId.get(id);
  if (!entry) return;
  if (entry.size.width === size.width && entry.size.height === size.height) {
    return;
  }
  entry.size = size;
  for (const listener of entry.listeners) listener(size);
  if (entry.name && nameToId.get(entry.name) === id) notifyName(entry.name);
}
export function getContainerSize(id) {
  return byId.get(id)?.size;
}
export function getNamedContainerSize(name) {
  const id = nameToId.get(name);
  return id ? getContainerSize(id) : undefined;
}
export function subscribeContainer(id, listener) {
  const entry = byId.get(id);
  if (!entry) return () => {};
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}
export function subscribeNamedContainer(name, listener) {
  let listeners = byName.get(name);
  if (!listeners) {
    listeners = new Set();
    byName.set(name, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) byName.delete(name);
  };
}
function notifyName(name) {
  const listeners = byName.get(name);
  if (!listeners) return;
  for (const listener of listeners) listener();
}

/**
 * Resolve which container an individual condition targets: a named condition
 * uses the matching ancestor, otherwise the nearest enclosing container.
 */
export function resolveContainerId(condition, nearestId, named) {
  return condition.name ? named[condition.name] ?? nameToId.get(condition.name) : nearestId;
}

/** Evaluate one condition against a measured size. */
export function matchesCondition(condition, size) {
  const v = condition.axis === "width" ? size.width : size.height;
  switch (condition.op) {
    case ">":
      return v > condition.value;
    case "<":
      return v < condition.value;
    case ">=":
      return v >= condition.value;
    case "<=":
      return v <= condition.value;
    default:
      return false;
  }
}

/**
 * Merge the styles of every container query whose condition currently matches.
 * `sizeFor` returns the live size of the container a condition targets.
 */
export function evaluateContainerQueries(queries, sizeFor) {
  const merged = {};
  for (const query of queries) {
    const size = sizeFor(query.condition);
    if (size && matchesCondition(query.condition, size)) {
      Object.assign(merged, query.style);
    }
  }
  return merged;
}
//# sourceMappingURL=container.js.map