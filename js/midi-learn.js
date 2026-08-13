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
    this.ccOwners = new Map(); // ccNum -> elementId/key
    this.learningOverlayEl = null;
    this.fallbackElementKeys = new WeakMap();
    this.nextFallbackElementKey = 1;
    this.attachedControls = new WeakMap();
    this.longPressDelayMs = 600;
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

    const bindingKey = this.getElementKey(element);
    const existingBinding = this.activeBindings.get(bindingKey);
    if (existingBinding) {
      existingBinding.element = element;
      existingBinding.label = controlLabel;
      existingBinding.callback = onChangeCallback;
      element.classList.add('midi-linked');
    }

    let attachment = this.attachedControls.get(element);
    if (attachment) {
      attachment.label = controlLabel;
      attachment.callback = onChangeCallback;
      return;
    }

    attachment = {
      label: controlLabel,
      callback: onChangeCallback,
      longPressTimer: null,
      startX: 0,
      startY: 0,
      suppressClickUntil: 0
    };
    this.attachedControls.set(element, attachment);

    const prepareControl = () => {
      const liveAttachment = this.attachedControls.get(element);
      this.currentElement = element;
      this.currentLabel = liveAttachment.label;
      this.currentCallback = liveAttachment.callback;
    };
    const clearLongPress = () => {
      const liveAttachment = this.attachedControls.get(element);
      if (liveAttachment && liveAttachment.longPressTimer !== null) {
        clearTimeout(liveAttachment.longPressTimer);
        liveAttachment.longPressTimer = null;
      }
    };

    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      prepareControl();
      this.showContextMenu(e.clientX, e.clientY);
    });

    element.addEventListener('keydown', (event) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      event.preventDefault();
      event.stopPropagation();
      prepareControl();
      const rect = typeof element.getBoundingClientRect === 'function'
        ? element.getBoundingClientRect()
        : { left: 0, bottom: 0 };
      this.showContextMenu(rect.left, rect.bottom);
    });

    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      clearLongPress();
      const liveAttachment = this.attachedControls.get(element);
      liveAttachment.startX = Number(event.clientX) || 0;
      liveAttachment.startY = Number(event.clientY) || 0;
      liveAttachment.longPressTimer = setTimeout(() => {
        liveAttachment.longPressTimer = null;
        liveAttachment.suppressClickUntil = Date.now() + 1000;
        prepareControl();
        this.showContextMenu(liveAttachment.startX, liveAttachment.startY);
      }, this.longPressDelayMs);
    });
    element.addEventListener('pointermove', (event) => {
      const liveAttachment = this.attachedControls.get(element);
      if (!liveAttachment || liveAttachment.longPressTimer === null) return;
      const distance = Math.hypot(
        (Number(event.clientX) || 0) - liveAttachment.startX,
        (Number(event.clientY) || 0) - liveAttachment.startY
      );
      if (distance > 10) clearLongPress();
    });
    element.addEventListener('pointerup', clearLongPress);
    element.addEventListener('pointercancel', clearLongPress);
    element.addEventListener('click', (event) => {
      const liveAttachment = this.attachedControls.get(element);
      if (!liveAttachment || Date.now() > liveAttachment.suppressClickUntil) return;
      liveAttachment.suppressClickUntil = 0;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  showContextMenu(x, y) {
    if (!this.contextMenuEl) return;

    const bindingKey = this.getElementKey(this.currentElement);
    const existingBinding = this.activeBindings.get(bindingKey);

    this.contextMenuEl.replaceChildren();
    const header = document.createElement('div');
    header.className = 'menu-item-header';
    header.textContent = `🎛️ MIDI Learn (${this.currentLabel})`;
    this.contextMenuEl.appendChild(header);

    const divider = document.createElement('div');
    divider.className = 'menu-divider';
    this.contextMenuEl.appendChild(divider);

    const itemLearn = document.createElement('div');
    itemLearn.className = 'menu-item';
    itemLearn.id = 'menuItemLearn';
    const learnText = document.createElement('span');
    learnText.textContent = '⚡ Aprender MIDI CC...';
    itemLearn.appendChild(learnText);
    this.contextMenuEl.appendChild(itemLearn);

    let itemClear = null;
    if (existingBinding) {
      const activeItem = document.createElement('div');
      activeItem.className = 'menu-item menu-item-active';
      const activeText = document.createElement('span');
      activeText.textContent = `● Mapeado para CC #${existingBinding.ccNum}`;
      activeItem.appendChild(activeText);
      this.contextMenuEl.appendChild(activeItem);

      itemClear = document.createElement('div');
      itemClear.className = 'menu-item menu-item-danger';
      itemClear.id = 'menuItemClear';
      const clearText = document.createElement('span');
      clearText.textContent = '❌ Remover Vínculo MIDI';
      itemClear.appendChild(clearText);
      this.contextMenuEl.appendChild(itemClear);
    }

    // Posicionamento inteligente
    this.contextMenuEl.style.left = `${Math.min(window.innerWidth - 200, x)}px`;
    this.contextMenuEl.style.top = `${Math.min(window.innerHeight - 150, y)}px`;
    this.contextMenuEl.style.display = 'block';

    itemLearn.addEventListener('click', () => {
      this.hideContextMenu();
      this.startLearning();
    });

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

    const targetElement = this.currentElement;
    const targetCallback = this.currentCallback;
    const bindingKey = this.getElementKey(targetElement);
    const normalizedCc = Math.max(0, Math.min(127, parseInt(ccNum, 10)));
    if (!Number.isFinite(normalizedCc)) return;

    // Um controle possui no máximo um CC, e um CC possui no máximo um controle.
    const oldBinding = this.activeBindings.get(bindingKey);
    if (oldBinding) {
      this.webMidi.removeCcMapping(oldBinding.ccNum);
      this.ccOwners.delete(oldBinding.ccNum);
    }

    const previousOwnerKey = this.ccOwners.get(normalizedCc);
    if (previousOwnerKey && previousOwnerKey !== bindingKey) {
      const previousOwner = this.activeBindings.get(previousOwnerKey);
      if (previousOwner && previousOwner.element) {
        previousOwner.element.classList.remove('midi-linked');
      }
      this.activeBindings.delete(previousOwnerKey);
    }
    this.webMidi.removeCcMapping(normalizedCc);

    // Registrar o novo vínculo
    const binding = {
      ccNum: normalizedCc,
      label: this.currentLabel,
      callback: targetCallback,
      element: targetElement,
      lastNormValue: 0
    };

    this.activeBindings.set(bindingKey, binding);
    this.ccOwners.set(normalizedCc, bindingKey);
    this.webMidi.addCcMapping(normalizedCc, (rawNormVal) => {
      const liveBinding = this.activeBindings.get(bindingKey);
      if (!liveBinding) return;
      const normVal = Math.max(0, Math.min(1, Number(rawNormVal) || 0));
      const liveElement = liveBinding.element;
      const isButton = liveElement && (
        liveElement.tagName === 'BUTTON' || liveElement.classList.contains('btn')
      );

      if (isButton) {
        // Toggle apenas na borda baixo -> alto; uma rajada de valores altos não
        // deve alternar o botão repetidamente.
        if (normVal >= 0.5 && liveBinding.lastNormValue < 0.5) {
          liveElement.click();
        }
      } else {
        if (liveElement && liveElement.tagName === 'INPUT') {
          const parsedMin = parseFloat(liveElement.min);
          const parsedMax = parseFloat(liveElement.max);
          const min = Number.isFinite(parsedMin) ? parsedMin : 0;
          const max = Number.isFinite(parsedMax) ? parsedMax : 1;
          liveElement.value = min + (normVal * (max - min));
        }
        liveBinding.callback(normVal);
      }
      liveBinding.lastNormValue = normVal;
    });

    targetElement.classList.remove('midi-learning-target');
    targetElement.classList.add('midi-linked');
    this.learningOverlayEl.style.display = 'none';

    console.log(`[MidiLearn] "${this.currentLabel}" vinculado com sucesso ao MIDI CC #${normalizedCc}`);
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
      if (this.ccOwners.get(existing.ccNum) === bindingKey) {
        this.webMidi.removeCcMapping(existing.ccNum);
        this.ccOwners.delete(existing.ccNum);
      }
      this.activeBindings.delete(bindingKey);
      if (element) element.classList.remove('midi-linked');
      console.log(`[MidiLearn] Vínculo do controle "${existing.label}" removido.`);
    }
  }

  removeBindingsForChannel(channel) {
    const prefix = `ch_${parseInt(channel, 10)}_`;
    Array.from(this.activeBindings.entries()).forEach(([key, binding]) => {
      if (!key.startsWith(prefix)) return;
      if (this.ccOwners.get(binding.ccNum) === key) {
        this.webMidi.removeCcMapping(binding.ccNum);
        this.ccOwners.delete(binding.ccNum);
      }
      if (binding.element) binding.element.classList.remove('midi-linked');
      this.activeBindings.delete(key);
    });
  }

  getElementKey(element) {
    if (element.id) return element.id;
    if (element.dataset && element.dataset.midiLearnKey) return element.dataset.midiLearnKey;
    if (element.dataset && element.dataset.channel) {
      const stableClasses = Array.from(element.classList || [])
        .filter(className => className !== 'midi-linked' && className !== 'midi-learning-target')
        .sort()
        .join('.');
      return `ch_${element.dataset.channel}_${stableClasses || element.tagName.toLowerCase()}`;
    }
    if (!this.fallbackElementKeys.has(element)) {
      this.fallbackElementKeys.set(element, `midi_control_${this.nextFallbackElementKey++}`);
    }
    return this.fallbackElementKeys.get(element);
  }
}

window.MidiLearnManager = MidiLearnManager;
