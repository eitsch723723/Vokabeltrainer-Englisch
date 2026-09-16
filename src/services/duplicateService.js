import { normalizeAnswer, levenshteinDistance } from './answerEvaluationService.js';

export function findDuplicateCandidates(candidate, vocabularies) {
  const en = normalizeAnswer(candidate.english);
  const de = normalizeAnswer(candidate.german);
  return vocabularies.map(existing => {
    const existingEn = normalizeAnswer(existing.english);
    const existingDe = normalizeAnswer(existing.german);
    const exact = (en === existingEn && de === existingDe) || en === existingEn || de === existingDe;
    const similar = en.length >= 4 && existingEn.length >= 4 && levenshteinDistance(en, existingEn) <= 1;
    return { existing, exact, similar, score: exact ? 2 : similar ? 1 : 0 };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
}
