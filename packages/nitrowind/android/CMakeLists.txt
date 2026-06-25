cmake_minimum_required(VERSION 3.22.1)
project(Nitrowind)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(PACKAGE_NAME Nitrowind)

# Shared, cross-platform engine sources (the open-source native core).
file(GLOB_RECURSE nitrowind_SOURCES CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/*.cpp"
)

add_library(${PACKAGE_NAME} SHARED ${nitrowind_SOURCES})

target_include_directories(${PACKAGE_NAME} PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/core"
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/jsi"
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/registry"
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/fabric"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp"
)

# Pull in the Nitrogen-generated autolinking CMake (HybridObjects + headers,
# links React-jsi, fbjni, reactnative, folly, and NitroModules for us).
include("${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/Nitrowind+autolinking.cmake")

target_compile_options(${PACKAGE_NAME} PRIVATE -frtti -fexceptions -Wall -O2)
