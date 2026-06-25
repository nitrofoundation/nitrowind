#include <jni.h>

#include "NitrolistOnLoad.hpp"

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::nitrolist::initialize(vm);
}