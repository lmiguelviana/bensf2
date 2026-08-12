#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

class BenSF2AudioProcessorEditor  : public juce::AudioProcessorEditor
{
public:
    BenSF2AudioProcessorEditor (BenSF2AudioProcessor&);
    ~BenSF2AudioProcessorEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    BenSF2AudioProcessor& audioProcessor;

#if JUCE_WEB_BROWSER
    juce::WebBrowserComponent webView;
#endif

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (BenSF2AudioProcessorEditor)
};
