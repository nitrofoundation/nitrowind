#include "NativeEffects.hpp"

#include "../bgimage/BackgroundImageTargets.hpp"
#include "../clippath/ClipPathTargets.hpp"
#include "../gradient/GradientAngleOverrides.hpp"
#include "../gradient/GradientTargets.hpp"
#include "../mask/MaskTargets.hpp"
#include "../mask/MaskTransformOverrides.hpp"
#include "../scroll/ScrollTimelineTargets.hpp"

namespace nitrocss {

void NativeEffects::extract(Tag tag, folly::dynamic &style) {
  if (auto *gradient = style.get_ptr("--nitrocss-gradient");
      gradient != nullptr && gradient->isObject()) {
    if (tag != 0) {
      double radius = 0.0;
      if (auto *value = style.get_ptr("borderRadius");
          value != nullptr && value->isNumber()) {
        radius = value->asDouble();
      }
      if (gradient->get_ptr("inner") != nullptr) {
        folly::dynamic descriptor = *gradient;
        if (auto *width = style.get_ptr("borderWidth");
            width != nullptr && width->isNumber()) {
          descriptor["bw"] = width->asDouble();
        }
        GradientTargets::shared().setDescriptor(tag, descriptor, radius);
      } else {
        GradientTargets::shared().setDescriptor(tag, *gradient, radius);
      }
    }
    style.erase("--nitrocss-gradient");
  } else if (tag != 0) {
    GradientTargets::shared().clearDescriptor(tag);
  }

  if (auto *clipPath = style.get_ptr("--nitrocss-clip-path");
      clipPath != nullptr && clipPath->isObject()) {
    if (tag != 0)
      ClipPathTargets::shared().setDescriptor(tag, *clipPath);
    style.erase("--nitrocss-clip-path");
  } else if (tag != 0) {
    ClipPathTargets::shared().clearDescriptor(tag);
  }

  if (auto *background = style.get_ptr("--nitrocss-background-image");
      background != nullptr && background->isObject()) {
    const auto *type = background->get_ptr("type");
    const bool isNone = type != nullptr && type->isString() &&
        type->getString() == "none";
    if (tag != 0 && isNone)
      BackgroundImageTargets::shared().clearDescriptor(tag);
    else if (tag != 0)
      BackgroundImageTargets::shared().setDescriptor(tag, *background);
    style.erase("--nitrocss-background-image");
  } else if (tag != 0) {
    BackgroundImageTargets::shared().clearDescriptor(tag);
  }

  if (auto *mask = style.get_ptr("--nitrocss-mask");
      mask != nullptr && mask->isObject()) {
    const auto *source = mask->get_ptr("source");
    const auto *type = source != nullptr && source->isObject()
        ? source->get_ptr("type")
        : nullptr;
    const bool isNone = type != nullptr && type->isString() &&
        type->getString() == "none";
    if (tag != 0 && isNone)
      MaskTargets::shared().clearDescriptor(tag);
    else if (tag != 0)
      MaskTargets::shared().setDescriptor(tag, *mask);
    style.erase("--nitrocss-mask");
  } else if (tag != 0) {
    MaskTargets::shared().clearDescriptor(tag);
  }

  style.erase("--nitrocss-gradient-angle");
  style.erase("--nitrocss-mask-transform");

  if (auto *source = style.get_ptr("--nitrocss-scroll-timeline-source");
      source != nullptr && source->isObject()) {
    if (tag != 0)
      ScrollTimelineTargets::shared().setSource(tag, *source);
    style.erase("--nitrocss-scroll-timeline-source");
  } else if (tag != 0) {
    ScrollTimelineTargets::shared().clearSource(tag);
  }

  if (auto *animation = style.get_ptr("--nitrocss-scroll-timeline-animation");
      animation != nullptr && animation->isObject()) {
    if (tag != 0)
      ScrollTimelineTargets::shared().setAnimation(tag, *animation);
    style.erase("--nitrocss-scroll-timeline-animation");
  } else if (tag != 0) {
    ScrollTimelineTargets::shared().clearAnimation(tag);
  }
}

void NativeEffects::clear(Tag tag) {
  GradientTargets::shared().clearDescriptor(tag);
  ClipPathTargets::shared().clearDescriptor(tag);
  BackgroundImageTargets::shared().clearDescriptor(tag);
  MaskTargets::shared().clearDescriptor(tag);
  ScrollTimelineTargets::shared().clear(tag);
  GradientAngleOverrides::shared().clearAngle(tag);
  MaskTransformOverrides::shared().clearTransform(tag);
}

void NativeEffects::onMountTransaction() {
  GradientTargets::shared().onMountTransaction();
  ClipPathTargets::shared().onMountTransaction();
  BackgroundImageTargets::shared().onMountTransaction();
  MaskTargets::shared().onMountTransaction();
  ScrollTimelineTargets::shared().onMountTransaction();
  GradientAngleOverrides::shared().onMountTransaction();
  MaskTransformOverrides::shared().onMountTransaction();
}

void NativeEffects::resetForNewInstance() {
  GradientTargets::shared().resetForNewInstance();
  ClipPathTargets::shared().resetForNewInstance();
  BackgroundImageTargets::shared().resetForNewInstance();
  MaskTargets::shared().resetForNewInstance();
  ScrollTimelineTargets::shared().resetForNewInstance();
  GradientAngleOverrides::shared().resetForNewInstance();
  MaskTransformOverrides::shared().resetForNewInstance();
}

} // namespace nitrocss
