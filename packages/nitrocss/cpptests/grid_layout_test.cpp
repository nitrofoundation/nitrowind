// Standalone parity check for the native GridLayoutEngine vs. the JS grid.tsx
// oracle (templateOffset / templateSpanSize). NOT part of the pod/gradle build
// (cpptests/ is outside the cpp/** and ios/** globs). Run manually:
//   clang++ -std=c++20 -I ../cpp/grid grid_layout_test.cpp ../cpp/grid/GridLayoutEngine.cpp -o /tmp/grid_test && /tmp/grid_test
#include "GridLayoutEngine.hpp"
#include <cassert>
#include <cmath>
#include <cstdio>

using namespace nitrowind::grid;

static int failures = 0;
static void check(const char* name, double got, double want) {
  if (std::abs(got - want) > 0.001) {
    std::printf("FAIL %s: got %.3f want %.3f\n", name, got, want);
    failures++;
  } else {
    std::printf("ok   %s = %.3f\n", name, got);
  }
}

int main() {
  // Case 1: three 1fr columns, width 300, columnGap 12. JS oracle:
  // frUnit = (300 - 24)/3 = 92. Offsets: col0=0, col1=104, col2=208.
  {
    GridInput in;
    in.width = 300;
    in.columns = {{TrackType::Fr, 1}, {TrackType::Fr, 1}, {TrackType::Fr, 1}};
    in.columnGap = 12;
    in.rows = {{TrackType::Px, 80}};
    in.rowGap = 10;
    // three auto-flow items, one per column
    in.items = {{0, 1, 0, 1}, {0, 1, 0, 1}, {0, 1, 0, 1}};
    auto out = GridLayoutEngine::layout(in);
    check("c1 item0.x", out.items[0].x, 0);
    check("c1 item1.x", out.items[1].x, 104);   // 92 + 12
    check("c1 item2.x", out.items[2].x, 208);   // 92 + 12 + 92 + 12
    check("c1 item0.w", out.items[0].width, 92);
    check("c1 height", out.height, 80);          // single row, no trailing gap
  }

  // Case 2: spanning item. col-span-2 at column 0.
  {
    GridInput in;
    in.width = 300;
    in.columns = {{TrackType::Fr, 1}, {TrackType::Fr, 1}, {TrackType::Fr, 1}};
    in.columnGap = 12;
    in.rows = {{TrackType::Px, 64}};
    in.items = {{0, 2, 0, 1}};
    auto out = GridLayoutEngine::layout(in);
    check("c2 span.x", out.items[0].x, 0);
    check("c2 span.w", out.items[0].width, 196);  // 92 + 12 + 92
  }

  // Case 3: multi-row height + row offsets. rows [80,80], rowGap 10.
  // Explicit placement: item at row 2 (1-based), col 1.
  {
    GridInput in;
    in.width = 300;
    in.columns = {{TrackType::Fr, 1}};
    in.rows = {{TrackType::Px, 80}, {TrackType::Px, 80}};
    in.rowGap = 10;
    in.items = {{1, 1, 2, 1}}; // 1-based col1 row2
    auto out = GridLayoutEngine::layout(in);
    check("c3 item.y", out.items[0].y, 90);   // 80 + 10
    check("c3 height", out.height, 170);       // 80 + 10 + 80
  }

  // Case 4: fixed + fr mix. cols [96px, 1fr, 2fr], width 300, gap 12.
  // free = 300 - 96 - 24 = 180; frUnit = 180/3 = 60. col widths: 96,60,120.
  // offsets: 0, 108, 180.
  {
    GridInput in;
    in.width = 300;
    in.columns = {{TrackType::Px, 96}, {TrackType::Fr, 1}, {TrackType::Fr, 2}};
    in.columnGap = 12;
    in.rows = {{TrackType::Px, 48}};
    in.items = {{0, 1, 0, 1}, {0, 1, 0, 1}, {0, 1, 0, 1}};
    auto out = GridLayoutEngine::layout(in);
    check("c4 col0.w", out.items[0].width, 96);
    check("c4 col1.w", out.items[1].width, 60);
    check("c4 col2.w", out.items[2].width, 120);
    check("c4 col1.x", out.items[1].x, 108);   // 96 + 12
    check("c4 col2.x", out.items[2].x, 180);    // 96 + 12 + 60 + 12
  }

  if (failures == 0) std::printf("\nALL PASS\n");
  else std::printf("\n%d FAILURES\n", failures);
  return failures == 0 ? 0 : 1;
}
