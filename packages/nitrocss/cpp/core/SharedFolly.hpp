#pragma once

// `SharedFolly`/`makeFolly`/`mergeFolly` live in NitroCssFolly.hpp (the
// resolver engine's folly helper). This header used to carry its own copy
// while the engine lived in a sibling package under a different namespace;
// after the merge both copies share `namespace nitrocss`, so this file only
// forwards to the canonical definitions. The alias is referenced by the Nitro
// spec as `nitrocss::SharedFolly` (see `src/specs/types.ts`).
#include "../NitroCssFolly.hpp"
