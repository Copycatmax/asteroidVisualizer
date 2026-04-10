const TAU = Math.PI * 2;

export function stablePhaseOffset(value) {
  const text = String(value ?? '');
  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) / 4294967296) * TAU;
}
