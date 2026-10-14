import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react';
import { parseEngineeringUnit, formatEngineeringUnit } from './utils/engineeringParser';
import { loadToolConfig, saveToolConfig, exportJsonFile } from './utils/appConfig';

type ThermType = 'NTC' | 'PTC';
type TempUnit = 'C' | 'F';

function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

// Rounds to 1 decimal and drops a trailing ".0" so unit-toggle conversions
// don't turn a clean "-40" into "-40.00000000000003".
function roundTempStr(v: number): string {
  return String(Math.round(v * 10) / 10);
}

interface RTPoint {
  r: number;
  tC: number;
}

interface Curve {
  key: string;
  label: string;
  color: string;
  fn: (tC: number) => number;
}

const KELVIN_OFFSET = 273.15;
const CONFIG_KEY = 'thermistorCalc';

interface PersistedThermistorState {
  partNumber: string;
  thermType: ThermType;
  bStr: string;
  t1Str: string;
  t2Str: string;
  r0Str: string;
  t0Str: string;
  betaTestR: string;
  columnOrder: 'RT' | 'TR';
  csvText: string | null;
  csvFileName: string | null;
  shTestR: string;
  plotStart: string;
  plotStop: string;
  tempUnit: TempUnit;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const M = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) pivotRow = row;
    }
    if (Math.abs(M[pivotRow][col]) < 1e-14) return null;
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col] / M[col][col];
      for (let c = col; c <= n; c++) {
        M[row][c] -= factor * M[col][c];
      }
    }
  }

  return M.map((row, i) => row[n] / row[i]);
}

function fitSteinhartHart(points: RTPoint[]): { a: number; b: number; c: number } | null {
  const valid = points.filter(p => p.r > 0);
  if (valid.length < 3) return null;

  // Least-squares fit of 1/T = a + b*ln(R) + c*ln(R)^3
  const rows = valid.map(p => {
    const l = Math.log(p.r);
    return { x0: 1, x1: l, x2: l * l * l, y: 1 / (p.tC + KELVIN_OFFSET) };
  });

  const ATA = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const ATy = [0, 0, 0];

  for (const row of rows) {
    const x = [row.x0, row.x1, row.x2];
    for (let i = 0; i < 3; i++) {
      ATy[i] += x[i] * row.y;
      for (let j = 0; j < 3; j++) {
        ATA[i][j] += x[i] * x[j];
      }
    }
  }

  const sol = solveLinearSystem(ATA, ATy);
  if (!sol) return null;
  return { a: sol[0], b: sol[1], c: sol[2] };
}

function betaSign(type: ThermType): number {
  return type === 'NTC' ? 1 : -1;
}

function betaTempC(r: number, b: number, r0: number, t0C: number, type: ThermType): number {
  const t0K = t0C + KELVIN_OFFSET;
  const invT = 1 / t0K + betaSign(type) * (1 / b) * Math.log(r / r0);
  return 1 / invT - KELVIN_OFFSET;
}

function betaResistance(tC: number, b: number, r0: number, t0C: number, type: ThermType): number {
  const t0K = t0C + KELVIN_OFFSET;
  const tK = tC + KELVIN_OFFSET;
  return r0 * Math.exp(betaSign(type) * b * (1 / tK - 1 / t0K));
}

function shTempC(r: number, a: number, b: number, c: number): number {
  const l = Math.log(r);
  const invT = a + b * l + c * l * l * l;
  return 1 / invT - KELVIN_OFFSET;
}

// Inverting 1/T = a + b*ln(R) + c*ln(R)^3 for R is a cubic in ln(R). With a
// real fitted c, that cubic commonly has three real roots (its discriminant
// is negative), so the textbook single-root Cardano shortcut doesn't apply.
// Since R(T) is monotonic over the calibrated range, solve numerically by
// bracketing + bisection instead of picking among complex cube roots.
function shResistance(tC: number, a: number, b: number, c: number, lnRLo: number, lnRHi: number): number {
  const tK = tC + KELVIN_OFFSET;
  const target = 1 / tK;
  const g = (l: number) => a + b * l + c * l * l * l;

  const steps = 60;
  let prevL = lnRLo;
  let prevVal = g(prevL) - target;
  for (let i = 1; i <= steps; i++) {
    const l = lnRLo + ((lnRHi - lnRLo) * i) / steps;
    const val = g(l) - target;
    if (prevVal === 0) return Math.exp(prevL);
    if ((prevVal < 0 && val > 0) || (prevVal > 0 && val < 0)) {
      let lo = prevL;
      let hi = l;
      let vLo = prevVal;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        const vMid = g(mid) - target;
        if (vMid === 0) return Math.exp(mid);
        if ((vLo < 0 && vMid < 0) || (vLo > 0 && vMid > 0)) {
          lo = mid;
          vLo = vMid;
        } else {
          hi = mid;
        }
      }
      return Math.exp((lo + hi) / 2);
    }
    prevL = l;
    prevVal = val;
  }
  return NaN;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

type ColumnOrder = 'RT' | 'TR';

function splitCsvLine(line: string): string[] {
  return line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
}

function parseCsvText(text: string, order: ColumnOrder): RTPoint[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const rows = lines.map(splitCsvLine);

  let startIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length >= 2) {
      const a = parseFloat(row[0]);
      const b = parseFloat(row[1]);
      if (row[0] !== '' && row[1] !== '' && !isNaN(a) && !isNaN(b)) {
        startIdx = i;
        break;
      }
    }
  }
  if (startIdx === -1) return [];

  const points: RTPoint[] = [];
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;
    const a = parseFloat(row[0]);
    const b = parseFloat(row[1]);
    if (isNaN(a) || isNaN(b)) continue;
    const r = order === 'RT' ? a : b;
    const tC = order === 'RT' ? b : a;
    if (r > 0) points.push({ r, tC });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable; ignore
    }
  }, [text]);

  return (
    <button className="secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Plot
// ---------------------------------------------------------------------------

// Literal colors rather than CSS var() references: the exported PNG is
// rasterized from the SVG in isolation (via a standalone Image/data URL),
// which has no access to the page's :root custom properties.
const PLOT_TEXT_MAIN = '#f3f3f3';
const PLOT_TEXT_MUTED = '#a0a0a0';
const PLOT_BORDER = 'rgba(255,255,255,0.16)';
const PLOT_BG = '#242424';

function ThermistorPlot({
  startC,
  stopC,
  curves,
  title,
  tempUnit,
}: {
  startC: number;
  stopC: number;
  curves: Curve[];
  title: string;
  tempUnit: TempUnit;
}) {
  const formatTemp = (tC: number) => (tempUnit === 'F' ? cToF(tC) : tC);
  const width = 700;
  const height = 420;
  const padL = 86;
  const padR = 20;
  const padT = title ? 40 : 20;
  const padB = 90;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const N = 200;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');

  const rangeValid = isFinite(startC) && isFinite(stopC) && startC !== stopC;
  const lo = rangeValid ? Math.min(startC, stopC) : 0;
  const hi = rangeValid ? Math.max(startC, stopC) : 1;

  const { xs, series, yMin, yMax } = useMemo(() => {
    if (!rangeValid || curves.length === 0) {
      return { xs: [] as number[], series: [] as { curve: Curve; values: number[] }[], yMin: 0, yMax: 1 };
    }
    const xs: number[] = [];
    for (let i = 0; i <= N; i++) xs.push(lo + ((hi - lo) * i) / N);

    const series = curves.map(c => ({
      curve: c,
      values: xs.map(t => {
        const v = c.fn(t);
        return isFinite(v) && v > 0 ? v : NaN;
      }),
    }));

    let yMinCalc = Infinity;
    let yMaxCalc = -Infinity;
    series.forEach(s =>
      s.values.forEach(v => {
        if (isFinite(v)) {
          if (v < yMinCalc) yMinCalc = v;
          if (v > yMaxCalc) yMaxCalc = v;
        }
      })
    );
    if (!isFinite(yMinCalc) || !isFinite(yMaxCalc)) {
      yMinCalc = 0;
      yMaxCalc = 1;
    }
    if (yMinCalc === yMaxCalc) {
      yMinCalc -= 1;
      yMaxCalc += 1;
    }
    const pad = (yMaxCalc - yMinCalc) * 0.08;
    yMinCalc -= pad;
    yMaxCalc += pad;
    if (yMinCalc < 0) yMinCalc = 0;

    return { xs, series, yMin: yMinCalc, yMax: yMaxCalc };
  }, [rangeValid, lo, hi, curves]);

  const xToPx = (t: number) => padL + ((t - lo) / (hi - lo || 1)) * plotW;
  const yToPx = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const buildPath = (values: number[]) => {
    let d = '';
    let started = false;
    values.forEach((v, i) => {
      if (!isFinite(v)) {
        started = false;
        return;
      }
      const cmd = started ? 'L' : 'M';
      d += `${cmd}${xToPx(xs[i]).toFixed(2)},${yToPx(v).toFixed(2)} `;
      started = true;
    });
    return d.trim();
  };

  const handleMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || xs.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) * width) / rect.width;
    const frac = (px - padL) / plotW;
    const idx = Math.round(frac * N);
    setHoverIdx(idx >= 0 && idx <= N ? idx : null);
  };

  const numYTicks = 5;
  const yTicks = Array.from({ length: numYTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / numYTicks);
  const numXTicks = 6;
  const xTicks = Array.from({ length: numXTicks + 1 }, (_, i) => lo + ((hi - lo) * i) / numXTicks);

  const handleCopyImage = useCallback(async () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    setCopyStatus('copying');
    let objectUrl: string | null = null;
    try {
      const svgString = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      objectUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to rasterize plot'));
        img.src = objectUrl as string;
      });

      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.fillStyle = PLOT_BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to encode PNG');

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setTimeout(() => setCopyStatus('idle'), 1500);
    }
  }, [width, height]);

  const legendY = height - 24;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <button
          className="secondary"
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
          onClick={handleCopyImage}
          disabled={curves.length === 0 || copyStatus === 'copying'}
        >
          {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Copy failed' : copyStatus === 'copying' ? 'Copying…' : 'Copy Plot as Image'}
        </button>
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', background: PLOT_BG, borderRadius: 8 }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {title && (
          <text x={width / 2} y={22} textAnchor="middle" fontSize="15" fontWeight={600} fill={PLOT_TEXT_MAIN}>
            {title}
          </text>
        )}

        {yTicks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={padL} y1={yToPx(t)} x2={padL + plotW} y2={yToPx(t)} stroke="rgba(255,255,255,0.07)" />
            <text x={padL - 10} y={yToPx(t) + 4} textAnchor="end" fontSize="10" fill={PLOT_TEXT_MUTED}>
              {formatEngineeringUnit(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <g key={`x${i}`}>
            <text x={xToPx(t)} y={padT + plotH + 20} textAnchor="middle" fontSize="10" fill={PLOT_TEXT_MUTED}>
              {formatTemp(t).toFixed(0)}
            </text>
          </g>
        ))}
        <text x={14} y={padT + plotH / 2} textAnchor="middle" fontSize="11" fill={PLOT_TEXT_MUTED} transform={`rotate(-90 14 ${padT + plotH / 2})`}>
          Resistance (Ω)
        </text>
        <text x={padL + plotW / 2} y={padT + plotH + 38} textAnchor="middle" fontSize="11" fill={PLOT_TEXT_MUTED}>
          Temperature (°{tempUnit})
        </text>

        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={PLOT_BORDER} />
        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={PLOT_BORDER} />

        {series.map(s => (
          <path key={s.curve.key} d={buildPath(s.values)} stroke={s.curve.color} strokeWidth={2} fill="none" />
        ))}

        {hoverIdx !== null && xs.length > 0 && (
          <>
            <line
              x1={xToPx(xs[hoverIdx])}
              x2={xToPx(xs[hoverIdx])}
              y1={padT}
              y2={padT + plotH}
              stroke="rgba(255,255,255,0.35)"
              strokeDasharray="4 4"
            />
            {series.map(s =>
              isFinite(s.values[hoverIdx]) ? (
                <circle
                  key={s.curve.key}
                  cx={xToPx(xs[hoverIdx])}
                  cy={yToPx(s.values[hoverIdx])}
                  r={4}
                  fill={s.curve.color}
                  stroke={PLOT_BG}
                  strokeWidth={1.5}
                />
              ) : null
            )}
          </>
        )}

        {curves.map((c, i) => (
          <g key={c.key}>
            <rect x={padL + i * 200} y={legendY - 10} width={12} height={12} rx={3} fill={c.color} />
            <text x={padL + i * 200 + 18} y={legendY} fontSize="11" fill={PLOT_TEXT_MUTED}>
              {c.label}
            </text>
          </g>
        ))}
      </svg>

      {hoverIdx !== null && xs.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: `${(xToPx(xs[hoverIdx]) / width) * 100}%`,
            top: 8,
            transform: 'translateX(-50%)',
            background: 'rgba(15,23,42,0.95)',
            border: '1px solid var(--panel-border)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
            fontSize: '0.8rem',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <div style={{ color: 'var(--text-main)', marginBottom: '0.25rem' }}>T = {formatTemp(xs[hoverIdx]).toFixed(2)} °{tempUnit}</div>
          {series.map(s => (
            <div key={s.curve.key} style={{ color: s.curve.color }}>
              {s.curve.label}: {isFinite(s.values[hoverIdx]) ? `${formatEngineeringUnit(s.values[hoverIdx])}Ω` : '—'}
            </div>
          ))}
          {(() => {
            const betaSeries = series.find(s => s.curve.key === 'beta');
            const shSeries = series.find(s => s.curve.key === 'sh');
            if (!betaSeries || !shSeries) return null;
            const bv = betaSeries.values[hoverIdx];
            const sv = shSeries.values[hoverIdx];
            if (!isFinite(bv) || !isFinite(sv)) return null;
            const delta = bv - sv;
            const pct = (delta / sv) * 100;
            return (
              <div
                style={{
                  color: 'var(--text-muted)',
                  marginTop: '0.35rem',
                  paddingTop: '0.35rem',
                  borderTop: '1px solid var(--panel-border)',
                }}
              >
                ΔR = {delta >= 0 ? '+' : ''}
                {formatEngineeringUnit(delta)}Ω ({pct >= 0 ? '+' : ''}
                {pct.toFixed(2)}%)
              </div>
            );
          })()}
        </div>
      )}

      {curves.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', fontSize: '0.9rem' }}>
          Enter valid Beta or Steinhart-Hart parameters to see a plot.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ThermistorCalculator() {
  const [saved] = useState(() => loadToolConfig<PersistedThermistorState>(CONFIG_KEY));

  const [partNumber, setPartNumber] = useState(saved?.partNumber ?? '');
  const [thermType, setThermType] = useState<ThermType>(saved?.thermType ?? 'NTC');

  // --- Beta section state ---
  const [bStr, setBStr] = useState(saved?.bStr ?? '3950');
  const [t1Str, setT1Str] = useState(saved?.t1Str ?? '25');
  const [t2Str, setT2Str] = useState(saved?.t2Str ?? '85');
  const [r0Str, setR0Str] = useState(saved?.r0Str ?? '10k');
  const [t0Str, setT0Str] = useState(saved?.t0Str ?? '25');
  const [betaTestR, setBetaTestR] = useState(saved?.betaTestR ?? '');

  const bNum = parseEngineeringUnit(bStr);
  const r0Num = parseEngineeringUnit(r0Str);
  const t0Num = parseFloat(t0Str);
  const t1Num = parseFloat(t1Str);
  const t2Num = parseFloat(t2Str);

  const betaValid = isFinite(bNum) && bNum > 0 && isFinite(r0Num) && r0Num > 0 && isFinite(t0Num);

  const betaTestT = useMemo(() => {
    if (!betaValid) return null;
    const r = parseEngineeringUnit(betaTestR);
    if (!isFinite(r) || r <= 0) return null;
    return betaTempC(r, bNum, r0Num, t0Num, thermType);
  }, [betaValid, betaTestR, bNum, r0Num, t0Num, thermType]);

  const betaSignChar = thermType === 'NTC' ? '+' : '-';
  const betaFormula = `T = 1 / ( 1/(T0+273.15) ${betaSignChar} (1/B)*ln(R/R0) ) - 273.15`;

  // --- Steinhart-Hart section state ---
  const [columnOrder, setColumnOrder] = useState<ColumnOrder>(saved?.columnOrder ?? 'RT');
  const [csvText, setCsvText] = useState<string | null>(saved?.csvText ?? null);
  const [csvFileName, setCsvFileName] = useState<string | null>(saved?.csvFileName ?? null);
  const [shTestR, setShTestR] = useState(saved?.shTestR ?? '');

  const csvPoints = useMemo(() => (csvText !== null ? parseCsvText(csvText, columnOrder) : []), [csvText, columnOrder]);

  const csvError = useMemo(() => {
    if (csvText === null) return null;
    if (csvPoints.length === 0) return 'No numeric R/T data rows found in this file.';
    if (csvPoints.length < 3) return `Only ${csvPoints.length} valid data row(s) found; at least 3 are needed to fit A, B, C.`;
    return null;
  }, [csvText, csvPoints]);

  const shCoeffs = useMemo(() => fitSteinhartHart(csvPoints), [csvPoints]);

  const handleCsvFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const shTestT = useMemo(() => {
    if (!shCoeffs) return null;
    const r = parseEngineeringUnit(shTestR);
    if (!isFinite(r) || r <= 0) return null;
    return shTempC(r, shCoeffs.a, shCoeffs.b, shCoeffs.c);
  }, [shCoeffs, shTestR]);

  const shFormula = 'T = 1 / ( A + B*ln(R) + C*ln(R)^3 ) - 273.15';

  // --- Plot section state ---
  const [plotStart, setPlotStart] = useState(saved?.plotStart ?? '-40');
  const [plotStop, setPlotStop] = useState(saved?.plotStop ?? '125');
  const [tempUnit, setTempUnitRaw] = useState<TempUnit>(saved?.tempUnit ?? 'C');

  // plotStart/plotStop are stored as text in whatever unit is currently
  // selected. Switching units converts the displayed numbers once, rather
  // than re-interpreting them live on every keystroke.
  const handleSetTempUnit = (unit: TempUnit) => {
    if (unit === tempUnit) return;
    const s = parseFloat(plotStart);
    const e = parseFloat(plotStop);
    const convert = unit === 'F' ? cToF : fToC;
    if (isFinite(s)) setPlotStart(roundTempStr(convert(s)));
    if (isFinite(e)) setPlotStop(roundTempStr(convert(e)));
    setTempUnitRaw(unit);
  };

  const plotStartNum = parseFloat(plotStart);
  const plotStopNum = parseFloat(plotStop);
  const plotStartC = tempUnit === 'F' ? fToC(plotStartNum) : plotStartNum;
  const plotStopC = tempUnit === 'F' ? fToC(plotStopNum) : plotStopNum;

  useEffect(() => {
    saveToolConfig<PersistedThermistorState>(CONFIG_KEY, {
      partNumber,
      thermType,
      bStr,
      t1Str,
      t2Str,
      r0Str,
      t0Str,
      betaTestR,
      columnOrder,
      csvText,
      csvFileName,
      shTestR,
      plotStart,
      plotStop,
      tempUnit,
    });
  }, [partNumber, thermType, bStr, t1Str, t2Str, r0Str, t0Str, betaTestR, columnOrder, csvText, csvFileName, shTestR, plotStart, plotStop, tempUnit]);

  const [importError, setImportError] = useState<string | null>(null);

  const handleExportConfig = async () => {
    const currentState: PersistedThermistorState = {
      partNumber,
      thermType,
      bStr,
      t1Str,
      t2Str,
      r0Str,
      t0Str,
      betaTestR,
      columnOrder,
      csvText,
      csvFileName,
      shTestR,
      plotStart,
      plotStop,
      tempUnit,
    };
    const safeName = (partNumber.trim() || 'thermistor').replace(/[\\/:*?"<>|]+/g, '_');
    await exportJsonFile(currentState, `${safeName}-thermistor-config.json`);
  };

  const handleImportConfig = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '')) as Partial<PersistedThermistorState>;
        if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid config file');
        if (parsed.partNumber !== undefined) setPartNumber(parsed.partNumber);
        if (parsed.thermType !== undefined) setThermType(parsed.thermType);
        if (parsed.bStr !== undefined) setBStr(parsed.bStr);
        if (parsed.t1Str !== undefined) setT1Str(parsed.t1Str);
        if (parsed.t2Str !== undefined) setT2Str(parsed.t2Str);
        if (parsed.r0Str !== undefined) setR0Str(parsed.r0Str);
        if (parsed.t0Str !== undefined) setT0Str(parsed.t0Str);
        if (parsed.betaTestR !== undefined) setBetaTestR(parsed.betaTestR);
        if (parsed.columnOrder !== undefined) setColumnOrder(parsed.columnOrder);
        if (parsed.csvText !== undefined) setCsvText(parsed.csvText);
        if (parsed.csvFileName !== undefined) setCsvFileName(parsed.csvFileName);
        if (parsed.shTestR !== undefined) setShTestR(parsed.shTestR);
        if (parsed.plotStart !== undefined) setPlotStart(parsed.plotStart);
        if (parsed.plotStop !== undefined) setPlotStop(parsed.plotStop);
        if (parsed.tempUnit !== undefined) setTempUnitRaw(parsed.tempUnit);
        setImportError(null);
      } catch {
        setImportError('Could not read that file — not a valid config JSON.');
      }
    };
    reader.onerror = () => setImportError('Failed to read file.');
    reader.readAsText(file);
    e.target.value = '';
  };

  const curves: Curve[] = useMemo(() => {
    const list: Curve[] = [];
    if (betaValid) {
      list.push({
        key: 'beta',
        label: `Beta (${thermType})`,
        color: '#8b5cf6',
        fn: (t: number) => betaResistance(t, bNum, r0Num, t0Num, thermType),
      });
    }
    if (shCoeffs && csvPoints.length > 0) {
      const rValues = csvPoints.map(p => p.r);
      // Extend a bit beyond the calibrated resistance range (~50x each way)
      // so the curve isn't cut off right at the data points, while still
      // avoiding the far-out region where the cubic fit becomes unreliable.
      const margin = Math.log(50);
      const lnRLo = Math.log(Math.min(...rValues)) - margin;
      const lnRHi = Math.log(Math.max(...rValues)) + margin;
      list.push({
        key: 'sh',
        label: 'Steinhart-Hart',
        color: '#34d399',
        fn: (t: number) => shResistance(t, shCoeffs.a, shCoeffs.b, shCoeffs.c, lnRLo, lnRHi),
      });
    }
    return list;
  }, [betaValid, bNum, r0Num, t0Num, thermType, shCoeffs, csvPoints]);

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 className="mb-6">Thermistor Calcs</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button className={thermType === 'NTC' ? 'active' : 'secondary'} onClick={() => setThermType('NTC')}>
            NTC
          </button>
          <button className={thermType === 'PTC' ? 'active' : 'secondary'} onClick={() => setThermType('PTC')}>
            PTC
          </button>
        </div>
      </div>

      <div className="input-group" style={{ maxWidth: 420 }}>
        <label>Part Number / Reference</label>
        <input
          type="text"
          value={partNumber}
          onChange={e => setPartNumber(e.target.value)}
          placeholder="e.g. NTCLE100E3103JB0"
        />
      </div>

      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Compute the Beta-parameter and Steinhart-Hart models for a thermistor from datasheet values or a measured R-T table, then plot both curves together.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button className="secondary" onClick={handleExportConfig}>
          Save Config to File
        </button>
        <label className="file-button">
          Import Config from File
          <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleImportConfig} />
        </label>
        {importError && <span style={{ color: '#fbbf24', fontSize: '0.85rem' }}>{importError}</span>}
      </div>

      {/* ---- Beta parameter section ---- */}
      <div className="results-panel" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        <h3 className="mb-6" style={{ fontSize: '1.05rem' }}>1. Beta (B) Parameter</h3>
        <div className="calc-grid">
          <div>
            <div className="input-group">
              <label>B Value (Kelvin)</label>
              <input type="text" value={bStr} onChange={e => setBStr(e.target.value)} placeholder="e.g. 3950" />
            </div>
            <div className="input-row">
              <div className="input-group" style={{ flex: 1 }}>
                <label>T1 (°C, reference low)</label>
                <input type="text" value={t1Str} onChange={e => setT1Str(e.target.value)} placeholder="25" />
              </div>
              <div className="input-group" style={{ flex: 1 }}>
                <label>T2 (°C, reference high)</label>
                <input type="text" value={t2Str} onChange={e => setT2Str(e.target.value)} placeholder="85" />
              </div>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '-1rem', marginBottom: '1.5rem' }}>
              T1/T2 label which datasheet B-value is used (e.g. "B{isFinite(t1Num) ? t1Num : 25}/{isFinite(t2Num) ? t2Num : 85}") — they are not otherwise used in the T(R) formula below.
            </p>
          </div>
          <div>
            <div className="input-group">
              <label>R0 (ohms, resistance at T0)</label>
              <input type="text" value={r0Str} onChange={e => setR0Str(e.target.value)} placeholder="e.g. 10k" />
            </div>
            <div className="input-group">
              <label>T0 (°C, reference temperature)</label>
              <input type="text" value={t0Str} onChange={e => setT0Str(e.target.value)} placeholder="25" />
            </div>
          </div>
        </div>

        {betaValid ? (
          <div style={{ marginTop: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)' }}>
              Temperature formula (copy/paste, {thermType})
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.5rem' }}>
              <div
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  fontSize: '0.95rem',
                  color: 'var(--primary-hover)',
                  userSelect: 'all',
                  wordBreak: 'break-all',
                }}
              >
                {betaFormula}
              </div>
              <CopyButton text={betaFormula} />
            </div>

            <div className="input-with-button" style={{ marginTop: '1rem', maxWidth: 420 }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Test: Resistance R (ohms)</label>
                <input type="text" value={betaTestR} onChange={e => setBetaTestR(e.target.value)} placeholder="e.g. 10k" />
              </div>
              <div className="calc-btn" style={{ background: 'transparent', boxShadow: 'none', cursor: 'default' }}>
                {betaTestT !== null ? (
                  <span className="result-value">{betaTestT.toFixed(2)} °C</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: '#fbbf24', fontSize: '0.85rem' }}>Enter a valid B, R0 and T0 to compute the formula.</p>
        )}
      </div>

      {/* ---- Steinhart-Hart section ---- */}
      <div className="results-panel">
        <h3 className="mb-6" style={{ fontSize: '1.05rem' }}>2. Steinhart-Hart Coefficients (from R-T Table)</h3>

        <div className="calc-grid">
          <div>
            <div className="input-group">
              <label>Load R-T Table (CSV)</label>
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
            </div>
            <div className="input-group">
              <label>CSV Column Order</label>
              <select value={columnOrder} onChange={e => setColumnOrder(e.target.value as ColumnOrder)}>
                <option value="RT">Resistance, Temperature (Ω, °C)</option>
                <option value="TR">Temperature, Resistance (°C, Ω)</option>
              </select>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Leading text/header rows are skipped automatically; data begins at the first row with two numeric columns. Temperature values are read as °C.
            </p>
          </div>
          <div>
            {csvFileName && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>File: {csvFileName}</p>}
            {csvError && <p style={{ color: '#fbbf24', fontSize: '0.85rem' }}>{csvError}</p>}
            {csvPoints.length > 0 && (
              <div style={{ maxHeight: 140, overflowY: 'auto', marginTop: '0.5rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                <div style={{ color: 'var(--text-muted)' }}>{csvPoints.length} data point(s) loaded:</div>
                {csvPoints.slice(0, 6).map((p, i) => (
                  <div key={i} style={{ color: 'var(--text-main)' }}>
                    R = {formatEngineeringUnit(p.r)}Ω, T = {p.tC}°C
                  </div>
                ))}
                {csvPoints.length > 6 && <div style={{ color: 'var(--text-muted)' }}>… and {csvPoints.length - 6} more</div>}
              </div>
            )}
          </div>
        </div>

        {shCoeffs ? (
          <div style={{ marginTop: '1rem' }}>
            <div className="calc-grid" style={{ marginBottom: '1rem' }}>
              <div className="result-item">
                <span className="result-label">A</span>
                <span className="result-value">{shCoeffs.a.toExponential(6)}</span>
              </div>
              <div className="result-item">
                <span className="result-label">B</span>
                <span className="result-value">{shCoeffs.b.toExponential(6)}</span>
              </div>
              <div className="result-item">
                <span className="result-label">C</span>
                <span className="result-value">{shCoeffs.c.toExponential(6)}</span>
              </div>
            </div>

            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)' }}>
              Temperature formula (copy/paste)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.5rem' }}>
              <div
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  fontSize: '0.95rem',
                  color: 'var(--primary-hover)',
                  userSelect: 'all',
                  wordBreak: 'break-all',
                }}
              >
                {shFormula}
              </div>
              <CopyButton text={shFormula} />
            </div>

            <div className="input-with-button" style={{ marginTop: '1rem', maxWidth: 420 }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Test: Resistance R (ohms)</label>
                <input type="text" value={shTestR} onChange={e => setShTestR(e.target.value)} placeholder="e.g. 10k" />
              </div>
              <div className="calc-btn" style={{ background: 'transparent', boxShadow: 'none', cursor: 'default' }}>
                {shTestT !== null ? (
                  <span className="result-value success">{shTestT.toFixed(2)} °C</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1rem' }}>
            Load a CSV with at least 3 R-T data rows to compute A, B and C.
          </p>
        )}
      </div>

      {/* ---- Plot section ---- */}
      <div className="results-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="mb-6" style={{ fontSize: '1.05rem' }}>3. Plot</h3>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <button className={tempUnit === 'C' ? 'active' : 'secondary'} onClick={() => handleSetTempUnit('C')}>
              °C
            </button>
            <button className={tempUnit === 'F' ? 'active' : 'secondary'} onClick={() => handleSetTempUnit('F')}>
              °F
            </button>
          </div>
        </div>
        <div className="input-row" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Start Temperature (°{tempUnit})</label>
            <input type="text" value={plotStart} onChange={e => setPlotStart(e.target.value)} placeholder="-40" />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Stop Temperature (°{tempUnit})</label>
            <input type="text" value={plotStop} onChange={e => setPlotStop(e.target.value)} placeholder="125" />
          </div>
        </div>
        <ThermistorPlot startC={plotStartC} stopC={plotStopC} curves={curves} title={partNumber.trim()} tempUnit={tempUnit} />
      </div>
    </div>
  );
}
