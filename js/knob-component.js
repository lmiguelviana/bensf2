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
    this.step = options.step || 1;
    this.value = options.value !== undefined ? options.value : this.min;
    this.unit = options.unit || '';
    this.onChange = options.onChange || null;

    this.isDragging = false;
    this.startY = 0;
    this.startValue = 0;

    this.render();
  }

  render() {
    this.container.className = 'knob-container';
    this.container.innerHTML = `
      <div class="knob-element">
        <div class="knob-pointer"></div>
      </div>
      <div class="knob-value-text">${this.formatValue()}</div>
      <div class="knob-title">${this.title}</div>
    `;

    this.pointerEl = this.container.querySelector('.knob-pointer');
    this.valueEl = this.container.querySelector('.knob-value-text');
    this.knobEl = this.container.querySelector('.knob-element');

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
  }

  setValue(newVal) {
    this.value = Math.max(this.min, Math.min(this.max, newVal));
    this.updateRotation();
    if (this.onChange) {
      this.onChange(this.value);
    }
  }

  attachEvents() {
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

      if (this.step >= 1) {
        newVal = Math.round(newVal / this.step) * this.step;
      }

      this.setValue(newVal);
    };

    const handleEnd = () => {
      if (this.isDragging) {
        this.isDragging = false;
        document.body.style.cursor = '';
      }
    };

    this.knobEl.addEventListener('mousedown', (e) => handleStart(e.clientY));
    window.addEventListener('mousemove', (e) => handleMove(e.clientY));
    window.addEventListener('mouseup', handleEnd);

    this.knobEl.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) handleStart(e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchend', handleEnd);

    // Suporte a Roda do Mouse (Wheel)
    this.knobEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? this.step || 0.05 : -(this.step || 0.05);
      this.setValue(this.value + delta);
    }, { passive: false });
  }
}

window.RotaryKnob = RotaryKnob;
