/**
 * SETTINGS MODAL MANAGER
 * Gerencia o painel de configurações de áudio, polifonia, sensibilidade de toque e mapeamento de múltiplos controladores MIDI.
 * Enumera saídas sem solicitar microfone e só confirma mudanças realmente aplicadas.
 */

function escapeSettingsHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    if (this.modalBackdrop) this.modalBackdrop.setAttribute('aria-hidden', 'true');
    this.configurePlatformManagedAudioControls();

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

    if (this.btnSave) this.btnSave.addEventListener('click', () => this.applySettings());
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
    this.modalBackdrop.setAttribute('aria-hidden', 'false');
    if (typeof window.openAccessibleModal === 'function') {
      window.openAccessibleModal(this.modalBackdrop, this.audioOutputSelect || this.btnSave);
    } else {
      this.modalBackdrop.style.display = 'flex';
      if (this.audioOutputSelect && typeof this.audioOutputSelect.focus === 'function') this.audioOutputSelect.focus();
    }
  }

  closeModal() {
    if (!this.modalBackdrop) return;
    this.modalBackdrop.setAttribute('aria-hidden', 'true');
    if (typeof window.closeAccessibleModal === 'function') window.closeAccessibleModal(this.modalBackdrop);
    else this.modalBackdrop.style.display = 'none';
  }

  configurePlatformManagedAudioControls() {
    const ctx = this.audioEngine && this.audioEngine.ctx;
    if (this.sampleRateSelect) {
      const actualRate = ctx && Number(ctx.sampleRate);
      this.sampleRateSelect.replaceChildren();
      const option = document.createElement('option');
      option.value = actualRate ? String(actualRate) : 'system';
      option.textContent = actualRate
        ? `${actualRate} Hz (definido pelo dispositivo/sistema)`
        : 'Definido pelo dispositivo/sistema';
      option.selected = true;
      this.sampleRateSelect.appendChild(option);
      this.sampleRateSelect.disabled = true;
      this.sampleRateSelect.setAttribute('aria-disabled', 'true');
      this.sampleRateSelect.title = 'O AudioContext atual não pode trocar sample rate com segurança durante a execução.';
    }
    if (this.bufferSizeSelect) {
      this.bufferSizeSelect.replaceChildren();
      const option = document.createElement('option');
      option.value = 'system';
      option.textContent = 'Gerenciado pelo navegador/sistema de áudio';
      option.selected = true;
      this.bufferSizeSelect.appendChild(option);
      this.bufferSizeSelect.disabled = true;
      this.bufferSizeSelect.setAttribute('aria-disabled', 'true');
      this.bufferSizeSelect.title = 'Web Audio não permite selecionar diretamente o tamanho do buffer.';
    }
  }

  async populateAudioOutputDevices() {
    if (!this.audioOutputSelect) return;
    const setSingleOption = (value, label) => {
      this.audioOutputSelect.replaceChildren();
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      this.audioOutputSelect.appendChild(option);
    };
    setSingleOption('default', '⏳ Carregando dispositivos...');

    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        setSingleOption('default', '🔊 Saída padrão do sistema');
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      if (audioOutputs.length === 0) {
        setSingleOption('default', '🔊 Saída padrão do sistema');
        return;
      }

      this.audioOutputSelect.replaceChildren();
      audioOutputs.forEach((device, index) => {
        const id = String(device.deviceId || 'default');
        const label = String(device.label || `Saída de áudio ${index + 1}`)
          .replace(/\s*\(.*default.*\)/i, '')
          .trim();
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${id === 'default' || id === 'communications' ? '🔊' : '🎧'} ${label}`;
        this.audioOutputSelect.appendChild(option);
      });

      // Restaurar seleção salva, se houver
      const savedDevice = localStorage.getItem('bensf2_audioOutput');
      const hasSavedDevice = Array.from(this.audioOutputSelect.options || []).some(option => option.value === savedDevice);
      if (savedDevice && hasSavedDevice) {
        this.audioOutputSelect.value = savedDevice;
      }

    } catch (e) {
      console.warn('[SettingsModal] Erro ao enumerar saídas de áudio:', e);
      setSingleOption('default', '🔊 Saída padrão do sistema');
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

    this.midiDevicesListContainer.innerHTML = devices.map((dev) => {
      const isActive = dev.active !== false; // padrão: ativo
      const deviceId = String(dev.id || '');
      const safeDeviceId = escapeSettingsHtml(deviceId);
      const safeName = escapeSettingsHtml(dev.name || 'Controlador MIDI');
      const safeManufacturer = escapeSettingsHtml(dev.manufacturer || 'Desconhecido');
      const safeShortId = escapeSettingsHtml(deviceId.slice(0, 12));

      let chanOptions = `<option value="all" ${dev.assignedChannel === 'all' ? 'selected' : ''}>🎹 Preservar canal MIDI do teclado</option>`;
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
        <div class="midi-device-item" data-device-id="${safeDeviceId}" style="
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
              <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">🎹 ${safeName}</div>
              <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                Fabricante: ${safeManufacturer} &nbsp;|&nbsp; ID: ${safeShortId}...
              </div>
            </div>

            <!-- Toggle Ativo/Inativo -->
            <button
              class="midi-device-toggle"
              data-device-id="${safeDeviceId}"
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
              data-device-id="${safeDeviceId}"
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

  async applySettings() {
    const selectedDeviceId = this.audioOutputSelect ? this.audioOutputSelect.value : 'default';
    const previousDisabled = this.btnSave ? this.btnSave.disabled : false;
    if (this.btnSave) this.btnSave.disabled = true;
    try {
      await this._switchAudioOutput(selectedDeviceId);
      localStorage.setItem('bensf2_audioOutput', selectedDeviceId);
      if (this.modalPolyphonySelect && this.synth) this.synth.setMaxPolyphony(this.modalPolyphonySelect.value);
      if (this.modalVelocityCurveSelect && this.synth) {
        this.synth.setVelocityCurve(this.modalVelocityCurveSelect.value);
        if (typeof window.updateTrackVelUI === 'function' && window.fxRack) {
          window.updateTrackVelUI(window.fxRack.selectedChannel);
        }
      }
      this.closeModal();
      if (window.showToastNotification) {
        window.showToastNotification('Configurações Aplicadas', 'Saída de áudio, polifonia e velocity atualizadas.', 'success');
      }
      return true;
    } catch (error) {
      console.warn('[SettingsModal] Não foi possível aplicar configurações:', error);
      if (window.showToastNotification) {
        window.showToastNotification('Falha nas Configurações', error.message, 'warning');
      } else if (typeof alert === 'function') {
        alert(`Não foi possível aplicar as configurações: ${error.message}`);
      }
      return false;
    } finally {
      if (this.btnSave) this.btnSave.disabled = previousDisabled;
    }
  }

  /**
   * Troca a saída de áudio sem quebrar o AudioContext nem parar o MIDI.
   * setSinkId() pode suspender o contexto — por isso fazemos resume() logo depois.
   */
  async _switchAudioOutput(deviceId) {
    const ctx = this.audioEngine && this.audioEngine.ctx;
    if (!ctx) throw new Error('O motor de áudio ainda não foi inicializado.');

    if (typeof ctx.setSinkId === 'function') {
      await ctx.setSinkId(deviceId);
    } else if (deviceId && deviceId !== 'default') {
      throw new Error('Esta versão não permite selecionar uma saída de áudio diferente da padrão.');
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
      if (ctx.state === 'suspended') throw new Error('O contexto de áudio permaneceu suspenso após a troca de saída.');
    }
    return true;
  }
}

window.SettingsModalManager = SettingsModalManager;
