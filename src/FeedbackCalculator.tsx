import { useState, useEffect } from 'react';
import { parseEngineeringUnit, formatEngineeringUnit } from './utils/engineeringParser';

export default function FeedbackCalculator() {
  const [vout, setVout] = useState<string>('');
  const [vref, setVref] = useState<string>('1.25');
  const [r1, setR1] = useState<string>('');
  const [r2, setR2] = useState<string>('');
  
  const [tol1, setTol1] = useState<number>(0.01);
  const [tol2, setTol2] = useState<number>(0.01);

  const [results, setResults] = useState<{nom: number, min: number, max: number} | null>(null);

  const calculateVout = () => {
    const vr = parseEngineeringUnit(vref);
    const topR = parseEngineeringUnit(r1);
    const botR = parseEngineeringUnit(r2);
    if (vr && topR && botR) {
      const vOutNom = vr * (1 + topR / botR);
      setVout(formatEngineeringUnit(vOutNom));
    }
  };

  const calculateVref = () => {
    const vo = parseEngineeringUnit(vout);
    const topR = parseEngineeringUnit(r1);
    const botR = parseEngineeringUnit(r2);
    if (vo && topR && botR) {
      const vr = vo / (1 + topR / botR);
      setVref(formatEngineeringUnit(vr));
    }
  };

  const calculateR1 = () => {
    const vo = parseEngineeringUnit(vout);
    const vr = parseEngineeringUnit(vref);
    const botR = parseEngineeringUnit(r2);
    if (vo && vr && botR && vo > vr) {
      const topR = botR * ((vo / vr) - 1);
      setR1(formatEngineeringUnit(topR, 1));
    }
  };

  const calculateR2 = () => {
    const vo = parseEngineeringUnit(vout);
    const vr = parseEngineeringUnit(vref);
    const topR = parseEngineeringUnit(r1);
    if (vo && vr && topR && vo > vr) {
      const botR = topR / ((vo / vr) - 1);
      setR2(formatEngineeringUnit(botR, 1));
    }
  };

  // Update results whenever values change
  useEffect(() => {
    // Check if variables are valid
    const vr = parseEngineeringUnit(vref);
    const topR = parseEngineeringUnit(r1);
    const botR = parseEngineeringUnit(r2);

    if (vr && topR && botR) {
      const nom = vr * (1 + topR / botR);
      const r1Max = topR * (1 + tol1);
      const r1Min = topR * (1 - tol1);
      const r2Max = botR * (1 + tol2);
      const r2Min = botR * (1 - tol2);

      const maxOut = vr * (1 + r1Max / r2Min);
      const minOut = vr * (1 + r1Min / r2Max);

      setResults({ nom, min: minOut, max: maxOut });
    } else {
      setResults(null);
    }
  }, [vout, vref, r1, r2, tol1, tol2]);

  return (
    <div className="glass-panel">
      <h2 className="mb-6">Feedback Resistor Calculator</h2>
      <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem'}}>
        Formula: Vout = Vref × (1 + R1 / R2)
      </p>

      <div className="calc-grid">
        <div>
          <div className="input-with-button">
            <div className="input-group">
              <label>Target Output Voltage (Vout)</label>
              <input type="text" value={vout} onChange={e => setVout(e.target.value)} placeholder="e.g. 3.3" />
            </div>
            <button className="calc-btn secondary" onClick={calculateVout} title="Calculate Vout">Solve</button>
          </div>

          <div className="input-with-button mt-4">
            <div className="input-group">
              <label>Reference Voltage (Vref)</label>
              <input type="text" value={vref} onChange={e => setVref(e.target.value)} placeholder="e.g. 1.25" />
            </div>
            <button className="calc-btn secondary" onClick={calculateVref} title="Calculate Vref">Solve</button>
          </div>
        </div>

        <div>
          <div className="input-with-button">
            <div className="tolerance-group">
              <div className="input-group">
                <label>Top Resistor (R1, ohms)</label>
                <input type="text" value={r1} onChange={e => setR1(e.target.value)} placeholder="e.g. 240k" />
              </div>
              <div className="input-group">
                <label>Tol.</label>
                <select value={tol1} onChange={e => setTol1(parseFloat(e.target.value))}>
                  <option value={0.001}>0.1%</option>
                  <option value={0.005}>0.5%</option>
                  <option value={0.01}>1%</option>
                  <option value={0.05}>5%</option>
                  <option value={0.1}>10%</option>
                </select>
              </div>
            </div>
            <button className="calc-btn secondary" onClick={calculateR1} title="Calculate R1">Solve</button>
          </div>

          <div className="input-with-button mt-4">
            <div className="tolerance-group">
              <div className="input-group">
                <label>Bottom Resistor (R2, ohms)</label>
                <input type="text" value={r2} onChange={e => setR2(e.target.value)} placeholder="e.g. 390k" />
              </div>
              <div className="input-group">
                <label>Tol.</label>
                <select value={tol2} onChange={e => setTol2(parseFloat(e.target.value))}>
                  <option value={0.001}>0.1%</option>
                  <option value={0.005}>0.5%</option>
                  <option value={0.01}>1%</option>
                  <option value={0.05}>5%</option>
                  <option value={0.1}>10%</option>
                </select>
              </div>
            </div>
            <button className="calc-btn secondary" onClick={calculateR2} title="Calculate R2">Solve</button>
          </div>
        </div>
      </div>

      {results && (
        <div className="results-panel">
          <h3 className="mb-6">Tolerance Analysis</h3>
          <div className="result-item">
            <span className="result-label">Minimum Output Voltage</span>
            <span className="result-value warning">{formatEngineeringUnit(results.min)} V</span>
          </div>
          <div className="result-item">
            <span className="result-label">Nominal Output Voltage</span>
            <span className="result-value success">{formatEngineeringUnit(results.nom)} V</span>
          </div>
          <div className="result-item">
            <span className="result-label">Maximum Output Voltage</span>
            <span className="result-value warning">{formatEngineeringUnit(results.max)} V</span>
          </div>
        </div>
      )}
    </div>
  );
}
