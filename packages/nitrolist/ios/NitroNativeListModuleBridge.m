#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NitroNativeListModule, NSObject)

RCT_EXTERN_METHOD(registerTemplates:(NSDictionary<NSString *, NSNumber *> *)map)

RCT_EXTERN_METHOD(createList:(NSArray<NSDictionary *> *)items
                  opts:(NSDictionary *)opts
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(update:(nonnull NSNumber *)handle patch:(NSArray<NSDictionary *> *)patch)

RCT_EXTERN_METHOD(scrollToIndex:(nonnull NSNumber *)handle index:(nonnull NSNumber *)index animated:(BOOL)animated)

RCT_EXTERN_METHOD(configureViewability:(nonnull NSNumber *)handle config:(NSDictionary *)config)

RCT_EXTERN_METHOD(configurePagination:(nonnull NSNumber *)handle config:(NSDictionary *)config)

RCT_EXTERN_METHOD(getViewability:(nonnull NSNumber *)handle
                  config:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPagination:(nonnull NSNumber *)handle
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(dispose:(nonnull NSNumber *)handle)

@end