cmake_minimum_required(VERSION 3.22.1)
project(Nitrowind)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(PACKAGE_NAME Nitrowind)

# Resolve nitrocss like Node would, so native builds work with hoisted,
# non-hoisted, npm, Yarn, and pnpm node_modules layouts. Fall back to the
# monorepo sibling path for local source checkouts without node_modules.
execute_process(
    COMMAND node --print "require.resolve('nitrocss/package.json')"
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    OUTPUT_VARIABLE NITROCSS_PACKAGE_JSON
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)
if(NITROCSS_PACKAGE_JSON)
    get_filename_component(NITROCSS_PACKAGE_DIR "${NITROCSS_PACKAGE_JSON}" DIRECTORY)
    set(NITROCSS_CPP_DIR "${NITROCSS_PACKAGE_DIR}/cpp")
else()
    set(NITROCSS_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../nitrocss/cpp")
endif()

# Shared, cross-platform engine sources (the open-source native core).
file(GLOB_RECURSE nitrowind_SOURCES CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/*.cpp"
    "${NITROCSS_CPP_DIR}/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/*.cpp"
)

# The iOS podspec vendors a copy of nitrocss into ../cpp/nitrocss at
# pod-install time. If that copy exists on disk, the ../cpp glob above picks
# it up in addition to the real nitrocss sources, producing duplicate
# symbols. Android always compiles nitrocss from NITROCSS_CPP_DIR, so drop
# the vendored copy from the source list.
list(FILTER nitrowind_SOURCES EXCLUDE REGEX "nitrowind/cpp/nitrocss/")

add_library(${PACKAGE_NAME} SHARED ${nitrowind_SOURCES})

target_include_directories(${PACKAGE_NAME} PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/core"
    "${NITROCSS_CPP_DIR}"
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/jsi"
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/registry"
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/fabric"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp"
)

# Pull in the Nitrogen-generated autolinking CMake (HybridObjects + headers,
# links React-jsi, fbjni, reactnative, folly, and NitroModules for us).
include("${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/Nitrowind+autolinking.cmake")

target_compile_options(${PACKAGE_NAME} PRIVATE -frtti -fexceptions -Wall -O2)
