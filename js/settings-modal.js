/**
 * SETTINGS MODAL MANAGER
 * Gerencia o painel de configurações de áudio, polifonia, sensibilidade de toque e mapeamento de múltiplos controladores MIDI.
 * FIX: enumeração de saídas de áudio com labels reais via getUserMedia + toggle Ativo/Inativo por controlador MIDI.
 */

class SettingsModalManager {
  constructor(audioEngine, webMidiManager, synthEngine) {
    this.audioEngine = audioEngine;
    this.webMidi = webMidiManager;
    this.synth = synthEngine;

    this.modalBackdrop = null;
    this.btnClose = null;
    this.btnSave = null;
    this.audioOutputSelect = null;
    this.sampleRateSelect = null;
    this.bufferSizeSelect = null;
    this.modalPolyphonySelect = null;
    this.modalVelocityCurveSelect = null;
    this.modalThemeSelect = null;
    this.midiDevicesListContainer = null;
  }

  init() {
    this.modalBackdrop = document.getElementById('settingsModal');
    this.btnClose = document.getElementById('btnCloseSettings');
    this.btnSave = document.getElementById('btnSaveSettings');
    this.audioOutputSelect = document.getElementById('audioOutputSelect');
    this.sampleRateSelect = document.getElementById('sampleRateSelect');
    this.bufferSizeSelect = document.getElementById('bufferSizeSelect');
    this.modalThemeSelect = document.getElementById('modalThemeSelect');
    this.modalPolyphonySelect = document.getElementById('modalPolyphonySelect');
    this.modalVelocityCurveSelect = document.getElementById('modalVelocityCurveSelect');
    this.midiDevicesListContainer = document.getElementById('midiDevicesListContainer');

    // Carregar tema salvo no localStorage (padrão: Nord Stage Red)
    const savedTheme = localStorage.getItem('bensf2_theme') || 'nord_red';
    this.setTheme(savedTheme);

    if (this.modalThemeSelect) {
      this.modalThemeSelect.value = savedTheme;
      this.modalThemeSelect.addEventListener('change', (e) => {
        this.setTheme(e.target.value);
      });
    }

    const canvasEl = document.getElementById('velocityCurveCanvas');
    if (canvasEl && this.synth && window.VelocityVisualizerManager) {
      this.velocityVisualizer = new VelocityVisualizerManager(canvasEl, this.synth);
    }

    const btnOpen = document.getElementById('btnOpenSettings');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.openModal());
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.closeModal());
    }

    if (this.modalBackdrop) {
      this.modalBackdrop.addEventListener('click', (e) => {
        if (e.target === this.modalBackdrop) this.closeModal();
      });
    }

    if (this.btnSave) {
      this.btnSave.addEventListener('click', () => this.applySettings());
    }

    if (this.modalPolyphonySelect && this.synth) {
      this.modalPolyphonySelect.addEventListener('change', (e) => {
        this.synth.setMaxPolyphony(e.target.value);
      });
    }

    if (this.modalVelocityCurveSelect && this.synth) {
      this.modalVelocityCurveSelect.addEventListener('change', (e) => {
        this.synth.setVelocityCurve(e.target.value);
        if (typeof window.updateTrackVelUI === 'function' && window.fxRack) {
          window.updateTrackVelUI(window.fxRack.selectedChannel);
        }
      });
    }

    // Pré-carrega lista de áudio ao iniciar (com labels desbloqueados)
    this.populateAudioOutputDevices();
  }

  setTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('bensf2_theme', themeName);
    console.log(`[SettingsModal] Tema visual alterado para: ${themeName}`);
  }

  openModal() {
    if (!this.modalBackdrop) return;

    if (this.modalPolyphonySelect && this.synth) {
      this.modalPolyphonySelect.value = this.synth.isAutoPolyphony ? 'auto' : this.synth.maxPolyphony;
    }
    if (this.modalVelocityCurveSelect && this.synth) {
      this.modalVelocityCurveSelect.value = this.synth.velocityCurve || 'normal';
    }

    this.populateAudioOutputDevices();
    this.populateMidiDevicesList();
    this.modalBackdrop.style.display = 'flex';
  }

  closeModal() {
    if (!this.modalBackdrop) return;
    this.modalBackdrop.style.display = 'none';
  }

  /**
   * FIX SAÍDA DE ÁUDIO:
   * enumerateDevices() retorna labels vazios sem permissão de mídia.
   * Solução: chamar getUserMedia({audio: true}) para desbloquear os nomes reais
   * dos dispositivos, depois enumerar. Isso é necessário mesmo no Electron.
   */
  async populateAudioOutputDevices() {
    if (!this.audioOutputSelect) return;

    this.audioOutputSelect.innerHTML = '<option value="default">⏳ Carregando dispositivos...</option>';

    try {
      // Solicitar permissão de áudio para desbloquear os labels reais dos dispositivos
      // (sem isso, enumerateDevices retorna strings vazias nos nomes)
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (permErr) {
        console.warn('[SettingsModal] Permissão de áudio negada ou sem microfone. Labels podem ficar genéricos.', permErr);
      }

      const devices = await navigator.mediaDevices.enumerateDevices();

      // Parar a stream imediatamente (só precisávamos da permissão para desbloquear labels)
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }

      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      console.log('[SettingsModal] Saídas de áudio detectadas:', audioOutputs.map(d => d.label || d.deviceId));

      if (audioOutputs.length === 0) {
        this.audioOutputSelect.innerHTML = '<option value="default">🔊 Alto-falantes Padrão do Sistema</option>';
        return;
      }

      this.audioOutputSelect.innerHTML = audioOutputs.map(d => {
        // Limpar label: usar o nome real ou fallback descritivo
        const label = d.label
          ? d.label.replace(/\s*\(.*default.*\)/i, '').trim() // remove "(default)" do Windows
          : `🔊 Saída de Áudio ${d.deviceId.slice(0, 8)}`;

        const isDefault = d.deviceId === 'default' || d.deviceId === 'communications';
        const icon = isDefault ? '🔊' : '🎧';
        return `<option value="${d.deviceId}">${icon} ${label}</option>`;
      }).join('');

      // Restaurar seleção salva, se houver
      const savedDevice = localStorage.getItem('bensf2_audioOutput');
      if (savedDevice && this.audioOutputSelect.querySelector(`option[value="${savedDevice}"]`)) {
        this.audioOutputSelect.value = savedDevice;
      }

    } catch (e) {
      console.warn('[SettingsModal] Erro ao enumerar saídas de áudio:', e);
      this.audioOutputSelect.innerHTML = '<option value="default">🔊 Alto-falantes Padrão do Sistema</option>';
    }
  }

  /**
   * MIDI DEVICES LIST:
   * Mostra todos os controladores conectados com:
   *  - Nome e fabricante
   *  - Toggle ATIVO / INATIVO (habilita ou silencia o dispositivo)
   *  - Seletor de porta (canal MIDI de roteamento)
   */
  populateMidiDevicesList() {
    if (!this.midiDevicesListContainer) return;
    const devices = this.webMidi.getConnectedDevicesList();

    if (devices.length === 0) {
      this.midiDevicesListContainer.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px; background: rgba(0,0,0,0.2); border-radius: var(--radius-sm); line-height: 1.6;">
          🔌 Nenhum teclado controlador MIDI detectado via USB ou Bluetooth.<br>
          Conecte seu teclado MIDI e abra este menu novamente!
        </div>
      `;
      return;
    }

    this.midiDevicesListContainer.innerHTML = devices.map((dev, idx) => {
      const isActive = dev.active !== false; // padrão: ativo

      let chanOptions = `<option value="all" ${dev.assignedChannel === 'all' ? 'selected' : ''}>🎹 Todos os Canais (Layer)</option>`;
      for (let ch = 1; ch <= 16; ch++) {
        const isSel = (dev.assignedChannel === ch) ? 'selected' : '';
        const chLabel = ch < 10 ? `0${ch}` : `${ch}`;
        chanOptions += `<option value="${ch}" ${isSel}>Porta CH ${chLabel}</option>`;
      }

      const toggleBg = isActive ? 'rgba(0,230,118,0.15)' : 'rgba(255,42,75,0.1)';
      const toggleBorder = isActive ? 'rgba(0,230,118,0.5)' : 'rgba(255,42,75,0.4)';
      const toggleColor = isActive ? 'var(--accent-emerald, #00e676)' : '#ff2a4b';
      const toggleLabel = isActive ? '● ATIVO' : '○ INATIVO';

      return `
        <div class="midi-device-item" data-device-id="${dev.id}" style="
          padding: 12px 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid ${isActive ? 'rgba(0,230,118,0.25)' : 'rgba(255,42,75,0.2)'};
          border-radius: var(--radius-sm);
          margin-bottom: 8px;
          transition: border-color 0.2s;
        ">
          <!-- Linha superior: nome + toggle -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div>
              <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">🎹 ${dev.name}</div>
              <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                Fabricante: ${dev.manufacturer} &nbsp;|&nbsp; ID: ${dev.id.slice(0, 12)}...
              </div>
            </div>

            <!-- Toggle Ativo/Inativo -->
            <button
              class="midi-device-toggle"
              data-device-id="${dev.id}"
              data-active="${isActive}"
              style="
                padding: 5px 12px;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.5px;
                background: ${toggleBg};
                color: ${toggleColor};
                border: 1px solid ${toggleBorder};
                border-radius: 20px;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
              "
            >${toggleLabel}</button>
          </div>

          <!-- Linha inferior: seletor de porta/canal -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); white-space: nowrap;">Roteamento de Porta:</span>
            <select
              class="device-channel-select preset-select"
              data-device-id="${dev.id}"
              style="font-size: 11px; padding: 4px 8px; flex: 1; opacity: ${isActive ? '1' : '0.4'};"
              ${!isActive ? 'disabled' : ''}
            >${chanOptions}</select>
          </div>
        </div>
      `;
    }).join('');

    // Eventos: seletor de canal
    const selects = this.midiDevicesListContainer.querySelectorAll('.device-channel-select');
    selects.forEach(sel => {
      sel.addEventListener('change', (e) => {
        const devId = e.target.dataset.deviceId;
        const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
        this.webMidi.setDeviceChannelMapping(devId, val);
      });
    });

    // Eventos: toggle ativo/inativo
    const toggleBtns = this.midiDevicesListContainer.querySelectorAll('.midi-device-toggle');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const devId = btn.dataset.deviceId;
        const currentActive = btn.dataset.active === 'true';
        const newActive = !currentActive;

        this.webMidi.setDeviceActive(devId, newActive);

        // Atualizar UI do item sem re-renderizar tudo
        const item = btn.closest('.midi-device-item');
        btn.dataset.active = String(newActive);

        if (newActive) {
          btn.textContent = '● ATIVO';
          btn.style.background = 'rgba(0,230,118,0.15)';
          btn.style.color = 'var(--accent-emerald, #00e676)';
          btn.style.borderColor = 'rgba(0,230,118,0.5)';
          item.style.borderColor = 'rgba(0,230,118,0.25)';
        } else {
          btn.textContent = '○ INATIVO';
          btn.style.background = 'rgba(255,42,75,0.1)';
          btn.style.color = '#ff2a4b';
          btn.style.borderColor = 'rgba(255,42,75,0.4)';
          item.style.borderColor = 'rgba(255,42,75,0.2)';
        }

        // Habilitar/desabilitar o select de porta
        const chanSel = item.querySelector('.device-channel-select');
        if (chanSel) {
          chanSel.disabled = !newActive;
          chanSel.style.opacity = newActive ? '1' : '0.4';
        }

        console.log(`[SettingsModal] Controlador ${devId} → ${newActive ? 'ATIVO' : 'INATIVO'}`);
      });
    });
  }

  applySettings() {
    // Saída de áudio
    const selectedDeviceId = this.audioOutputSelect ? this.audioOutputSelect.value : 'default';
    localStorage.setItem('bensf2_audioOutput', selectedDeviceId);

    this._switchAudioOutput(selectedDeviceId);

    if (this.modalPolyphonySelect && this.synth) {
      this.synth.setMaxPolyphony(this.modalPolyphonySelect.value);
    }

    if (this.modalVelocityCurveSelect && this.synth) {
      this.synth.setVelocityCurve(this.modalVelocityCurveSelect.value);
    }

    console.log('[SettingsModal] Configurações salvas e aplicadas com sucesso!');
    this.closeModal();
    alert('✅ Configurações de Áudio, Polifonia e Controladores MIDI salvas!');
  }

  /**
   * Troca a saída de áudio sem quebrar o AudioContext nem parar o MIDI.
   * setSinkId() pode suspender o contexto — por isso fazemos resume() logo depois.
   */
  async _switchAudioOutput(deviceId) {
    const ctx = this.audioEngine && this.audioEngine.ctx;
    if (!ctx) return;

    // setSinkId está disponível no Chrome/Electron mais recentes
    if (typeof ctx.setSinkId === 'function') {
      try {
        await ctx.setSinkId(deviceId);
        console.log(`[SettingsModal] Saída de áudio trocada para: ${deviceId}`);
      } catch (e) {
        console.warn('[SettingsModal] setSinkId falhou (dispositivo pode não suportar):', e);
      }
    } else {
      console.warn('[SettingsModal] setSinkId não disponível nesta versão do Electron/Chrome.');
    }

    // CRÍTICO: setSinkId pode suspender o AudioContext — sempre fazer resume depois
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
        console.log('[SettingsModal] AudioContext retomado após troca de dispositivo.');
      } catch (e) {
        console.warn('[SettingsModal] Falha ao retomar AudioContext:', e);
      }
    }
  }
}

window.SettingsModalManager = SettingsModalManager;
