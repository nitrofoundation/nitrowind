#pragma once

#include <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#import <React/RCTUIKit.h>
#else
#import <UIKit/UIKit.h>
#define RCTPlatformView UIView
#define RCTPlatformImage UIImage
#define RCTUIColor UIColor
#define RCTUIGraphicsImageRenderer UIGraphicsImageRenderer
#define RCTUIGraphicsImageRendererContext UIGraphicsImageRendererContext
#define RCTUIGraphicsImageRendererFormat UIGraphicsImageRendererFormat
NS_INLINE CGImageRef UIImageGetCGImageRef(UIImage *image) {
  return image.CGImage;
}
#endif

NS_INLINE void NitroCssPrepareLayerBackedView(RCTPlatformView *view) {
#if TARGET_OS_OSX
  view.wantsLayer = YES;
#else
  (void)view;
#endif
}

NS_INLINE void NitroCssPathAddCurve(
    UIBezierPath *path,
    CGPoint point,
    CGPoint controlPoint1,
    CGPoint controlPoint2) {
#if TARGET_OS_OSX
  [path curveToPoint:point
       controlPoint1:controlPoint1
       controlPoint2:controlPoint2];
#else
  [path addCurveToPoint:point
          controlPoint1:controlPoint1
          controlPoint2:controlPoint2];
#endif
}

NS_INLINE void NitroCssPathAddLine(UIBezierPath *path, CGPoint point) {
#if TARGET_OS_OSX
  [path lineToPoint:point];
#else
  [path addLineToPoint:point];
#endif
}

NS_INLINE UIBezierPath *NitroCssRoundedPath(CGRect rect, CGFloat radius) {
#if TARGET_OS_OSX
  return [UIBezierPath bezierPathWithRoundedRect:rect
                                         xRadius:radius
                                         yRadius:radius];
#else
  return [UIBezierPath bezierPathWithRoundedRect:rect cornerRadius:radius];
#endif
}

NS_INLINE void NitroCssAppendPath(UIBezierPath *path, UIBezierPath *other) {
#if TARGET_OS_OSX
  [path appendBezierPath:other];
#else
  [path appendPath:other];
#endif
}

NS_INLINE void NitroCssUseEvenOddFill(UIBezierPath *path) {
#if TARGET_OS_OSX
  path.windingRule = NSWindingRuleEvenOdd;
#else
  path.usesEvenOddFillRule = YES;
#endif
}

NS_INLINE BOOL NitroCssGetRGBA(
    RCTUIColor *color,
    CGFloat *red,
    CGFloat *green,
    CGFloat *blue,
    CGFloat *alpha) {
#if TARGET_OS_OSX
  NSColor *rgb = [color colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
  if (rgb == nil) return NO;
  [rgb getRed:red green:green blue:blue alpha:alpha];
  return YES;
#else
  return [color getRed:red green:green blue:blue alpha:alpha];
#endif
}

NS_INLINE NSValue *NitroCssValueWithRect(CGRect rect) {
#if TARGET_OS_OSX
  return [NSValue valueWithRect:rect];
#else
  return [NSValue valueWithCGRect:rect];
#endif
}

NS_INLINE CGRect NitroCssRectValue(NSValue *value) {
#if TARGET_OS_OSX
  return value.rectValue;
#else
  return value.CGRectValue;
#endif
}
