/**
 * BEN SF2 SETLIST & SONG MODE MANAGER (MAINSTAGE / NORD STAGE STYLE)
 * Gerencia a organização de presets e captura do estado completo do workstation para shows ao vivo.
 * Suporta Seamless Patch Change (Troca de música/patch sem corte de som).
 */

class BenSetlistManager {
  constructor(synthEngine, presetManager, mixerManager, fxRackManager) {
    this.synth = synthEngine;
    this.presetManager = presetManager;
    this.mixer = mixerManager;
    this.fxRack = fxRackManager;

    this.activeSetlistName = 'Show Ao Vivo Default';
    this.items = [];
    this.currentIndex = 0;

    this.loadFromStorage();
    if (this.items.length === 0) {
      this.addDemoItems();
    }
  }

  addDemoItems() {
    this.items = [
      { id: 'item_1', songName: '01. Intro Culto - Piano + Pad', presetName: 'Piano e Pad Warm', notes: 'Tom: C | BPM: 72', snapshot: null },
      { id: 'item_2', songName: '02. Louvor Rápido - Synth Lead', presetName: 'Lead Brass Split', notes: 'Tom: G | BPM: 128', snapshot: null },
      { id: 'item_3', songName: '03. Solo de Órgão B3', presetName: 'Organ Rock B3', notes: 'Tom: E | BPM: 100', snapshot: null }
    ];
    this.saveToStorage();
    this.renderSetlistPanel();
  }

  getSetlistItems() {
    return this.items;
  }

  // Captura o Estado Atual do Workstation (Timbres, Canais, Volumes, Transpose, Efeitos)
  captureCurrentWorkstationState() {
    if (!this.synth) return null;

    const snapshot = {
      timestamp: Date.now(),
      totalChannels: this.mixer ? this.mixer.totalChannels : 4,
      channels: []
    };

    for (let ch = 1; ch <= snapshot.totalChannels; ch++) {
      const chConfig = this.synth.channels[ch];
      if (chConfig) {
        snapshot.channels.push({
          channel: ch,
          name: chConfig.name || `CH ${ch}`,
          assignedPresetIndex: chConfig.assignedPresetIndex,
          presetName: chConfig.presetName || '',
          volume: chConfig.volume,
          pan: chConfig.pan,
          transpose: chConfig.transpose,
          semitoneTranspose: chConfig.semitoneTranspose || 0,
          keyRangeLow: chConfig.keyRangeLow || 0,
          keyRangeHigh: chConfig.keyRangeHigh || 127,
          muted: chConfig.muted || false,
          solo: chConfig.solo || false
        });
      }
    }

    if (this.fxRack) {
      snapshot.masterFx = {
        reverbMix: this.fxRack.reverbMix,
        reverbMode: this.fxRack.reverbMode,
        chorusMix: this.fxRack.chorusMix,
        cutoffFreq: this.fxRack.cutoffFreq
      };
    }

    return snapshot;
  }

  addItem(songName, presetName = '', notes = '', useCurrentState = false) {
    let snapshot = null;
    if (useCurrentState) {
      snapshot = this.captureCurrentWorkstationState();
    }

    const newItem = {
      id: 'song_' + Date.now(),
      songName: songName || `Música ${this.items.length + 1}`,
      presetName: presetName || '',
      notes: notes,
      snapshot: snapshot
    };

    this.items.push(newItem);
    this.renderSetlistPanel();
    this.saveToStorage();

    if (window.showToastNotification) {
      window.showToastNotification(
        '🎤 Setlist Atualizado',
        `Música "${newItem.songName}" adicionada com sucesso ao Setlist!`,
        'success'
      );
    }

    return newItem;
  }

  recaptureSongState(index) {
    if (index >= 0 && index < this.items.length) {
      const snapshot = this.captureCurrentWorkstationState();
      this.items[index].snapshot = snapshot;
      this.saveToStorage();
      this.renderSetlistPanel();

      if (window.showToastNotification) {
        window.showToastNotification(
          '📸 Configuração Recapturada',
          `Estado atual do mixer gravado na música "${this.items[index].songName}".`,
          'info'
        );
      }
    }
  }

  removeItem(index) {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
      if (this.currentIndex >= this.items.length) {
        this.currentIndex = Math.max(0, this.items.length - 1);
      }
      this.renderSetlistPanel();
      this.saveToStorage();
    }
  }

  applySnapshot(snapshot) {
    if (!snapshot || !this.synth) return;

    if (this.mixer && snapshot.totalChannels) {
      this.mixer.setVisibleChannelCount(snapshot.totalChannels);
    }

    if (snapshot.channels && Array.isArray(snapshot.channels)) {
      snapshot.channels.forEach(chData => {
        const ch = chData.channel;
        const chConfig = this.synth.channels[ch];
        if (chConfig) {
          if (chData.assignedPresetIndex !== undefined && chData.assignedPresetIndex !== null) {
            this.synth.setChannelPreset(ch, chData.assignedPresetIndex);
            if (this.mixer) this.mixer.updateChannelPresetDropdown(ch, chData.assignedPresetIndex);
          }

          this.synth.setChannelVolume(ch, chData.volume !== undefined ? chData.volume : 0.8);
          this.synth.setChannelPan(ch, chData.pan !== undefined ? chData.pan : 0);
          this.synth.setChannelTranspose(ch, chData.transpose !== undefined ? chData.transpose : 0);
          chConfig.semitoneTranspose = chData.semitoneTranspose || 0;
          chConfig.keyRangeLow = chData.keyRangeLow || 0;
          chConfig.keyRangeHigh = chData.keyRangeHigh || 127;
        }
      });
    }

    if (snapshot.masterFx && this.fxRack) {
      if (snapshot.masterFx.reverbMix !== undefined) this.fxRack.setReverbMix(snapshot.masterFx.reverbMix);
      if (snapshot.masterFx.reverbMode) this.fxRack.setMasterReverbMode(snapshot.masterFx.reverbMode);
    }

    if (this.mixer) {
      this.mixer.renderMixer();
    }
  }

  selectSong(index, seamless = true) {
    if (index < 0 || index >= this.items.length) return;

    this.currentIndex = index;
    const item = this.items[index];

    console.log(`[SetlistManager] Alternando para música ${index + 1}: "${item.songName}"`);

    // Seamless Patch Change: Não encerra vozes que ainda estão soando
    if (!seamless && this.synth) {
      this.synth.stopAllVoices();
    }

    // Se a música tiver um Instant Snapshot do Workstation, carregar diretamente!
    if (item.snapshot) {
      this.applySnapshot(item.snapshot);
    } else if (item.presetName && this.presetManager) {
      const presetObj = this.presetManager.userPresets.get(item.presetName);
      if (presetObj) {
        this.presetManager.loadPreset(presetObj);
      }
    }

    this.renderSetlistPanel();

    if (window.showToastNotification) {
      window.showToastNotification(
        '🎤 Setlist Live Mode',
        `Música Ativa: ${item.songName}`,
        'success'
      );
    }
  }

  nextSong() {
    if (this.currentIndex < this.items.length - 1) {
      this.selectSong(this.currentIndex + 1);
    }
  }

  prevSong() {
    if (this.currentIndex > 0) {
      this.selectSong(this.currentIndex - 1);
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('bensf2_setlist_items', JSON.stringify(this.items));
    } catch (e) { }
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem('bensf2_setlist_items');
      if (stored) {
        this.items = JSON.parse(stored);
      }
    } catch (e) { }
  }

  renderSetlistPanel() {
    const container = document.getElementById('setlistItemsContainer');
    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 24px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">
          <div style="font-size: 24px; margin-bottom: 8px;">🎤</div>
          <div style="font-weight: 700; color: var(--accent-cyan); margin-bottom: 4px;">Setlist Vazio</div>
          Nenhuma música adicionada ao seu repertório. Monte seu som no mixer e clique no botão <b>➕ Adicionar Música</b>!
        </div>
      `;
      return;
    }

    let html = '';
    this.items.forEach((item, idx) => {
      const isActive = idx === this.currentIndex;
      const typeLabel = item.snapshot ? '📸 ESTADO COMPLETO DO MIXER' : `PR: ${item.presetName || 'Padrão'}`;

      html += `
        <div class="setlist-item-card ${isActive ? 'active' : ''}" data-index="${idx}" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-radius: 8px;
          background: ${isActive ? 'linear-gradient(90deg, rgba(0, 242, 254, 0.22), rgba(127, 0, 255, 0.18))' : 'rgba(255,255,255,0.03)'};
          border: 1px solid ${isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.06)'};
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: ${isActive ? '0 0 15px rgba(0, 242, 254, 0.2)' : 'none'};
        ">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
            <div style="
              font-family: var(--font-mono);
              font-size: 14px;
              font-weight: 800;
              color: ${isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'};
              min-width: 28px;
              text-align: center;
            ">${idx + 1}</div>

            <div style="display: flex; flex-direction: column; overflow: hidden;">
              <span style="
                font-family: var(--font-heading);
                font-size: 13px;
                font-weight: 800;
                color: ${isActive ? '#fff' : 'var(--text-main)'};
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              ">${item.songName}</span>

              <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                <strong style="color: ${item.snapshot ? 'var(--accent-cyan)' : 'var(--accent-purple)'};">${typeLabel}</strong> ${item.notes ? ' • ' + item.notes : ''}
              </span>
            </div>
          </div>

          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-sm btn-recapture-song" data-index="${idx}" style="font-size: 10px; padding: 3px 8px;" title="Atualizar esta música com o timbre/estado atual do mixer">
              📸 Capturar
            </button>
            <button class="btn btn-sm btn-select-song" data-index="${idx}" style="font-size: 10px; padding: 3px 12px; font-weight: 800; background: ${isActive ? 'var(--accent-cyan)' : ''}; color: ${isActive ? '#000' : ''};">
              ${isActive ? '● EM USO' : '▶ SELECIONAR'}
            </button>
            <button class="btn btn-sm btn-delete-song" data-index="${idx}" style="font-size: 10px; padding: 3px 8px; color: var(--accent-danger);" title="Excluir do Setlist">✕</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Vinculo de eventos de clique nos botões das músicas no Setlist
    container.querySelectorAll('.setlist-item-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const idx = parseInt(card.dataset.index, 10);
        if (e.target.classList.contains('btn-delete-song')) {
          e.stopPropagation();
          this.removeItem(idx);
        } else if (e.target.classList.contains('btn-recapture-song')) {
          e.stopPropagation();
          this.recaptureSongState(idx);
        } else {
          this.selectSong(idx, true);
        }
      });
    });
  }
}

window.BenSetlistManager = BenSetlistManager;
