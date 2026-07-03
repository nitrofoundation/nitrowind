// Standalone property test for the NitroList C++ core vs a naive O(n) oracle.
// NOT part of the pod/gradle build (cpptests/ is outside the globs). Run:
//   clang++ -std=c++20 -I ../cpp virtualizer_test.cpp -o /tmp/nl_test && /tmp/nl_test
#include "ViewportCuller.hpp"
#include "Virtualizer.hpp"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <vector>

using namespace nitrolist;

static int failures = 0;
static void check(const char* name, double got, double want) {
  if (std::abs(got - want) > 0.001) {
    std::printf("FAIL %s: got %.3f want %.3f\n", name, got, want);
    failures++;
  }
}
static void checkIdx(const char* name, std::size_t got, std::size_t want) {
  if (got != want) {
    std::printf("FAIL %s: got %zu want %zu\n", name, got, want);
    failures++;
  }
}

// Naive oracle over explicit sizes + gap.
struct Oracle {
  std::vector<double> sizes;
  double gap;
  double offset(std::size_t i) const {
    double o = 0;
    for (std::size_t k = 0; k < i && k < sizes.size(); ++k) o += sizes[k] + gap;
    return o;
  }
  double contentSize() const {
    double t = 0;
    for (double s : sizes) t += s + gap;
    return sizes.empty() ? 0.0 : t - gap;
  }
  std::size_t indexAt(double pos) const {
    if (sizes.empty()) return 0;
    if (pos <= 0) return 0;
    std::size_t ans = 0;
    for (std::size_t i = 0; i < sizes.size(); ++i)
      if (offset(i) <= pos) ans = i; else break;
    return ans;
  }
};

// Deterministic PRNG (Date.now/rand unavailable + reproducible).
static uint64_t s = 0x9e3779b97f4a7c15ull;
static uint64_t next() { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return s; }
static double frand(double lo, double hi) {
  return lo + (double)(next() % 100000) / 100000.0 * (hi - lo);
}

int main() {
  // Deterministic worked example: 5 items, gap 10.
  {
    Virtualizer v;
    v.reset(5, 100.0, 10.0);
    check("offset0", v.offset(0), 0);
    check("offset1", v.offset(1), 110);      // 100 + 10
    check("offset4", v.offset(4), 440);      // 4*(110)
    check("content", v.contentSize(), 540);  // 5*100 + 4*10
    v.setSize(2, 250.0);                      // item 2 grows by 150
    check("offset3 after grow", v.offset(3), 110 + 110 + 260); // 480
    check("content after grow", v.contentSize(), 690);
    checkIdx("indexAt 0", v.indexAt(0), 0);
    checkIdx("indexAt 109", v.indexAt(109), 0);
    checkIdx("indexAt 110", v.indexAt(110), 1);
    checkIdx("indexAt 5000", v.indexAt(5000), 4); // clamp to last
  }

  // Property test: random sizes/gaps vs oracle, incl. random size corrections.
  for (int trial = 0; trial < 400; ++trial) {
    const std::size_t n = 1 + (std::size_t)(next() % 200);
    const double gap = frand(0, 20);
    Virtualizer v;
    v.reset(n, 50.0, gap);
    Oracle o{std::vector<double>(n, 50.0), gap};
    // apply random corrections
    for (int c = 0; c < (int)n / 3; ++c) {
      std::size_t i = (std::size_t)(next() % n);
      double sz = frand(10, 300);
      v.setSize(i, sz);
      o.sizes[i] = sz;
    }
    for (std::size_t i = 0; i <= n; ++i)
      check("offset", v.offset(i), o.offset(i));
    check("content", v.contentSize(), o.contentSize());
    for (int q = 0; q < 30; ++q) {
      double pos = frand(-50, o.contentSize() + 100);
      checkIdx("indexAt", v.indexAt(pos), o.indexAt(pos));
    }
  }

  // ViewportCuller window + delta.
  {
    Virtualizer v;
    v.reset(100, 40.0, 0.0);  // 100 items × 40px = 4000px content
    ViewportCuller c;
    // viewport 400px at offset 800, prerender 0.5 → PV [600, 1400]
    Window w = c.update(v, 800, 400, 0.5);
    checkIdx("win.first", w.first, 15);  // 600/40
    checkIdx("win.last", w.last, 35);    // 1400/40
    if (!w.contains(20) || w.contains(10) || w.contains(40)) {
      std::printf("FAIL window.contains\n"); failures++;
    }
    // scroll to top → window starts at 0
    Window w2 = c.update(v, 0, 400, 0.5);
    checkIdx("top.first", w2.first, 0);
    if (!c.changed()) { std::printf("FAIL culler.changed\n"); failures++; }
  }

  if (failures == 0) std::printf("ALL NITROLIST CORE TESTS PASSED\n");
  else std::printf("%d FAILURES\n", failures);
  return failures ? 1 : 0;
}
