#pragma once

#include <vector>

namespace nitrolist::layout {

struct ItemInput {
  int index{0};
  int span{1};
  bool fullSpan{false};
  double extent{0};
};

struct LayoutOptions {
  bool horizontal{false};
  bool grid{false};
  int crossAxisCount{1};
  double viewportWidth{0};
  double viewportHeight{0};
  double startInset{0};
  double endInset{0};
  double horizontalInset{0};
  double verticalInset{0};
  double rowGap{0};
  double columnGap{0};
};

struct ItemFrame {
  int index{0};
  double x{0};
  double y{0};
  double width{0};
  double height{0};
  double mainStart{0};
  double mainExtent{0};
};

struct LayoutResult {
  std::vector<ItemFrame> frames;
  double totalMainExtent{0};
  double contentWidth{0};
  double contentHeight{0};
};

struct ViewportRange {
  int renderStartIndex{0};
  int renderEndIndex{-1};
  int visibleStartIndex{0};
  int visibleEndIndex{-1};
};

class LayoutEngine {
 public:
  LayoutResult Layout(const std::vector<ItemInput>& items,
                      const LayoutOptions& options) const;
  ViewportRange RangeForViewport(const std::vector<ItemFrame>& frames,
                                 double viewportMainExtent,
                                 double scrollOffset,
                                 double overscanScreens) const;

 private:
  LayoutResult LayoutList(const std::vector<ItemInput>& items,
                          const LayoutOptions& options) const;
  LayoutResult LayoutGrid(const std::vector<ItemInput>& items,
                          const LayoutOptions& options) const;
};

}  // namespace nitrolist::layout