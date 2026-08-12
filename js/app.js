/**
 * MASTER APPLICATION CONTROLLER
 * Liga a interface UI ao motor de síntese SF2, Mixer Console, Master FX, FX por Pista com Algoritmos de Reverb Valhalla DSP e Modal de Configurações.
 */

document.addEventListener('DOMContentLoaded', () => {
  const synth = new SynthEngine(window.audioEngine);
  window.synth = synth;

  const fxRack = new FxRackManager(window.audioEngine);
  fxRack.init();
  window.fxRack = fxRack;

  synth.attachFxRackToChannels(fxRack);

  const vuMeter = new VuMeterManager(window.audioEngine);
  window.vuMeter = vuMeter;

  const webMidi = new WebMidiManager(synth);
  window.webMidi = webMidi;

  // Gerenciador de Automação MIDI Learn (Botão Direito estilo Kontakt)
  const midiLearn = new MidiLearnManager(webMidi);
  midiLearn.init();
  window.midiLearn = midiLearn;

  const mixerConsole = new MixerConsoleManager(synth, vuMeter);
  mixerConsole.setMidiLearnManager(midiLearn);
  mixerConsole.setFxRackManager(fxRack);
  mixerConsole.init(document.getElementById('mixerContainer'));
  window.mixerConsole = mixerConsole;

  const presetManager = new PresetManager(synth, fxRack, mixerConsole);
  window.presetManager = presetManager;

  let baseOctave = 1;
  let totalKeysToRender = 88; // Padrão 88 teclas estilo Piano Completo

  // WebMIDI Manager com iluminação de teclas em tempo real quando o controlador físico toca
  const midiDeviceStatusText = document.getElementById('midiDeviceStatusText');
  const pianoKeysEl = document.getElementById('pianoKeys');

  webMidi.init((deviceName) => {
    if (midiDeviceStatusText) {
      midiDeviceStatusText.textContent = deviceName;
      midiDeviceStatusText.style.color = deviceName !== 'Nenhum' && deviceName !== 'Não Suportado' ? 'var(--accent-emerald)' : 'var(--accent-cyan)';
    }
  });

  // Instanciar Gerenciador de Configurações
  const settingsModal = new SettingsModalManager(window.audioEngine, webMidi, synth);
  settingsModal.init();
  window.settingsModal = settingsModal;

  // Pitch Bend & Mod Wheel Controles Físicos na Tela (Lado Esquerdo do Teclado)
  const pitchWheelInput = document.getElementById('pitchWheel');
  const modWheelInput = document.getElementById('modWheel');

  if (pitchWheelInput) {
    const resetPitch = () => {
      pitchWheelInput.value = 0;
      synth.setPitchBend('all', 0);
    };
    pitchWheelInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) * 2.0; // +/- 2 semitones
      synth.setPitchBend('all', val);
    });
    pitchWheelInput.addEventListener('mouseup', resetPitch);
    pitchWheelInput.addEventListener('touchend', resetPitch);

    midiLearn.attach(pitchWheelInput, 'Pitch Bend Wheel', (normVal) => {
      const bendVal = (normVal * 4.0) - 2.0;
      synth.setPitchBend('all', bendVal);
    });
  }

  if (modWheelInput) {
    modWheelInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      fxRack.setReverbMix(val * 0.5);
    });

    midiLearn.attach(modWheelInput, 'Modulation Wheel (CC1)', (normVal) => {
      fxRack.setReverbMix(normVal * 0.5);
    });
  }

  // Intercept NoteOn/NoteOff do Synth para iluminação visual do teclado
  const originalNoteOn = synth.noteOn.bind(synth);
  synth.noteOn = function(note, velocity, channel) {
    originalNoteOn(note, velocity, channel);
    if (pianoKeysEl) {
      const keyEl = pianoKeysEl.querySelector(`[data-note="${note}"]`);
      if (keyEl) keyEl.classList.add('active');
    }
  };

  const originalNoteOff = synth.noteOff.bind(synth);
  synth.noteOff = function(note, channel) {
    originalNoteOff(note, channel);
    if (pianoKeysEl) {
      const keyEl = pianoKeysEl.querySelector(`[data-note="${note}"]`);
      if (keyEl) keyEl.classList.remove('active');
    }
  };

  // Registrar Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      console.log('[PWA] Service Worker registrado com sucesso!');
    }).catch(err => console.log('[PWA] Falha ao registrar Service Worker:', err));
  }

  // Elementos do DOM
  const tabMixer = document.getElementById('tabMixer');
  const tabFxRack = document.getElementById('tabFxRack');
  const tabMidi = document.getElementById('tabMidi');

  const sectionMixer = document.getElementById('sectionMixer');
  const sectionFxRack = document.getElementById('sectionFxRack');
  const sectionMidiKeyboard = document.getElementById('sectionMidiKeyboard');

  const audioStatusDot = document.getElementById('audioStatusDot');
  const audioStatusText = document.getElementById('audioStatusText');
  const voiceCountDisplay = document.getElementById('voiceCountDisplay');
  const sf2DropZone = document.getElementById('sf2DropZone');
  const sf2FileInput = document.getElementById('sf2FileInput');
  const presetListEl = document.getElementById('presetList');
  const sf2PresetCount = document.getElementById('sf2PresetCount');

  const mixerChannelCountSelect = document.getElementById('mixerChannelCountSelect');
  const btnAddChannel = document.getElementById('btnAddChannel');

  const keyboardRangeSelect = document.getElementById('keyboardRangeSelect');
  const octaveDisplay = document.getElementById('octaveDisplay');
  const btnOctaveUp = document.getElementById('btnOctaveUp');
  const btnOctaveDown = document.getElementById('btnOctaveDown');

  const btnSavePreset = document.getElementById('btnSavePreset');
  const btnLoadPreset = document.getElementById('btnLoadPreset');
  const presetFileInput = document.getElementById('presetFileInput');
  const presetSelect = document.getElementById('presetSelect');

  const fxRackTitleEl = document.getElementById('fxRackTitleText');

  // Tab View Switcher
  function switchView(activeTab, showMixer, showFx, showMidi) {
    [tabMixer, tabFxRack, tabMidi].forEach(t => t && t.classList.remove('active'));
    if (activeTab) activeTab.classList.add('active');

    if (sectionMixer) sectionMixer.style.display = showMixer ? 'flex' : 'none';
    if (sectionFxRack) sectionFxRack.style.display = showFx ? 'block' : 'none';
    if (sectionMidiKeyboard) sectionMidiKeyboard.style.display = showMidi ? 'flex' : 'flex';
  }

  if (tabMixer) tabMixer.addEventListener('click', () => switchView(tabMixer, true, false, true));
  if (tabFxRack) tabFxRack.addEventListener('click', () => switchView(tabFxRack, false, true, true));
  if (tabMidi) tabMidi.addEventListener('click', () => switchView(tabMidi, true, true, true));

  // Seletor de Quantidade de Canais do Mixer (4, 8, 12, 16)
  if (mixerChannelCountSelect) {
    mixerChannelCountSelect.addEventListener('change', (e) => {
      mixerConsole.setVisibleChannelCount(e.target.value);
    });
  }

  if (btnAddChannel) {
    btnAddChannel.addEventListener('click', () => {
      mixerConsole.addChannel();
      if (mixerChannelCountSelect) {
        mixerChannelCountSelect.value = mixerConsole.totalChannels;
      }
    });
  }

  // 1. MASTER FX CONTROLS & ALGORITMOS VALHALLA
  const btnMasterEqToggle = document.getElementById('btnMasterEqToggle');
  if (btnMasterEqToggle) {
    btnMasterEqToggle.addEventListener('click', () => {
      const isAct = btnMasterEqToggle.classList.toggle('active');
      btnMasterEqToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleMasterEq(isAct);
    });
  }

  const btnMasterDelayToggle = document.getElementById('btnMasterDelayToggle');
  if (btnMasterDelayToggle) {
    btnMasterDelayToggle.addEventListener('click', () => {
      const isAct = btnMasterDelayToggle.classList.toggle('active');
      btnMasterDelayToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleMasterDelay(isAct);
    });
  }

  const btnMasterReverbToggle = document.getElementById('btnMasterReverbToggle');
  if (btnMasterReverbToggle) {
    btnMasterReverbToggle.addEventListener('click', () => {
      const isAct = btnMasterReverbToggle.classList.toggle('active');
      btnMasterReverbToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleMasterReverb(isAct);
    });
  }

  const selectMasterReverbMode = document.getElementById('selectMasterReverbMode');
  if (selectMasterReverbMode) {
    selectMasterReverbMode.addEventListener('change', (e) => {
      fxRack.setMasterReverbMode(e.target.value);
    });
  }

  const knobMasterLowEl = document.getElementById('knobMasterEqLow');
  if (knobMasterLowEl) {
    new RotaryKnob(knobMasterLowEl, {
      title: 'GRAVE', min: -12, max: 12, step: 0.5, value: 0, unit: 'dB',
      onChange: (val) => fxRack.setMasterEqLowGain(val)
    });
  }
  const knobMasterMidEl = document.getElementById('knobMasterEqMid');
  if (knobMasterMidEl) {
    new RotaryKnob(knobMasterMidEl, {
      title: 'MÉDIO', min: -12, max: 12, step: 0.5, value: 0, unit: 'dB',
      onChange: (val) => fxRack.setMasterEqMidGain(val)
    });
  }
  const knobMasterHighEl = document.getElementById('knobMasterEqHigh');
  if (knobMasterHighEl) {
    new RotaryKnob(knobMasterHighEl, {
      title: 'AGUDO', min: -12, max: 12, step: 0.5, value: 0, unit: 'dB',
      onChange: (val) => fxRack.setMasterEqHighGain(val)
    });
  }

  const knobMasterDelayTimeEl = document.getElementById('knobMasterDelayTime');
  if (knobMasterDelayTimeEl) {
    new RotaryKnob(knobMasterDelayTimeEl, {
      title: 'TEMPO', min: 50, max: 1000, step: 10, value: 300, unit: 'ms',
      onChange: (val) => fxRack.setMasterDelayTime(val / 1000.0)
    });
  }
  const knobMasterDelayMixEl = document.getElementById('knobMasterDelayMix');
  if (knobMasterDelayMixEl) {
    new RotaryKnob(knobMasterDelayMixEl, {
      title: 'MISTURA', min: 0, max: 100, step: 1, value: 20, unit: '%',
      onChange: (val) => fxRack.setMasterDelayMix(val / 100.0)
    });
  }

  const knobMasterReverbSizeEl = document.getElementById('knobMasterReverbSize');
  if (knobMasterReverbSizeEl) {
    new RotaryKnob(knobMasterReverbSizeEl, {
      title: 'SALA', min: 10, max: 100, step: 1, value: 40, unit: '%',
      onChange: (val) => fxRack.setMasterReverbSize(val / 100.0)
    });
  }
  const knobMasterReverbMixEl = document.getElementById('knobMasterReverbMix');
  if (knobMasterReverbMixEl) {
    new RotaryKnob(knobMasterReverbMixEl, {
      title: 'MISTURA', min: 0, max: 100, step: 1, value: 25, unit: '%',
      onChange: (val) => fxRack.setMasterReverbMix(val / 100.0)
    });
  }

  // 2. PER-TRACK FX CONTROLS & ALGORITMOS VALHALLA
  const btnTrackEqToggle = document.getElementById('btnTrackEqToggle');
  if (btnTrackEqToggle) {
    btnTrackEqToggle.addEventListener('click', () => {
      const isAct = btnTrackEqToggle.classList.toggle('active');
      btnTrackEqToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleTrackEq(isAct);
    });
  }

  const btnTrackDelayToggle = document.getElementById('btnTrackDelayToggle');
  if (btnTrackDelayToggle) {
    btnTrackDelayToggle.addEventListener('click', () => {
      const isAct = btnTrackDelayToggle.classList.toggle('active');
      btnTrackDelayToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleTrackDelay(isAct);
    });
  }

  const btnTrackReverbToggle = document.getElementById('btnTrackReverbToggle');
  if (btnTrackReverbToggle) {
    btnTrackReverbToggle.addEventListener('click', () => {
      const isAct = btnTrackReverbToggle.classList.toggle('active');
      btnTrackReverbToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleTrackReverb(isAct);
    });
  }

  const selectTrackReverbMode = document.getElementById('selectTrackReverbMode');
  if (selectTrackReverbMode) {
    selectTrackReverbMode.addEventListener('change', (e) => {
      fxRack.setTrackReverbMode(e.target.value);
    });
  }

  let knobTrackEqLow, knobTrackEqMid, knobTrackEqHigh, knobTrackDelayTime, knobTrackDelayMix, knobTrackReverbSize, knobTrackReverbMix;

  const knobTrackLowEl = document.getElementById('knobTrackEqLow');
  if (knobTrackLowEl) {
    knobTrackEqLow = new RotaryKnob(knobTrackLowEl, {
      title: 'GRAVE', min: -12, max: 12, step: 0.5, value: 0, unit: 'dB',
      onChange: (val) => fxRack.setEqLowGain(val)
    });
    midiLearn.attach(knobTrackLowEl, 'EQ Grave Pista', (normVal) => {
      const dbVal = (normVal * 24.0) - 12.0;
      fxRack.setEqLowGain(dbVal);
      if (knobTrackEqLow) knobTrackEqLow.setValue(dbVal);
    });
  }

  const knobTrackMidEl = document.getElementById('knobTrackEqMid');
  if (knobTrackMidEl) {
    knobTrackEqMid = new RotaryKnob(knobTrackMidEl, {
      title: 'MÉDIO', min: -12, max: 12, step: 0.5, value: 0, unit: 'dB',
      onChange: (val) => fxRack.setEqMidGain(val)
    });
    midiLearn.attach(knobTrackMidEl, 'EQ Médio Pista', (normVal) => {
      const dbVal = (normVal * 24.0) - 12.0;
      fxRack.setEqMidGain(dbVal);
      if (knobTrackEqMid) knobTrackEqMid.setValue(dbVal);
    });
  }

  const knobTrackHighEl = document.getElementById('knobTrackEqHigh');
  if (knobTrackHighEl) {
    knobTrackEqHigh = new RotaryKnob(knobTrackHighEl, {
      title: 'AGUDO', min: -12, max: 12, step: 0.5, value: 0, unit: 'dB',
      onChange: (val) => fxRack.setEqHighGain(val)
    });
    midiLearn.attach(knobTrackHighEl, 'EQ Agudo Pista', (normVal) => {
      const dbVal = (normVal * 24.0) - 12.0;
      fxRack.setEqHighGain(dbVal);
      if (knobTrackEqHigh) knobTrackEqHigh.setValue(dbVal);
    });
  }

  const knobTrackDelayTimeEl = document.getElementById('knobTrackDelayTime');
  if (knobTrackDelayTimeEl) {
    knobTrackDelayTime = new RotaryKnob(knobTrackDelayTimeEl, {
      title: 'TEMPO', min: 50, max: 1000, step: 10, value: 300, unit: 'ms',
      onChange: (val) => fxRack.setDelayTime(val / 1000.0)
    });
  }

  const knobTrackDelayMixEl = document.getElementById('knobTrackDelayMix');
  if (knobTrackDelayMixEl) {
    knobTrackDelayMix = new RotaryKnob(knobTrackDelayMixEl, {
      title: 'MISTURA', min: 0, max: 100, step: 1, value: 20, unit: '%',
      onChange: (val) => fxRack.setDelayMix(val / 100.0)
    });
  }

  const knobTrackReverbSizeEl = document.getElementById('knobTrackReverbSize');
  if (knobTrackReverbSizeEl) {
    knobTrackReverbSize = new RotaryKnob(knobTrackReverbSizeEl, {
      title: 'SALA', min: 10, max: 100, step: 1, value: 40, unit: '%',
      onChange: (val) => fxRack.setReverbSize(val / 100.0)
    });
  }

  const knobTrackReverbMixEl = document.getElementById('knobTrackReverbMix');
  if (knobTrackReverbMixEl) {
    knobTrackReverbMix = new RotaryKnob(knobTrackReverbMixEl, {
      title: 'MISTURA', min: 0, max: 100, step: 1, value: 25, unit: '%',
      onChange: (val) => fxRack.setReverbMix(val / 100.0)
    });
  }

  // Atualizar Knobs, Toggles e Modo Reverb da pista individual ao trocar de canal no Mixer!
  fxRack.onSelectionChange((ch, params) => {
    const chName = synth.channels[ch] ? synth.channels[ch].name : `CH ${ch < 10 ? '0' + ch : ch}`;
    if (fxRackTitleEl) {
      fxRackTitleEl.textContent = `EFEITOS DA PISTA - ${chName.toUpperCase()}`;
    }

    if (btnTrackEqToggle) {
      btnTrackEqToggle.classList.toggle('active', params.eqEnabled !== false);
      btnTrackEqToggle.textContent = params.eqEnabled !== false ? 'ON' : 'OFF';
    }
    if (btnTrackDelayToggle) {
      btnTrackDelayToggle.classList.toggle('active', params.delayEnabled !== false);
      btnTrackDelayToggle.textContent = params.delayEnabled !== false ? 'ON' : 'OFF';
    }
    if (btnTrackReverbToggle) {
      btnTrackReverbToggle.classList.toggle('active', params.reverbEnabled !== false);
      btnTrackReverbToggle.textContent = params.reverbEnabled !== false ? 'ON' : 'OFF';
    }

    if (selectTrackReverbMode) {
      selectTrackReverbMode.value = params.reverbMode || 'concert_hall';
    }

    if (knobTrackEqLow) knobTrackEqLow.setValue(params.eqLow);
    if (knobTrackEqMid) knobTrackEqMid.setValue(params.eqMid);
    if (knobTrackEqHigh) knobTrackEqHigh.setValue(params.eqHigh);
    if (knobTrackDelayTime) knobTrackDelayTime.setValue(params.delayTime);
    if (knobTrackDelayMix) knobTrackDelayMix.setValue(params.delayMix);
    if (knobTrackReverbSize) knobTrackReverbSize.setValue(params.reverbSize);
    if (knobTrackReverbMix) knobTrackReverbMix.setValue(params.reverbMix);
  });

  // Preset Manager Binds
  if (btnSavePreset) {
    btnSavePreset.addEventListener('click', () => {
      presetManager.savePreset();
    });
  }

  if (btnLoadPreset && presetFileInput) {
    btnLoadPreset.addEventListener('click', () => presetFileInput.click());
    presetFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        presetManager.importPresetFromJsonFile(e.target.files[0]);
      }
    });
  }

  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const selectedVal = e.target.value;
      if (presetManager.factoryPresets.has(selectedVal)) {
        presetManager.loadPreset(presetManager.factoryPresets.get(selectedVal));
      } else if (presetManager.userPresets.has(selectedVal)) {
        presetManager.loadPreset(presetManager.userPresets.get(selectedVal));
      }
    });
  }

  // Seletor de Extensão de Teclado (24, 61, 88 teclas)
  if (keyboardRangeSelect) {
    keyboardRangeSelect.addEventListener('change', (e) => {
      totalKeysToRender = parseInt(e.target.value, 10) || 88;
      renderPianoKeyboard();
    });
  }

  // Renderizar Teclado Virtual Piano com Proporções Piano Real Slender
  function renderPianoKeyboard() {
    pianoKeysEl.innerHTML = '';
    const startNote = totalKeysToRender === 88 ? 21 : baseOctave * 12;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    let whiteCount = 0;
    for (let i = 0; i < totalKeysToRender; i++) {
      const noteNum = startNote + i;
      if (noteNum > 108) break;
      if (!noteNames[noteNum % 12].includes('#')) whiteCount++;
    }

    const blackWidthPct = (100.0 / whiteCount) * 0.62;
    const blackMarginPct = (100.0 / whiteCount) * 0.31;

    for (let i = 0; i < totalKeysToRender; i++) {
      const noteNum = startNote + i;
      if (noteNum > 108) break;

      const noteName = noteNames[noteNum % 12];
      const isBlack = noteName.includes('#');

      const keyEl = document.createElement('div');
      keyEl.className = `piano-key ${isBlack ? 'black' : 'white'}`;
      keyEl.dataset.note = noteNum;

      if (isBlack) {
        keyEl.style.width = `${blackWidthPct}%`;
        keyEl.style.marginLeft = `-${blackMarginPct}%`;
        keyEl.style.marginRight = `-${blackMarginPct}%`;
      } else {
        if (noteName === 'C') {
          const label = document.createElement('span');
          label.className = 'key-label';
          label.textContent = `${Math.floor(noteNum / 12) - 1}`;
          keyEl.appendChild(label);
        }
      }

      const triggerNoteOn = (e) => {
        e.preventDefault();
        window.audioEngine.resume().then(() => updateAudioStatus(true));
        keyEl.classList.add('active');
        synth.noteOn(noteNum, 100, 1);
      };

      const triggerNoteOff = (e) => {
        e.preventDefault();
        keyEl.classList.remove('active');
        synth.noteOff(noteNum, 1);
      };

      keyEl.addEventListener('mousedown', triggerNoteOn);
      keyEl.addEventListener('mouseup', triggerNoteOff);
      keyEl.addEventListener('mouseleave', triggerNoteOff);

      keyEl.addEventListener('touchstart', triggerNoteOn, { passive: false });
      keyEl.addEventListener('touchend', triggerNoteOff, { passive: false });

      pianoKeysEl.appendChild(keyEl);
    }

    const endOctave = Math.floor((startNote + totalKeysToRender) / 12) - 1;
    if (octaveDisplay) {
      octaveDisplay.textContent = `C${Math.floor(startNote / 12) - 1} - C${endOctave}`;
    }
  }

  renderPianoKeyboard();

  btnOctaveUp.addEventListener('click', () => {
    if (baseOctave < 7) {
      baseOctave++;
      renderPianoKeyboard();
    }
  });

  btnOctaveDown.addEventListener('click', () => {
    if (baseOctave > 1) {
      baseOctave--;
      renderPianoKeyboard();
    }
  });

  // Mapeamento de Teclado QWERTY
  const qwertyKeyMap = {
    'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5,
    't': 6, 'g': 7, 'y': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12
  };

  const activeQwertyKeys = new Set();
  let isMasterMuted = false;

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      presetManager.savePreset();
      return;
    }

    if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const key = e.key.toLowerCase();

    if (key === 'z') {
      if (baseOctave > 1) {
        baseOctave--;
        renderPianoKeyboard();
      }
      return;
    }
    if (key === 'x') {
      if (baseOctave < 7) {
        baseOctave++;
        renderPianoKeyboard();
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      isMasterMuted = !isMasterMuted;
      window.audioEngine.setMasterVolume(isMasterMuted ? 0 : 0.8);
      console.log(`[QWERTY] Master Mute: ${isMasterMuted}`);
      return;
    }

    if (key in qwertyKeyMap && !activeQwertyKeys.has(key)) {
      activeQwertyKeys.add(key);
      const noteNum = (baseOctave * 12) + qwertyKeyMap[key];
      
      window.audioEngine.resume().then(() => updateAudioStatus(true));
      synth.noteOn(noteNum, 100, 1);
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in qwertyKeyMap) {
      activeQwertyKeys.delete(key);
      const noteNum = (baseOctave * 12) + qwertyKeyMap[key];
      synth.noteOff(noteNum, 1);
    }
  });

  // Upload & Drag-and-Drop de Arquivos SF2
  sf2DropZone.addEventListener('click', () => sf2FileInput.click());

  sf2DropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    sf2DropZone.style.borderColor = 'var(--accent-cyan)';
  });

  sf2DropZone.addEventListener('dragleave', () => {
    sf2DropZone.style.borderColor = '';
  });

  sf2DropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    sf2DropZone.style.borderColor = '';
    if (e.dataTransfer.files.length > 0) {
      handleSf2File(e.dataTransfer.files[0]);
    }
  });

  sf2FileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleSf2File(e.target.files[0]);
    }
  });

  function handleSf2File(file) {
    if (!file.name.toLowerCase().endsWith('.sf2')) {
      alert('Por favor, selecione um arquivo válido com extensão .sf2');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arrayBuffer = evt.target.result;
        const parser = new SoundFont2Parser(arrayBuffer);
        const parsedData = parser.parse();

        synth.loadSoundFont(parsedData);
        updatePresetListUI(parsedData.presets);

        mixerConsole.renderMixer();

        alert(`SoundFont "${file.name}" carregado com sucesso! Timbres prontos para atribuir às pistas.`);
      } catch (err) {
        console.error('Erro ao ler arquivo SF2:', err);
        alert('Erro ao processar o arquivo SF2: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function updatePresetListUI(presets) {
    presetListEl.innerHTML = '';
    sf2PresetCount.textContent = `${presets.length} Timbres`;

    presets.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = `preset-item ${idx === 0 ? 'active' : ''}`;
      item.innerHTML = `
        <span>${p.name}</span>
        <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">${p.bank}:${p.preset}</span>
      `;
      item.addEventListener('click', () => {
        presetListEl.querySelectorAll('.preset-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        console.log(`[UI] Preset selecionado: ${p.name}`);
      });
      presetListEl.appendChild(item);
    });
  }

  // Monitor de Áudio e Vozes Polifônicas
  function updateAudioStatus(active) {
    if (active) {
      audioStatusDot.classList.add('active');
      audioStatusText.textContent = 'Áudio: Ativo';
    }
  }

  setInterval(() => {
    if (voiceCountDisplay) {
      voiceCountDisplay.textContent = `${synth.getActiveVoicesCount()} / ${synth.isAutoPolyphony ? 'Auto (' + synth.maxPolyphony + ')' : synth.maxPolyphony}`;
    }
  }, 200);

  document.body.addEventListener('click', () => {
    window.audioEngine.resume().then(() => updateAudioStatus(true));
  }, { once: true });
});
