cmake_minimum_required(VERSION 3.16)
project(GhostDropUI LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

include(GNUInstallDirs)

# ── Paths ─────────────────────────────────────────────────────────
set(LOGOS_APP_BUNDLE    "/Applications/LogosApp.app"
    CACHE PATH "Installed LogosApp bundle")
set(LOGOS_APP_FRAMEWORKS "${LOGOS_APP_BUNDLE}/Contents/Frameworks")
set(LOGOS_LIBLOGOS_ROOT "$ENV{HOME}/logos-core-poc/logos-liblogos"
    CACHE PATH "logos-liblogos root")
set(LOGOS_CPP_SDK_ROOT  "$ENV{HOME}/logos-core-poc/logos-cpp-sdk"
    CACHE PATH "logos-cpp-sdk root")
set(LOGOS_APP_INTERFACES "$ENV{HOME}/logos-core-poc/logos-app-poc/interfaces"
    CACHE PATH "logos-app-poc/interfaces containing IComponent.h")

# ── Qt ────────────────────────────────────────────────────────────
set(CMAKE_PREFIX_PATH "/opt/homebrew/opt/qt@6")
find_package(Qt6 REQUIRED COMPONENTS
    Core Widgets Quick QuickWidgets Qml RemoteObjects Network)

# ── Bundle all QML files as Qt resources ─────────────────────────
qt_add_resources(QML_RESOURCES ghostdrop_ui_qml
    PREFIX "/ghostdrop"
    FILES
        src/GhostDropRoot.qml
        src/views/SourceView.qml
        src/views/OutletView.qml
        src/views/ReaderView.qml
        src/components/Components.qml
)

# ── Logos cpp-generator ───────────────────────────────────────────
set(CPP_GENERATOR "$ENV{HOME}/logos-core-poc/build/cpp-generator/bin/logos-cpp-generator")
set(METADATA_JSON "${CMAKE_CURRENT_SOURCE_DIR}/metadata.json")
set(PLUGINS_OUTPUT_DIR "${CMAKE_BINARY_DIR}/modules")

add_custom_target(run_cpp_generator_ghostdrop_ui
    COMMAND "${CPP_GENERATOR}"
            --metadata "${METADATA_JSON}"
            --module-dir "${PLUGINS_OUTPUT_DIR}"
    WORKING_DIRECTORY "$ENV{HOME}/logos-core-poc"
    COMMENT "Running logos-cpp-generator for ghostdrop_ui"
    VERBATIM
)

# ── UI plugin shared library ──────────────────────────────────────
add_library(ghostdrop_ui SHARED
    GhostDropUIComponent.cpp
    GhostDropUIComponent.h
    GhostDropBridge.cpp
    GhostDropBridge.h
    ${QML_RESOURCES}
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api.h
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api_client.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api_client.h
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api_consumer.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/logos_api_provider.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/token_manager.cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/module_proxy.cpp
)

set_target_properties(ghostdrop_ui PROPERTIES PREFIX "")
add_dependencies(ghostdrop_ui run_cpp_generator_ghostdrop_ui)

target_link_libraries(ghostdrop_ui PRIVATE
    Qt6::Core
    Qt6::Widgets
    Qt6::Quick
    Qt6::QuickWidgets
    Qt6::Qml
    Qt6::RemoteObjects
    Qt6::Network
    "${LOGOS_APP_FRAMEWORKS}/liblogos_core.dylib"
)

target_include_directories(ghostdrop_ui PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${LOGOS_APP_INTERFACES}
    ${LOGOS_LIBLOGOS_ROOT}
    ${LOGOS_CPP_SDK_ROOT}/cpp
    ${LOGOS_CPP_SDK_ROOT}/cpp/generated
)

set_target_properties(ghostdrop_ui PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
    INSTALL_RPATH "@loader_path/../lib;@loader_path"
    BUILD_WITH_INSTALL_RPATH TRUE
)

add_custom_command(TARGET ghostdrop_ui POST_BUILD
    COMMAND install_name_tool
        -id "@rpath/ghostdrop_ui.dylib"
        $<TARGET_FILE:ghostdrop_ui>
    COMMENT "Fixing install name"
)

# ── Deploy target ─────────────────────────────────────────────────
add_custom_target(deploy
    COMMAND cp $<TARGET_FILE:ghostdrop_ui>
               "${LOGOS_APP_FRAMEWORKS}/ghostdrop_ui.dylib"
    COMMAND echo "✓ Deployed ghostdrop_ui.dylib"
    DEPENDS ghostdrop_ui
    COMMENT "Deploying ghostdrop_ui to LogosApp.app"
)
