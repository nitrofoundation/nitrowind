#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface NitroListLayoutItem : NSObject
@property (nonatomic, assign) NSInteger index;
@property (nonatomic, assign) NSInteger span;
@property (nonatomic, assign) BOOL fullSpan;
@property (nonatomic, assign) CGFloat extent;
@end

@interface NitroListLayoutFrame : NSObject
@property (nonatomic, assign) NSInteger index;
@property (nonatomic, assign) CGRect frame;
@property (nonatomic, assign) CGFloat mainStart;
@property (nonatomic, assign) CGFloat mainExtent;
@end

@interface NitroListLayoutResult : NSObject
@property (nonatomic, copy) NSArray<NitroListLayoutFrame *> *frames;
@property (nonatomic, assign) CGFloat totalMainExtent;
@property (nonatomic, assign) CGSize contentSize;
@end

@interface NitroListRenderRange : NSObject
@property (nonatomic, assign) NSInteger renderStartIndex;
@property (nonatomic, assign) NSInteger renderEndIndex;
@property (nonatomic, assign) NSInteger visibleStartIndex;
@property (nonatomic, assign) NSInteger visibleEndIndex;
@end

@interface NitroListLayoutEngine : NSObject
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
                             columnGap:(CGFloat)columnGap;
                      + (NitroListRenderRange *)rangeForFrames:(NSArray<NitroListLayoutFrame *> *)frames
                                 viewportMainExtent:(CGFloat)viewportMainExtent
                                   scrollOffset:(CGFloat)scrollOffset
                                overscanScreens:(CGFloat)overscanScreens;
@end

NS_ASSUME_NONNULL_END