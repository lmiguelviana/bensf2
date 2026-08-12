/**
 * MIDI LEARN AUTOMATION MANAGER (ESTILO KONTAKT / DAW)
 * Permite clicar com o botão direito sobre qualquer Fader, Knob ou Controle para mapear instantaneamente a botões e knobs físicos do teclado controlador.
 */

class MidiLearnManager {
  constructor(webMidiManager) {
    this.webMidi = webMidiManager;
    this.contextMenuEl = null;
    this.currentElement = null;
    this.currentLabel = '';
    this.currentCallback = null;

    this.activeBindings = new Map(); // elementId/key -> { ccNum, label, callback, element }
    this.learningOverlayEl = null;
  }

  init() {
    this.createContextMenuElement();
    this.createLearningOverlayElement();

    // Fechar menu de contexto ao clicar em qualquer lugar da tela
    document.addEventListener('click', () => this.hideContextMenu());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideContextMenu();
        this.cancelLearning();
      }
    });
  }

  createContextMenuElement() {
    this.contextMenuEl = document.createElement('div');
    this.contextMenuEl.className = 'midi-learn-menu';
    this.contextMenuEl.style.display = 'none';
    document.body.appendChild(this.contextMenuEl);
  }

  createLearningOverlayElement() {
    this.learningOverlayEl = document.createElement('div');
    this.learningOverlayEl.className = 'midi-learning-overlay';
    this.learningOverlayEl.style.display = 'none';
    this.learningOverlayEl.innerHTML = `
      <div class="learning-card">
        <span class="learning-icon">🎛️</span>
        <div>
          <div class="learning-title">MIDI Learn Ativo</div>
          <div class="learning-sub" id="midiLearnSubText">Mova qualquer knob ou fader no seu controlador físico...</div>
        </div>
        <button id="btnCancelMidiLearn" class="btn btn-sm">Cancelar (ESC)</button>
      </div>
    `;
    document.body.appendChild(this.learningOverlayEl);

    const btnCancel = this.learningOverlayEl.querySelector('#btnCancelMidiLearn');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => this.cancelLearning());
    }
  }

  attach(element, controlLabel, onChangeCallback) {
    if (!element) return;

    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      this.currentElement = element;
      this.currentLabel = controlLabel;
      this.currentCallback = onChangeCallback;

      this.showContextMenu(e.clientX, e.clientY);
    });
  }

  showContextMenu(x, y) {
    if (!this.contextMenuEl) return;

    const bindingKey = this.getElementKey(this.currentElement);
    const existingBinding = this.activeBindings.get(bindingKey);

    this.contextMenuEl.innerHTML = `
      <div class="menu-item-header">🎛️ MIDI Learn (${this.currentLabel})</div>
      <div class="menu-divider"></div>
      <div class="menu-item" id="menuItemLearn">
        <span>⚡ Aprender MIDI CC...</span>
      </div>
      ${existingBinding ? `
        <div class="menu-item menu-item-active">
          <span>● Mapeado para CC #${existingBinding.ccNum}</span>
        </div>
        <div class="menu-item menu-item-danger" id="menuItemClear">
          <span>❌ Remover Vínculo MIDI</span>
        </div>
      ` : ''}
    `;

    // Posicionamento inteligente
    this.contextMenuEl.style.left = `${Math.min(window.innerWidth - 200, x)}px`;
    this.contextMenuEl.style.top = `${Math.min(window.innerHeight - 150, y)}px`;
    this.contextMenuEl.style.display = 'block';

    const itemLearn = this.contextMenuEl.querySelector('#menuItemLearn');
    if (itemLearn) {
      itemLearn.addEventListener('click', () => {
        this.hideContextMenu();
        this.startLearning();
      });
    }

    const itemClear = this.contextMenuEl.querySelector('#menuItemClear');
    if (itemClear) {
      itemClear.addEventListener('click', () => {
        this.hideContextMenu();
        this.removeBinding(this.currentElement);
      });
    }
  }

  hideContextMenu() {
    if (this.contextMenuEl) {
      this.contextMenuEl.style.display = 'none';
    }
  }

  startLearning() {
    if (!this.currentElement || !this.currentCallback) return;

    const subText = this.learningOverlayEl.querySelector('#midiLearnSubText');
    if (subText) {
      subText.textContent = `Aguardando movimento do fader/knob físico para: "${this.currentLabel}"...`;
    }

    this.learningOverlayEl.style.display = 'flex';
    this.currentElement.classList.add('midi-learning-target');

    this.webMidi.setLearningCallback((ccNum) => {
      this.completeLearning(ccNum);
    });
  }

  completeLearning(ccNum) {
    if (!this.currentElement || !this.currentCallback) return;

    const bindingKey = this.getElementKey(this.currentElement);

    // Remover vínculo antigo se já existia
    this.webMidi.removeCcMapping(ccNum);

    // Registrar o novo vínculo
    const binding = {
      ccNum,
      label: this.currentLabel,
      callback: this.currentCallback,
      element: this.currentElement
    };

    this.activeBindings.set(bindingKey, binding);
    this.webMidi.addCcMapping(ccNum, (normVal) => {
      // Atualizar valor no elemento UI
      if (this.currentElement.tagName === 'INPUT') {
        const min = parseFloat(this.currentElement.min) || 0;
        const max = parseFloat(this.currentElement.max) || 1;
        const calcVal = min + (normVal * (max - min));
        this.currentElement.value = calcVal;
        this.currentElement.dispatchEvent(new Event('input'));
      }
      this.currentCallback(normVal);
    });

    this.currentElement.classList.remove('midi-learning-target');
    this.currentElement.classList.add('midi-linked');
    this.learningOverlayEl.style.display = 'none';

    console.log(`[MidiLearn] "${this.currentLabel}" vinculado com sucesso ao MIDI CC #${ccNum}`);
  }

  cancelLearning() {
    if (this.currentElement) {
      this.currentElement.classList.remove('midi-learning-target');
    }
    this.webMidi.cancelLearning();
    if (this.learningOverlayEl) {
      this.learningOverlayEl.style.display = 'none';
    }
  }

  removeBinding(element) {
    const bindingKey = this.getElementKey(element);
    const existing = this.activeBindings.get(bindingKey);
    if (existing) {
      this.webMidi.removeCcMapping(existing.ccNum);
      this.activeBindings.delete(bindingKey);
      element.classList.remove('midi-linked');
      console.log(`[MidiLearn] Vínculo do controle "${existing.label}" removido.`);
    }
  }

  getElementKey(element) {
    if (element.id) return element.id;
    if (element.dataset && element.dataset.channel) return `ch_${element.dataset.channel}_${element.className}`;
    return element.outerHTML.slice(0, 30);
  }
}

window.MidiLearnManager = MidiLearnManager;
