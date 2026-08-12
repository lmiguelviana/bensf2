/**
 * MASTER APPLICATION CONTROLLER
 * Liga a interface UI ao motor de síntese SF2, Mixer Console, FX Rack, WebMIDI e PresetManager.
 */

document.addEventListener('DOMContentLoaded', () => {
  const synth = new SynthEngine(window.audioEngine);
  window.synth = synth;

  const fxRack = new FxRackManager(window.audioEngine);
  fxRack.init();
  window.fxRack = fxRack;

  const vuMeter = new VuMeterManager(window.audioEngine);
  window.vuMeter = vuMeter;

  const mixerConsole = new MixerConsoleManager(synth, vuMeter);
  mixerConsole.init(document.getElementById('mixerContainer'));
  window.mixerConsole = mixerConsole;

  // Instanciar PresetManager
  const presetManager = new PresetManager(synth, fxRack, mixerConsole);
  window.presetManager = presetManager;

  // Instanciar WebMIDI Manager
  const midiDeviceStatusText = document.getElementById('midiDeviceStatusText');
  const webMidi = new WebMidiManager(synth);
  webMidi.init((deviceName) => {
    if (midiDeviceStatusText) {
      midiDeviceStatusText.textContent = deviceName;
      midiDeviceStatusText.style.color = deviceName !== 'Nenhum' && deviceName !== 'Não Suportado' ? 'var(--accent-emerald)' : 'var(--accent-cyan)';
    }
  });
  window.webMidi = webMidi;

  let baseOctave = 3;

  // Registrar Service Worker para PWA (Instalação no Android + Suporte Offline)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      console.log('[PWA] Service Worker registrado com sucesso!');
    }).catch(err => console.log('[PWA] Falha ao registrar Service Worker:', err));
  }

  // Elementos do DOM
  const audioStatusDot = document.getElementById('audioStatusDot');
  const audioStatusText = document.getElementById('audioStatusText');
  const voiceCountDisplay = document.getElementById('voiceCountDisplay');
  const sf2DropZone = document.getElementById('sf2DropZone');
  const sf2FileInput = document.getElementById('sf2FileInput');
  const presetListEl = document.getElementById('presetList');
  const sf2PresetCount = document.getElementById('sf2PresetCount');
  const sf2PromptBanner = document.getElementById('sf2PromptBanner');
  const polyphonySelect = document.getElementById('polyphonySelect');
  const velocityCurveSelect = document.getElementById('velocityCurveSelect');
  const btnAddChannel = document.getElementById('btnAddChannel');

  const btnSavePreset = document.getElementById('btnSavePreset');
  const btnLoadPreset = document.getElementById('btnLoadPreset');
  const presetFileInput = document.getElementById('presetFileInput');
  const presetSelect = document.getElementById('presetSelect');

  const pianoKeysEl = document.getElementById('pianoKeys');
  const octaveDisplay = document.getElementById('octaveDisplay');
  const btnOctaveUp = document.getElementById('btnOctaveUp');
  const btnOctaveDown = document.getElementById('btnOctaveDown');

  // Controles de Efeitos FX
  const eqLowGain = document.getElementById('eqLowGain');
  const eqLowVal = document.getElementById('eqLowVal');
  const eqMidGain = document.getElementById('eqMidGain');
  const eqMidVal = document.getElementById('eqMidVal');
  const eqHighGain = document.getElementById('eqHighGain');
  const eqHighVal = document.getElementById('eqHighVal');

  const delayTime = document.getElementById('delayTime');
  const delayTimeVal = document.getElementById('delayTimeVal');
  const delayMix = document.getElementById('delayMix');
  const delayMixVal = document.getElementById('delayMixVal');

  const fxReverbSize = document.getElementById('fxReverbSize');
  const reverbSizeVal = document.getElementById('reverbSizeVal');
  const fxReverbMix = document.getElementById('fxReverbMix');
  const reverbMixVal = document.getElementById('reverbMixVal');

  // 1. Preset Manager Binds
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

  // 2. Bind Adicionar Nova Pista no Mixer
  if (btnAddChannel) {
    btnAddChannel.addEventListener('click', () => {
      mixerConsole.addChannel();
    });
  }

  // Configurações de Polifonia e Velocidade
  polyphonySelect.addEventListener('change', (e) => {
    synth.setMaxPolyphony(e.target.value);
  });

  velocityCurveSelect.addEventListener('change', (e) => {
    synth.setVelocityCurve(e.target.value);
  });

  // Binds dos Efeitos FX Rack
  if (eqLowGain) {
    eqLowGain.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      fxRack.setEqLowGain(val);
      eqLowVal.textContent = `${val > 0 ? '+' : ''}${val} dB`;
    });
  }

  if (eqMidGain) {
    eqMidGain.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      fxRack.setEqMidGain(val);
      eqMidVal.textContent = `${val > 0 ? '+' : ''}${val} dB`;
    });
  }

  if (eqHighGain) {
    eqHighGain.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      fxRack.setEqHighGain(val);
      eqHighVal.textContent = `${val > 0 ? '+' : ''}${val} dB`;
    });
  }

  if (delayTime) {
    delayTime.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      fxRack.setDelayTime(val);
      delayTimeVal.textContent = `${Math.round(val * 1000)} ms`;
    });
  }

  if (delayMix) {
    delayMix.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      fxRack.setDelayMix(val);
      delayMixVal.textContent = `${Math.round(val * 100)}%`;
    });
  }

  if (fxReverbSize) {
    fxReverbSize.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      fxRack.setReverbSize(val);
      reverbSizeVal.textContent = `${Math.round(val * 100)}%`;
    });
  }

  if (fxReverbMix) {
    fxReverbMix.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      fxRack.setReverbMix(val);
      reverbMixVal.textContent = `${Math.round(val * 100)}%`;
    });
  }

  // 3. Renderizar Teclado Virtual Piano
  function renderPianoKeyboard() {
    pianoKeysEl.innerHTML = '';
    const startNote = baseOctave * 12;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    for (let i = 0; i < 24; i++) {
      const noteNum = startNote + i;
      const noteName = noteNames[noteNum % 12];
      const isBlack = noteName.includes('#');

      const keyEl = document.createElement('div');
      keyEl.className = `piano-key ${isBlack ? 'black' : 'white'}`;
      keyEl.dataset.note = noteNum;

      if (!isBlack) {
        const label = document.createElement('span');
        label.className = 'key-label';
        label.textContent = `${noteName}${Math.floor(noteNum / 12) - 1}`;
        keyEl.appendChild(label);
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

    octaveDisplay.textContent = `Oitava: C${baseOctave}-C${baseOctave + 2}`;
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

  // 4. Mapeamento de Teclado QWERTY + Atalho Ctrl+S para Salvar Preset
  const qwertyKeyMap = {
    'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5,
    't': 6, 'g': 7, 'y': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12
  };

  const activeQwertyKeys = new Set();
  let isMasterMuted = false;

  window.addEventListener('keydown', (e) => {
    // Atalho Ctrl+S / Cmd+S para salvar preset
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

      const keyEl = pianoKeysEl.querySelector(`[data-note="${noteNum}"]`);
      if (keyEl) keyEl.classList.add('active');
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in qwertyKeyMap) {
      activeQwertyKeys.delete(key);
      const noteNum = (baseOctave * 12) + qwertyKeyMap[key];
      synth.noteOff(noteNum, 1);

      const keyEl = pianoKeysEl.querySelector(`[data-note="${noteNum}"]`);
      if (keyEl) keyEl.classList.remove('active');
    }
  });

  // 5. Upload & Drag-and-Drop de Arquivos SF2
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

        if (sf2PromptBanner) {
          sf2PromptBanner.style.display = 'none';
        }

        alert(`SoundFont "${file.name}" carregado com sucesso! Timbres prontos para tocar.`);
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

  // 6. Monitor de Áudio e Vozes Polifônicas
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
