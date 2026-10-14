import { useState, useEffect } from 'react';
import { parseEngineeringUnit } from './utils/engineeringParser';
import { loadToolConfig, saveToolConfig } from './utils/appConfig';

const CONFIG_KEY = 'calibration';

interface PersistedCalibrationState {
  measured1: string;
  actual1: string;
  measured2: string;
  actual2: string;
}

// Plain decimal output (no engineering suffixes) so a gain like 0.001 isn't
// shown as "1m" and the values can be pasted straight into firmware.
function formatNumber(value: number): string {
  return String(parseFloat(value.toPrecision(10)));
}

export default function CalibrationCalculator() {
  const [saved] = useState(() => loadToolConfig<PersistedCalibrationState>(CONFIG_KEY));

  const [measured1, setMeasured1] = useState(saved?.measured1 ?? '');
  const [actual1, setActual1] = useState(saved?.actual1 ?? '');
  const [measured2, setMeasured2] = useState(saved?.measured2 ?? '');
  const [actual2, setActual2] = useState(saved?.actual2 ?? '');

  useEffect(() => {
    saveToolConfig<PersistedCalibrationState>(CONFIG_KEY, { measured1, actual1, measured2, actual2 });
  }, [measured1, actual1, measured2, actual2]);

  const m1 = parseEngineeringUnit(measured1);
  const a1 = parseEngineeringUnit(actual1);
  const m2 = parseEngineeringUnit(measured2);
  const a2 = parseEngineeringUnit(actual2);

  const allEntered = [m1, a1, m2, a2].every(isFinite);
  const sameMeasured = allEntered && m1 === m2;

  // Line through (m1, a1) and (m2, a2): actual = measured * gain + offset
  let gain: number | null = null;
  let offset: number | null = null;
  if (allEntered && !sameMeasured) {
    gain = (a2 - a1) / (m2 - m1);
    offset = a1 - gain * m1;
  }

  return (
    <div className="glass-panel">
      <h2 className="mb-6">Calibration</h2>

      <div className="results-panel" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        <h3 className="mb-6" style={{ fontSize: '1.05rem' }}>1. Linear Calibration</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Enter the measured and actual values at two points. Gain and offset are chosen so that
          Actual = Measured × Gain + Offset passes through both points.
        </p>

        <div className="calc-grid">
          <div>
            <h3 className="mb-6" style={{ fontSize: '1rem', color: 'var(--text-main)' }}>Point 1</h3>
            <div className="input-group">
              <label>Measured Value</label>
              <input type="text" value={measured1} onChange={e => setMeasured1(e.target.value)} placeholder="e.g. 0.12" />
            </div>
            <div className="input-group">
              <label>Actual Value</label>
              <input type="text" value={actual1} onChange={e => setActual1(e.target.value)} placeholder="e.g. 0" />
            </div>
          </div>
          <div>
            <h3 className="mb-6" style={{ fontSize: '1rem', color: 'var(--text-main)' }}>Point 2</h3>
            <div className="input-group">
              <label>Measured Value</label>
              <input type="text" value={measured2} onChange={e => setMeasured2(e.target.value)} placeholder="e.g. 9.87" />
            </div>
            <div className="input-group">
              <label>Actual Value</label>
              <input type="text" value={actual2} onChange={e => setActual2(e.target.value)} placeholder="e.g. 10" />
            </div>
          </div>
        </div>

        {gain !== null && offset !== null ? (
          <div>
            <div className="result-item">
              <span className="result-label">Gain</span>
              <span className="result-value">{formatNumber(gain)}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Offset</span>
              <span className="result-value">{formatNumber(offset)}</span>
            </div>
          </div>
        ) : sameMeasured ? (
          <p style={{ color: '#fbbf24', fontSize: '0.85rem' }}>
            The two measured values must be different to compute a gain.
          </p>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Enter all four values to compute the gain and offset.
          </p>
        )}
      </div>
    </div>
  );
}
