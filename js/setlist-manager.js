/**
 * BEN SF2 SETLIST & SONG MODE MANAGER (MAINSTAGE / NORD STAGE STYLE)
 * Gerencia a organização de presets para shows ao vivo com suporte a Seamless Patch Change (Troca sem corte de som).
 */

class BenSetlistManager {
  constructor(synthEngine, presetManager, mixerManager, fxRackManager) {
    this.synth = synthEngine;
    this.presetManager = presetManager;
    this.mixer = mixerManager;
    this.fxRack = fxRackManager;

    this.activeSetlistName = 'Show Ao Vivo Default';
    this.items = [
      { id: 'item_1', songName: '01. Intro Culto - Piano + Pad', presetName: 'Piano e Pad Warm', notes: 'Tom: C | BPM: 72' },
      { id: 'item_2', songName: '02. Louvor Rápido - Synth Lead', presetName: 'Lead Brass Split', notes: 'Tom: G | BPM: 128' },
      { id: 'item_3', songName: '03. Solo de Órgão B3', presetName: 'Organ Rock B3', notes: 'Tom: E | BPM: 100' }
    ];

    this.currentIndex = 0;
    this.initUI();
  }

  initUI() {
    this.renderSetlistPanel();
  }

  getSetlistItems() {
    return this.items;
  }

  addItem(songName, presetName, notes = '') {
    const newItem = {
      id: 'song_' + Date.now(),
      songName: songName || `Música ${this.items.length + 1}`,
      presetName: presetName || '',
      notes: notes
    };
    this.items.push(newItem);
    this.renderSetlistPanel();
    this.saveToStorage();
    return newItem;
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

  moveItem(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.items.length || toIndex < 0 || toIndex >= this.items.length) return;
    const element = this.items.splice(fromIndex, 1)[0];
    this.items.splice(toIndex, 0, element);
    this.renderSetlistPanel();
    this.saveToStorage();
  }

  selectSong(index, seamless = true) {
    if (index < 0 || index >= this.items.length) return;

    this.currentIndex = index;
    const item = this.items[index];

    console.log(`[SetlistManager] Alternando para música ${index + 1}: "${item.songName}" (Preset: ${item.presetName})`);

    // Seamless Patch Change: Mantém vozes ativas soando suavemente sem corte abrupto de áudio!
    if (!seamless && this.synth) {
      this.synth.stopAllVoices();
    }

    // Carregar o preset associado à música
    if (item.presetName && this.presetManager) {
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
        this.renderSetlistPanel();
      }
    } catch (e) { }
  }

  renderSetlistPanel() {
    const container = document.getElementById('setlistItemsContainer');
    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 20px;">
          Nenhuma música no Setlist. Clique no botão ➕ para adicionar músicas do seu show!
        </div>
      `;
      return;
    }

    let html = '';
    this.items.forEach((item, idx) => {
      const isActive = idx === this.currentIndex;
      html += `
        <div class="setlist-item-card ${isActive ? 'active' : ''}" data-index="${idx}" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 6px;
          background: ${isActive ? 'linear-gradient(90deg, rgba(0, 242, 254, 0.2), rgba(127, 0, 255, 0.15))' : 'rgba(255,255,255,0.03)'};
          border: 1px solid ${isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.06)'};
          margin-bottom: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        ">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;">
            <div style="
              font-family: var(--font-mono);
              font-size: 12px;
              font-weight: 800;
              color: ${isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'};
              min-width: 24px;
            ">${idx + 1}</div>

            <div style="display: flex; flex-direction: column; overflow: hidden;">
              <span style="
                font-family: var(--font-heading);
                font-size: 12px;
                font-weight: 800;
                color: ${isActive ? '#fff' : 'var(--text-main)'};
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              ">${item.songName}</span>

              <span style="font-size: 10px; color: var(--text-muted);">
                Preset: <strong style="color: var(--accent-purple);">${item.presetName || 'Padrão'}</strong> ${item.notes ? ' • ' + item.notes : ''}
              </span>
            </div>
          </div>

          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="btn btn-sm btn-select-song" data-index="${idx}" style="font-size: 10px; padding: 2px 8px; font-weight: 800;">
              ${isActive ? '● EM USO' : '▶ SELECIONAR'}
            </button>
            <button class="btn btn-sm btn-delete-song" data-index="${idx}" style="font-size: 10px; padding: 2px 6px; color: var(--accent-danger);" title="Excluir do Setlist">✕</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Vinculo de eventos de clique nos itens do Setlist
    container.querySelectorAll('.setlist-item-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-song')) {
          e.stopPropagation();
          const idx = parseInt(e.target.dataset.index, 10);
          this.removeItem(idx);
        } else {
          const idx = parseInt(card.dataset.index, 10);
          this.selectSong(idx, true);
        }
      });
    });
  }
}

window.BenSetlistManager = BenSetlistManager;
