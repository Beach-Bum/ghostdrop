cmake_minimum_required(VERSION 3.16)
project(GhostDropModulePlugin LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

include(GNUInstallDirs)

# ── Logos SDK roots ──────────────────────────────────────────────
set(LOGOS_LIBLOGOS_ROOT "$ENV{HOME}/logos-core-poc/logos-liblogos"
    CACHE PATH "logos-liblogos root")
set(LOGOS_CPP_SDK_ROOT  "$ENV{HOME}/logos-core-poc/logos-cpp-sdk"
    CACHE PATH "logos-cpp-sdk root")
set(LOGOS_APP_BUNDLE    "/Applications/LogosApp.app"
    CACHE PATH "Installed LogosApp bundle")

# ── Qt ────────────────────────────────────────────────────────────
set(CMAKE_PREFIX_PATH "/opt/homebrew/opt/qt@6")
find_package(Qt6 REQUIRED COMPONENTS Core Network Concurrent Gui)

# ── OpenSSL (from bundle) ─────────────────────────────────────────
set(OPENSSL_ROOT_DIR "${LOGOS_APP_BUNDLE}/Contents/Frameworks")
find_package(OpenSSL REQUIRED)

# ── Logos cpp-generator ───────────────────────────────────────────
set(CPP_GENERATOR "$ENV{HOME}/logos-core-poc/build/cpp-generator/bin/logos-cpp-generator")
set(METADATA_JSON "${CMAKE_CURRENT_SOURCE_DIR}/metadata.json")
set(PLUGINS_OUTPUT_DIR "${CMAKE_BINARY_DIR}/modules")

add_custom_target(run_cpp_generator_ghostdrop
    COMMAND "${CPP_GENERATOR}"
            --metadata "${METADATA_JSON}"
            --module-dir "${PLUGINS_OUTPUT_DIR}"
    WORKING_DIRECTORY "$ENV{HOME}/logos-core-poc"
    COMMENT "Running logos-cpp-generator for ghostdrop_module"
    VERBATIM
)

# ── Plugin sources ────────────────────────────────────────────────
add_library(ghostdrop_module_plugin SHARED
    ghostdrop_module_plugin.cpp
    ghostdrop_module_plugin.h
    ghostdrop_module_interface.h
    src/GhostDropCore.cpp
    src/GhostDropCore.h
    src/CryptoService.cpp
    src/CryptoService.h
    src/NetworkService.cpp
    src/NetworkService.h
    src/StripService.cpp
    src/StripService.h
    ${LOGOS_LIBLOGOS_ROOT}/interface.h
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api.h
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api_client.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api_client.h
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api_consumer.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api_provider.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/token_manager.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/module_proxy.cpp
)

set_target_properties(ghostdrop_module_plugin PROPERTIES PREFIX "")
add_dependencies(ghostdrop_module_plugin run_cpp_generator_ghostdrop)

target_link_libraries(ghostdrop_module_plugin PRIVATE
    Qt6::Core
    Qt6::Network
    Qt6::Concurrent
    Qt6::Gui
    OpenSSL::SSL
    OpenSSL::Crypto
    "${LOGOS_APP_BUNDLE}/Contents/Frameworks/liblogos_core.dylib"
)

target_include_directories(ghostdrop_module_plugin PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${LOGOS_LIBLOGOS_ROOT}
    ${LOGOS_CPP_SDK_ROOT}/cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/generated
    ${OPENSSL_INCLUDE_DIR}
)

set_target_properties(ghostdrop_module_plugin PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/modules"
    INSTALL_RPATH "@loader_path"
    BUILD_WITH_INSTALL_RPATH TRUE
)

add_custom_command(TARGET ghostdrop_module_plugin POST_BUILD
    COMMAND install_name_tool
        -id "@rpath/ghostdrop_module_plugin.dylib"
        $<TARGET_FILE:ghostdrop_module_plugin>
)

# Install into LogosApp.app
add_custom_target(deploy
    COMMAND cp $<TARGET_FILE:ghostdrop_module_plugin>
               "${LOGOS_APP_BUNDLE}/Contents/Frameworks/"
    DEPENDS ghostdrop_module_plugin
    COMMENT "Deploying ghostdrop_module_plugin to LogosApp.app"
)

install(TARGETS ghostdrop_module_plugin
    LIBRARY DESTINATION "${LOGOS_APP_BUNDLE}/Contents/Frameworks"
)
