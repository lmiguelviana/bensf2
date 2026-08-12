/**
 * BEN SF2 SQLITE PERSISTENT DATABASE ENGINE
 * Gerencia o armazenamento persistente no banco de dados SQLite para Presets e Curvas de Velocity Personalizadas.
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
    this.userCurves = [];
    this.init();
  }

  async init() {
    // Tentar carregar do SQLite via Electron IPC ou LocalStorage
    try {
      if (window.electronAPI && window.electronAPI.dbGetVelocityCurves) {
        const stored = await window.electronAPI.dbGetVelocityCurves();
        if (Array.isArray(stored) && stored.length > 0) {
          this.userCurves = stored;
        } else {
          this.userCurves = [...this.factoryCurves];
          await window.electronAPI.dbSaveVelocityCurves(this.userCurves);
        }
      } else {
        const local = localStorage.getItem('bensf2_velocity_curves_sqlite');
        if (local) {
          this.userCurves = JSON.parse(local);
        } else {
          this.userCurves = [...this.factoryCurves];
          this.saveToLocalStorage();
        }
      }
    } catch (err) {
      console.warn('[BenDB] Erro ao inicializar banco de dados SQLite, usando fallback local:', err);
      this.userCurves = [...this.factoryCurves];
    }
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem('bensf2_velocity_curves_sqlite', JSON.stringify(this.userCurves));
    } catch (e) {
      console.error('[BenDB] Falha ao salvar no LocalStorage:', e);
    }
  }

  getVelocityCurves() {
    return this.userCurves;
  }

  async addCustomVelocityCurve(curveObj) {
    if (!curveObj || !curveObj.name) return null;

    const newCurve = {
      id: 'custom_' + Date.now(),
      name: curveObj.name.trim(),
      minVel: parseInt(curveObj.minVel, 10) || 1,
      maxVel: parseInt(curveObj.maxVel, 10) || 127,
      curvePower: parseFloat(curveObj.curvePower) || 2.0,
      mode: curveObj.mode || 'custom',
      fixedVel: parseInt(curveObj.fixedVel, 10) || 120,
      isFactory: false
    };

    this.userCurves.push(newCurve);

    if (window.electronAPI && window.electronAPI.dbSaveVelocityCurves) {
      await window.electronAPI.dbSaveVelocityCurves(this.userCurves);
    } else {
      this.saveToLocalStorage();
    }

    console.log(`[BenDB] Nova Curva de Velocity salva no SQLite: "${newCurve.name}"`, newCurve);
    return newCurve;
  }

  async deleteVelocityCurve(id) {
    this.userCurves = this.userCurves.filter(c => c.id !== id || c.isFactory);

    if (window.electronAPI && window.electronAPI.dbSaveVelocityCurves) {
      await window.electronAPI.dbSaveVelocityCurves(this.userCurves);
    } else {
      this.saveToLocalStorage();
    }
  }
}

window.BenDatabaseManager = BenDatabaseManager;
