export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    // Apostrophes are optional for learning answers: don't == dont.
    .replace(/['’‘`´]/g, '')
    // Sentence punctuation must not turn an otherwise correct answer into an error.
    // Separating punctuation (for example hyphens) becomes whitespace so word boundaries remain readable.
    .replace(/[.,!?;:()[\]{}"„“”«»…]/g, ' ')
    .replace(/[-–—/\\]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Kept under the existing export name for compatibility. The implementation also
// handles adjacent transpositions, which are a common typing error (e.g. "freind").
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

      if (
        i > 1 &&
        j > 1 &&
        x[i - 1] === y[j - 2] &&
        x[i - 2] === y[j - 1]
      ) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[x.length][y.length];
}

function nearThreshold(length) {
  if (length < 4) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  return 3;
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
