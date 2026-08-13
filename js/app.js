/**
 * MASTER APPLICATION CONTROLLER
 * Liga a interface UI ao motor de síntese SF2, Mixer Console, Master FX, FX por Pista com atribuição independente de timbres à pista selecionada.
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

  const setlistManager = new BenSetlistManager(synth, presetManager, mixerConsole, fxRack);
  window.setlistManager = setlistManager;

  let baseOctave = 1;
  let totalKeysToRender = 88; // Padrão 88 teclas estilo Piano Completo

  // Sistema de Notificações Amigáveis (Toast Notifications)
  function showToastNotification(title, message, type = 'success') {
    let container = document.querySelector('.toast-notification-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-notification-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const safeType = ['success', 'warning', 'info'].includes(type) ? type : 'info';
    toast.className = `toast-banner ${safeType}`;
    toast.setAttribute('role', safeType === 'warning' ? 'alert' : 'status');
    const iconMap = { success: '🎉', warning: '⚠️', info: 'ℹ️' };
    const icon = document.createElement('div');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconMap[safeType] || 'ℹ️';

    const content = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = String(title ?? '');
    const messageEl = document.createElement('div');
    messageEl.className = 'toast-message';
    messageEl.textContent = String(message ?? '');
    content.append(titleEl, messageEl);
    toast.append(icon, content);

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastFadeOut 0.35s ease forwards';
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  }
  window.showToastNotification = showToastNotification;

  let activeModal = null;
  const modalReturnFocus = new WeakMap();
  function openAccessibleModal(backdrop, initialFocus) {
    if (!backdrop) return;
    modalReturnFocus.set(backdrop, document.activeElement);
    backdrop.style.display = 'flex';
    backdrop.setAttribute('aria-hidden', 'false');
    activeModal = backdrop;
    const dialog = backdrop.querySelector('[role="dialog"]');
    requestAnimationFrame(() => (initialFocus || dialog)?.focus());
  }
  function closeAccessibleModal(backdrop) {
    if (!backdrop) return;
    backdrop.style.display = 'none';
    backdrop.setAttribute('aria-hidden', 'true');
    if (activeModal === backdrop) activeModal = null;
    const previous = modalReturnFocus.get(backdrop);
    if (previous && typeof previous.focus === 'function') previous.focus();
  }
  window.openAccessibleModal = openAccessibleModal;
  window.closeAccessibleModal = closeAccessibleModal;

  document.addEventListener('keydown', (event) => {
    if (!activeModal) return;
    if (event.key === 'Escape') {
      const cancel = activeModal.querySelector('#btnCloseSettings, [id^="btnCancel"]');
      if (cancel) cancel.click();
      else closeAccessibleModal(activeModal);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(activeModal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

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
      if (typeof synth.setChannelModulation === 'function') synth.setChannelModulation('all', val);
    });

    midiLearn.attach(modWheelInput, 'Modulation Wheel (CC1)', (normVal) => {
      if (typeof synth.setChannelModulation === 'function') synth.setChannelModulation('all', normVal);
    });
  }

  // Intercept NoteOn/NoteOff do Synth para iluminação visual do teclado
  const originalNoteOn = synth.noteOn.bind(synth);
  synth.noteOn = function(...args) {
    const note = args[0];
    const result = originalNoteOn(...args);
    if (pianoKeysEl) {
      const keyEl = pianoKeysEl.querySelector(`[data-note="${note}"]`);
      if (keyEl) keyEl.classList.add('active');
    }
    return result;
  };

  const originalNoteOff = synth.noteOff.bind(synth);
  synth.noteOff = function(...args) {
    const note = args[0];
    const result = originalNoteOff(...args);
    if (pianoKeysEl) {
      const keyEl = pianoKeysEl.querySelector(`[data-note="${note}"]`);
      if (keyEl) keyEl.classList.remove('active');
    }
    return result;
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
  const tabSetlist = document.getElementById('tabSetlist');

  const sectionMixer = document.getElementById('sectionMixer');
  const sectionFxRack = document.getElementById('sectionFxRack');
  const sectionSetlist = document.getElementById('sectionSetlist');
  const sectionMidiKeyboard = document.getElementById('sectionMidiKeyboard');

  const audioStatusDot = document.getElementById('audioStatusDot');
  const audioStatusText = document.getElementById('audioStatusText');
  const voiceCountDisplay = document.getElementById('voiceCountDisplay');
  const sf2DropZone = document.getElementById('sf2DropZone');
  const sf2FileInput = document.getElementById('sf2FileInput');
  const presetListEl = document.getElementById('presetList');
  const sf2PresetCount = document.getElementById('sf2PresetCount');
  const sf2LoadStatus = document.getElementById('sf2LoadStatus');

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

  const accessibleControlNames = {
    presetSelect: 'Preset salvo',
    mixerChannelCountSelect: 'Quantidade de pistas visíveis',
    selectTrackVelMode: 'Curva de velocity da pista selecionada',
    inputTrackVelMin: 'Velocity mínima da pista',
    inputTrackVelMax: 'Velocity máxima da pista',
    inputTrackVelPower: 'Potência da curva de velocity da pista',
    selectTrackReverbMode: 'Algoritmo de reverb da pista',
    selectMasterReverbMode: 'Algoritmo de reverb master',
    trackVelCanvas: 'Curva de velocity da pista',
    velocityCurveCanvas: 'Curva de velocity global'
  };
  Object.entries(accessibleControlNames).forEach(([id, label]) => {
    const element = document.getElementById(id);
    if (element && !element.getAttribute('aria-label')) element.setAttribute('aria-label', label);
    if (element?.tagName === 'CANVAS') element.setAttribute('role', 'img');
  });

  const syncToggleAccessibility = (root = document) => {
    const candidates = root.matches?.('.btn-fx-toggle, .btn-mute, .btn-solo') ? [root] : root.querySelectorAll?.('.btn-fx-toggle, .btn-mute, .btn-solo') || [];
    candidates.forEach((button) => button.setAttribute('aria-pressed', String(button.classList.contains('active'))));
  };
  syncToggleAccessibility();
  const toggleObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes') syncToggleAccessibility(mutation.target);
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) syncToggleAccessibility(node);
      });
    });
  });
  toggleObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  // Lógica de Recolher / Expandir Painel Lateral (Sidebar) & Teclado Virtual
  const sidebarPanel = document.querySelector('.sidebar-panel');
  const btnCollapseSidebarDirect = document.getElementById('btnCollapseSidebarDirect');
  const btnExpandSidebarFloat = document.getElementById('btnExpandSidebarFloat');
  let isSidebarCollapsed = false;

  function toggleSidebar() {
    isSidebarCollapsed = !isSidebarCollapsed;
    if (sidebarPanel) {
      sidebarPanel.style.display = isSidebarCollapsed ? 'none' : 'flex';
    }
    if (btnCollapseSidebarDirect) {
      btnCollapseSidebarDirect.textContent = isSidebarCollapsed ? '▶ Expandir' : '◀ Recolher';
    }
    if (btnExpandSidebarFloat) {
      btnExpandSidebarFloat.style.display = isSidebarCollapsed ? 'block' : 'none';
    }
    showToastNotification('Painel Lateral', isSidebarCollapsed ? 'Painel lateral recolhido. Clique em 📁 BIBLIOTECA ▶ para reexibir.' : 'Painel lateral expandido.', 'info');
  }

  if (btnCollapseSidebarDirect) btnCollapseSidebarDirect.addEventListener('click', toggleSidebar);
  if (btnExpandSidebarFloat) btnExpandSidebarFloat.addEventListener('click', toggleSidebar);

  const btnCollapseKeyboardDirect = document.getElementById('btnCollapseKeyboardDirect');
  const btnExpandKeyboardFloat = document.getElementById('btnExpandKeyboardFloat');
  let isKeyboardCollapsed = false;

  function toggleKeyboard() {
    isKeyboardCollapsed = !isKeyboardCollapsed;
    if (sectionMidiKeyboard) {
      sectionMidiKeyboard.style.display = isKeyboardCollapsed ? 'none' : 'flex';
    }
    if (btnCollapseKeyboardDirect) {
      btnCollapseKeyboardDirect.textContent = isKeyboardCollapsed ? '▲ Expandir Teclado' : '▼ Recolher Teclado';
    }
    if (btnExpandKeyboardFloat) {
      btnExpandKeyboardFloat.style.display = isKeyboardCollapsed ? 'block' : 'none';
    }
    showToastNotification('Teclado Piano', isKeyboardCollapsed ? 'Teclado virtual recolhido. Clique em 🎹 EXIBIR TECLADO ▲ para reexibir.' : 'Teclado virtual expandido.', 'info');
  }

  if (btnCollapseKeyboardDirect) btnCollapseKeyboardDirect.addEventListener('click', toggleKeyboard);
  if (btnExpandKeyboardFloat) btnExpandKeyboardFloat.addEventListener('click', toggleKeyboard);

  // Tab View Switcher (Mixer & Layers, Rack FX Master, Setlist Live Mode)
  function switchView(activeTab, showMixer, showFx, showSetlist) {
    [tabMixer, tabFxRack, tabSetlist].forEach((tab) => {
      if (!tab) return;
      const selected = tab === activeTab;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    if (sectionMixer) sectionMixer.style.display = showMixer ? 'flex' : 'none';
    if (sectionFxRack) sectionFxRack.style.display = showFx ? 'block' : 'none';
    if (sectionSetlist) sectionSetlist.style.display = showSetlist ? 'block' : 'none';
    if (sectionMixer) sectionMixer.setAttribute('aria-hidden', String(!showMixer));
    if (sectionFxRack) sectionFxRack.setAttribute('aria-hidden', String(!showFx));
    if (sectionSetlist) sectionSetlist.setAttribute('aria-hidden', String(!showSetlist));
    if (sectionMidiKeyboard && !isKeyboardCollapsed) sectionMidiKeyboard.style.display = 'flex';
  }

  if (tabMixer) tabMixer.addEventListener('click', () => switchView(tabMixer, true, false, false));
  if (tabFxRack) tabFxRack.addEventListener('click', () => switchView(tabFxRack, false, true, false));
  if (tabSetlist) tabSetlist.addEventListener('click', () => {
    switchView(tabSetlist, false, false, true);
    if (setlistManager) setlistManager.renderSetlistPanel();
  });

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

  // 1. MASTER FX CONTROLS & ALGORITMOS VALHALLA & CHORUS ESTÉREO & MIDI LEARN MASTER
  const btnMasterEqToggle = document.getElementById('btnMasterEqToggle');
  if (btnMasterEqToggle) {
    btnMasterEqToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnMasterEqToggle.addEventListener('click', () => {
      const isAct = btnMasterEqToggle.classList.toggle('active');
      btnMasterEqToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleMasterEq(isAct);
    });
    if (midiLearn) midiLearn.attach(btnMasterEqToggle, 'Master EQ ON/OFF', () => {});
  }

  const btnMasterChorusToggle = document.getElementById('btnMasterChorusToggle');
  if (btnMasterChorusToggle) {
    btnMasterChorusToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnMasterChorusToggle.addEventListener('click', () => {
      const isAct = btnMasterChorusToggle.classList.toggle('active');
      btnMasterChorusToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleMasterChorus(isAct);
    });
    if (midiLearn) midiLearn.attach(btnMasterChorusToggle, 'Master Chorus ON/OFF', () => {});
  }

  const btnMasterDelayToggle = document.getElementById('btnMasterDelayToggle');
  if (btnMasterDelayToggle) {
    btnMasterDelayToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnMasterDelayToggle.addEventListener('click', () => {
      const isAct = btnMasterDelayToggle.classList.toggle('active');
      btnMasterDelayToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleMasterDelay(isAct);
    });
    if (midiLearn) midiLearn.attach(btnMasterDelayToggle, 'Master Delay ON/OFF', () => {});
  }

  const btnMasterReverbToggle = document.getElementById('btnMasterReverbToggle');
  if (btnMasterReverbToggle) {
    btnMasterReverbToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnMasterReverbToggle.addEventListener('click', () => {
      const isAct = btnMasterReverbToggle.classList.toggle('active');
      btnMasterReverbToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleMasterReverb(isAct);
    });
    if (midiLearn) midiLearn.attach(btnMasterReverbToggle, 'Master Reverb ON/OFF', () => {});
  }

  const selectMasterReverbMode = document.getElementById('selectMasterReverbMode');
  if (selectMasterReverbMode) {
    selectMasterReverbMode.addEventListener('change', (e) => {
      fxRack.setMasterReverbMode(e.target.value);
    });
  }

  let knobMasterLow, knobMasterMid, knobMasterHigh, knobMasterChorusMix, knobMasterDelayTime, knobMasterDelayMix, knobMasterReverbSize, knobMasterReverbMix;

  const knobMasterLowEl = document.getElementById('knobMasterEqLow');
  if (knobMasterLowEl) {
    knobMasterLow = new RotaryKnob(knobMasterLowEl, {
      title: 'GRAVE', min: -12, max: 12, step: 0.5, value: 0, unit: 'dB',
      onChange: (val) => fxRack.setMasterEqLowGain(val)
    });
    midiLearn.attach(knobMasterLowEl, 'Master EQ Grave', (normVal) => {
      const dbVal = (normVal * 24.0) - 12.0;
      fxRack.setMasterEqLowGain(dbVal);
      if (knobMasterLow) knobMasterLow.setValue(dbVal);
    });
  }

  const knobMasterMidEl = document.getElementById('knobMasterEqMid');
  if (knobMasterMidEl) {
    knobMasterMid = new RotaryKnob(knobMasterMidEl, {
      title: 'MÉDIO', min: -12, max: 12, step: 0.5, value: 0, unit: 'dB',
      onChange: (val) => fxRack.setMasterEqMidGain(val)
    });
    midiLearn.attach(knobMasterMidEl, 'Master EQ Médio', (normVal) => {
      const dbVal = (normVal * 24.0) - 12.0;
      fxRack.setMasterEqMidGain(dbVal);
      if (knobMasterMid) knobMasterMid.setValue(dbVal);
    });
  }

  const knobMasterHighEl = document.getElementById('knobMasterEqHigh');
  if (knobMasterHighEl) {
    knobMasterHigh = new RotaryKnob(knobMasterHighEl, {
      title: 'AGUDO', min: -12, max: 12, step: 0.5, value: 0, unit: 'dB',
      onChange: (val) => fxRack.setMasterEqHighGain(val)
    });
    midiLearn.attach(knobMasterHighEl, 'Master EQ Agudo', (normVal) => {
      const dbVal = (normVal * 24.0) - 12.0;
      fxRack.setMasterEqHighGain(dbVal);
      if (knobMasterHigh) knobMasterHigh.setValue(dbVal);
    });
  }

  const knobMasterChorusMixEl = document.getElementById('knobMasterChorusMix');
  if (knobMasterChorusMixEl) {
    knobMasterChorusMix = new RotaryKnob(knobMasterChorusMixEl, {
      title: 'CHORUS', min: 0, max: 100, step: 1, value: 30, unit: '%',
      onChange: (val) => fxRack.setMasterChorusMix(val / 100.0)
    });
    midiLearn.attach(knobMasterChorusMixEl, 'Master Chorus Mistura', (normVal) => {
      const pctVal = Math.round(normVal * 100);
      fxRack.setMasterChorusMix(normVal);
      if (knobMasterChorusMix) knobMasterChorusMix.setValue(pctVal);
    });
  }

  const knobMasterDelayTimeEl = document.getElementById('knobMasterDelayTime');
  if (knobMasterDelayTimeEl) {
    knobMasterDelayTime = new RotaryKnob(knobMasterDelayTimeEl, {
      title: 'TEMPO', min: 50, max: 1000, step: 10, value: 300, unit: 'ms',
      onChange: (val) => fxRack.setMasterDelayTime(val / 1000.0)
    });
    midiLearn.attach(knobMasterDelayTimeEl, 'Master Delay Tempo', (normVal) => {
      const msVal = Math.round(50 + (normVal * 950));
      fxRack.setMasterDelayTime(msVal / 1000.0);
      if (knobMasterDelayTime) knobMasterDelayTime.setValue(msVal);
    });
  }

  const knobMasterDelayMixEl = document.getElementById('knobMasterDelayMix');
  if (knobMasterDelayMixEl) {
    knobMasterDelayMix = new RotaryKnob(knobMasterDelayMixEl, {
      title: 'MISTURA', min: 0, max: 100, step: 1, value: 20, unit: '%',
      onChange: (val) => fxRack.setMasterDelayMix(val / 100.0)
    });
    midiLearn.attach(knobMasterDelayMixEl, 'Master Delay Mistura', (normVal) => {
      const pctVal = Math.round(normVal * 100);
      fxRack.setMasterDelayMix(normVal);
      if (knobMasterDelayMix) knobMasterDelayMix.setValue(pctVal);
    });
  }

  const knobMasterReverbSizeEl = document.getElementById('knobMasterReverbSize');
  if (knobMasterReverbSizeEl) {
    knobMasterReverbSize = new RotaryKnob(knobMasterReverbSizeEl, {
      title: 'SALA', min: 10, max: 100, step: 1, value: 40, unit: '%',
      onChange: (val) => fxRack.setMasterReverbSize(val / 100.0)
    });
    midiLearn.attach(knobMasterReverbSizeEl, 'Master Reverb Tamanho Sala', (normVal) => {
      const pctVal = Math.round(10 + (normVal * 90));
      fxRack.setMasterReverbSize(pctVal / 100.0);
      if (knobMasterReverbSize) knobMasterReverbSize.setValue(pctVal);
    });
  }

  const knobMasterReverbMixEl = document.getElementById('knobMasterReverbMix');
  if (knobMasterReverbMixEl) {
    knobMasterReverbMix = new RotaryKnob(knobMasterReverbMixEl, {
      title: 'MISTURA', min: 0, max: 100, step: 1, value: 25, unit: '%',
      onChange: (val) => fxRack.setMasterReverbMix(val / 100.0)
    });
    midiLearn.attach(knobMasterReverbMixEl, 'Master Reverb Mistura', (normVal) => {
      const pctVal = Math.round(normVal * 100);
      fxRack.setMasterReverbMix(normVal);
      if (knobMasterReverbMix) knobMasterReverbMix.setValue(pctVal);
    });
  }

  // Master Resets
  const btnResetMasterEq = document.getElementById('btnResetMasterEq');
  if (btnResetMasterEq) {
    btnResetMasterEq.addEventListener('click', () => {
      fxRack.setMasterEqLowGain(0);
      fxRack.setMasterEqMidGain(0);
      fxRack.setMasterEqHighGain(0);
      fxRack.toggleMasterEq(false);
      if (knobMasterLow) knobMasterLow.setValue(0);
      if (knobMasterMid) knobMasterMid.setValue(0);
      if (knobMasterHigh) knobMasterHigh.setValue(0);
      if (btnMasterEqToggle) {
        btnMasterEqToggle.classList.remove('active');
        btnMasterEqToggle.textContent = 'OFF';
      }
      showToastNotification('EQ Master Restaurado', 'Equalizador Master zerado em 0dB (OFF).', 'info');
    });
  }

  const btnResetMasterChorus = document.getElementById('btnResetMasterChorus');
  if (btnResetMasterChorus) {
    btnResetMasterChorus.addEventListener('click', () => {
      fxRack.setMasterChorusMix(0.3);
      fxRack.toggleMasterChorus(false);
      if (knobMasterChorusMix) knobMasterChorusMix.setValue(30);
      if (btnMasterChorusToggle) {
        btnMasterChorusToggle.classList.remove('active');
        btnMasterChorusToggle.textContent = 'OFF';
      }
      showToastNotification('Chorus Master Restaurado', 'Chorus Master reiniciado para 30% (OFF).', 'info');
    });
  }

  const btnResetMasterDelay = document.getElementById('btnResetMasterDelay');
  if (btnResetMasterDelay) {
    btnResetMasterDelay.addEventListener('click', () => {
      fxRack.setMasterDelayTime(0.3);
      fxRack.setMasterDelayMix(0.2);
      fxRack.toggleMasterDelay(false);
      if (knobMasterDelayTime) knobMasterDelayTime.setValue(300);
      if (knobMasterDelayMix) knobMasterDelayMix.setValue(20);
      if (btnMasterDelayToggle) {
        btnMasterDelayToggle.classList.remove('active');
        btnMasterDelayToggle.textContent = 'OFF';
      }
      showToastNotification('Delay Master Restaurado', 'Delay Master reiniciado para 300ms / 20% (OFF).', 'info');
    });
  }

  const btnResetMasterReverb = document.getElementById('btnResetMasterReverb');
  if (btnResetMasterReverb) {
    btnResetMasterReverb.addEventListener('click', () => {
      fxRack.setMasterReverbMode('concert_hall');
      fxRack.setMasterReverbSize(0.4);
      fxRack.setMasterReverbMix(0.25);
      fxRack.toggleMasterReverb(false);
      if (selectMasterReverbMode) selectMasterReverbMode.value = 'concert_hall';
      if (knobMasterReverbSize) knobMasterReverbSize.setValue(40);
      if (knobMasterReverbMix) knobMasterReverbMix.setValue(25);
      if (btnMasterReverbToggle) {
        btnMasterReverbToggle.classList.remove('active');
        btnMasterReverbToggle.textContent = 'OFF';
      }
      showToastNotification('Reverb Master Restaurado', 'Reverb Master retornado ao Concert Hall 40%/25% (OFF).', 'info');
    });
  }

  // 2. PER-TRACK FX CONTROLS & ADSR & CUTOFF & CHORUS & VALHALLA REVERBS & UNIVERSAL MIDI LEARN
  let knobTrackAdsrAttack, knobTrackAdsrDecay, knobTrackAdsrSustain, knobTrackAdsrRelease;

  const knobAttackEl = document.getElementById('knobTrackAdsrAttack');
  if (knobAttackEl) {
    knobTrackAdsrAttack = new RotaryKnob(knobAttackEl, {
      title: 'ATTACK', min: 1, max: 2000, step: 5, value: 5, unit: 'ms',
      onChange: (val) => {
        const ch = fxRack.selectedChannel;
        if (synth.channels[ch] && synth.channels[ch].adsr) {
          synth.channels[ch].adsr.attack = val / 1000.0;
        }
      }
    });
    midiLearn.attach(knobAttackEl, 'Envelope ADSR Attack', (normVal) => {
      const ch = fxRack.selectedChannel;
      const msVal = Math.round(1 + (normVal * 1999));
      if (synth.channels[ch] && synth.channels[ch].adsr) {
        synth.channels[ch].adsr.attack = msVal / 1000.0;
      }
      if (knobTrackAdsrAttack) knobTrackAdsrAttack.setValue(msVal);
    });
  }

  const knobDecayEl = document.getElementById('knobTrackAdsrDecay');
  if (knobDecayEl) {
    knobTrackAdsrDecay = new RotaryKnob(knobDecayEl, {
      title: 'DECAY', min: 10, max: 3000, step: 10, value: 100, unit: 'ms',
      onChange: (val) => {
        const ch = fxRack.selectedChannel;
        if (synth.channels[ch] && synth.channels[ch].adsr) {
          synth.channels[ch].adsr.decay = val / 1000.0;
        }
      }
    });
    midiLearn.attach(knobDecayEl, 'Envelope ADSR Decay', (normVal) => {
      const ch = fxRack.selectedChannel;
      const msVal = Math.round(10 + (normVal * 2990));
      if (synth.channels[ch] && synth.channels[ch].adsr) {
        synth.channels[ch].adsr.decay = msVal / 1000.0;
      }
      if (knobTrackAdsrDecay) knobTrackAdsrDecay.setValue(msVal);
    });
  }

  const knobSustainEl = document.getElementById('knobTrackAdsrSustain');
  if (knobSustainEl) {
    knobTrackAdsrSustain = new RotaryKnob(knobSustainEl, {
      title: 'SUSTAIN', min: 0, max: 100, step: 1, value: 75, unit: '%',
      onChange: (val) => {
        const ch = fxRack.selectedChannel;
        if (synth.channels[ch] && synth.channels[ch].adsr) {
          synth.channels[ch].adsr.sustain = val / 100.0;
        }
      }
    });
    midiLearn.attach(knobSustainEl, 'Envelope ADSR Sustain', (normVal) => {
      const ch = fxRack.selectedChannel;
      const pctVal = Math.round(normVal * 100);
      if (synth.channels[ch] && synth.channels[ch].adsr) {
        synth.channels[ch].adsr.sustain = normVal;
      }
      if (knobTrackAdsrSustain) knobTrackAdsrSustain.setValue(pctVal);
    });
  }

  const knobReleaseEl = document.getElementById('knobTrackAdsrRelease');
  if (knobReleaseEl) {
    knobTrackAdsrRelease = new RotaryKnob(knobReleaseEl, {
      title: 'RELEASE', min: 10, max: 5000, step: 10, value: 250, unit: 'ms',
      onChange: (val) => {
        const ch = fxRack.selectedChannel;
        if (synth.channels[ch] && synth.channels[ch].adsr) {
          synth.channels[ch].adsr.release = val / 1000.0;
        }
      }
    });
    midiLearn.attach(knobReleaseEl, 'Envelope ADSR Release', (normVal) => {
      const ch = fxRack.selectedChannel;
      const msVal = Math.round(10 + (normVal * 4990));
      if (synth.channels[ch] && synth.channels[ch].adsr) {
        synth.channels[ch].adsr.release = msVal / 1000.0;
      }
      if (knobTrackAdsrRelease) knobTrackAdsrRelease.setValue(msVal);
    });
  }

  const btnTrackCutoffToggle = document.getElementById('btnTrackCutoffToggle');
  if (btnTrackCutoffToggle) {
    btnTrackCutoffToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnTrackCutoffToggle.addEventListener('click', () => {
      const isAct = btnTrackCutoffToggle.classList.toggle('active');
      btnTrackCutoffToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleTrackCutoff(isAct);
    });
    if (midiLearn) midiLearn.attach(btnTrackCutoffToggle, 'Filtro Cutoff Pista ON/OFF', () => {});
  }

  const btnTrackEqToggle = document.getElementById('btnTrackEqToggle');
  if (btnTrackEqToggle) {
    btnTrackEqToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnTrackEqToggle.addEventListener('click', () => {
      const isAct = btnTrackEqToggle.classList.toggle('active');
      btnTrackEqToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleTrackEq(isAct);
    });
    if (midiLearn) midiLearn.attach(btnTrackEqToggle, 'EQ Pista ON/OFF', () => {});
  }

  const btnTrackChorusToggle = document.getElementById('btnTrackChorusToggle');
  if (btnTrackChorusToggle) {
    btnTrackChorusToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnTrackChorusToggle.addEventListener('click', () => {
      const isAct = btnTrackChorusToggle.classList.toggle('active');
      btnTrackChorusToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleTrackChorus(isAct);
    });
    if (midiLearn) midiLearn.attach(btnTrackChorusToggle, 'Chorus Pista ON/OFF', () => {});
  }

  const btnTrackDelayToggle = document.getElementById('btnTrackDelayToggle');
  if (btnTrackDelayToggle) {
    btnTrackDelayToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnTrackDelayToggle.addEventListener('click', () => {
      const isAct = btnTrackDelayToggle.classList.toggle('active');
      btnTrackDelayToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleTrackDelay(isAct);
    });
    if (midiLearn) midiLearn.attach(btnTrackDelayToggle, 'Delay Pista ON/OFF', () => {});
  }

  const btnTrackReverbToggle = document.getElementById('btnTrackReverbToggle');
  if (btnTrackReverbToggle) {
    btnTrackReverbToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnTrackReverbToggle.addEventListener('click', () => {
      const isAct = btnTrackReverbToggle.classList.toggle('active');
      btnTrackReverbToggle.textContent = isAct ? 'ON' : 'OFF';
      fxRack.toggleTrackReverb(isAct);
    });
    if (midiLearn) midiLearn.attach(btnTrackReverbToggle, 'Reverb Pista ON/OFF', () => {});
  }

  const selectTrackReverbMode = document.getElementById('selectTrackReverbMode');
  if (selectTrackReverbMode) {
    selectTrackReverbMode.addEventListener('change', (e) => {
      fxRack.setTrackReverbMode(e.target.value);
    });
  }

  let knobTrackCutoff, knobTrackEqLow, knobTrackEqMid, knobTrackEqHigh, knobTrackChorusMix, knobTrackDelayTime, knobTrackDelayMix, knobTrackReverbSize, knobTrackReverbMix;

  const knobTrackCutoffEl = document.getElementById('knobTrackCutoff');
  if (knobTrackCutoffEl) {
    knobTrackCutoff = new RotaryKnob(knobTrackCutoffEl, {
      title: 'CUTOFF', min: 200, max: 20000, step: 100, value: 20000, unit: 'Hz',
      onChange: (val) => fxRack.setCutoffFrequency(val)
    });
    midiLearn.attach(knobTrackCutoffEl, 'Filtro Cutoff Pista', (normVal) => {
      const freqHz = Math.round(200 * Math.pow(100, normVal));
      fxRack.setCutoffFrequency(freqHz);
      if (knobTrackCutoff) knobTrackCutoff.setValue(freqHz);
    });
  }

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

  const knobTrackChorusMixEl = document.getElementById('knobTrackChorusMix');
  if (knobTrackChorusMixEl) {
    knobTrackChorusMix = new RotaryKnob(knobTrackChorusMixEl, {
      title: 'CHORUS', min: 0, max: 100, step: 1, value: 30, unit: '%',
      onChange: (val) => fxRack.setChorusMix(val / 100.0)
    });
    midiLearn.attach(knobTrackChorusMixEl, 'Chorus Pista Mistura', (normVal) => {
      const pctVal = Math.round(normVal * 100);
      fxRack.setChorusMix(normVal);
      if (knobTrackChorusMix) knobTrackChorusMix.setValue(pctVal);
    });
  }

  const knobTrackDelayTimeEl = document.getElementById('knobTrackDelayTime');
  if (knobTrackDelayTimeEl) {
    knobTrackDelayTime = new RotaryKnob(knobTrackDelayTimeEl, {
      title: 'TEMPO', min: 50, max: 1000, step: 10, value: 300, unit: 'ms',
      onChange: (val) => fxRack.setDelayTime(val / 1000.0)
    });
    midiLearn.attach(knobTrackDelayTimeEl, 'Delay Pista Tempo', (normVal) => {
      const msVal = Math.round(50 + (normVal * 950));
      fxRack.setDelayTime(msVal / 1000.0);
      if (knobTrackDelayTime) knobTrackDelayTime.setValue(msVal);
    });
  }

  const knobTrackDelayMixEl = document.getElementById('knobTrackDelayMix');
  if (knobTrackDelayMixEl) {
    knobTrackDelayMix = new RotaryKnob(knobTrackDelayMixEl, {
      title: 'MISTURA', min: 0, max: 100, step: 1, value: 20, unit: '%',
      onChange: (val) => fxRack.setDelayMix(val / 100.0)
    });
    midiLearn.attach(knobTrackDelayMixEl, 'Delay Pista Mistura', (normVal) => {
      const pctVal = Math.round(normVal * 100);
      fxRack.setDelayMix(normVal);
      if (knobTrackDelayMix) knobTrackDelayMix.setValue(pctVal);
    });
  }

  const knobTrackReverbSizeEl = document.getElementById('knobTrackReverbSize');
  if (knobTrackReverbSizeEl) {
    knobTrackReverbSize = new RotaryKnob(knobTrackReverbSizeEl, {
      title: 'SALA', min: 10, max: 100, step: 1, value: 40, unit: '%',
      onChange: (val) => fxRack.setReverbSize(val / 100.0)
    });
    midiLearn.attach(knobTrackReverbSizeEl, 'Reverb Pista Tamanho Sala', (normVal) => {
      const pctVal = Math.round(10 + (normVal * 90));
      fxRack.setReverbSize(pctVal / 100.0);
      if (knobTrackReverbSize) knobTrackReverbSize.setValue(pctVal);
    });
  }

  const knobTrackReverbMixEl = document.getElementById('knobTrackReverbMix');
  if (knobTrackReverbMixEl) {
    knobTrackReverbMix = new RotaryKnob(knobTrackReverbMixEl, {
      title: 'MISTURA', min: 0, max: 100, step: 1, value: 25, unit: '%',
      onChange: (val) => fxRack.setReverbMix(val / 100.0)
    });
    midiLearn.attach(knobTrackReverbMixEl, 'Reverb Pista Mistura', (normVal) => {
      const pctVal = Math.round(normVal * 100);
      fxRack.setReverbMix(normVal);
      if (knobTrackReverbMix) knobTrackReverbMix.setValue(pctVal);
    });
  }

  // Per-Track Resets
  const btnResetTrackAdsr = document.getElementById('btnResetTrackAdsr');
  if (btnResetTrackAdsr) {
    btnResetTrackAdsr.addEventListener('click', () => {
      const ch = fxRack.selectedChannel;
      if (synth.channels[ch]) {
        synth.channels[ch].adsr = { attack: 0.005, decay: 0.1, sustain: 0.75, release: 0.25 };
        if (knobTrackAdsrAttack) knobTrackAdsrAttack.setValue(5);
        if (knobTrackAdsrDecay) knobTrackAdsrDecay.setValue(100);
        if (knobTrackAdsrSustain) knobTrackAdsrSustain.setValue(75);
        if (knobTrackAdsrRelease) knobTrackAdsrRelease.setValue(250);
        showToastNotification('ADSR Restaurado', 'Envelope retornado ao padrão (5ms A, 100ms D, 75% S, 250ms R).', 'info');
      }
    });
  }

  const btnResetTrackCutoff = document.getElementById('btnResetTrackCutoff');
  if (btnResetTrackCutoff) {
    btnResetTrackCutoff.addEventListener('click', () => {
      fxRack.setCutoffFrequency(20000);
      fxRack.toggleTrackCutoff(false);
      if (knobTrackCutoff) knobTrackCutoff.setValue(20000);
      if (btnTrackCutoffToggle) {
        btnTrackCutoffToggle.classList.remove('active');
        btnTrackCutoffToggle.textContent = 'OFF';
      }
      showToastNotification('Cutoff Restaurado', 'Filtro reiniciado para 20.000Hz (OFF).', 'info');
    });
  }

  const btnResetTrackEq = document.getElementById('btnResetTrackEq');
  if (btnResetTrackEq) {
    btnResetTrackEq.addEventListener('click', () => {
      fxRack.setEqLowGain(0);
      fxRack.setEqMidGain(0);
      fxRack.setEqHighGain(0);
      fxRack.toggleTrackEq(false);
      if (knobTrackEqLow) knobTrackEqLow.setValue(0);
      if (knobTrackEqMid) knobTrackEqMid.setValue(0);
      if (knobTrackEqHigh) knobTrackEqHigh.setValue(0);
      if (btnTrackEqToggle) {
        btnTrackEqToggle.classList.remove('active');
        btnTrackEqToggle.textContent = 'OFF';
      }
      showToastNotification('EQ Restaurado', 'Equalizador zerado em 0dB (OFF).', 'info');
    });
  }

  const btnResetTrackChorus = document.getElementById('btnResetTrackChorus');
  if (btnResetTrackChorus) {
    btnResetTrackChorus.addEventListener('click', () => {
      fxRack.setChorusMix(0.3);
      fxRack.toggleTrackChorus(false);
      if (knobTrackChorusMix) knobTrackChorusMix.setValue(30);
      if (btnTrackChorusToggle) {
        btnTrackChorusToggle.classList.remove('active');
        btnTrackChorusToggle.textContent = 'OFF';
      }
      showToastNotification('Chorus Restaurado', 'Chorus reiniciado para 30% (OFF).', 'info');
    });
  }

  const btnResetTrackDelay = document.getElementById('btnResetTrackDelay');
  if (btnResetTrackDelay) {
    btnResetTrackDelay.addEventListener('click', () => {
      fxRack.setDelayTime(0.3);
      fxRack.setDelayMix(0.2);
      fxRack.toggleTrackDelay(false);
      if (knobTrackDelayTime) knobTrackDelayTime.setValue(300);
      if (knobTrackDelayMix) knobTrackDelayMix.setValue(20);
      if (btnTrackDelayToggle) {
        btnTrackDelayToggle.classList.remove('active');
        btnTrackDelayToggle.textContent = 'OFF';
      }
      showToastNotification('Delay Restaurado', 'Delay reiniciado para 300ms / 20% (OFF).', 'info');
    });
  }

  const btnResetTrackReverb = document.getElementById('btnResetTrackReverb');
  if (btnResetTrackReverb) {
    btnResetTrackReverb.addEventListener('click', () => {
      fxRack.setTrackReverbMode('concert_hall');
      fxRack.setReverbSize(0.4);
      fxRack.setReverbMix(0.25);
      fxRack.toggleTrackReverb(false);
      if (selectTrackReverbMode) selectTrackReverbMode.value = 'concert_hall';
      if (knobTrackReverbSize) knobTrackReverbSize.setValue(40);
      if (knobTrackReverbMix) knobTrackReverbMix.setValue(25);
      if (btnTrackReverbToggle) {
        btnTrackReverbToggle.classList.remove('active');
        btnTrackReverbToggle.textContent = 'OFF';
      }
      showToastNotification('Reverb Restaurado', 'Reverb retornado ao Concert Hall 40%/25% (OFF).', 'info');
    });
  }

  // Atualizar Knobs, Toggles e Modo Reverb da pista selecionada
  fxRack.onSelectionChange((ch, params) => {
    const chName = synth.channels[ch] ? synth.channels[ch].name : `CH ${ch < 10 ? '0' + ch : ch}`;
    if (fxRackTitleEl) {
      fxRackTitleEl.textContent = `EFEITOS DA PISTA - ${chName.toUpperCase()}`;
    }

    const chObj = synth.channels[ch];
    if (chObj && chObj.adsr) {
      if (knobTrackAdsrAttack) knobTrackAdsrAttack.setValue(Math.round(chObj.adsr.attack * 1000));
      if (knobTrackAdsrDecay) knobTrackAdsrDecay.setValue(Math.round(chObj.adsr.decay * 1000));
      if (knobTrackAdsrSustain) knobTrackAdsrSustain.setValue(Math.round(chObj.adsr.sustain * 100));
      if (knobTrackAdsrRelease) knobTrackAdsrRelease.setValue(Math.round(chObj.adsr.release * 1000));
    }

    if (btnTrackCutoffToggle) {
      const isAct = params.cutoffEnabled === true;
      btnTrackCutoffToggle.classList.toggle('active', isAct);
      btnTrackCutoffToggle.textContent = isAct ? 'ON' : 'OFF';
    }
    if (btnTrackEqToggle) {
      const isAct = params.eqEnabled === true;
      btnTrackEqToggle.classList.toggle('active', isAct);
      btnTrackEqToggle.textContent = isAct ? 'ON' : 'OFF';
    }
    if (btnTrackChorusToggle) {
      const isAct = params.chorusEnabled === true;
      btnTrackChorusToggle.classList.toggle('active', isAct);
      btnTrackChorusToggle.textContent = isAct ? 'ON' : 'OFF';
    }
    if (btnTrackDelayToggle) {
      const isAct = params.delayEnabled === true;
      btnTrackDelayToggle.classList.toggle('active', isAct);
      btnTrackDelayToggle.textContent = isAct ? 'ON' : 'OFF';
    }
    if (btnTrackReverbToggle) {
      const isAct = params.reverbEnabled === true;
      btnTrackReverbToggle.classList.toggle('active', isAct);
      btnTrackReverbToggle.textContent = isAct ? 'ON' : 'OFF';
    }

    if (selectTrackReverbMode) {
      selectTrackReverbMode.value = params.reverbMode || 'concert_hall';
    }

    if (knobTrackCutoff) knobTrackCutoff.setValue(params.cutoffFreq || 20000);
    if (knobTrackEqLow) knobTrackEqLow.setValue(params.eqLow);
    if (knobTrackEqMid) knobTrackEqMid.setValue(params.eqMid);
    if (knobTrackEqHigh) knobTrackEqHigh.setValue(params.eqHigh);
    if (knobTrackChorusMix) knobTrackChorusMix.setValue(params.chorusMix || 30);
    if (knobTrackDelayTime) knobTrackDelayTime.setValue(params.delayTime);
    if (knobTrackDelayMix) knobTrackDelayMix.setValue(params.delayMix);
    if (knobTrackReverbSize) knobTrackReverbSize.setValue(params.reverbSize);
    if (knobTrackReverbMix) knobTrackReverbMix.setValue(params.reverbMix);

    updateTrackVelUI(ch);
  });

  // Instanciar Gerenciador de Banco de Dados SQLite
  const dbManager = (window.BenDatabaseManager) ? new window.BenDatabaseManager() : null;

  // Track Velocity Visualizer & Controls Setup
  const trackVelCanvas = document.getElementById('trackVelCanvas');
  const selectTrackVelMode = document.getElementById('selectTrackVelMode');
  const trackVelModuleTitle = document.getElementById('trackVelModuleTitle');
  const btnTrackVelToggle = document.getElementById('btnTrackVelToggle');
  const btnSaveCustomVelCurve = document.getElementById('btnSaveCustomVelCurve');

  const inputTrackVelMin = document.getElementById('inputTrackVelMin');
  const inputTrackVelMax = document.getElementById('inputTrackVelMax');
  const inputTrackVelPower = document.getElementById('inputTrackVelPower');
  const lblVelMin = document.getElementById('lblVelMin');
  const lblVelMax = document.getElementById('lblVelMax');
  const lblVelPower = document.getElementById('lblVelPower');
  const customVelControlsGroup = document.getElementById('customVelControlsGroup');

  // Modal para Salvar Curva no SQLite DB
  const saveVelCurveModal = document.getElementById('saveVelCurveModal');
  const inputVelCurveName = document.getElementById('inputVelCurveName');
  const btnConfirmVelCurveModal = document.getElementById('btnConfirmVelCurveModal');
  const btnCancelVelCurveModal = document.getElementById('btnCancelVelCurveModal');

  let trackVelocityVisualizer = null;

  if (trackVelCanvas && window.VelocityVisualizerManager && synth) {
    trackVelocityVisualizer = new VelocityVisualizerManager(trackVelCanvas, synth, () => {
      const activeCh = fxRack ? fxRack.selectedChannel : 1;
      const chObj = synth.channels[activeCh];
      if (chObj && chObj.velocitySettings) {
        return chObj.velocitySettings.useGlobal ? synth.globalVelocitySettings : chObj.velocitySettings;
      }
      return synth.globalVelocitySettings;
    });
  }

  function populateVelocityCurveDropdown() {
    if (!selectTrackVelMode || !dbManager) return;
    const curves = dbManager.getVelocityCurves();
    selectTrackVelMode.replaceChildren();
    const addOption = (parent, value, label) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      parent.appendChild(option);
    };
    addOption(selectTrackVelMode, 'global', '🌐 Usar Padrão Global');
    addOption(selectTrackVelMode, 'normal', 'Standard (Normal)');
    addOption(selectTrackVelMode, 'soft', 'Soft (Sensível / Leve)');
    addOption(selectTrackVelMode, 'hard', 'Hard (Forte / Pesado)');
    addOption(selectTrackVelMode, 'compressed', 'Comprimido (Dyn Compress)');
    addOption(selectTrackVelMode, 'fixed', 'Fixo (Velocity 120)');

    const customCurves = curves.filter((curve) => !curve.isFactory);
    if (customCurves.length > 0) {
      const group = document.createElement('optgroup');
      group.label = 'CURVAS SALVAS NO APP';
      customCurves.forEach((curve) => addOption(group, curve.id, curve.name));
      selectTrackVelMode.appendChild(group);
    }
    addOption(selectTrackVelMode, 'custom', '✏️ Personalizado (Sliders)');
  }

  Promise.resolve(dbManager?.ready).then(() => populateVelocityCurveDropdown());

  function updateTrackVelUI(ch) {
    const chObj = synth.channels[ch];
    if (!chObj) return;
    if (!chObj.velocitySettings) {
      chObj.velocitySettings = { useGlobal: true, mode: 'normal', minVel: 1, maxVel: 127, curvePower: 2.0, fixedVel: 120 };
    }

    const vel = chObj.velocitySettings;
    const isGlobal = vel.useGlobal;

    if (selectTrackVelMode) {
      selectTrackVelMode.value = isGlobal ? 'global' : (vel.curveId || vel.mode || 'normal');
    }

    if (btnTrackVelToggle) {
      const isCustom = !isGlobal;
      btnTrackVelToggle.classList.toggle('active', isCustom);
      btnTrackVelToggle.textContent = isCustom ? 'ON' : 'OFF';
      btnTrackVelToggle.title = isCustom ? 'Velocity na Pista ATIVADO (Personalizado nesta faixa)' : 'Velocity na Pista DESLIGADO (Usando Padrão Global)';
    }

    if (trackVelModuleTitle) {
      const chName = chObj.name || `CH ${ch}`;
      trackVelModuleTitle.textContent = `VELOCITY DA PISTA (${chName})`;
    }

    if (inputTrackVelMin) {
      inputTrackVelMin.value = vel.minVel !== undefined ? vel.minVel : 1;
      if (lblVelMin) lblVelMin.textContent = inputTrackVelMin.value;
    }
    if (inputTrackVelMax) {
      inputTrackVelMax.value = vel.maxVel !== undefined ? vel.maxVel : 127;
      if (lblVelMax) lblVelMax.textContent = inputTrackVelMax.value;
    }
    if (inputTrackVelPower) {
      inputTrackVelPower.value = vel.curvePower !== undefined ? vel.curvePower : 2.0;
      if (lblVelPower) lblVelPower.textContent = inputTrackVelPower.value;
    }

    if (trackVelocityVisualizer) {
      const currentSettings = isGlobal ? synth.globalVelocitySettings : vel;
      trackVelocityVisualizer.render(currentSettings);
    }
  }

  window.updateTrackVelUI = updateTrackVelUI;

  // Listeners para Sliders da Curva Personalizada
  function onSliderVelChange() {
    const activeCh = fxRack ? fxRack.selectedChannel : 1;
    const chObj = synth.channels[activeCh];
    if (!chObj) return;

    if (!chObj.velocitySettings) {
      chObj.velocitySettings = { useGlobal: false, mode: 'custom', minVel: 1, maxVel: 127, curvePower: 2.0 };
    }

    chObj.velocitySettings.useGlobal = false;
    chObj.velocitySettings.mode = 'custom';
    chObj.velocitySettings.minVel = parseInt(inputTrackVelMin.value, 10);
    chObj.velocitySettings.maxVel = parseInt(inputTrackVelMax.value, 10);
    chObj.velocitySettings.curvePower = parseFloat(inputTrackVelPower.value);

    if (lblVelMin) lblVelMin.textContent = inputTrackVelMin.value;
    if (lblVelMax) lblVelMax.textContent = inputTrackVelMax.value;
    if (lblVelPower) lblVelPower.textContent = inputTrackVelPower.value;

    if (selectTrackVelMode) selectTrackVelMode.value = 'custom';
    if (mixerConsole) mixerConsole.updateChannelVelocityBadge(activeCh);
    updateTrackVelUI(activeCh);
  }

  if (inputTrackVelMin) inputTrackVelMin.addEventListener('input', onSliderVelChange);
  if (inputTrackVelMax) inputTrackVelMax.addEventListener('input', onSliderVelChange);
  if (inputTrackVelPower) inputTrackVelPower.addEventListener('input', onSliderVelChange);

  // Modal para Salvar no SQLite
  if (btnSaveCustomVelCurve) {
    btnSaveCustomVelCurve.addEventListener('click', () => {
      if (saveVelCurveModal) {
        if (inputVelCurveName) {
          inputVelCurveName.value = `Curva Persona ${dbManager ? dbManager.getVelocityCurves().length + 1 : 1}`;
        }
        openAccessibleModal(saveVelCurveModal, inputVelCurveName);
      }
    });
  }

  if (btnCancelVelCurveModal) {
    btnCancelVelCurveModal.addEventListener('click', () => {
      closeAccessibleModal(saveVelCurveModal);
    });
  }

  if (btnConfirmVelCurveModal) {
    btnConfirmVelCurveModal.addEventListener('click', async () => {
      const name = inputVelCurveName ? inputVelCurveName.value.trim() : '';
      if (!name || !dbManager) return;

      const activeCh = fxRack ? fxRack.selectedChannel : 1;
      const chObj = synth.channels[activeCh];
      const vel = (chObj && chObj.velocitySettings) ? chObj.velocitySettings : { minVel: 1, maxVel: 127, curvePower: 2.0, mode: 'custom' };

      const saved = await dbManager.addCustomVelocityCurve({
        name: name,
        minVel: vel.minVel,
        maxVel: vel.maxVel,
        curvePower: vel.curvePower,
        mode: vel.mode || 'custom'
      });

      if (saved) {
        populateVelocityCurveDropdown();
        if (selectTrackVelMode) selectTrackVelMode.value = saved.id;
        showToastNotification('Curva salva', `Curva "${name}" armazenada no app.`, 'success');
      }

      closeAccessibleModal(saveVelCurveModal);
    });
  }

  if (btnTrackVelToggle) {
    btnTrackVelToggle.title = 'Clique com o botão direito para MIDI Learn';
    btnTrackVelToggle.addEventListener('click', () => {
      const activeCh = fxRack ? fxRack.selectedChannel : 1;
      const chObj = synth.channels[activeCh];
      if (!chObj) return;

      if (!chObj.velocitySettings) {
        chObj.velocitySettings = { useGlobal: true, mode: 'normal', minVel: 1, maxVel: 127 };
      }

      // Alternar ON (Velocity da Pista) / OFF (Padrão Global)
      chObj.velocitySettings.useGlobal = !chObj.velocitySettings.useGlobal;
      if (!chObj.velocitySettings.useGlobal && (!chObj.velocitySettings.mode || chObj.velocitySettings.mode === 'global')) {
        chObj.velocitySettings.mode = 'normal';
      }

      if (mixerConsole) {
        mixerConsole.updateChannelVelocityBadge(activeCh);
      }
      updateTrackVelUI(activeCh);
      showToastNotification(
        'Velocity por Pista',
        chObj.velocitySettings.useGlobal ? 'Desativado (Usando Padrão Global)' : 'Ativado para esta pista',
        'info'
      );
    });
    if (midiLearn) midiLearn.attach(btnTrackVelToggle, 'Velocity Pista ON/OFF', () => {});
  }

  if (selectTrackVelMode) {
    selectTrackVelMode.addEventListener('change', (e) => {
      const activeCh = fxRack ? fxRack.selectedChannel : 1;
      const chObj = synth.channels[activeCh];
      if (!chObj) return;

      if (!chObj.velocitySettings) {
        chObj.velocitySettings = { useGlobal: true, mode: 'normal', minVel: 1, maxVel: 127 };
      }

      const val = e.target.value;
      if (val === 'global') {
        chObj.velocitySettings.useGlobal = true;
      } else if (val.startsWith('custom_') || val.startsWith('fact_')) {
        chObj.velocitySettings.useGlobal = false;
        chObj.velocitySettings.curveId = val;
        if (dbManager) {
          const found = dbManager.getVelocityCurves().find(c => c.id === val);
          if (found) {
            chObj.velocitySettings.minVel = found.minVel;
            chObj.velocitySettings.maxVel = found.maxVel;
            chObj.velocitySettings.curvePower = found.curvePower;
            chObj.velocitySettings.mode = found.mode;
          }
        }
      } else {
        chObj.velocitySettings.useGlobal = false;
        chObj.velocitySettings.mode = val;
      }

      if (mixerConsole) {
        mixerConsole.updateChannelVelocityBadge(activeCh);
      }
      updateTrackVelUI(activeCh);
    });
  }

  // Modal de Nome do Novo Preset (Compatível 100% com Electron & Web)
  const newPresetNameModal = document.getElementById('newPresetNameModal');
  const inputNewPresetName = document.getElementById('inputNewPresetName');
  const btnConfirmPresetModal = document.getElementById('btnConfirmPresetModal');
  const btnCancelPresetModal = document.getElementById('btnCancelPresetModal');

  function openNewPresetModal() {
    if (!newPresetNameModal) return;
    if (inputNewPresetName) {
      inputNewPresetName.value = `Preset Live ${presetManager.userPresets.size + 1}`;
    }
    openAccessibleModal(newPresetNameModal, inputNewPresetName);
  }

  function closeNewPresetModal() {
    closeAccessibleModal(newPresetNameModal);
  }

  const btnNewPreset = document.getElementById('btnNewPreset');
  if (btnNewPreset) {
    btnNewPreset.addEventListener('click', () => openNewPresetModal());
  }

  if (btnCancelPresetModal) {
    btnCancelPresetModal.addEventListener('click', () => closeNewPresetModal());
  }

  if (btnConfirmPresetModal) {
    btnConfirmPresetModal.addEventListener('click', () => {
      const name = inputNewPresetName ? inputNewPresetName.value.trim() : '';
      if (name) {
        presetManager.createNewPreset(name);
        closeNewPresetModal();
      }
    });
  }

  if (inputNewPresetName) {
    inputNewPresetName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const name = inputNewPresetName.value.trim();
        if (name) {
          presetManager.createNewPreset(name);
          closeNewPresetModal();
        }
      } else if (e.key === 'Escape') {
        closeNewPresetModal();
      }
    });
  }

  if (btnSavePreset) {
    btnSavePreset.addEventListener('click', () => {
      if (presetManager.activePresetName) {
        presetManager.saveActivePreset();
      } else {
        openNewPresetModal();
      }
    });
  }

  if (btnLoadPreset) {
    btnLoadPreset.addEventListener('click', () => {
      presetManager.openPresetFileDialog();
    });
  }

  // Botão Recolher / Expandir Efeitos da Pista
  const btnToggleCollapseTrackFx = document.getElementById('btnToggleCollapseTrackFx');
  const trackFxBodyContainer = document.getElementById('trackFxBodyContainer');
  let isTrackFxCollapsed = false;

  if (btnToggleCollapseTrackFx && trackFxBodyContainer) {
    btnToggleCollapseTrackFx.addEventListener('click', () => {
      isTrackFxCollapsed = !isTrackFxCollapsed;
      trackFxBodyContainer.style.display = isTrackFxCollapsed ? 'none' : 'flex';
      btnToggleCollapseTrackFx.textContent = isTrackFxCollapsed ? '▲ Expandir' : '▼ Recolher';
    });
  }

  if (presetFileInput) {
    presetFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        presetManager.importPresetFromJsonFile(e.target.files[0]);
      }
    });
  }

  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const selectedVal = e.target.value;
      if (presetManager.userPresets.has(selectedVal)) {
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

  const activePointerNotes = new Map();

  function releaseVirtualPointer(pointerId) {
    const played = activePointerNotes.get(pointerId);
    if (!played) return;
    activePointerNotes.delete(pointerId);
    played.keyElement.classList.remove('active');
    synth.noteOffTrack(played.note, played.track);
  }

  function releaseAllVirtualPointers() {
    Array.from(activePointerNotes.keys()).forEach(releaseVirtualPointer);
  }

  // Renderizar Teclado Virtual Piano com Proporções Piano Real Slender
  function renderPianoKeyboard() {
    releaseAllVirtualPointers();
    pianoKeysEl.replaceChildren();
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

      const keyEl = document.createElement('button');
      keyEl.type = 'button';
      keyEl.className = `piano-key ${isBlack ? 'black' : 'white'}`;
      keyEl.dataset.note = noteNum;
      keyEl.style.touchAction = 'none';
      const octave = Math.floor(noteNum / 12) - 1;
      keyEl.setAttribute('aria-label', `${noteName}${octave}, nota MIDI ${noteNum}`);
      keyEl.title = `${noteName}${octave}. Velocity por pressão quando disponível; caso contrário, pela posição vertical.`;

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

      const playVirtualKey = (ownerId, velocity) => {
        if (activePointerNotes.has(ownerId)) return;
        keyEl.classList.add('active');
        const activeTrack = mixerConsole ? mixerConsole.selectedChannel : 1;
        activePointerNotes.set(ownerId, { note: noteNum, track: activeTrack, keyElement: keyEl });
        synth.noteOnTrack(noteNum, velocity, activeTrack);
      };

      const triggerNoteOn = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        window.audioEngine.resume().then(() => updateAudioStatus(true));
        const velocity = window.PerformanceInput
          ? PerformanceInput.pointerVelocity(e, keyEl.getBoundingClientRect())
          : 100;
        playVirtualKey(e.pointerId, velocity);
        try { keyEl.setPointerCapture(e.pointerId); } catch (err) {}
      };

      const triggerNoteOff = (e) => {
        e.preventDefault();
        releaseVirtualPointer(e.pointerId);
      };

      keyEl.addEventListener('pointerdown', triggerNoteOn);
      keyEl.addEventListener('pointerup', triggerNoteOff);
      keyEl.addEventListener('pointercancel', triggerNoteOff);
      keyEl.addEventListener('lostpointercapture', triggerNoteOff);
      keyEl.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key) || event.repeat) return;
        event.preventDefault();
        window.audioEngine.resume().then(() => updateAudioStatus(true));
        playVirtualKey(`keyboard-${noteNum}`, 100);
      });
      keyEl.addEventListener('keyup', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        releaseVirtualPointer(`keyboard-${noteNum}`);
      });
      keyEl.addEventListener('blur', () => releaseVirtualPointer(`keyboard-${noteNum}`));

      pianoKeysEl.appendChild(keyEl);
    }

    const endOctave = Math.floor((startNote + totalKeysToRender) / 12) - 1;
    if (octaveDisplay) {
      octaveDisplay.textContent = `C${Math.floor(startNote / 12) - 1} - C${endOctave}`;
    }
    const fullPiano = totalKeysToRender === 88;
    [btnOctaveDown, btnOctaveUp].forEach((button) => {
      if (!button) return;
      button.disabled = fullPiano;
      button.title = fullPiano ? 'A extensão de 88 teclas já mostra todo o piano.' : 'Deslocar a janela do teclado virtual em uma oitava.';
    });
  }

  renderPianoKeyboard();

  btnOctaveUp.addEventListener('click', () => {
    if (totalKeysToRender !== 88 && baseOctave < 7) {
      baseOctave++;
      renderPianoKeyboard();
    }
  });

  btnOctaveDown.addEventListener('click', () => {
    if (totalKeysToRender !== 88 && baseOctave > 1) {
      baseOctave--;
      renderPianoKeyboard();
    }
  });

  // Mapeamento de Teclado QWERTY
  const qwertyKeyMap = {
    'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5,
    't': 6, 'g': 7, 'y': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12
  };

  const activeQwertyKeys = new Map();
  let isMasterMuted = false;
  let previousMasterVolume = window.audioEngine.getMasterVolume();

  const isTypingTarget = (target) => target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);

  function releaseAllQwertyKeys() {
    activeQwertyKeys.forEach((played) => synth.noteOffTrack(played.note, played.track));
    activeQwertyKeys.clear();
  }

  function panicAllNotes(showFeedback = true) {
    releaseAllVirtualPointers();
    releaseAllQwertyKeys();
    if (typeof synth.allNotesOff === 'function') synth.allNotesOff();
    pianoKeysEl?.querySelectorAll('.active').forEach((key) => key.classList.remove('active'));
    if (showFeedback) showToastNotification('Panic acionado', 'Todas as notas e pedais pendentes foram liberados.', 'warning');
  }

  const btnPanic = document.getElementById('btnPanic');
  if (btnPanic) btnPanic.addEventListener('click', () => panicAllNotes(true));

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      presetManager.saveActivePreset();
      return;
    }

    if (e.key === 'Escape' && !activeModal) {
      e.preventDefault();
      panicAllNotes(true);
      return;
    }
    if (e.repeat || isTypingTarget(e.target) || e.target.closest?.('[role="slider"], .piano-key')) return;
    const key = e.key.toLowerCase();

    if (key === 'z') {
      if (totalKeysToRender !== 88 && baseOctave > 1) {
        baseOctave--;
        renderPianoKeyboard();
      }
      return;
    }
    if (key === 'x') {
      if (totalKeysToRender !== 88 && baseOctave < 7) {
        baseOctave++;
        renderPianoKeyboard();
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      isMasterMuted = !isMasterMuted;
      if (isMasterMuted) {
        previousMasterVolume = window.audioEngine.getMasterVolume();
        window.audioEngine.setMasterVolume(0);
      } else {
        window.audioEngine.setMasterVolume(previousMasterVolume);
      }
      document.body.classList.toggle('master-muted', isMasterMuted);
      showToastNotification('Master Mute', isMasterMuted ? 'Saída master silenciada.' : `Volume restaurado em ${Math.round(previousMasterVolume * 100)}%.`, 'info');
      return;
    }

    if (key in qwertyKeyMap && !activeQwertyKeys.has(key)) {
      const noteNum = (baseOctave * 12) + qwertyKeyMap[key];
      const activeTrack = mixerConsole ? mixerConsole.selectedChannel : 1;
      activeQwertyKeys.set(key, { note: noteNum, track: activeTrack });
      window.audioEngine.resume().then(() => updateAudioStatus(true));
      // Teclados QWERTY comuns não possuem sensor de pressão.
      synth.noteOnTrack(noteNum, 100, activeTrack);
    }
  });

  const viewTabs = [tabMixer, tabFxRack, tabSetlist].filter(Boolean);
  viewTabs.forEach((tab, index) => tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + viewTabs.length) % viewTabs.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % viewTabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = viewTabs.length - 1;
    viewTabs[nextIndex].focus();
    viewTabs[nextIndex].click();
  }));

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in qwertyKeyMap) {
      const played = activeQwertyKeys.get(key);
      activeQwertyKeys.delete(key);
      if (played) synth.noteOffTrack(played.note, played.track);
    }
  });

  window.addEventListener('blur', () => panicAllNotes(false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) panicAllNotes(false);
  });

  // Upload & Drag-and-Drop de Arquivos SF2
  sf2DropZone.addEventListener('click', () => sf2FileInput.click());
  sf2DropZone.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    sf2FileInput.click();
  });

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
      handleSf2Files(e.dataTransfer.files);
    }
  });

  sf2FileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleSf2Files(e.target.files);
    }
  });



  // Atalhos Globais de Palco (Troca de Músicas do Setlist via Teclado / Pedal)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'N' || e.key === 'n' || e.key === 'PageDown') {
      setlistManager.nextSong();
    } else if (e.key === 'P' || e.key === 'p' || e.key === 'PageUp') {
      setlistManager.prevSong();
    }
  });

  const btnPrevSong = document.getElementById('btnPrevSong');
  const btnNextSong = document.getElementById('btnNextSong');
  if (btnPrevSong) btnPrevSong.addEventListener('click', () => setlistManager.prevSong());
  if (btnNextSong) btnNextSong.addEventListener('click', () => setlistManager.nextSong());

  // Handlers para o Modal de Adicionar Música ao Setlist
  const btnAddSongToSetlist = document.getElementById('btnAddSongToSetlist');
  const addSongModal = document.getElementById('addSongModal');
  const inputSongTitle = document.getElementById('inputSongTitle');
  const selectSongPreset = document.getElementById('selectSongPreset');
  const songPresetSelectContainer = document.getElementById('songPresetSelectContainer');
  const inputSongNotes = document.getElementById('inputSongNotes');
  const btnConfirmAddSongModal = document.getElementById('btnConfirmAddSongModal');
  const btnCancelAddSongModal = document.getElementById('btnCancelAddSongModal');

  if (btnAddSongToSetlist && addSongModal) {
    btnAddSongToSetlist.addEventListener('click', () => {
    if (selectSongPreset) {
        selectSongPreset.replaceChildren();
        presetManager.userPresets.forEach((p, name) => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          selectSongPreset.appendChild(option);
        });
        if (selectSongPreset.options.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = '(Nenhum preset salvo — crie um preset no Mixer primeiro)';
          selectSongPreset.appendChild(option);
        }
      }
      if (inputSongTitle) inputSongTitle.value = `Música ${setlistManager.getSetlistItems().length + 1}`;
      
      const snapRadio = addSongModal.querySelector('input[name="songSourceType"][value="snapshot"]');
      if (snapRadio) snapRadio.checked = true;
      if (songPresetSelectContainer) songPresetSelectContainer.style.display = 'none';

      openAccessibleModal(addSongModal, inputSongTitle);
    });

    addSongModal.querySelectorAll('input[name="songSourceType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (songPresetSelectContainer) {
          songPresetSelectContainer.style.display = e.target.value === 'preset' ? 'block' : 'none';
        }
      });
    });
  }

  if (btnCancelAddSongModal) {
    btnCancelAddSongModal.addEventListener('click', () => {
      closeAccessibleModal(addSongModal);
    });
  }

  if (btnConfirmAddSongModal) {
    btnConfirmAddSongModal.addEventListener('click', () => {
      const title = inputSongTitle ? inputSongTitle.value.trim() : '';
      const preset = selectSongPreset ? selectSongPreset.value : '';
      const notes = inputSongNotes ? inputSongNotes.value.trim() : '';
      const sourceType = addSongModal.querySelector('input[name="songSourceType"]:checked')?.value || 'snapshot';

      if (title) {
        const useSnapshot = sourceType === 'snapshot';
        setlistManager.addItem(title, preset, notes, useSnapshot);
        closeAccessibleModal(addSongModal);
      }
    });
  }

  function handleSf2Files(filesList) {
    const files = Array.from(filesList).filter(f => f.name.toLowerCase().endsWith('.sf2'));
    if (files.length === 0) {
      showToastNotification('Arquivo Inválido', 'Selecione um arquivo .sf2 PCM. SF3 comprimido ainda não é suportado.', 'warning');
      return;
    }

    let loadedCount = 0;
    let failedCount = 0;
    let completedCount = 0;
    sf2DropZone.setAttribute('aria-busy', 'true');
    if (sf2LoadStatus) sf2LoadStatus.textContent = `Carregando ${files.length} arquivo(s) SoundFont.`;
    const finishFile = () => {
      completedCount++;
      if (completedCount < files.length) return;
      sf2DropZone.setAttribute('aria-busy', 'false');
      if (sf2LoadStatus) sf2LoadStatus.textContent = `${loadedCount} SoundFont(s) carregado(s); ${failedCount} falha(s).`;
    };
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const arrayBuffer = evt.target.result;
          const parser = new SoundFont2Parser(arrayBuffer);
          const parsedData = parser.parse();

          const allPresets = synth.loadSoundFont(parsedData, file.name);
          updatePresetListUI(allPresets);

          if (mixerConsole) {
            mixerConsole.renderMixer();
          }

          loadedCount++;
          const addedCount = parsedData.presets ? parsedData.presets.length : 0;
          showToastNotification(
            'SoundFont Adicionado!',
            `"${file.name}" adicionado com sucesso (+${addedCount} timbres na biblioteca). Total: ${allPresets.length} timbres.`,
            'success'
          );
        } catch (err) {
          failedCount++;
          console.error(`Erro ao ler arquivo SF2 (${file.name}):`, err);
          showToastNotification('Erro ao Carregar SF2', `Falha ao carregar "${file.name}": ${err.message}`, 'warning');
        } finally {
          finishFile();
        }
      };
      reader.onerror = () => {
        failedCount++;
        showToastNotification('Erro ao Ler Arquivo', `Não foi possível ler "${file.name}".`, 'warning');
        finishFile();
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function updatePresetListUI(presets) {
    presetListEl.replaceChildren();
    sf2PresetCount.textContent = `${presets.length} Timbres`;

    presets.forEach((p, idx) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `preset-item ${idx === 0 ? 'active' : ''}`;
      item.setAttribute('aria-pressed', String(idx === 0));
      const text = document.createElement('span');
      text.className = 'preset-item-text';
      const name = document.createElement('span');
      name.className = 'preset-item-name';
      name.textContent = String(p.name || 'Timbre sem nome');
      text.appendChild(name);
      if (p.sf2Source) {
        const source = document.createElement('span');
        source.className = 'preset-item-source';
        source.textContent = String(p.sf2Source);
        text.appendChild(source);
      }
      const program = document.createElement('span');
      program.className = 'preset-item-program';
      program.textContent = `${p.bank}:${p.preset}`;
      item.append(text, program);
      item.addEventListener('click', () => {
        presetListEl.querySelectorAll('.preset-item').forEach((element) => {
          element.classList.remove('active');
          element.setAttribute('aria-pressed', 'false');
        });
        item.classList.add('active');
        item.setAttribute('aria-pressed', 'true');

        // Atribuir o timbre clicado EXCLUSIVAMENTE à PISTA SELECIONADA no Mixer!
        const activeCh = mixerConsole ? mixerConsole.selectedChannel : 1;
        synth.setChannelPreset(activeCh, idx);

        if (mixerConsole) {
          mixerConsole.updateChannelPresetDropdown(activeCh, idx);
        }

        const chName = synth.channels[activeCh] ? synth.channels[activeCh].name : `CH ${activeCh}`;
        showToastNotification('Timbre Atribuído', `"${p.name}" atribuído à pista ${chName}.`, 'info');
      });

      // Duplo Clique no Timbre ➔ Adicionar Nova Pista e Atribuir
      item.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (mixerConsole) {
          if (mixerConsole.totalChannels < 16) {
            mixerConsole.addChannel();
            const newCh = mixerConsole.totalChannels;
            synth.setChannelPreset(newCh, idx);
            mixerConsole.selectChannel(newCh);
            mixerConsole.updateChannelPresetDropdown(newCh, idx);
            showToastNotification('Nova Pista Criada!', `Pista CH ${newCh} adicionada com timbre "${p.name}".`, 'success');
          } else {
            showToastNotification('Limite Alcançado', 'Máximo de 16 pistas MIDI atingido.', 'warning');
          }
        }
      });

      presetListEl.appendChild(item);
    });
  }

  // Duplo clique na área vazia do Mixer ➔ Adicionar Nova Pista
  const mixerContainerEl = document.getElementById('mixerContainer');
  if (mixerContainerEl) {
    mixerContainerEl.addEventListener('dblclick', (e) => {
      if (e.target === mixerContainerEl || e.target.classList.contains('app-workspace')) {
        if (mixerConsole && mixerConsole.totalChannels < 16) {
          mixerConsole.addChannel();
          showToastNotification('Nova Pista Criada', `Pista CH ${mixerConsole.totalChannels} adicionada.`, 'info');
        }
      }
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
      voiceCountDisplay.textContent = `${synth.getActiveVoicesCount()} / ${synth.isAutoPolyphony ? 'Auto (' + (synth.maxPolyphony ? synth.maxPolyphony : '64') + ')' : synth.maxPolyphony}`;
    }
  }, 200);

  document.body.addEventListener('click', () => {
    window.audioEngine.resume().then(() => updateAudioStatus(true));
  }, { once: true });
});
