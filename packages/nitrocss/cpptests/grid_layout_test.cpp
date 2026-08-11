// Standalone parity check for the native GridLayoutEngine vs. the JS grid.tsx
// oracle (templateOffset / templateSpanSize). NOT part of the pod/gradle build
// (cpptests/ is outside the cpp/** and ios/** globs). Run manually:
//   clang++ -std=c++20 -I ../cpp/grid grid_layout_test.cpp ../cpp/grid/GridLayoutEngine.cpp -o /tmp/grid_test && /tmp/grid_test
#include "GridLayoutEngine.hpp"
#include <cassert>
#include <cmath>
#include <cstdio>

using namespace nitrocss::grid;

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

  // Case 5: content-sized rows use each row's largest measured child.
  {
    GridInput in;
    in.width = 240;
    in.columns = {{TrackType::Fr, 1}, {TrackType::Fr, 1}};
    in.rows = {{TrackType::Auto, 0}};
    in.autoRow = {TrackType::Auto, 0};
    in.rowGap = 8;
    in.items = {{0, 1, 0, 1}, {0, 1, 0, 1}, {0, 1, 0, 1}};
    in.intrinsicHeights = {32, 48, 72};
    auto out = GridLayoutEngine::layout(in);
    check("c5 row0.h", out.items[0].height, 48);
    check("c5 row1.h", out.items[2].height, 72);
    check("c5 height", out.height, 128);
  }

  // Case 6: intrinsic auto columns expand from child measurements.
  {
    GridInput in;
    in.width = 300;
    in.columns = {{TrackType::Auto, 0}, {TrackType::Fr, 1}};
    in.rows = {{TrackType::Px, 40}};
    in.columnGap = 12;
    in.items = {{0, 1, 0, 1}, {0, 1, 0, 1}};
    in.intrinsicWidths = {84, 20};
    auto out = GridLayoutEngine::layout(in);
    check("c6 auto.w", out.items[0].width, 84);
    check("c6 fr.x", out.items[1].x, 96);
  }

  // Case 7: an intrinsic track respects its serialized minmax minimum.
  {
    GridInput in;
    in.width = 220;
    in.columns = {{TrackType::Auto, 80}, {TrackType::Fr, 1}};
    in.rows = {{TrackType::Auto, 40}};
    in.items = {{0, 1, 0, 1}, {0, 1, 0, 1}};
    in.intrinsicWidths = {32, 20};
    in.intrinsicHeights = {24, 60};
    auto out = GridLayoutEngine::layout(in);
    check("c7 auto minimum", out.items[0].width, 80);
    check("c7 row growth", out.items[0].height, 60);
  }

  // Case 8: percentage tracks resolve against the native content width.
  {
    GridInput in;
    in.width = 300;
    in.columns = {{TrackType::Percent, .4}, {TrackType::Percent, .6}};
    in.rows = {{TrackType::Px, 40}};
    in.items = {{0, 1, 0, 1}, {0, 1, 0, 1}};
    auto out = GridLayoutEngine::layout(in);
    check("c8 percent first", out.items[0].width, 120);
    check("c8 percent second", out.items[1].width, 180);
  }

  // Case 9: normal flow does not backfill holes; dense flow does.
  {
    GridInput in;
    in.width = 300;
    in.columns = {{TrackType::Fr, 1}, {TrackType::Fr, 1}, {TrackType::Fr, 1}};
    in.rows = {{TrackType::Px, 40}, {TrackType::Px, 40}};
    in.items = {{0, 2, 0, 1}, {0, 2, 0, 1}, {0, 1, 0, 1}};
    auto normal = GridLayoutEngine::layout(in);
    check("c9 normal row", normal.items[2].y, 40);
    in.dense = true;
    auto dense = GridLayoutEngine::layout(in);
    check("c9 dense hole", dense.items[2].y, 0);
    check("c9 dense column", dense.items[2].x, 200);
  }

  // Case 10: native alignment positions intrinsic content inside its grid area.
  {
    GridInput in;
    in.width = 200;
    in.columns = {{TrackType::Fr, 1}};
    in.rows = {{TrackType::Px, 100}};
    in.items = {{0, 1, 0, 1}};
    in.intrinsicWidths = {80};
    in.intrinsicHeights = {40};
    in.justifyItems = Alignment::Center;
    in.alignItems = Alignment::End;
    auto out = GridLayoutEngine::layout(in);
    check("c10 aligned x", out.items[0].x, 60);
    check("c10 aligned y", out.items[0].y, 60);
    check("c10 intrinsic width", out.items[0].width, 80);
    check("c10 intrinsic height", out.items[0].height, 40);
  }

  if (failures == 0) std::printf("\nALL PASS\n");
  else std::printf("\n%d FAILURES\n", failures);
  return failures == 0 ? 0 : 1;
}
