/**
 * DAW ROTARY KNOB CONTROLLER
 * Componente interativo de Knob giratório profissional (estilo VST / Kontakt).
 * Arraste para cima/baixo para girar e alterar os valores suavemente.
 */

class RotaryKnob {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.title = options.title || 'KNOB';
    this.min = options.min !== undefined ? options.min : 0;
    this.max = options.max !== undefined ? options.max : 100;
    this.step = options.step !== undefined ? Math.abs(Number(options.step)) : 1;
    this.value = options.value !== undefined ? options.value : this.min;
    this.unit = options.unit || '';
    this.onChange = options.onChange || null;

    this.isDragging = false;
    this.startY = 0;
    this.startValue = 0;
    this.cleanupCallbacks = [];

    this.render();
  }

  render() {
    this.container.className = 'knob-container';
    this.container.replaceChildren();

    this.knobEl = document.createElement('div');
    this.knobEl.className = 'knob-element';
    this.knobEl.setAttribute('role', 'slider');
    this.knobEl.tabIndex = 0;
    this.knobEl.setAttribute('aria-label', this.title);
    this.knobEl.setAttribute('aria-valuemin', String(this.min));
    this.knobEl.setAttribute('aria-valuemax', String(this.max));

    this.pointerEl = document.createElement('div');
    this.pointerEl.className = 'knob-pointer';
    this.knobEl.appendChild(this.pointerEl);

    this.valueEl = document.createElement('div');
    this.valueEl.className = 'knob-value-text';

    const titleEl = document.createElement('div');
    titleEl.className = 'knob-title';
    titleEl.textContent = this.title;

    this.container.append(this.knobEl, this.valueEl, titleEl);

    this.updateRotation();
    this.attachEvents();
  }

  formatValue() {
    if (this.unit === '%') return `${Math.round(this.value)}${this.unit}`;
    if (this.unit === 'dB') return `${this.value > 0 ? '+' : ''}${this.value}${this.unit}`;
    if (this.unit === 'ms') return `${Math.round(this.value)}${this.unit}`;
    return `${typeof this.value === 'number' ? parseFloat(this.value.toFixed(2)) : this.value}${this.unit}`;
  }

  updateRotation() {
    // Mapear min..max para -135deg .. +135deg
    const pct = (this.value - this.min) / (this.max - this.min);
    const angle = -135 + pct * 270;
    if (this.pointerEl) {
      this.pointerEl.style.transform = `rotate(${angle}deg)`;
    }
    if (this.valueEl) {
      this.valueEl.textContent = this.formatValue();
    }
    if (this.knobEl) {
      this.knobEl.setAttribute('aria-valuenow', String(this.value));
      this.knobEl.setAttribute('aria-valuetext', this.formatValue());
    }
  }

  setValue(newVal) {
    let normalized = Math.max(this.min, Math.min(this.max, Number(newVal)));
    if (!Number.isFinite(normalized)) normalized = this.min;
    if (this.step > 0) {
      normalized = this.min + Math.round((normalized - this.min) / this.step) * this.step;
      const decimals = (String(this.step).split('.')[1] || '').length;
      normalized = Number(normalized.toFixed(Math.min(8, decimals)));
    }
    this.value = Math.max(this.min, Math.min(this.max, normalized));
    this.updateRotation();
    if (this.onChange) {
      this.onChange(this.value);
    }
  }

  attachEvents() {
    const on = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      this.cleanupCallbacks.push(() => target.removeEventListener(type, listener, options));
    };

    const handleStart = (clientY) => {
      this.isDragging = true;
      this.startY = clientY;
      this.startValue = this.value;
      document.body.style.cursor = 'ns-resize';
    };

    const handleMove = (clientY) => {
      if (!this.isDragging) return;
      const deltaY = this.startY - clientY; // Arrastar para cima aumenta
      const range = this.max - this.min;
      const sensitivity = range / 150.0;
      let newVal = this.startValue + deltaY * sensitivity;

      this.setValue(newVal);
    };

    const handleEnd = () => {
      if (this.isDragging) {
        this.isDragging = false;
        document.body.style.cursor = '';
      }
    };

    on(this.knobEl, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      handleStart(e.clientY);
      try { this.knobEl.setPointerCapture(e.pointerId); } catch (error) {}
    });
    on(this.knobEl, 'pointermove', (e) => {
      if (!this.isDragging) return;
      e.preventDefault();
      handleMove(e.clientY);
    });
    on(this.knobEl, 'pointerup', handleEnd);
    on(this.knobEl, 'pointercancel', handleEnd);
    on(this.knobEl, 'lostpointercapture', handleEnd);

    // Suporte a Roda do Mouse (Wheel)
    on(this.knobEl, 'wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? this.step || 0.05 : -(this.step || 0.05);
      this.setValue(this.value + delta);
    }, { passive: false });

    on(this.knobEl, 'keydown', (e) => {
      const step = this.step || (this.max - this.min) / 100;
      const changes = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 10, PageDown: -step * 10 };
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        this.setValue(e.key === 'Home' ? this.min : this.max);
      } else if (changes[e.key] !== undefined) {
        e.preventDefault();
        this.setValue(this.value + changes[e.key]);
      }
    });
  }

  dispose() {
    this.cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
    this.isDragging = false;
  }
}

window.RotaryKnob = RotaryKnob;
