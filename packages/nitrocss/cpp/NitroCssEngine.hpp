#pragma once

#include "NitroCssFolly.hpp"

#include <cstdint>
#include <folly/dynamic.h>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace nitrocss {

/** Bit positions mirror the `StyleDependency` enum in `src/compiler/types.ts` and NitroCss specs. */
enum class Dependency : uint32_t {
  Theme = 0,
  ColorScheme = 1,
  Dimensions = 2,
  Insets = 3,
  Orientation = 4,
  Rtl = 5,
  FontScale = 6,
  Rem = 7,
  ContainerSize = 8,
  GroupState = 9,
};

inline uint32_t depFlag(Dependency d) {
  return 1u << static_cast<uint32_t>(d);
}

enum class ContainerAxis : uint8_t { Width = 0, Height = 1 };
enum class ContainerOp : uint8_t { Gt, Lt, Ge, Le };

/**
 * A container-query condition gating a bucket. Thresholds are baked to px by the
 * compiler, so evaluation is a single numeric comparison against the measured
 * container size — no unit math.
 */
struct ContainerCondition {
  bool present = false;
  std::string name; // empty = nearest container
  ContainerAxis axis = ContainerAxis::Width;
  ContainerOp op = ContainerOp::Gt;
  double value = 0.0;
};

/** Context needed to resolve a class to concrete values. */
struct ResolveContext {
  std::string themeName;
  int colorScheme = 0; // ColorScheme: Light=0, Dark=1
  bool rtl = false;
  double rem = 16.0;
  double screenWidth = 0.0;
  double screenHeight = 0.0;
  double fontScale = 1.0;
  // Live safe-area insets, used to resolve `*-safe` dynamic values natively.
  double insetTop = 0.0;
  double insetRight = 0.0;
  double insetBottom = 0.0;
  double insetLeft = 0.0;
  // Measured size of this node's nearest enclosing container (container
  // queries). `hasContainer` is false until the container has been laid out.
  bool hasContainer = false;
  double containerWidth = 0.0;
  double containerHeight = 0.0;
  // Measured sizes of named ancestor containers (`@container/sidebar`).
  std::unordered_map<std::string, std::pair<double, double>> namedContainerSizes;
  bool isFocused = false;
  bool isActive = false;
  bool isDisabled = false;
  bool isHovered = false;
  bool isFirstChild = false;
  bool isLastChild = false;
  bool isGroupActive = false;
  bool isGroupFocused = false;
  bool isGroupHovered = false;
  bool isGroupDisabled = false;
};

/** A single compiled variant of a class. */
struct CompiledBucket {
  folly::dynamic style = folly::dynamic::object();
  uint32_t dependencies = 0;
  std::string variant = "base";
  // Platform variant (`ios`, `android`, `web`, `native`, …). Empty applies to
  // every platform. The platform is fixed for the lifetime of the process.
  std::string platform;
  // Container-query condition gating this bucket (when `present`).
  ContainerCondition container;
  // Set when this class turns its node into a queryable container.
  bool isContainerMarker = false;
  std::string containerName;
};

/**
 * Holds the compiled style tables (shipped from JS as JSON) and resolves a
 * `className` string into a `folly::dynamic` style object + a dependency mask.
 * This is the C++ counterpart of NitroCss's JS first-paint resolver.
 */
class NitroCssEngine {
public:
  /** Parse and install the compiled artifact (`{ classes, themes, … }`). */
  void setCompiledStyles(const std::string& json);

  void registerThemes(const std::vector<std::string>& names);
  void setTheme(const std::string& name);
  std::string currentTheme() const;
  bool hasTheme(const std::string& name) const;
  double rem() const;

  /** Union of every bucket's dependency mask for a class (variant-agnostic). */
  uint32_t dependencyMask(const std::string& className) const;

  /**
   * Whether a class marks its node as a queryable container, and (if so) its
   * name via `outName` (empty for an anonymous container).
   */
  bool resolveContainerMarker(const std::string& className,
                              std::string& outName) const;

  /** Whether a class marks its node as a group root (`group` / `group/name`). */
  bool resolveGroupMarker(const std::string& className,
                          std::string& outName) const;

  /**
   * Resolve a space-separated `className` into a merged style object for the
   * given context. `outMask` receives the union of contributing dependencies.
   */
  folly::dynamic resolve(const std::string& className,
                         const ResolveContext& ctx,
                         uint32_t& outMask) const;

private:
  /**
   * Immutable, platform-filtered composition of a complete className string.
   * Building this once avoids repeating tokenization and class-table lookups
   * for every runtime update of every node using the same class composition.
   */
  struct PreparedResolution {
    std::vector<CompiledBucket> buckets;
    uint32_t dependencyMask = 0;
    bool isContainerMarker = false;
    std::string containerName;
    bool isGroupMarker = false;
    std::string groupName;
  };

  struct FinalResolution {
    folly::dynamic style = folly::dynamic::object();
    uint32_t dependencyMask = 0;
  };

  std::shared_ptr<const PreparedResolution> prepareResolutionLocked(
      const std::string& className) const;
  std::shared_ptr<const folly::dynamic> prepareEffectiveVarsLocked(
      const ResolveContext& ctx) const;
  folly::dynamic effectiveVars(const ResolveContext& ctx) const;
  static bool variantApplies(const std::string& variant, const ResolveContext& ctx);
  /** Whether a bucket's platform variant applies on this build's OS. */
  static bool platformApplies(const std::string& platform);
  /** Evaluate a container condition against the measured size in `ctx`. */
  static bool containerMatches(const ContainerCondition& condition,
                               const ResolveContext& ctx);

  mutable std::mutex mutex_;
  std::unordered_map<std::string, std::vector<CompiledBucket>> classes_;
  std::unordered_map<std::string, folly::dynamic> themes_; // name -> { var: value }
  std::vector<std::string> themeNames_;
  std::string currentTheme_;
  double rem_ = 16.0;
  mutable std::unordered_map<std::string,
                             std::shared_ptr<const PreparedResolution>>
      resolutionCache_;
  mutable std::unordered_map<std::string,
                             std::shared_ptr<const folly::dynamic>>
      effectiveVarsCache_;
  mutable std::unordered_map<std::string,
                             std::shared_ptr<const FinalResolution>>
      finalResolutionCache_;
};

} // namespace nitrocss
