import { useState, useMemo } from 'react';
import nerdamer from 'nerdamer/all.min';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { parseEngineeringUnit, formatEngineeringUnit } from './utils/engineeringParser';
import { prettyTeX, prettyText } from './utils/prettyExpression';

// Turn multi-character variable names into subscripted form, e.g. Vout -> V_{out}, R2 -> R_{2}
function subscriptVariables(tex: string, vars: string[]): string {
  // Names containing '_' are already subscripted by nerdamer's toTeX()
  const multi = new Set(vars.filter(v => v.length > 1 && !v.includes('_')));
  if (multi.size === 0) return tex;
  // Match bare identifiers only; skip LaTeX commands like \frac, \cdot, \pi
  return tex.replace(/(\\?)([A-Za-z][A-Za-z0-9_]*)/g, (match, slash: string, name: string) => {
    if (slash || !multi.has(name)) return match;
    const sub = name.slice(1);
    return /^[0-9]+$/.test(sub) ? `${name[0]}_{${sub}}` : `${name[0]}_{\\mathrm{${sub}}}`;
  });
}

function renderTeX(tex: string): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode: true });
}

interface ParsedEquation {
  variables: string[];
  inputTeX: string | null;
  error: string | null;
}

interface Solution {
  result: string | null;
  resultTeX: string | null;
  numericResult: string | null;
  error: string | null;
}

const EMPTY_SOLUTION: Solution = { result: null, resultTeX: null, numericResult: null, error: null };

function parseEquation(equation: string): ParsedEquation {
  if (!equation || !equation.includes('=')) {
    return { variables: [], inputTeX: null, error: null };
  }
  try {
    const expr = nerdamer(equation);
    return { variables: expr.variables(), inputTeX: prettyTeX(expr.toString()) ?? expr.toTeX(), error: null };
  } catch {
    return { variables: [], inputTeX: null, error: 'Invalid equation format.' };
  }
}

function formatNumeric(expr: string, evalMap: Record<string, string>): string {
  const evaluated = nerdamer(expr, evalMap).evaluate().text();
  const num = parseFloat(evaluated);
  return isNaN(num) ? evaluated : formatEngineeringUnit(num);
}

function solveEquation(
  equation: string,
  targetVar: string,
  variables: string[],
  varValues: Record<string, string>
): Solution {
  if (!equation || !equation.includes('=') || !targetVar) return EMPTY_SOLUTION;

  try {
    // solveFor returns an expression or an array of expressions
    const raw = nerdamer(equation).solveFor(targetVar);
    const solutions = Array.isArray(raw) ? raw : [raw];

    const solutionString = solutions.map(s => prettyText(s.toString()) ?? s.toString()).join(' ,  ');
    const solutionTeX = solutions.map(s => prettyTeX(s.toString()) ?? s.toTeX()).join(',\\quad ');

    // Evaluate numerically
    const inputVars = variables.filter(v => v !== targetVar);
    const evalMap: Record<string, string> = {};
    let allValid = inputVars.length > 0;

    for (const v of inputVars) {
      const valStr = varValues[v];
      const num = valStr && valStr.trim() !== '' ? parseEngineeringUnit(valStr) : NaN;
      if (isNaN(num)) {
        allValid = false;
        break;
      }
      evalMap[v] = num.toString();
    }

    const numericResult = allValid
      ? `${targetVar} = ${solutions.map(s => formatNumeric(s.toString(), evalMap)).join(' ,  ')}`
      : null;

    return {
      result: `${targetVar} = ${solutionString}`,
      resultTeX: solutionTeX ? `${nerdamer(targetVar).toTeX()} = ${solutionTeX}` : null,
      numericResult,
      error: null
    };
  } catch {
    return { ...EMPTY_SOLUTION, error: `Cannot solve for ${targetVar}. Ensure the equation is mathematically valid.` };
  }
}

export default function SymbolicSolver() {
  const [equation, setEquation] = useState<string>('Vout = Vin * (R2 / (R1 + R2))');
  const [selectedVar, setSelectedVar] = useState<string>('');
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => parseEquation(equation), [equation]);
  const { variables, inputTeX } = parsed;

  // Fall back to the first variable when the selection isn't in the current equation
  const targetVar = variables.includes(selectedVar) ? selectedVar : (variables[0] ?? '');

  const solved = useMemo(
    () => solveEquation(equation, targetVar, variables, varValues),
    [equation, targetVar, variables, varValues]
  );
  const { result, resultTeX, numericResult } = solved;
  const error = parsed.error ?? solved.error;

  const prettyInput = useMemo(() => inputTeX ? subscriptVariables(inputTeX, variables) : null, [inputTeX, variables]);
  const prettyResult = useMemo(() => resultTeX ? subscriptVariables(resultTeX, variables) : null, [resultTeX, variables]);

  const copyLaTeX = async () => {
    if (!prettyResult) return;
    try {
      await navigator.clipboard.writeText(prettyResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  };

  const labelStyle = { color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
  const mathBoxStyle = {
    padding: '0.5rem 1rem',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '8px',
    fontSize: '1.2rem',
    overflowX: 'auto' as const,
    marginTop: '0.5rem',
    marginBottom: '1rem'
  };

  return (
    <div className="glass-panel">
      <h2 className="mb-6">Symbolic Equation Solver</h2>
      <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem'}}>
        Enter any algebraic equation using standard math notation (e.g. <code>V = I * R</code> or <code>Fc = 1 / (2 * pi * R * C)</code>) and select a variable to solve for.
      </p>

      <div className="calc-grid">
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="input-group">
            <label>Equation</label>
            <input 
              type="text" 
              value={equation} 
              onChange={e => setEquation(e.target.value)} 
              placeholder="e.g. Vout = Vin * (R2 / (R1 + R2))" 
              style={{ width: '100%', fontSize: '1.1rem', fontFamily: 'monospace' }}
            />
          </div>
        </div>

        <div>
          <div className="input-group">
            <label>Solve For Variable</label>
            <select 
              value={targetVar} 
              onChange={e => setSelectedVar(e.target.value)}
              disabled={variables.length === 0}
            >
              {variables.length === 0 && <option value="">No variables found</option>}
              {variables.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {variables.filter(v => v !== targetVar).map(v => (
          <div key={v}>
            <div className="input-group">
              <label>Value for {v}</label>
              <input
                type="text"
                value={varValues[v] || ''}
                onChange={e => setVarValues(prev => ({ ...prev, [v]: e.target.value }))}
                placeholder={`e.g. 1k, 10u, 5`}
              />
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="results-panel" style={{ marginTop: '1.5rem', borderLeftColor: '#f44336' }}>
          <span className="result-value warning" style={{ fontSize: '1rem' }}>{error}</span>
        </div>
      )}

      {result && !error && (
        <div className="results-panel" style={{ marginTop: '1.5rem' }}>
          <h3 className="mb-4">Solved Result</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Symbolic</span>
            <div style={{
              padding: '1rem', 
              background: 'rgba(0,0,0,0.2)', 
              borderRadius: '8px', 
              fontSize: '1.1rem', 
              fontFamily: 'monospace',
              color: 'var(--accent)',
              wordBreak: 'break-all',
              marginTop: '0.5rem'
            }}>
              {result}
            </div>
          </div>

          {numericResult && (
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Numeric</span>
              <div style={{
                padding: '1rem', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '8px', 
                fontSize: '1.25rem', 
                fontFamily: 'monospace',
                color: '#4ade80',
                fontWeight: 'bold',
                wordBreak: 'break-all',
                marginTop: '0.5rem'
              }}>
                {numericResult}
              </div>
            </div>
          )}
        </div>
      )}

      {prettyInput && !error && (
        <div className="results-panel" style={{ marginTop: '1.5rem' }}>
          <h3 className="mb-4">Formatted Equation</h3>

          <span style={labelStyle}>Input</span>
          <div style={mathBoxStyle} dangerouslySetInnerHTML={{ __html: renderTeX(prettyInput) }} />

          {prettyResult && (
            <>
              <span style={labelStyle}>Solved for {targetVar}</span>
              <div style={{ ...mathBoxStyle, color: 'var(--accent)' }} dangerouslySetInnerHTML={{ __html: renderTeX(prettyResult) }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={labelStyle}>LaTeX Source</span>
                <button type="button" onClick={copyLaTeX} style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre style={{
                padding: '1rem',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                marginTop: '0.5rem'
              }}>
                {prettyResult}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
