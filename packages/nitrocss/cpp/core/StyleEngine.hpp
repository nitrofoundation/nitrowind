#pragma once

#include "NitroCssEngine.hpp"

namespace nitrowind {

// Backwards-compatible aliases for the engine now owned by the nitrocss package.
// The ABI intentionally stays the same for the rest of Nitrowind's native core.
using Dependency = nitrocss::Dependency;
using ContainerAxis = nitrocss::ContainerAxis;
using ContainerOp = nitrocss::ContainerOp;
using ContainerCondition = nitrocss::ContainerCondition;
using ResolveContext = nitrocss::ResolveContext;
using CompiledBucket = nitrocss::CompiledBucket;
using StyleEngine = nitrocss::NitroCssEngine;
using nitrocss::depFlag;

} // namespace nitrowind
