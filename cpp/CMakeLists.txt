cmake_minimum_required(VERSION 3.15)
project(cortix VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Options
option(CORTIX_BUILD_EXAMPLES "Build example programs" ON)
option(CORTIX_BUILD_TESTS "Build tests" ON)
option(CORTIX_BUILD_WASM "Build WebAssembly module" OFF)

# Header-only library target
add_library(cortix INTERFACE)
target_include_directories(cortix INTERFACE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

# Emscripten/WASM build
if(EMSCRIPTEN OR CORTIX_BUILD_WASM)
    message(STATUS "Building Cortix WASM module")

    add_executable(cortix_wasm src/wasm_bindings.cpp)
    target_link_libraries(cortix_wasm PRIVATE cortix)

    set_target_properties(cortix_wasm PROPERTIES
        OUTPUT_NAME "cortix"
        SUFFIX ".js"
    )

    target_link_options(cortix_wasm PRIVATE
        -sEXPORT_ES6=1
        -sMODULARIZE=1
        -sEXPORT_NAME=createCortixModule
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=16777216
        "-sEXPORTED_FUNCTIONS=['_malloc','_free']"
        "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32']"
        --bind
        -O3
    )

    # Copy output to convenient location
    add_custom_command(TARGET cortix_wasm POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy
            $<TARGET_FILE:cortix_wasm>
            ${CMAKE_CURRENT_SOURCE_DIR}/dist/cortix.js
        COMMAND ${CMAKE_COMMAND} -E copy
            ${CMAKE_CURRENT_BINARY_DIR}/cortix.wasm
            ${CMAKE_CURRENT_SOURCE_DIR}/dist/cortix.wasm
        COMMENT "Copying WASM outputs to dist/"
    )
endif()

# Native examples (not built with Emscripten)
if(CORTIX_BUILD_EXAMPLES AND NOT EMSCRIPTEN)
    add_executable(cortix_example examples/basic_usage.cpp)
    target_link_libraries(cortix_example PRIVATE cortix)
endif()

# Tests (not built with Emscripten)
if(CORTIX_BUILD_TESTS AND NOT EMSCRIPTEN)
    enable_testing()
    add_executable(cortix_test test/test_scales.cpp)
    target_link_libraries(cortix_test PRIVATE cortix)
    add_test(NAME cortix_test COMMAND cortix_test)
endif()

# Installation
include(GNUInstallDirs)
install(TARGETS cortix
    EXPORT cortixTargets
    INCLUDES DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
)
install(DIRECTORY include/cortix
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
)
install(EXPORT cortixTargets
    FILE cortixConfig.cmake
    NAMESPACE cortix::
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/cortix
)
