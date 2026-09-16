export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE');
}

export function levenshteinDistance(a, b) {
  const x = normalizeAnswer(a);
  const y = normalizeAnswer(b);
  const rows = x.length + 1;
  const cols = y.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[x.length][y.length];
}

function nearThreshold(length) {
  if (length < 4) return 0;
  if (length < 8) return 1;
  return 2;
}

export function evaluateAnswer(answer, acceptedAnswers) {
  const normalized = normalizeAnswer(answer);
  const accepted = acceptedAnswers.map(normalizeAnswer).filter(Boolean);
  if (!normalized) return { result: 'wrong', matched: null, distance: null };
  const exact = accepted.find(value => value === normalized);
  if (exact) return { result: 'correct', matched: exact, distance: 0 };

  let best = null;
  for (const candidate of accepted) {
    const distance = levenshteinDistance(normalized, candidate);
    const threshold = nearThreshold(Math.max(normalized.length, candidate.length));
    if (threshold > 0 && distance <= threshold && (!best || distance < best.distance)) {
      best = { candidate, distance };
    }
  }
  if (best) return { result: 'near', matched: best.candidate, distance: best.distance };
  return { result: 'wrong', matched: null, distance: null };
}
