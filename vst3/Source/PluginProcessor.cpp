#include "PluginProcessor.h"
#include "PluginEditor.h"

BenSF2AudioProcessor::BenSF2AudioProcessor()
#ifndef JucePlugin_PreferredChannelConfigurations
     : AudioProcessor (BusesProperties()
                       #if ! JucePlugin_IsMidiEffect
                        #if JucePlugin_IsSynth
                         .withOutput ("Output", juce::AudioChannelSet::stereo(), true)
                        #else
                         .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                         .withOutput ("Output", juce::AudioChannelSet::stereo(), true)
                        #endif
                       #endif
                       ),
       parameters (*this, nullptr, juce::Identifier ("BenSF2Params"),
                   {
                       std::make_unique<juce::AudioParameterFloat> ("master_vol", "Volume Master", 0.0f, 1.0f, 0.8f),
                       std::make_unique<juce::AudioParameterFloat> ("cutoff", "Filtro Cutoff", 20.0f, 20000.0f, 20000.0f),
                       std::make_unique<juce::AudioParameterFloat> ("reverb", "Reverb Wet", 0.0f, 1.0f, 0.2f),
                       std::make_unique<juce::AudioParameterFloat> ("delay", "Delay Wet", 0.0f, 1.0f, 0.0f)
                   })
#endif
{
}

BenSF2AudioProcessor::~BenSF2AudioProcessor()
{
}

const juce::String BenSF2AudioProcessor::getName() const
{
    return JucePlugin_Name;
}

bool BenSF2AudioProcessor::acceptsMidi() const
{
   #if JucePlugin_WantsMidiInput
    return true;
   #else
    return false;
   #endif
}

bool BenSF2AudioProcessor::producesMidi() const
{
   #if JucePlugin_ProducesMidiOutput
    return true;
   #else
    return false;
   #endif
}

bool BenSF2AudioProcessor::isMidiEffect() const
{
   #if JucePlugin_IsMidiEffect
    return true;
   #else
    return false;
   #endif
}

double BenSF2AudioProcessor::getTailLengthSeconds() const
{
    return 0.0;
}

int BenSF2AudioProcessor::getNumPrograms()
{
    return 1;
}

int BenSF2AudioProcessor::getCurrentProgram()
{
    return 0;
}

void BenSF2AudioProcessor::setCurrentProgram (int index)
{
}

const juce::String BenSF2AudioProcessor::getProgramName (int index)
{
    return {};
}

void BenSF2AudioProcessor::changeProgramName (int index, const juce::String& newName)
{
}

void BenSF2AudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
}

void BenSF2AudioProcessor::releaseResources()
{
}

bool BenSF2AudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
     && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    return true;
}

void BenSF2AudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    auto totalNumInputChannels  = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear (i, 0, buffer.getNumSamples());
}

bool BenSF2AudioProcessor::hasEditor() const
{
    return true;
}

juce::AudioProcessorEditor* BenSF2AudioProcessor::createEditor()
{
    return new BenSF2AudioProcessorEditor (*this);
}

void BenSF2AudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
}

void BenSF2AudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new BenSF2AudioProcessor();
}
