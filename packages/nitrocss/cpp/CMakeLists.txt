cmake_minimum_required(VERSION 3.22.1)
project(nitrocss)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(nitrocss STATIC
    NitroCssEngine.cpp
    css/CssColor.cpp
)

target_include_directories(nitrocss PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}"
)

target_compile_options(nitrocss PRIVATE -frtti -fexceptions -Wall -O2)
