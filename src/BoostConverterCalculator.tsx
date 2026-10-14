import { useState, useEffect } from 'react';
import { parseEngineeringUnit, formatEngineeringUnit } from './utils/engineeringParser';

export default function BoostConverterCalculator() {
  const [mode, setMode] = useState<'CCM' | 'DCM'>('CCM');

  // Operating Conditions
  const [vin, setVin] = useState<string>('5');
  const [vout, setVout] = useState<string>('12');
  const [iout, setIout] = useState<string>('1');
  const [fsw, setFsw] = useState<string>('1M');
  const [vfb, setVfb] = useState<string>('1.25');
  const [vd, setVd] = useState<string>('0.5');
  const [eta, setEta] = useState<string>('90');

  // Inductor
  const [l, setL] = useState<string>('4.7u');
  const [deltaIl, setDeltaIl] = useState<string>('');
  
  // Capacitors
  const [cout, setCout] = useState<string>('10u');
  const [deltaVout, setDeltaVout] = useState<string>('');
  const [cin, setCin] = useState<string>('10u');
  const [deltaVin, setDeltaVin] = useState<string>('');

  // Feedback
  const [rtop, setRtop] = useState<string>('');
  const [rbot, setRbot] = useState<string>('10k');

  // Derived display values
  const [dutyCycle, setDutyCycle] = useState<number>(0);
  const [iin, setIin] = useState<number>(0);
  const [ilPeak, setIlPeak] = useState<number>(0);
  const [ilRms, setIlRms] = useState<number>(0);
  const [idAvg, setIdAvg] = useState<number>(0);
  const [idPeak, setIdPeak] = useState<number>(0);
  const [idRms, setIdRms] = useState<number>(0);

  // Parse common values
  const getCommonValues = () => {
    return {
      vInParsed: parseEngineeringUnit(vin) || 0,
      vOutParsed: parseEngineeringUnit(vout) || 0,
      iOutParsed: parseEngineeringUnit(iout) || 0,
      fSwParsed: parseEngineeringUnit(fsw) || 0,
      vFbParsed: parseEngineeringUnit(vfb) || 0,
      vDParsed: parseEngineeringUnit(vd) || 0,
      etaParsed: (parseEngineeringUnit(eta) || 90) / 100,
    };
  };

  useEffect(() => {
    const { vInParsed, vOutParsed, iOutParsed, fSwParsed, vDParsed, etaParsed } = getCommonValues();
    const lParsed = parseEngineeringUnit(l) || 0;
    
    if (vInParsed > 0 && vOutParsed > 0 && vOutParsed > vInParsed) {
      const iinVal = (vOutParsed * iOutParsed) / (vInParsed * etaParsed);
      setIin(iinVal);

      if (mode === 'CCM') {
        const d = 1 - (vInParsed / (vOutParsed + vDParsed));
        setDutyCycle(d);
      } else {
        if (lParsed > 0 && iOutParsed > 0 && fSwParsed > 0) {
          const d = Math.sqrt((2 * iOutParsed * lParsed * fSwParsed * (vOutParsed + vDParsed - vInParsed)) / (vInParsed * vInParsed));
          setDutyCycle(d);
        } else {
          setDutyCycle(0);
        }
      }
    } else {
      setDutyCycle(0);
      setIin(0);
    }
  }, [vin, vout, iout, vd, eta, mode, l, fsw]);

  // Derived values effect
  useEffect(() => {
    const dIl = parseEngineeringUnit(deltaIl) || 0;
    const { iOutParsed, vInParsed, vOutParsed, vDParsed } = getCommonValues();
    
    if (iin > 0) {
      if (mode === 'CCM') {
        const peak = iin + dIl / 2;
        setIlPeak(peak);
        setIlRms(Math.sqrt(iin * iin + (dIl * dIl) / 12));
        
        setIdAvg(iOutParsed);
        setIdPeak(peak);
        setIdRms(iin * Math.sqrt(1 - dutyCycle));
      } else {
        const peak = dIl;
        setIlPeak(peak);
        
        const d1 = dutyCycle > 0 ? dutyCycle * vInParsed / (vOutParsed + vDParsed - vInParsed) : 0;
        setIlRms(peak * Math.sqrt((dutyCycle + d1) / 3));
        
        setIdAvg(iOutParsed);
        setIdPeak(peak);
        setIdRms(peak * Math.sqrt(d1 / 3));
      }
    } else {
      setIlPeak(0);
      setIlRms(0);
      setIdAvg(0);
      setIdPeak(0);
      setIdRms(0);
    }
  }, [iin, deltaIl, dutyCycle, mode, vin, vout, vd]);


  // Calculation functions
  const calculateDeltaIl = () => {
    const { vInParsed, fSwParsed } = getCommonValues();
    const lParsed = parseEngineeringUnit(l);
    if (vInParsed && fSwParsed && lParsed && dutyCycle > 0) {
      setDeltaIl(formatEngineeringUnit((vInParsed * dutyCycle) / (fSwParsed * lParsed)));
    }
  };

  const calculateL = () => {
    const { vInParsed, fSwParsed, vOutParsed, vDParsed, iOutParsed } = getCommonValues();
    const dIl = parseEngineeringUnit(deltaIl);
    if (vInParsed && fSwParsed && dIl) {
      if (mode === 'CCM') {
        const d = 1 - (vInParsed / (vOutParsed + vDParsed));
        setL(formatEngineeringUnit((vInParsed * d) / (fSwParsed * dIl)));
      } else {
        setL(formatEngineeringUnit((2 * iOutParsed * (vOutParsed + vDParsed - vInParsed)) / (fSwParsed * dIl * dIl)));
      }
    }
  };

  const calculateDeltaVout = () => {
    const { iOutParsed, fSwParsed, vInParsed, vOutParsed, vDParsed } = getCommonValues();
    const cOutParsed = parseEngineeringUnit(cout);
    if (iOutParsed && fSwParsed && cOutParsed && dutyCycle > 0) {
      if (mode === 'CCM') {
        setDeltaVout(formatEngineeringUnit((iOutParsed * dutyCycle) / (fSwParsed * cOutParsed)));
      } else {
        const d1 = dutyCycle * vInParsed / (vOutParsed + vDParsed - vInParsed);
        setDeltaVout(formatEngineeringUnit((iOutParsed * (1 - d1)) / (fSwParsed * cOutParsed)));
      }
    }
  };

  const calculateCout = () => {
    const { iOutParsed, fSwParsed, vInParsed, vOutParsed, vDParsed } = getCommonValues();
    const dVout = parseEngineeringUnit(deltaVout);
    if (iOutParsed && fSwParsed && dVout && dutyCycle > 0) {
      if (mode === 'CCM') {
        setCout(formatEngineeringUnit((iOutParsed * dutyCycle) / (fSwParsed * dVout)));
      } else {
        const d1 = dutyCycle * vInParsed / (vOutParsed + vDParsed - vInParsed);
        setCout(formatEngineeringUnit((iOutParsed * (1 - d1)) / (fSwParsed * dVout)));
      }
    }
  };

  const calculateDeltaVin = () => {
    const { fSwParsed } = getCommonValues();
    const cInParsed = parseEngineeringUnit(cin);
    const dIl = parseEngineeringUnit(deltaIl);
    if (fSwParsed && cInParsed && dIl) {
      setDeltaVin(formatEngineeringUnit(dIl / (8 * fSwParsed * cInParsed)));
    }
  };

  const calculateCin = () => {
    const { fSwParsed } = getCommonValues();
    const dVin = parseEngineeringUnit(deltaVin);
    const dIl = parseEngineeringUnit(deltaIl);
    if (fSwParsed && dVin && dIl) {
      setCin(formatEngineeringUnit(dIl / (8 * fSwParsed * dVin)));
    }
  };

  const calculateRtop = () => {
    const { vOutParsed, vFbParsed } = getCommonValues();
    const rBotParsed = parseEngineeringUnit(rbot);
    if (vOutParsed && vFbParsed && rBotParsed && vOutParsed > vFbParsed) {
      setRtop(formatEngineeringUnit(rBotParsed * (vOutParsed / vFbParsed - 1), 1));
    }
  };

  const calculateRbot = () => {
    const { vOutParsed, vFbParsed } = getCommonValues();
    const rTopParsed = parseEngineeringUnit(rtop);
    if (vOutParsed && vFbParsed && rTopParsed && vOutParsed > vFbParsed) {
      setRbot(formatEngineeringUnit(rTopParsed / (vOutParsed / vFbParsed - 1), 1));
    }
  };

  return (
    <div className="glass-panel" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      <h2 className="mb-6">Boost Converter Calculator</h2>
      <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem'}}>
        Canonical boost converter component calculator. Ensure Vout &gt; Vin. 
        Calculates optimal inductance, capacitance and feedback resistors.
      </p>

      <div className="flex gap-6 mb-6" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <label className="flex gap-2 items-center" style={{ cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.9rem' }}>
          <input 
            type="radio" 
            name="mode" 
            value="CCM" 
            checked={mode === 'CCM'} 
            onChange={() => setMode('CCM')} 
            style={{ accentColor: 'var(--primary-color)' }}
          />
          Continuous Conduction (CCM)
        </label>
        <label className="flex gap-2 items-center" style={{ cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.9rem' }}>
          <input 
            type="radio" 
            name="mode" 
            value="DCM" 
            checked={mode === 'DCM'} 
            onChange={() => setMode('DCM')} 
            style={{ accentColor: 'var(--primary-color)' }}
          />
          Discontinuous Conduction (DCM)
        </label>
      </div>

      <div className="calc-grid">
        {/* Operating Conditions Column */}
        <div>
          <h3 className="mb-6" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Operating Conditions</h3>
          <div className="input-group mb-4">
            <label>Input Voltage (Vin, V)</label>
            <input type="text" value={vin} onChange={e => setVin(e.target.value)} />
          </div>
          <div className="input-group mb-4">
            <label>Output Voltage (Vout, V)</label>
            <input type="text" value={vout} onChange={e => setVout(e.target.value)} />
          </div>
          <div className="input-group mb-4">
            <label>Output Current (Iout, A)</label>
            <input type="text" value={iout} onChange={e => setIout(e.target.value)} />
          </div>
          <div className="input-group mb-4">
            <label>Switching Frequency (fsw, Hz)</label>
            <input type="text" value={fsw} onChange={e => setFsw(e.target.value)} />
          </div>
          <div className="input-group mb-4">
            <label>Feedback Ref Voltage (Vfb, V)</label>
            <input type="text" value={vfb} onChange={e => setVfb(e.target.value)} />
          </div>
          <div className="input-group mb-4">
            <label>Diode Forward Drop (Vd, V)</label>
            <input type="text" value={vd} onChange={e => setVd(e.target.value)} />
          </div>
          <div className="input-group mb-6">
            <label>Estimated Efficiency (η, %)</label>
            <input type="text" value={eta} onChange={e => setEta(e.target.value)} />
          </div>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h4 style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem'}}>Base Parameters</h4>
            <div className="flex" style={{justifyContent: 'space-between', marginBottom: '0.25rem'}}>
              <span>Duty Cycle (D):</span>
              <span style={{fontWeight: 600, color: 'var(--primary-color)'}}>
                {dutyCycle > 0 ? `${(dutyCycle * 100).toFixed(1)}%` : 'N/A'}
              </span>
            </div>
            <div className="flex" style={{justifyContent: 'space-between'}}>
              <span>Input Current (Iin):</span>
              <span style={{fontWeight: 600, color: 'var(--primary-color)'}}>{formatEngineeringUnit(iin)}A</span>
            </div>
          </div>
        </div>

        {/* Component Calculations Column */}
        <div>
          {/* Inductor Section */}
          <h3 className="mb-4" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Inductor (L)</h3>
          <div className="input-with-button mb-4">
            <div className="input-group">
              <label>Inductance (L, H)</label>
              <input type="text" value={l} onChange={e => setL(e.target.value)} placeholder="e.g. 4.7u" />
            </div>
            <button className="calc-btn secondary" onClick={calculateL} title="Calculate L">Solve</button>
          </div>
          <div className="input-with-button mb-4">
            <div className="input-group">
              <label>Ripple Current (ΔIL, A)</label>
              <input type="text" value={deltaIl} onChange={e => setDeltaIl(e.target.value)} placeholder="e.g. 0.4" />
            </div>
            <button className="calc-btn secondary" onClick={calculateDeltaIl} title="Calculate Ripple">Solve</button>
          </div>
          
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
            <div className="flex" style={{justifyContent: 'space-between', marginBottom: '0.25rem'}}>
              <span>Inductor Peak Current:</span>
              <span style={{fontWeight: 600, color: 'var(--primary-color)'}}>{formatEngineeringUnit(ilPeak)}A</span>
            </div>
            <div className="flex" style={{justifyContent: 'space-between'}}>
              <span>Inductor RMS Current:</span>
              <span style={{fontWeight: 600, color: 'var(--primary-color)'}}>{formatEngineeringUnit(ilRms)}A</span>
            </div>
          </div>

          {/* Capacitors Section */}
          <h3 className="mb-4" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Capacitors</h3>
          <div className="input-with-button mb-4">
            <div className="input-group">
              <label>Output Capacitance (Cout, F)</label>
              <input type="text" value={cout} onChange={e => setCout(e.target.value)} placeholder="e.g. 10u" />
            </div>
            <button className="calc-btn secondary" onClick={calculateCout} title="Calculate Cout">Solve</button>
          </div>
          <div className="input-with-button mb-4">
            <div className="input-group">
              <label>Output Ripple Voltage (ΔVout, V)</label>
              <input type="text" value={deltaVout} onChange={e => setDeltaVout(e.target.value)} placeholder="e.g. 0.05" />
            </div>
            <button className="calc-btn secondary" onClick={calculateDeltaVout} title="Calculate ΔVout">Solve</button>
          </div>

          <div className="input-with-button mb-4">
            <div className="input-group">
              <label>Input Capacitance (Cin, F)</label>
              <input type="text" value={cin} onChange={e => setCin(e.target.value)} placeholder="e.g. 10u" />
            </div>
            <button className="calc-btn secondary" onClick={calculateCin} title="Calculate Cin">Solve</button>
          </div>
          <div className="input-with-button mb-6">
            <div className="input-group">
              <label>Input Ripple Voltage (ΔVin, V)</label>
              <input type="text" value={deltaVin} onChange={e => setDeltaVin(e.target.value)} placeholder="e.g. 0.02" />
            </div>
            <button className="calc-btn secondary" onClick={calculateDeltaVin} title="Calculate ΔVin">Solve</button>
          </div>

        </div>

        {/* Feedback & Diode Column */}
        <div>
          {/* Feedback Resistors Section */}
          <h3 className="mb-4" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Feedback Resistors</h3>
          <div className="input-with-button mb-4">
            <div className="input-group">
              <label>Top Resistor (Rtop, ohms)</label>
              <input type="text" value={rtop} onChange={e => setRtop(e.target.value)} placeholder="e.g. 86k" />
            </div>
            <button className="calc-btn secondary" onClick={calculateRtop} title="Calculate Rtop">Solve</button>
          </div>
          <div className="input-with-button mb-6">
            <div className="input-group">
              <label>Bottom Resistor (Rbot, ohms)</label>
              <input type="text" value={rbot} onChange={e => setRbot(e.target.value)} placeholder="e.g. 10k" />
            </div>
            <button className="calc-btn secondary" onClick={calculateRbot} title="Calculate Rbot">Solve</button>
          </div>

          {/* Diode Section */}
          <h3 className="mb-4" style={{fontSize: '1rem', color: 'var(--text-main)'}}>Diode Ratings</h3>
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div className="flex" style={{justifyContent: 'space-between', marginBottom: '0.25rem'}}>
              <span>Average Current:</span>
              <span style={{fontWeight: 600, color: 'var(--primary-color)'}}>{formatEngineeringUnit(idAvg)}A</span>
            </div>
            <div className="flex" style={{justifyContent: 'space-between', marginBottom: '0.25rem'}}>
              <span>Peak Current:</span>
              <span style={{fontWeight: 600, color: 'var(--primary-color)'}}>{formatEngineeringUnit(idPeak)}A</span>
            </div>
            <div className="flex" style={{justifyContent: 'space-between'}}>
              <span>RMS Current:</span>
              <span style={{fontWeight: 600, color: 'var(--primary-color)'}}>{formatEngineeringUnit(idRms)}A</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
