import { useState } from 'react';
import { parseEngineeringUnit, formatEngineeringUnit } from './utils/engineeringParser';

export default function OpAmpCalculator() {
  const [vin, setVin] = useState<string>('');
  const [vout, setVout] = useState<string>('');
  const [rf, setRf] = useState<string>('');
  const [r, setR] = useState<string>('');
  const [gain, setGain] = useState<string>('');

  const calculateVin = () => {
    const vo = parseEngineeringUnit(vout);
    const g = parseEngineeringUnit(gain);
    const fR = parseEngineeringUnit(rf);
    const inR = parseEngineeringUnit(r);
    
    if (vo && g) {
      setVin(formatEngineeringUnit(vo / g));
    } else if (vo && fR && inR) {
      const calcGain = 1 + (fR / inR);
      setGain(formatEngineeringUnit(calcGain));
      setVin(formatEngineeringUnit(vo / calcGain));
    }
  };

  const calculateVout = () => {
    const vi = parseEngineeringUnit(vin);
    const g = parseEngineeringUnit(gain);
    const fR = parseEngineeringUnit(rf);
    const inR = parseEngineeringUnit(r);

    if (vi && g) {
      setVout(formatEngineeringUnit(vi * g));
    } else if (vi && fR && inR) {
      const calcGain = 1 + (fR / inR);
      setGain(formatEngineeringUnit(calcGain));
      setVout(formatEngineeringUnit(vi * calcGain));
    }
  };

  const calculateGain = () => {
    const fR = parseEngineeringUnit(rf);
    const inR = parseEngineeringUnit(r);
    const vo = parseEngineeringUnit(vout);
    const vi = parseEngineeringUnit(vin);

    if (fR && inR) {
      setGain(formatEngineeringUnit(1 + fR / inR));
    } else if (vo && vi) {
      setGain(formatEngineeringUnit(vo / vi));
    }
  };

  const calculateRf = () => {
    const inR = parseEngineeringUnit(r);
    let g = parseEngineeringUnit(gain);
    const vo = parseEngineeringUnit(vout);
    const vi = parseEngineeringUnit(vin);

    if (!g && vo && vi) {
      g = vo / vi;
      setGain(formatEngineeringUnit(g));
    }

    if (inR && g && g > 1) {
      setRf(formatEngineeringUnit(inR * (g - 1), 1));
    }
  };

  const calculateR = () => {
    const fR = parseEngineeringUnit(rf);
    let g = parseEngineeringUnit(gain);
    const vo = parseEngineeringUnit(vout);
    const vi = parseEngineeringUnit(vin);

    if (!g && vo && vi) {
      g = vo / vi;
      setGain(formatEngineeringUnit(g));
    }

    if (fR && g && g > 1) {
      setR(formatEngineeringUnit(fR / (g - 1), 1));
    }
  };

  return (
    <div className="glass-panel">
      <h2 className="mb-6">Non-Inverting Op-Amp</h2>
      <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem'}}>
        Formulas: Gain = 1 + (Rf / R) | Vout = Gain × Vin
      </p>

      <div className="calc-grid">
        <div>
          <h3 className="mb-6" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Voltages</h3>
          <div className="input-with-button">
            <div className="input-group">
              <label>Full-Scale Input Voltage (Vin)</label>
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
              <input type="text" value={rf} onChange={e => setRf(e.target.value)} placeholder="e.g. 4k" />
            </div>
            <button className="calc-btn secondary" onClick={calculateRf} title="Calculate Rf">Solve</button>
          </div>

          <div className="input-with-button" style={{ marginTop: '1rem' }}>
            <div className="input-group">
              <label>Inverting Input to Ground Resistor (R, ohms)</label>
              <input type="text" value={r} onChange={e => setR(e.target.value)} placeholder="e.g. 1k" />
            </div>
            <button className="calc-btn secondary" onClick={calculateR} title="Calculate R">Solve</button>
          </div>

          <div className="input-with-button" style={{ marginTop: '1rem' }}>
            <div className="input-group">
              <label>Voltage Gain (V/V)</label>
              <input type="text" value={gain} onChange={e => setGain(e.target.value)} placeholder="e.g. 5.0" />
            </div>
            <button className="calc-btn secondary" onClick={calculateGain} title="Calculate Gain">Solve</button>
          </div>
        </div>
      </div>
    </div>
  );
}
