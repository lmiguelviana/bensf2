/**
 * PERFORMANCE INPUT HELPERS
 * Converte pressao de caneta/tela ou a posicao vertical do toque em velocity MIDI.
 */
class PerformanceInput {
  static clampVelocity(value) {
    const numeric = Number(value);
    return Math.max(1, Math.min(127, Math.round(Number.isFinite(numeric) ? numeric : 100)));
  }

  static pointerVelocity(event, keyRect) {
    const pressure = Number(event && event.pressure);
    const pointerType = event && event.pointerType;
    const hasMeasuredPressure = Number.isFinite(pressure) && pressure > 0 && pressure <= 1 && (
      pointerType === 'pen' ||
      (pointerType === 'touch' && Math.abs(pressure - 0.5) > 0.001)
    );

    let intensity;
    if (hasMeasuredPressure) {
      intensity = pressure;
    } else if (keyRect && Number(keyRect.height) > 0 && Number.isFinite(Number(event && event.clientY))) {
      intensity = (Number(event.clientY) - Number(keyRect.top)) / Number(keyRect.height);
    } else {
      intensity = 0.75;
    }

    intensity = Math.max(0, Math.min(1, intensity));
    // Evita que um toque muito leve seja totalmente inaudivel, mantendo ampla dinamica.
    return this.clampVelocity(16 + (intensity * 111));
  }
}

window.PerformanceInput = PerformanceInput;
