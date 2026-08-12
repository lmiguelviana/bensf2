#include "PluginProcessor.h"
#include "PluginEditor.h"

BenSF2AudioProcessorEditor::BenSF2AudioProcessorEditor (BenSF2AudioProcessor& p)
    : AudioProcessorEditor (&p), audioProcessor (p)
{
    setSize (1240, 780);

#if JUCE_WEB_BROWSER
    addAndMakeVisible (webView);
    webView.goToURL ("http://127.0.0.1:8080/index.html");
#endif
}

BenSF2AudioProcessorEditor::~BenSF2AudioProcessorEditor()
{
}

void BenSF2AudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0x07, 0x09, 0x0e));
}

void BenSF2AudioProcessorEditor::resized()
{
#if JUCE_WEB_BROWSER
    webView.setBounds (getLocalBounds());
#endif
}
