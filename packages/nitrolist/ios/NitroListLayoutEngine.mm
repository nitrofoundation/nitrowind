#import "NitroListLayoutEngine.h"

#include "../cpp/list/NitroListLayoutEngine.hpp"

@implementation NitroListLayoutItem
@end

@implementation NitroListLayoutFrame
@end

@implementation NitroListLayoutResult
@end

@implementation NitroListRenderRange
@end

@implementation NitroListLayoutEngine

+ (NitroListLayoutResult *)layoutItems:(NSArray<NitroListLayoutItem *> *)items
                          viewportSize:(CGSize)viewportSize
                            horizontal:(BOOL)horizontal
                                  grid:(BOOL)grid
                        crossAxisCount:(NSInteger)crossAxisCount
                            startInset:(CGFloat)startInset
                              endInset:(CGFloat)endInset
                       horizontalInset:(CGFloat)horizontalInset
                         verticalInset:(CGFloat)verticalInset
                                rowGap:(CGFloat)rowGap
                             columnGap:(CGFloat)columnGap {
  std::vector<nitrolist::layout::ItemInput> nativeItems;
  nativeItems.reserve(items.count);
  for (NitroListLayoutItem *item in items) {
    nitrolist::layout::ItemInput input;
    input.index = static_cast<int>(item.index);
    input.span = static_cast<int>(item.span);
    input.fullSpan = item.fullSpan;
    input.extent = item.extent;
    nativeItems.push_back(input);
  }

  nitrolist::layout::LayoutOptions options;
  options.horizontal = horizontal;
  options.grid = grid;
  options.crossAxisCount = static_cast<int>(crossAxisCount);
  options.viewportWidth = viewportSize.width;
  options.viewportHeight = viewportSize.height;
  options.startInset = startInset;
  options.endInset = endInset;
  options.horizontalInset = horizontalInset;
  options.verticalInset = verticalInset;
  options.rowGap = rowGap;
  options.columnGap = columnGap;

  nitrolist::layout::LayoutEngine engine;
  const auto nativeResult = engine.Layout(nativeItems, options);

  NSMutableArray<NitroListLayoutFrame *> *frames = [NSMutableArray arrayWithCapacity:nativeResult.frames.size()];
  for (const auto &nativeFrame : nativeResult.frames) {
    NitroListLayoutFrame *frame = [NitroListLayoutFrame new];
    frame.index = nativeFrame.index;
    frame.frame = CGRectMake(nativeFrame.x, nativeFrame.y, nativeFrame.width, nativeFrame.height);
    frame.mainStart = nativeFrame.mainStart;
    frame.mainExtent = nativeFrame.mainExtent;
    [frames addObject:frame];
  }

  NitroListLayoutResult *result = [NitroListLayoutResult new];
  result.frames = frames;
  result.totalMainExtent = nativeResult.totalMainExtent;
  result.contentSize = CGSizeMake(nativeResult.contentWidth, nativeResult.contentHeight);
  return result;
}

+ (NitroListRenderRange *)rangeForFrames:(NSArray<NitroListLayoutFrame *> *)frames
                       viewportMainExtent:(CGFloat)viewportMainExtent
                             scrollOffset:(CGFloat)scrollOffset
                          overscanScreens:(CGFloat)overscanScreens {
  std::vector<nitrolist::layout::ItemFrame> nativeFrames;
  nativeFrames.reserve(frames.count);
  for (NitroListLayoutFrame *frame in frames) {
    nitrolist::layout::ItemFrame nativeFrame;
    nativeFrame.index = static_cast<int>(frame.index);
    nativeFrame.x = frame.frame.origin.x;
    nativeFrame.y = frame.frame.origin.y;
    nativeFrame.width = frame.frame.size.width;
    nativeFrame.height = frame.frame.size.height;
    nativeFrame.mainStart = frame.mainStart;
    nativeFrame.mainExtent = frame.mainExtent;
    nativeFrames.push_back(nativeFrame);
  }

  nitrolist::layout::LayoutEngine engine;
  const auto nativeRange = engine.RangeForViewport(
      nativeFrames,
      viewportMainExtent,
      scrollOffset,
      overscanScreens);

  NitroListRenderRange *range = [NitroListRenderRange new];
  range.renderStartIndex = nativeRange.renderStartIndex;
  range.renderEndIndex = nativeRange.renderEndIndex;
  range.visibleStartIndex = nativeRange.visibleStartIndex;
  range.visibleEndIndex = nativeRange.visibleEndIndex;
  return range;
}

@end