#pragma once

#include "HybridNitroCssDiagnosticsSpec.hpp"
#include "core/NitroCssCore.hpp"

#include <functional>
#include <string>
#include <vector>

namespace margelo::nitro::nitrocss {

/** Concrete `NitroCssDiagnostics` — optional debugging hooks. */
class HybridNitroCssDiagnostics : public HybridNitroCssDiagnosticsSpec {
public:
  HybridNitroCssDiagnostics() : HybridObject(TAG) {}

  void onShadowNodeRegistered(
      const std::function<void(double, const std::string&, double)>& listener) override {
    registered_ = listener;
  }

  void onShadowNodeUnregistered(
      const std::function<void(double, double)>& listener) override {
    unregistered_ = listener;
  }

  void onShadowTreeUpdate(
      const std::function<void(const std::vector<DiagnosticUpdate>&)>& listener) override {
    update_ = listener;
  }

  NativeDiagnosticsSnapshot getSnapshot() override {
    const auto snapshot = ::nitrocss::NitroCssCore::shared().diagnosticsSnapshot();
    return NativeDiagnosticsSnapshot(
        /* nativeAvailable */ true,
        static_cast<double>(snapshot.linkedNodes),
        static_cast<double>(snapshot.affectedNodes),
        static_cast<double>(snapshot.resolvedNodes),
        static_cast<double>(snapshot.skippedMutations),
        static_cast<double>(snapshot.committedMutations),
        snapshot.lastResolveDurationMs,
        snapshot.lastCommitDurationMs,
        snapshot.totalResolveDurationMs,
        snapshot.totalCommitDurationMs);
  }

  void reset() override {
    ::nitrocss::NitroCssCore::shared().resetDiagnostics();
  }

  // --- Engine-facing emitters ----------------------------------------------
  void emitRegistered(double tag, const std::string& className, double count) {
    if (registered_) registered_(tag, className, count);
  }
  void emitUnregistered(double tag, double count) {
    if (unregistered_) unregistered_(tag, count);
  }
  void emitUpdate(const std::vector<DiagnosticUpdate>& updates) {
    if (update_) update_(updates);
  }

private:
  std::function<void(double, const std::string&, double)> registered_;
  std::function<void(double, double)> unregistered_;
  std::function<void(const std::vector<DiagnosticUpdate>&)> update_;
};

} // namespace margelo::nitro::nitrocss
