/**
 * MASTER APPLICATION CONTROLLER
 * Liga a interface UI ao motor de síntese SF2 e gerenciador de áudio.
 */

document.addEventListener('DOMContentLoaded', () => {
  const synth = new SynthEngine(window.audioEngine);
  window.synth = synth;

  let baseOctave = 3; // Oitava base (C3 = nota 48)

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
  const pianoKeysEl = document.getElementById('pianoKeys');
  const octaveDisplay = document.getElementById('octaveDisplay');
  const btnOctaveUp = document.getElementById('btnOctaveUp');
  const btnOctaveDown = document.getElementById('btnOctaveDown');

  // 1. Configurações de Polifonia e Velocidade
  polyphonySelect.addEventListener('change', (e) => {
    synth.setMaxPolyphony(e.target.value);
  });

  velocityCurveSelect.addEventListener('change', (e) => {
    synth.setVelocityCurve(e.target.value);
  });

  // 2. Renderizar Teclado Virtual Piano
  function renderPianoKeyboard() {
    pianoKeysEl.innerHTML = '';
    const startNote = baseOctave * 12; // C3 = 48
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

  // Controles de Oitava
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

  // 3. Mapeamento de Teclado QWERTY + Atalhos (Z/X oitava, Espaço mute)
  const qwertyKeyMap = {
    'a': 0,  // C
    'w': 1,  // C#
    's': 2,  // D
    'e': 3,  // D#
    'd': 4,  // E
    'f': 5,  // F
    't': 6,  // F#
    'g': 7,  // G
    'y': 8,  // G#
    'h': 9,  // A
    'u': 10, // A#
    'j': 11, // B
    'k': 12  // C (oitava acima)
  };

  const activeQwertyKeys = new Set();
  let isMasterMuted = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const key = e.key.toLowerCase();

    // Atalhos de Oitava Z / X
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

    // Atalho Barra de Espaço = Mute / Unmute Geral
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

  // 4. Upload & Drag-and-Drop de Arquivos SF2
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

        // Ocultar banner de aviso
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

  // 5. Binds do Console de Mixer
  document.querySelectorAll('.ch-volume').forEach(fader => {
    fader.addEventListener('input', (e) => {
      const ch = parseInt(e.target.dataset.channel);
      const val = parseFloat(e.target.value);
      synth.setChannelVolume(ch, val);
    });
  });

  document.querySelectorAll('.ch-pan').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const ch = parseInt(e.target.dataset.channel);
      const val = parseFloat(e.target.value);
      synth.setChannelPan(ch, val);
    });
  });

  document.querySelectorAll('.ch-mute').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ch = parseInt(e.target.dataset.channel);
      const isMuted = !btn.classList.contains('active');
      btn.classList.toggle('active', isMuted);
      btn.style.background = isMuted ? 'var(--accent-danger)' : '';
      synth.setChannelMute(ch, isMuted);
    });
  });

  // 6. Monitor de Áudio e Vozes Polifônicas
  function updateAudioStatus(active) {
    if (active) {
      audioStatusDot.classList.add('active');
      audioStatusText.textContent = 'Áudio: Ativo';
    }
  }

  setInterval(() => {
    if (voiceCountDisplay) {
      voiceCountDisplay.textContent = `${synth.getActiveVoicesCount()} / ${synth.maxPolyphony}`;
    }
  }, 200);

  document.body.addEventListener('click', () => {
    window.audioEngine.resume().then(() => updateAudioStatus(true));
  }, { once: true });
});
