cmake_minimum_required(VERSION 3.22.1)
project(Nitrolist)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(PACKAGE_NAME Nitrolist)

file(GLOB_RECURSE nitrolist_SOURCES CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/*.cpp"
)

add_library(${PACKAGE_NAME} SHARED ${nitrolist_SOURCES})

target_include_directories(${PACKAGE_NAME} PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/core"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp"
)

include("${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/Nitrolist+autolinking.cmake")

target_compile_options(${PACKAGE_NAME} PRIVATE -frtti -fexceptions -Wall -O2)