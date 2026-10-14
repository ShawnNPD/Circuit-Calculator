// Re-formats nerdamer's plain-text output (e.g. "-(-R2*Vin+R2*Vout)*Vout^(-1)") for display:
// sums list positive terms before negative ones, and a leading minus is folded into a
// numerator/denominator sum when that reduces the number of minus signs, giving
// "(R2*Vin - R2*Vout)/Vout" instead.

type Node =
  | { type: 'num'; value: string }
  | { type: 'sym'; name: string }
  | { type: 'func'; name: string; args: Node[] }
  | { type: 'add'; terms: Node[] }
  | { type: 'neg'; arg: Node }
  | { type: 'mul'; factors: { node: Node; inv: boolean }[] }
  | { type: 'pow'; base: Node; exp: Node };

// A product in normal form: sign * (num factors) / (den factors)
interface Term {
  sign: 1 | -1;
  num: Node[];
  den: Node[];
}

// ---------- Parsing ----------

function tokenize(src: string): string[] {
  const tokens = src.match(/\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/^(),]/g) ?? [];
  if (tokens.join('') !== src.replace(/\s+/g, '')) throw new Error('Unrecognized characters');
  return tokens;
}

function parse(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const expect = (t: string) => {
    if (tokens[pos] !== t) throw new Error(`Expected ${t}`);
    pos++;
  };

  function expr(): Node {
    const terms: Node[] = [term()];
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++];
      const t = term();
      terms.push(op === '-' ? { type: 'neg', arg: t } : t);
    }
    return terms.length === 1 ? terms[0] : { type: 'add', terms };
  }

  function term(): Node {
    const factors = [{ node: unary(), inv: false }];
    while (peek() === '*' || peek() === '/') {
      const op = tokens[pos++];
      factors.push({ node: unary(), inv: op === '/' });
    }
    return factors.length === 1 ? factors[0].node : { type: 'mul', factors };
  }

  function unary(): Node {
    if (peek() === '-') {
      pos++;
      return { type: 'neg', arg: unary() };
    }
    if (peek() === '+') {
      pos++;
      return unary();
    }
    return power();
  }

  function power(): Node {
    const base = primary();
    if (peek() === '^') {
      pos++;
      return { type: 'pow', base, exp: unary() };
    }
    return base;
  }

  function primary(): Node {
    const t = tokens[pos++];
    if (t === undefined) throw new Error('Unexpected end');
    if (t === '(') {
      const inner = expr();
      expect(')');
      return inner;
    }
    if (/^\d/.test(t)) return { type: 'num', value: t };
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() === '(') {
        pos++;
        const args: Node[] = [expr()];
        while (peek() === ',') {
          pos++;
          args.push(expr());
        }
        expect(')');
        return { type: 'func', name: t, args };
      }
      return { type: 'sym', name: t };
    }
    throw new Error(`Unexpected token ${t}`);
  }

  const result = expr();
  if (pos !== tokens.length) throw new Error('Trailing input');
  return result;
}

// ---------- Normalization ----------

function negativeExponent(exp: Node): Node | null {
  if (exp.type === 'neg') return exp.arg;
  return null;
}

function toTerm(node: Node): Term {
  const t: Term = { sign: 1, num: [], den: [] };
  const visit = (n: Node, inv: boolean) => {
    if (n.type === 'neg') {
      t.sign = t.sign === 1 ? -1 : 1;
      visit(n.arg, inv);
    } else if (n.type === 'mul') {
      for (const f of n.factors) visit(f.node, inv !== f.inv);
    } else if (n.type === 'pow' && negativeExponent(n.exp)) {
      const k = negativeExponent(n.exp)!;
      if (k.type === 'num' && k.value === '1') visit(n.base, !inv);
      else (inv ? t.num : t.den).push({ type: 'pow', base: n.base, exp: k });
    } else if (!(n.type === 'num' && n.value === '1')) {
      (inv ? t.den : t.num).push(n);
    }
  };
  visit(node, false);
  // Numeric coefficients first
  const numbersFirst = (a: Node, b: Node) => Number(b.type === 'num') - Number(a.type === 'num');
  t.num.sort(numbersFirst);
  t.den.sort(numbersFirst);
  return t;
}

const negateSum = (sum: Extract<Node, { type: 'add' }>): Node => ({
  type: 'add',
  terms: sum.terms.map(term => (term.type === 'neg' ? term.arg : { type: 'neg', arg: term })),
});

// Fold a leading minus into a numerator or denominator sum if that doesn't add minus signs
function absorbSign(t: Term): Term {
  if (t.sign === 1) return t;
  for (const side of ['num', 'den'] as const) {
    const sums = t[side].filter(f => f.type === 'add');
    if (sums.length !== 1) continue;
    const sum = sums[0] as Extract<Node, { type: 'add' }>;
    const negatives = sum.terms.filter(term => toTerm(term).sign === -1).length;
    const positives = sum.terms.length - negatives;
    if (positives <= negatives) {
      return { ...t, sign: 1, [side]: t[side].map(f => (f === sum ? negateSum(sum) : f)) };
    }
  }
  return t;
}

// ---------- Emitting ----------

interface Style {
  mul: string;
  paren: (s: string) => string;
  frac: (num: string, den: string, numIsCompound: boolean, denIsCompound: boolean) => string;
  pow: (base: string, exp: string, expIsAtom: boolean) => string;
  func: (name: string, args: string[]) => string;
  sym: (name: string) => string;
  plus: string;
  minus: string;
}

const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu',
  'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]);
const TEX_FUNCS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'min', 'max']);

const texSym = (name: string): string => {
  const us = name.indexOf('_');
  if (us > 0) return `${texSym(name.slice(0, us))}_{${name.slice(us + 1)}}`;
  return GREEK.has(name) ? `\\${name}` : name;
};

const TEX: Style = {
  mul: ' \\cdot ',
  paren: s => `\\left(${s}\\right)`,
  frac: (n, d) => `\\frac{${n}}{${d}}`,
  pow: (b, e) => `${b}^{${e}}`,
  func: (name, args) => {
    if (name === 'sqrt') return `\\sqrt{${args[0]}}`;
    if (name === 'abs') return `\\left|${args[0]}\\right|`;
    const head = TEX_FUNCS.has(name) ? `\\${name}` : `\\operatorname{${name}}`;
    return `${head}\\left(${args.join(', ')}\\right)`;
  },
  sym: texSym,
  plus: ' + ',
  minus: ' - ',
};

const TEXT: Style = {
  mul: '*',
  paren: s => `(${s})`,
  frac: (n, d, nc, dc) => `${nc ? `(${n})` : n}/${dc ? `(${d})` : d}`,
  pow: (b, e, atom) => `${b}^${atom ? e : `(${e})`}`,
  func: (name, args) => `${name}(${args.join(', ')})`,
  sym: name => name,
  plus: ' + ',
  minus: ' - ',
};

function emit(node: Node, s: Style): string {
  if (node.type === 'add') return emitSum(node, s);
  const t = absorbSign(toTerm(node));
  return (t.sign === -1 ? '-' : '') + emitBody(t, s);
}

function emitSum(node: Extract<Node, { type: 'add' }>, s: Style): string {
  const terms = node.terms.map(term => absorbSign(toTerm(term)));
  const ordered = [...terms.filter(t => t.sign === 1), ...terms.filter(t => t.sign === -1)];
  return ordered
    .map((t, i) => {
      const body = emitBody(t, s);
      if (i === 0) return (t.sign === -1 ? '-' : '') + body;
      return (t.sign === -1 ? s.minus : s.plus) + body;
    })
    .join('');
}

function emitFactors(factors: Node[], s: Style): string {
  if (factors.length === 0) return '1';
  if (factors.length === 1 && factors[0].type === 'add') return emitSum(factors[0], s);
  return factors.map(f => emitFactor(f, s)).join(s.mul);
}

function emitFactor(node: Node, s: Style): string {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'sym':
      return s.sym(node.name);
    case 'func':
      return s.func(node.name, node.args.map(a => emit(a, s)));
    case 'pow': {
      const atomic = node.base.type === 'sym' || node.base.type === 'num';
      const base = atomic ? emitFactor(node.base, s) : s.paren(emit(node.base, s));
      const expAtom = node.exp.type === 'sym' || node.exp.type === 'num';
      return s.pow(base, emit(node.exp, s), expAtom);
    }
    default:
      return s.paren(emit(node, s));
  }
}

function emitBody(t: Term, s: Style): string {
  const num = emitFactors(t.num, s);
  if (t.den.length === 0) return num;
  const compound = (f: Node[]) => f.length > 1 || (f.length === 1 && f[0].type === 'add');
  return s.frac(num, emitFactors(t.den, s), compound(t.num), compound(t.den));
}

// ---------- Public API ----------

function format(expr: string, style: Style): string | null {
  try {
    return expr
      .split('=')
      .map(side => emit(parse(side), style))
      .join(' = ');
  } catch {
    return null;
  }
}

/** LaTeX for a nerdamer expression/equation string, or null if it couldn't be parsed. */
export const prettyTeX = (expr: string) => format(expr, TEX);

/** Plain-text form of a nerdamer expression/equation string, or null if it couldn't be parsed. */
export const prettyText = (expr: string) => format(expr, TEXT);
