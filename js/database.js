/**
 * VELOCITY CURVE PERSISTENCE
 * Mantém uma API assíncrona explícita e só altera memória após gravação bem-sucedida.
 */
class BenDatabaseManager {
  constructor() {
    this.dbName = 'bensf2_database.sqlite';
    this.factoryCurves = [
      { id: 'fact_std', name: '🎵 Standard (Power 2.0)', minVel: 1, maxVel: 127, curvePower: 2.0, mode: 'normal', fixedVel: 120, isFactory: true },
      { id: 'fact_soft', name: '🎹 Soft Touch (Leve / Sensível)', minVel: 1, maxVel: 127, curvePower: 1.2, mode: 'soft', fixedVel: 120, isFactory: true },
      { id: 'fact_hard', name: '🎹 Hard Touch (Pesado / Força)', minVel: 5, maxVel: 127, curvePower: 2.8, mode: 'hard', fixedVel: 120, isFactory: true },
      { id: 'fact_compress', name: '🎷 Compressão Dinâmica (50%)', minVel: 10, maxVel: 120, curvePower: 1.5, mode: 'compressed', fixedVel: 120, isFactory: true },
      { id: 'fact_organ', name: '🎹 Órgão / Synth Lead (Fixo 127)', minVel: 1, maxVel: 127, curvePower: 2.0, mode: 'fixed', fixedVel: 127, isFactory: true },
      { id: 'fact_organ120', name: '🎹 Órgão / Synth Lead (Fixo 120)', minVel: 1, maxVel: 127, curvePower: 2.0, mode: 'fixed', fixedVel: 120, isFactory: true }
    ];
    this.userCurves = this.factoryCurves.map(curve => ({ ...curve }));
    this.ready = this.init();
  }

  clamp(value, min, max, fallback) {
    const numeric = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
  }

  cleanText(value, fallback, maxLength) {
    if (typeof value !== 'string') return fallback;
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return (clean || fallback).slice(0, maxLength);
  }

  normalizeCurve(input, options = {}) {
    if (!input || typeof input !== 'object') return null;
    const allowedModes = new Set(['normal', 'soft', 'hard', 'compressed', 'fixed', 'custom']);
    let minVel = Math.round(this.clamp(input.minVel, 1, 127, 1));
    let maxVel = Math.round(this.clamp(input.maxVel, 1, 127, 127));
    if (minVel > maxVel) [minVel, maxVel] = [maxVel, minVel];
    const rawId = this.cleanText(input.id, '', 100).replace(/[^a-zA-Z0-9_-]/g, '');
    const id = rawId || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const factoryIds = new Set(this.factoryCurves.map(curve => curve.id));
    const isFactory = options.allowFactory === true && factoryIds.has(id);
    const mode = allowedModes.has(input.mode) ? input.mode : 'custom';
    return {
      id,
      name: this.cleanText(input.name, 'Curva sem nome', 120),
      minVel,
      maxVel,
      curvePower: this.clamp(input.curvePower, 0.1, 8, 2),
      mode,
      fixedVel: Math.round(this.clamp(input.fixedVel, 1, 127, 120)),
      isFactory
    };
  }

  normalizeStoredCurves(input) {
    if (!Array.isArray(input)) throw new Error('O banco de curvas não contém uma lista válida.');
    const byId = new Map(this.factoryCurves.map(curve => [curve.id, { ...curve }]));
    input.slice(0, 500).forEach(candidate => {
      const normalized = this.normalizeCurve(candidate, { allowFactory: true });
      if (!normalized || normalized.isFactory) return;
      byId.set(normalized.id, normalized);
    });
    return Array.from(byId.values());
  }

  async init() {
    try {
      let stored = null;
      if (window.electronAPI && typeof window.electronAPI.dbGetVelocityCurves === 'function') {
        stored = await window.electronAPI.dbGetVelocityCurves();
      } else {
        const raw = localStorage.getItem('bensf2_velocity_curves_sqlite');
        stored = raw ? JSON.parse(raw) : null;
      }
      if (stored !== null) this.userCurves = this.normalizeStoredCurves(stored);
      if (stored === null || this.userCurves.length === 0) {
        this.userCurves = this.factoryCurves.map(curve => ({ ...curve }));
        await this.persistCurves(this.userCurves);
      }
      return this.userCurves;
    } catch (error) {
      console.warn('[BenDB] Banco indisponível; usando curvas de fábrica em memória:', error);
      this.userCurves = this.factoryCurves.map(curve => ({ ...curve }));
      return this.userCurves;
    }
  }

  async persistCurves(curves) {
    if (window.electronAPI && typeof window.electronAPI.dbSaveVelocityCurves === 'function') {
      const saved = await window.electronAPI.dbSaveVelocityCurves(curves);
      if (saved !== true) throw new Error('O processo principal recusou a gravação das curvas.');
      return true;
    }
    localStorage.setItem('bensf2_velocity_curves_sqlite', JSON.stringify(curves));
    return true;
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem('bensf2_velocity_curves_sqlite', JSON.stringify(this.userCurves));
      return true;
    } catch (error) {
      console.error('[BenDB] Falha ao salvar no LocalStorage:', error);
      return false;
    }
  }

  getVelocityCurves() {
    return this.userCurves;
  }

  async addCustomVelocityCurve(curveObj) {
    await this.ready;
    const normalized = this.normalizeCurve({ ...curveObj, id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
    if (!normalized || !normalized.name) return null;
    const next = [...this.userCurves, normalized];
    try {
      await this.persistCurves(next);
      this.userCurves = next;
      return normalized;
    } catch (error) {
      console.error('[BenDB] Falha ao persistir nova curva:', error);
      return null;
    }
  }

  async deleteVelocityCurve(id) {
    await this.ready;
    const target = this.userCurves.find(curve => curve.id === id);
    if (!target || target.isFactory) return false;
    const next = this.userCurves.filter(curve => curve.id !== id);
    try {
      await this.persistCurves(next);
      this.userCurves = next;
      return true;
    } catch (error) {
      console.error('[BenDB] Falha ao excluir curva:', error);
      return false;
    }
  }
}

window.BenDatabaseManager = BenDatabaseManager;
