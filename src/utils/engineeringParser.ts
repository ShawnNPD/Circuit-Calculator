export function parseEngineeringUnit(value: string): number {
  if (!value) return NaN;
  // Remove all spaces
  const cleanValue = value.replace(/\s+/g, '');

  // Match the numeric part and an optional single-character suffix
  // e.g. "1.5k", "-2.4M", "100", "5u"
  const match = cleanValue.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)([a-zA-Zμµ]?)$/);

  if (!match) {
    // Fallback to standard parseFloat if it doesn't match our pattern
    return parseFloat(value);
  }

  const numPart = parseFloat(match[1]);
  const suffix = match[2];

  if (isNaN(numPart)) return NaN;

  let multiplier = 1;
  switch (suffix) {
    case 'T': multiplier = 1e12; break;
    case 'G': multiplier = 1e9; break;
    case 'M': multiplier = 1e6; break;
    case 'k':
    case 'K': multiplier = 1e3; break;
    case 'm': multiplier = 1e-3; break;
    case 'u':
    case 'μ':
    case 'µ': multiplier = 1e-6; break;
    case 'n': multiplier = 1e-9; break;
    case 'p': multiplier = 1e-12; break;
    case 'f': multiplier = 1e-15; break;
    default: break; // No recognized suffix or empty suffix
  }

  return numPart * multiplier;
}

export function formatEngineeringUnit(value: number, fractionDigits = 3): string {
  if (value === 0) return '0';
  if (isNaN(value) || !isFinite(value)) return String(value);

  const absValue = Math.abs(value);
  // Find the base-10 exponent
  let exponent = Math.floor(Math.log10(absValue));
  // Snap exponent to the nearest lower multiple of 3
  let engExponent = Math.floor(exponent / 3) * 3;

  let suffix = '';
  switch (engExponent) {
    case 12: suffix = 'T'; break;
    case 9: suffix = 'G'; break;
    case 6: suffix = 'M'; break;
    case 3: suffix = 'k'; break;
    case 0: suffix = ''; break;
    case -3: suffix = 'm'; break;
    case -6: suffix = 'u'; break;
    case -9: suffix = 'n'; break;
    case -12: suffix = 'p'; break;
    case -15: suffix = 'f'; break;
    default:
      if (engExponent > 12 || engExponent < -15) {
        return value.toExponential(fractionDigits);
      }
  }

  const scaledValue = value / Math.pow(10, engExponent);
  // parseFloat avoids trailing zeros (e.g. 1.200k -> 1.2k)
  const formattedNumber = parseFloat(scaledValue.toFixed(fractionDigits));
  
  return `${formattedNumber}${suffix}`;
}
