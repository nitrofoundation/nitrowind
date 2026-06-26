import type React from "react";

import type {
  CreateOptions,
  NativeItemDescriptor,
  NativePatch,
} from "./NitroNativeListModule";

type HandleState = {
  items: NativeItemDescriptor[];
  opts: CreateOptions;
};

const templateIdByName = new Map<string, number>();
const templateComponentById = new Map<number, React.ComponentType<any>>();
const handleStates = new Map<number, HandleState>();
const handleListeners = new Map<number, Set<() => void>>();

let nextTemplateId = 1;

export function registerTemplate(
  name: string,
  component: React.ComponentType<any>,
): number {
  const templateId = templateIdByName.get(name) ?? nextTemplateId++;
  templateIdByName.set(name, templateId);
  templateComponentById.set(templateId, component);
  return templateId;
}

export function getTemplateId(templateName: string): number {
  const templateId = templateIdByName.get(templateName);
  if (templateId == null) {
    throw new Error(
      `NitroList template '${templateName}' is not registered. Call registerTemplates() first.`,
    );
  }
  return templateId;
}

export function getTemplateComponent(
  templateId: number,
): React.ComponentType<any> | null {
  return templateComponentById.get(templateId) ?? null;
}

export function setHandleState(
  handle: number,
  items: NativeItemDescriptor[],
  opts: CreateOptions,
): void {
  handleStates.set(handle, { items, opts });
  notifyHandle(handle);
}

export function updateHandleOptions(
  handle: number,
  opts: Partial<CreateOptions>,
): void {
  const state = handleStates.get(handle);
  if (state == null) {
    return;
  }
  state.opts = { ...state.opts, ...opts };
  notifyHandle(handle);
}

export function applyHandlePatch(handle: number, patch: NativePatch[]): void {
  const state = handleStates.get(handle);
  if (state == null) {
    return;
  }

  for (const op of patch) {
    if (op.op === "remove") {
      state.items.splice(op.index, 1);
      continue;
    }

    if (op.op === "insert") {
      state.items.splice(op.index, 0, op.item);
      continue;
    }

    state.items.splice(op.index, 1, op.item);
  }

  notifyHandle(handle);
}

export function getHandleState(handle: number): HandleState | null {
  return handleStates.get(handle) ?? null;
}

export function deleteHandleState(handle: number): void {
  handleStates.delete(handle);
  notifyHandle(handle);
}

export function subscribeHandle(
  handle: number,
  listener: () => void,
): () => void {
  let listeners = handleListeners.get(handle);
  if (listeners == null) {
    listeners = new Set();
    handleListeners.set(handle, listeners);
  }

  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      handleListeners.delete(handle);
    }
  };
}

function notifyHandle(handle: number): void {
  handleListeners.get(handle)?.forEach((listener) => listener());
}
