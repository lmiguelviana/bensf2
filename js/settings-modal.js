/**
 * SETTINGS MODAL MANAGER
 * Gerencia o painel de configurações de áudio, polifonia, sensibilidade de toque e mapeamento de múltiplos controladores MIDI.
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
    this.midiDevicesListContainer = null;
  }

  init() {
    this.modalBackdrop = document.getElementById('settingsModal');
    this.btnClose = document.getElementById('btnCloseSettings');
    this.btnSave = document.getElementById('btnSaveSettings');
    this.audioOutputSelect = document.getElementById('audioOutputSelect');
    this.sampleRateSelect = document.getElementById('sampleRateSelect');
    this.bufferSizeSelect = document.getElementById('bufferSizeSelect');
    this.modalPolyphonySelect = document.getElementById('modalPolyphonySelect');
    this.modalVelocityCurveSelect = document.getElementById('modalVelocityCurveSelect');
    this.midiDevicesListContainer = document.getElementById('midiDevicesListContainer');

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
      });
    }

    this.populateAudioOutputDevices();
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

  async populateAudioOutputDevices() {
    if (!this.audioOutputSelect) return;
    this.audioOutputSelect.innerHTML = '<option value="default">Alto-falantes Padrão do Sistema</option>';

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        
        if (audioOutputs.length > 0) {
          this.audioOutputSelect.innerHTML = audioOutputs.map(d => `
            <option value="${d.deviceId}">${d.label || `Saída de Áudio (${d.deviceId.slice(0,8)})`}</option>
          `).join('');
        }
      } catch (e) {
        console.warn('[SettingsModal] Erro ao enumerar saídas de áudio:', e);
      }
    }
  }

  populateMidiDevicesList() {
    if (!this.midiDevicesListContainer) return;
    const devices = this.webMidi.getConnectedDevicesList();

    if (devices.length === 0) {
      this.midiDevicesListContainer.innerHTML = `
        <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 12px; background: rgba(0,0,0,0.2); border-radius: var(--radius-sm);">
          🔌 Nenhum teclado controlador MIDI detectado via USB ou Bluetooth.<br>Conecte seu teclado MIDI e abra este menu novamente!
        </div>
      `;
      return;
    }

    this.midiDevicesListContainer.innerHTML = devices.map((dev, idx) => {
      let chanOptions = `<option value="all" ${dev.assignedChannel === 'all' ? 'selected' : ''}>Todos os Canais (Layer)</option>`;
      for (let ch = 1; ch <= 16; ch++) {
        const isSel = (dev.assignedChannel === ch || (dev.assignedChannel === undefined && idx + 1 === ch)) ? 'selected' : '';
        chanOptions += `<option value="${ch}" ${isSel}>Canal MIDI CH ${ch < 10 ? '0' + ch : ch}</option>`;
      }

      return `
        <div class="midi-device-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--bg-card-border); border-radius: var(--radius-sm); margin-bottom: 8px;">
          <div>
            <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">🎹 ${dev.name}</div>
            <div style="font-size: 10px; color: var(--text-muted);">Fabricante: ${dev.manufacturer} | ID: ${dev.id}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-muted);">Roteamento:</span>
            <select class="device-channel-select preset-select" data-device-id="${dev.id}" style="font-size: 11px; padding: 4px 8px;">
              ${chanOptions}
            </select>
          </div>
        </div>
      `;
    }).join('');

    const selects = this.midiDevicesListContainer.querySelectorAll('.device-channel-select');
    selects.forEach(sel => {
      sel.addEventListener('change', (e) => {
        const devId = e.target.dataset.deviceId;
        const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
        this.webMidi.setDeviceChannelMapping(devId, val);
      });
    });
  }

  applySettings() {
    const selectedDeviceId = this.audioOutputSelect ? this.audioOutputSelect.value : 'default';
    if (this.audioEngine && this.audioEngine.ctx && typeof this.audioEngine.ctx.setSinkId === 'function') {
      try {
        this.audioEngine.ctx.setSinkId(selectedDeviceId);
        console.log(`[SettingsModal] Dispositivo de saída alterado para: ${selectedDeviceId}`);
      } catch (e) {
        console.warn('[SettingsModal] Troca de saída de áudio não suportada pelo navegador:', e);
      }
    }

    if (this.modalPolyphonySelect && this.synth) {
      this.synth.setMaxPolyphony(this.modalPolyphonySelect.value);
    }

    if (this.modalVelocityCurveSelect && this.synth) {
      this.synth.setVelocityCurve(this.modalVelocityCurveSelect.value);
    }

    console.log('[SettingsModal] Configurações salvas e aplicadas com sucesso!');
    this.closeModal();
    alert('Configurações de Áudio, Polifonia e Controladores MIDI salvas!');
  }
}

window.SettingsModalManager = SettingsModalManager;
