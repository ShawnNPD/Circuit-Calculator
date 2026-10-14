import { useState } from 'react';
import { parseEngineeringUnit, formatEngineeringUnit } from './utils/engineeringParser';

export default function DiffAmpCalculator() {
  const [vin, setVin] = useState<string>('');
  const [vout, setVout] = useState<string>('');
  const [rf, setRf] = useState<string>('');
  const [rin, setRin] = useState<string>('');
  const [gain, setGain] = useState<string>('');

  const calculateVin = () => {
    const vo = parseEngineeringUnit(vout);
    const g = parseEngineeringUnit(gain);
    const fR = parseEngineeringUnit(rf);
    const inR = parseEngineeringUnit(rin);
    
    if (vo && g) {
      setVin(formatEngineeringUnit(vo / g));
    } else if (vo && fR && inR) {
      const calcGain = fR / inR;
      setGain(formatEngineeringUnit(calcGain));
      setVin(formatEngineeringUnit(vo / calcGain));
    }
  };

  const calculateVout = () => {
    const vi = parseEngineeringUnit(vin);
    const g = parseEngineeringUnit(gain);
    const fR = parseEngineeringUnit(rf);
    const inR = parseEngineeringUnit(rin);

    if (vi && g) {
      setVout(formatEngineeringUnit(vi * g));
    } else if (vi && fR && inR) {
      const calcGain = fR / inR;
      setGain(formatEngineeringUnit(calcGain));
      setVout(formatEngineeringUnit(vi * calcGain));
    }
  };

  const calculateGain = () => {
    const fR = parseEngineeringUnit(rf);
    const inR = parseEngineeringUnit(rin);
    const vo = parseEngineeringUnit(vout);
    const vi = parseEngineeringUnit(vin);

    if (fR && inR) {
      setGain(formatEngineeringUnit(fR / inR));
    } else if (vo && vi) {
      setGain(formatEngineeringUnit(vo / vi));
    }
  };

  const calculateRf = () => {
    const inR = parseEngineeringUnit(rin);
    let g = parseEngineeringUnit(gain);
    const vo = parseEngineeringUnit(vout);
    const vi = parseEngineeringUnit(vin);

    if (!g && vo && vi) {
      g = vo / vi;
      setGain(formatEngineeringUnit(g));
    }

    if (inR && g) {
      setRf(formatEngineeringUnit(inR * g, 1));
    }
  };

  const calculateRin = () => {
    const fR = parseEngineeringUnit(rf);
    let g = parseEngineeringUnit(gain);
    const vo = parseEngineeringUnit(vout);
    const vi = parseEngineeringUnit(vin);

    if (!g && vo && vi) {
      g = vo / vi;
      setGain(formatEngineeringUnit(g));
    }

    if (fR && g) {
      setRin(formatEngineeringUnit(fR / g, 1));
    }
  };

  return (
    <div className="glass-panel">
      <h2 className="mb-6">Differential Amplifier</h2>
      <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem'}}>
        Formulas: Gain = Rf / Rin | Vout = Gain × Vin
      </p>

      <div className="calc-grid">
        <div>
          <h3 className="mb-6" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Voltages</h3>
          <div className="input-with-button">
            <div className="input-group">
              <label>Full-Scale Differential Input Voltage (Vin)</label>
              <input type="text" value={vin} onChange={e => setVin(e.target.value)} placeholder="e.g. 1.0" />
            </div>
            <button className="calc-btn secondary" onClick={calculateVin} title="Calculate Vin">Solve</button>
          </div>

          <div className="input-with-button" style={{ marginTop: '1rem' }}>
            <div className="input-group">
              <label>Full-Scale Output Voltage (Vout)</label>
              <input type="text" value={vout} onChange={e => setVout(e.target.value)} placeholder="e.g. 5.0" />
            </div>
            <button className="calc-btn secondary" onClick={calculateVout} title="Calculate Vout">Solve</button>
          </div>
        </div>

        <div>
          <h3 className="mb-6" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Resistors & Gain</h3>
          <div className="input-with-button">
            <div className="input-group">
              <label>Feedback Resistor (Rf, ohms)</label>
              <input type="text" value={rf} onChange={e => setRf(e.target.value)} placeholder="e.g. 10k" />
            </div>
            <button className="calc-btn secondary" onClick={calculateRf} title="Calculate Rf">Solve</button>
          </div>

          <div className="input-with-button" style={{ marginTop: '1rem' }}>
            <div className="input-group">
              <label>Input Resistor (Rin, ohms)</label>
              <input type="text" value={rin} onChange={e => setRin(e.target.value)} placeholder="e.g. 1k" />
            </div>
            <button className="calc-btn secondary" onClick={calculateRin} title="Calculate Rin">Solve</button>
          </div>

          <div className="input-with-button" style={{ marginTop: '1rem' }}>
            <div className="input-group">
              <label>Voltage Gain (V/V)</label>
              <input type="text" value={gain} onChange={e => setGain(e.target.value)} placeholder="e.g. 10.0" />
            </div>
            <button className="calc-btn secondary" onClick={calculateGain} title="Calculate Gain">Solve</button>
          </div>
        </div>
      </div>
    </div>
  );
}
