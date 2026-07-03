// Standalone test for the UI-thread ListEngine decision core. Run:
//   clang++ -std=c++20 -I ../cpp list_engine_test.cpp -o /tmp/nl_engine && /tmp/nl_engine
#include "ListEngine.hpp"
#include <algorithm>
#include <cstdio>
#include <vector>

using namespace nitrolist;

static int failures = 0;
static void checkIdx(const char* name, std::size_t got, std::size_t want) {
  if (got != want) {
    std::printf("FAIL %s: got %zu want %zu\n", name, got, want);
    failures++;
  }
}
static bool sameSet(std::vector<Tag> a, std::vector<Tag> b) {
  std::sort(a.begin(), a.end());
  std::sort(b.begin(), b.end());
  return a == b;
}
static void checkSet(const char* name, std::vector<Tag> got, std::vector<Tag> want) {
  if (!sameSet(got, want)) {
    std::printf("FAIL %s: got %zu tags, want %zu\n", name, got.size(), want.size());
    failures++;
  }
}
template <typename F>
static std::vector<Tag> range(int lo, int hi, F tagOf) {
  std::vector<Tag> v;
  for (int i = lo; i <= hi; ++i) v.push_back(tagOf(i));
  return v;
}

int main() {
  auto tagOf = [](int i) { return (Tag)(1000 + i); };

  ListEngine e;
  e.configure(/*count*/ 100, /*size*/ 40.0, /*gap*/ 0.0, /*prerender*/ 0.5);
  for (int i = 0; i < 100; ++i) e.setCellTag(i, tagOf(i));

  // First scroll to top: viewport 400, pad 200 → window [0, 15].
  {
    auto d = e.setViewport(0, 400);
    // From empty window: everything in [0,15] enters, nothing leaves.
    if (!d.changed) { std::printf("FAIL first tick not changed\n"); failures++; }
    checkIdx("top.first", e.window().first, 0);
    checkIdx("top.last", e.window().last, 15);
    checkSet("top toVisible", d.toVisible, range(0, 15, tagOf));
    checkSet("top toHidden", d.toHidden, {});
    checkSet("top visibleTags", e.visibleTags(), range(0, 15, tagOf));
  }

  // Scroll down to offset 800 → window [15, 35].
  {
    auto d = e.setViewport(800, 400);
    checkIdx("mid.first", e.window().first, 15);
    checkIdx("mid.last", e.window().last, 35);
    // 16..35 enter; 0..14 leave (15 stays in both).
    checkSet("mid toVisible", d.toVisible, range(16, 35, tagOf));
    checkSet("mid toHidden", d.toHidden, range(0, 14, tagOf));
  }

  // Same viewport again → no change, empty delta.
  {
    auto d = e.setViewport(800, 400);
    if (d.changed) { std::printf("FAIL steady tick reported change\n"); failures++; }
    checkSet("steady toVisible", d.toVisible, {});
    checkSet("steady toHidden", d.toHidden, {});
  }

  // Clamp at the end (offset way past content).
  {
    e.setViewport(1000000, 400);
    checkIdx("end.last", e.window().last, 99);
  }

  // Size correction shifts offsets: grow item 0 to 200 → contentSize +160.
  {
    double before = e.contentSize();
    e.setCellSize(0, 200.0);
    double after = e.contentSize();
    if (!(after > before + 159 && after < before + 161)) {
      std::printf("FAIL contentSize after grow: %.1f -> %.1f\n", before, after);
      failures++;
    }
  }

  if (failures == 0) std::printf("ALL LISTENGINE TESTS PASSED\n");
  else std::printf("%d FAILURES\n", failures);
  return failures ? 1 : 0;
}
