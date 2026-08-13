/**
 * SETLIST & SONG MODE MANAGER
 * Setlists reutilizam exatamente o schema versionado do PresetManager.
 */
class BenSetlistManager {
  constructor(synthEngine, presetManager, mixerManager, fxRackManager) {
    this.synth = synthEngine;
    this.presetManager = presetManager;
    this.mixer = mixerManager;
    this.fxRack = fxRackManager;
    this.activeSetlistName = 'Show Ao Vivo';
    this.items = [];
    this.currentIndex = -1;
    this.loadFromStorage();
  }

  cleanText(value, fallback = '', maxLength = 300) {
    if (typeof value !== 'string') return fallback;
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return (clean || fallback).slice(0, maxLength);
  }

  normalizeItem(candidate, index = 0) {
    if (!candidate || typeof candidate !== 'object') return null;
    const songName = this.cleanText(candidate.songName, `Música ${index + 1}`, 160);
    const presetName = this.cleanText(candidate.presetName, '', 120);
    const notes = this.cleanText(candidate.notes, '', 600);
    let snapshot = null;
    let snapshotError = null;
    if (candidate.snapshot) {
      try {
        snapshot = this.presetManager.normalizeRigState(candidate.snapshot, `Snapshot: ${songName}`);
      } catch (error) {
        snapshotError = error.message;
      }
    }
    return {
      id: this.cleanText(candidate.id, `song_${Date.now()}_${index}`, 100),
      songName,
      presetName,
      notes,
      snapshot,
      ...(snapshotError ? { snapshotError } : {})
    };
  }

  getSetlistItems() {
    return this.items;
  }

  captureCurrentWorkstationState(songName = 'Snapshot do Setlist') {
    return this.presetManager.captureRigState(songName);
  }

  addItem(songName, presetName = '', notes = '', useCurrentState = false) {
    const normalizedName = this.cleanText(songName, `Música ${this.items.length + 1}`, 160);
    const item = this.normalizeItem({
      id: `song_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      songName: normalizedName,
      presetName,
      notes,
      snapshot: useCurrentState ? this.captureCurrentWorkstationState(`Snapshot: ${normalizedName}`) : null
    }, this.items.length);
    if (!item) return null;
    this.items.push(item);
    if (!this.saveToStorage()) {
      this.items.pop();
      this.notify('Falha ao Atualizar Setlist', 'O armazenamento local não está disponível.', 'warning');
      return null;
    }
    this.renderSetlistPanel();
    this.notify('Setlist Atualizado', `Música "${item.songName}" adicionada.`, 'success');
    return item;
  }

  recaptureSongState(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return false;
    const previous = this.items[index].snapshot;
    this.items[index].snapshot = this.captureCurrentWorkstationState(`Snapshot: ${this.items[index].songName}`);
    delete this.items[index].snapshotError;
    if (!this.saveToStorage()) {
      this.items[index].snapshot = previous;
      this.notify('Falha ao Capturar', 'Não foi possível persistir o snapshot.', 'warning');
      return false;
    }
    this.renderSetlistPanel();
    this.notify('Configuração Recapturada', `Estado atual salvo em "${this.items[index].songName}".`, 'info');
    return true;
  }

  removeItem(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return false;
    const removed = this.items.splice(index, 1)[0];
    const previousIndex = this.currentIndex;
    if (this.items.length === 0) this.currentIndex = -1;
    else if (this.currentIndex >= this.items.length) this.currentIndex = this.items.length - 1;
    else if (index < this.currentIndex) this.currentIndex--;
    if (!this.saveToStorage()) {
      this.items.splice(index, 0, removed);
      this.currentIndex = previousIndex;
      this.notify('Falha ao Remover', 'Não foi possível persistir o Setlist.', 'warning');
      return false;
    }
    this.renderSetlistPanel();
    return true;
  }

  applySnapshot(snapshot) {
    const result = this.presetManager.applyRigState(snapshot, {
      updateActiveName: false,
      fallbackName: 'Snapshot do Setlist',
      requireTimbres: true
    });
    if (!result.ok) {
      this.notify('Falha ao Aplicar Snapshot', result.error.message, 'warning');
      return false;
    }
    return true;
  }

  selectSong(index, seamless = true) {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return false;
    const item = this.items[index];
    let applied = false;
    if (item.snapshot) {
      applied = this.applySnapshot(item.snapshot);
    } else if (item.presetName) {
      const preset = this.presetManager.userPresets.get(item.presetName);
      if (preset) {
        const result = this.presetManager.applyRigState(preset, {
          updateActiveName: true,
          requireTimbres: true
        });
        applied = result.ok;
        if (!result.ok) this.notify('Falha ao Carregar Preset', result.error.message, 'warning');
      }
      else this.notify('Preset Ausente', `O preset "${item.presetName}" não existe mais.`, 'warning');
    } else if (item.snapshotError) {
      this.notify('Snapshot Inválido', item.snapshotError, 'warning');
    } else {
      this.notify('Música sem Som', 'Associe um snapshot ou preset antes de selecionar esta música.', 'warning');
    }
    if (!applied) return false;
    if (!seamless && this.synth && typeof this.synth.stopAllVoices === 'function') this.synth.stopAllVoices();
    this.currentIndex = index;
    this.renderSetlistPanel();
    this.notify('Setlist Live Mode', `Música ativa: ${item.songName}`, 'success');
    return true;
  }

  nextSong() {
    const nextIndex = this.currentIndex < 0 ? 0 : this.currentIndex + 1;
    return nextIndex < this.items.length ? this.selectSong(nextIndex) : false;
  }

  prevSong() {
    const previousIndex = this.currentIndex - 1;
    return previousIndex >= 0 ? this.selectSong(previousIndex) : false;
  }

  saveToStorage() {
    try {
      localStorage.setItem('bensf2_setlist_items', JSON.stringify(this.items));
      return true;
    } catch (error) {
      console.error('[SetlistManager] Falha ao salvar Setlist:', error);
      return false;
    }
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem('bensf2_setlist_items');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Formato de Setlist inválido.');
      this.items = parsed
        .slice(0, 500)
        .map((candidate, index) => this.normalizeItem(candidate, index))
        .filter(Boolean);
      this.currentIndex = -1;
    } catch (error) {
      console.error('[SetlistManager] Setlist local inválido ignorado:', error);
      this.items = [];
      this.currentIndex = -1;
    }
  }

  createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  renderSetlistPanel() {
    const container = document.getElementById('setlistItemsContainer');
    if (!container) return;
    container.replaceChildren();
    if (this.items.length === 0) {
      const empty = this.createElement('div', 'setlist-empty-state');
      empty.style.cssText = 'text-align:center;color:var(--text-muted);font-size:11px;padding:24px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px dashed rgba(255,255,255,0.1);';
      const icon = this.createElement('div', '', '🎤');
      icon.style.cssText = 'font-size:24px;margin-bottom:8px;';
      const title = this.createElement('div', '', 'Setlist Vazio');
      title.style.cssText = 'font-weight:700;color:var(--accent-cyan);margin-bottom:4px;';
      const help = this.createElement('div', '', 'Monte seu som no mixer e clique em “Adicionar Música”.');
      empty.append(icon, title, help);
      container.appendChild(empty);
      return;
    }

    this.items.forEach((item, index) => {
      const active = index === this.currentIndex;
      const card = this.createElement('div', `setlist-item-card${active ? ' active' : ''}`);
      card.dataset.index = String(index);
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Selecionar ${item.songName}`);
      card.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:8px;background:${active ? 'linear-gradient(90deg,rgba(0,242,254,.22),rgba(127,0,255,.18))' : 'rgba(255,255,255,.03)'};border:1px solid ${active ? 'var(--accent-cyan)' : 'rgba(255,255,255,.06)'};margin-bottom:8px;cursor:pointer;`;

      const content = this.createElement('div', 'setlist-item-content');
      content.style.cssText = 'display:flex;align-items:center;gap:12px;flex:1;overflow:hidden;';
      const number = this.createElement('div', 'setlist-item-number', String(index + 1));
      number.style.cssText = 'font-family:var(--font-mono);font-size:14px;font-weight:800;min-width:28px;text-align:center;';
      const details = this.createElement('div', 'setlist-item-details');
      details.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;';
      const name = this.createElement('span', 'setlist-item-name', item.songName);
      name.style.cssText = 'font-family:var(--font-heading);font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      const source = item.snapshot ? '📸 SNAPSHOT DO RIG' : `PR: ${item.presetName || '(não associado)'}`;
      const meta = this.createElement('span', 'setlist-item-meta', `${source}${item.notes ? ` • ${item.notes}` : ''}`);
      meta.style.cssText = 'font-size:10px;color:var(--text-muted);margin-top:2px;';
      details.append(name, meta);
      content.append(number, details);

      const actions = this.createElement('div', 'setlist-item-actions');
      actions.style.cssText = 'display:flex;gap:6px;align-items:center;';
      const capture = this.createElement('button', 'btn btn-sm btn-recapture-song', '📸 Capturar');
      capture.type = 'button';
      capture.dataset.index = String(index);
      const select = this.createElement('button', 'btn btn-sm btn-select-song', active ? '● EM USO' : '▶ SELECIONAR');
      select.type = 'button';
      select.dataset.index = String(index);
      const remove = this.createElement('button', 'btn btn-sm btn-delete-song', '✕');
      remove.type = 'button';
      remove.dataset.index = String(index);
      remove.setAttribute('aria-label', `Excluir ${item.songName}`);
      actions.append(capture, select, remove);
      card.append(content, actions);

      card.addEventListener('click', event => {
        if (event.target.closest('.btn-delete-song')) this.removeItem(index);
        else if (event.target.closest('.btn-recapture-song')) this.recaptureSongState(index);
        else this.selectSong(index, true);
      });
      card.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
          event.preventDefault();
          this.selectSong(index, true);
        }
      });
      container.appendChild(card);
    });
  }

  notify(title, message, type) {
    if (window.showToastNotification) window.showToastNotification(title, message, type);
    else if (type === 'warning') console.warn(`[SetlistManager] ${title}: ${message}`);
  }
}

window.BenSetlistManager = BenSetlistManager;
