import { useState, useEffect } from 'react';
import { parseEngineeringUnit, formatEngineeringUnit } from './utils/engineeringParser';

export default function ResistorDividerCalculator() {
  const [vin, setVin] = useState<string>('');
  const [vout, setVout] = useState<string>('');
  const [rtop, setRtop] = useState<string>('');
  const [rbottom, setRbottom] = useState<string>('');
  
  const [tolTop, setTolTop] = useState<number>(0.01);
  const [tolBottom, setTolBottom] = useState<number>(0.01);

  const [results, setResults] = useState<{nom: number, min: number, max: number, current: number} | null>(null);

  const calculateVout = () => {
    const vi = parseEngineeringUnit(vin);
    const rT = parseEngineeringUnit(rtop);
    const rB = parseEngineeringUnit(rbottom);
    if (vi && rT && rB) {
      const vOutNom = vi * (rB / (rT + rB));
      setVout(formatEngineeringUnit(vOutNom));
    }
  };

  const calculateVin = () => {
    const vo = parseEngineeringUnit(vout);
    const rT = parseEngineeringUnit(rtop);
    const rB = parseEngineeringUnit(rbottom);
    if (vo && rT && rB) {
      const vi = vo / (rB / (rT + rB));
      setVin(formatEngineeringUnit(vi));
    }
  };

  const calculateRtop = () => {
    const vo = parseEngineeringUnit(vout);
    const vi = parseEngineeringUnit(vin);
    const rB = parseEngineeringUnit(rbottom);
    if (vo && vi && rB && vi > vo) {
      // vo = vi * rB / (rT + rB)
      // vo * (rT + rB) = vi * rB
      // vo * rT = vi * rB - vo * rB
      // rT = rB * (vi - vo) / vo
      const rT = rB * (vi - vo) / vo;
      setRtop(formatEngineeringUnit(rT, 1));
    }
  };

  const calculateRbottom = () => {
    const vo = parseEngineeringUnit(vout);
    const vi = parseEngineeringUnit(vin);
    const rT = parseEngineeringUnit(rtop);
    if (vo && vi && rT && vi > vo) {
      // vo = vi * rB / (rT + rB)
      // vo * rT + vo * rB = vi * rB
      // vi * rB - vo * rB = vo * rT
      // rB * (vi - vo) = vo * rT
      // rB = vo * rT / (vi - vo)
      const rB = (vo * rT) / (vi - vo);
      setRbottom(formatEngineeringUnit(rB, 1));
    }
  };

  // Update results whenever values change
  useEffect(() => {
    // Check if variables are valid
    const vi = parseEngineeringUnit(vin);
    const rT = parseEngineeringUnit(rtop);
    const rB = parseEngineeringUnit(rbottom);

    if (vi && rT && rB) {
      const nom = vi * (rB / (rT + rB));
      const rTMax = rT * (1 + tolTop);
      const rTMin = rT * (1 - tolTop);
      const rBMax = rB * (1 + tolBottom);
      const rBMin = rB * (1 - tolBottom);

      const maxOut = vi * (rBMax / (rTMin + rBMax));
      const minOut = vi * (rBMin / (rTMax + rBMin));

      const current = vi / (rT + rB);

      setResults({ nom, min: minOut, max: maxOut, current });
    } else {
      setResults(null);
    }
  }, [vout, vin, rtop, rbottom, tolTop, tolBottom]);

  return (
    <div className="glass-panel">
      <h2 className="mb-6">Standard Resistor Divider</h2>
      <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem'}}>
        Formula: Vout = Vin × (Rbottom / (Rtop + Rbottom))
      </p>

      <div className="calc-grid">
        <div>
          <div className="input-with-button">
            <div className="input-group">
               <label>Input Voltage (Vin)</label>
               <input type="text" value={vin} onChange={e => setVin(e.target.value)} placeholder="e.g. 5.0" />
            </div>
            <button className="calc-btn secondary" onClick={calculateVin} title="Calculate Vin">Solve</button>
          </div>

          <div className="input-with-button mt-4">
            <div className="input-group">
               <label>Output Voltage (Vout)</label>
               <input type="text" value={vout} onChange={e => setVout(e.target.value)} placeholder="e.g. 3.3" />
            </div>
            <button className="calc-btn secondary" onClick={calculateVout} title="Calculate Vout">Solve</button>
          </div>
        </div>

        <div>
          <div className="input-with-button">
            <div className="tolerance-group">
              <div className="input-group">
                <label>Top Resistor (Rtop, ohms)</label>
                <input type="text" value={rtop} onChange={e => setRtop(e.target.value)} placeholder="e.g. 10k" />
              </div>
              <div className="input-group">
                <label>Tol.</label>
                <select value={tolTop} onChange={e => setTolTop(parseFloat(e.target.value))}>
                  <option value={0.001}>0.1%</option>
                  <option value={0.005}>0.5%</option>
                  <option value={0.01}>1%</option>
                  <option value={0.05}>5%</option>
                  <option value={0.1}>10%</option>
                </select>
              </div>
            </div>
            <button className="calc-btn secondary" onClick={calculateRtop} title="Calculate Rtop">Solve</button>
          </div>

          <div className="input-with-button mt-4">
            <div className="tolerance-group">
              <div className="input-group">
                <label>Bottom Resistor (Rbottom, ohms)</label>
                <input type="text" value={rbottom} onChange={e => setRbottom(e.target.value)} placeholder="e.g. 20k" />
              </div>
              <div className="input-group">
                <label>Tol.</label>
                <select value={tolBottom} onChange={e => setTolBottom(parseFloat(e.target.value))}>
                  <option value={0.001}>0.1%</option>
                  <option value={0.005}>0.5%</option>
                  <option value={0.01}>1%</option>
                  <option value={0.05}>5%</option>
                  <option value={0.1}>10%</option>
                </select>
              </div>
            </div>
            <button className="calc-btn secondary" onClick={calculateRbottom} title="Calculate Rbottom">Solve</button>
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
          <div className="result-item" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="result-label">Current Draw</span>
            <span className="result-value info">{formatEngineeringUnit(results.current)}A</span>
          </div>
        </div>
      )}
    </div>
  );
}
