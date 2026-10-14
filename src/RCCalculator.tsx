import { useState } from 'react';
import { parseEngineeringUnit, formatEngineeringUnit } from './utils/engineeringParser';

export default function RCCalculator() {
  const [r, setR] = useState<string>('');
  const [c, setC] = useState<string>('');
  const [tau, setTau] = useState<string>('');
  const [fc, setFc] = useState<string>('');
  const [tr, setTr] = useState<string>('');

  const updateDerived = (t: number) => {
    setTau(formatEngineeringUnit(t));
    setFc(formatEngineeringUnit(1 / (2 * Math.PI * t)));
    setTr(formatEngineeringUnit(2.197224577 * t));
  };

  const calculateDerived = () => {
    const res = parseEngineeringUnit(r);
    const cap = parseEngineeringUnit(c);
    if (res && cap) {
      updateDerived(res * cap);
    }
  };

  const calculateR = () => {
    const cap = parseEngineeringUnit(c);
    let t = parseEngineeringUnit(tau);
    
    if (!t) {
      const freq = parseEngineeringUnit(fc);
      if (freq) t = 1 / (2 * Math.PI * freq);
      else {
        const rise = parseEngineeringUnit(tr);
        if (rise) t = rise / 2.197224577;
      }
    }

    if (t && cap) {
      setR(formatEngineeringUnit(t / cap, 1));
      updateDerived(t);
    }
  };

  const calculateC = () => {
    const res = parseEngineeringUnit(r);
    let t = parseEngineeringUnit(tau);
    
    if (!t) {
      const freq = parseEngineeringUnit(fc);
      if (freq) t = 1 / (2 * Math.PI * freq);
      else {
        const rise = parseEngineeringUnit(tr);
        if (rise) t = rise / 2.197224577;
      }
    }

    if (t && res) {
      setC(formatEngineeringUnit(t / res));
      updateDerived(t);
    }
  };

  const syncFromTau = () => {
    const t = parseEngineeringUnit(tau);
    if (t) updateDerived(t);
  };

  const syncFromFc = () => {
    const freq = parseEngineeringUnit(fc);
    if (freq) updateDerived(1 / (2 * Math.PI * freq));
  };

  const syncFromTr = () => {
    const rise = parseEngineeringUnit(tr);
    if (rise) updateDerived(rise / 2.197224577);
  };

  return (
    <div className="glass-panel">
      <h2 className="mb-6">RC Time Constant Calculator</h2>
      <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem'}}>
        Formulas: τ = R × C | fc = 1 / (2π × τ) | Tr (10-90%) ≈ 2.2 × τ
      </p>

      <div className="calc-grid">
        <div>
          <h3 className="mb-6" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Components</h3>
          <div className="input-with-button">
            <div className="input-group">
              <label>Resistance (R, ohms)</label>
              <input type="text" value={r} onChange={e => setR(e.target.value)} placeholder="e.g. 10k" />
            </div>
            <button className="calc-btn secondary" onClick={calculateR} title="Calculate R">Solve</button>
          </div>

          <div className="input-with-button" style={{ marginTop: '1rem' }}>
            <div className="input-group">
              <label>Capacitance (C, farads)</label>
              <input type="text" value={c} onChange={e => setC(e.target.value)} placeholder="e.g. 100n" />
            </div>
            <button className="calc-btn secondary" onClick={calculateC} title="Calculate C">Solve</button>
          </div>
          
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button className="calc-btn active" style={{ width: '100%' }} onClick={calculateDerived}>Calculate Timings from R & C</button>
          </div>
        </div>

        <div>
          <h3 className="mb-6" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Timings & Frequency</h3>
          <div className="input-with-button">
            <div className="input-group">
              <label>Time Constant (τ, seconds)</label>
              <input type="text" value={tau} onChange={e => setTau(e.target.value)} placeholder="e.g. 1m" />
            </div>
            <button className="calc-btn secondary" onClick={syncFromTau} title="Calculate others from τ">Sync</button>
          </div>

          <div className="input-with-button" style={{ marginTop: '1rem' }}>
            <div className="input-group">
              <label>Cutoff Frequency (fc, hertz)</label>
              <input type="text" value={fc} onChange={e => setFc(e.target.value)} placeholder="e.g. 1.5k" />
            </div>
            <button className="calc-btn secondary" onClick={syncFromFc} title="Calculate others from fc">Sync</button>
          </div>

          <div className="input-with-button" style={{ marginTop: '1rem' }}>
            <div className="input-group">
              <label>Rise Time 10-90% (Tr, seconds)</label>
              <input type="text" value={tr} onChange={e => setTr(e.target.value)} placeholder="e.g. 2.2m" />
            </div>
            <button className="calc-btn secondary" onClick={syncFromTr} title="Calculate others from Tr">Sync</button>
          </div>
        </div>
      </div>
    </div>
  );
}
