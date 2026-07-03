#pragma once

#ifdef __cplusplus
#include <jsi/jsi.h>

namespace nitrolist {
/**
 * Install the `global.__nitrolist*` cold-path JSI channel on the JS runtime.
 * Idempotent per runtime. Called from the surface-presenter bootstrap (the
 * reliable bridgeless path) — NOT from a legacy `RCTBridgeModule setBridge:`,
 * which never fires in bridgeless RN.
 */
void installHostFunctions(facebook::jsi::Runtime &rt);
} // namespace nitrolist
#endif
