# ==============================================================================
# BENSF2 LIVE SAMPLER WORKSTATION - VST3 PLUGIN CMAKE BUILD CONFIGURATION
# ==============================================================================
cmake_minimum_required(VERSION 3.22)
project(BenSF2_VST3 VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Incluir o Framework JUCE 8 para compilação nativa VST3
add_subdirectory(JUCE)

juce_add_plugin(BenSF2
    COMPANY_NAME "LMiguelViana"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE LMV1
    PLUGIN_CODE BSF2
    FORMATS VST3 Standalone
    PRODUCT_NAME "BenSF2 Workstation VST3"
)

target_sources(BenSF2 PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
)

target_compile_definitions(BenSF2 PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(BenSF2 PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_plugin_client
    juce::juce_gui_extra
    DEPENDS juce::juce_recommended_config_flags
)
