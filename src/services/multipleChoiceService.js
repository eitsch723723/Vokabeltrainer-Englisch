function target(v, direction) {
  return direction === 'en-de' ? v.german : v.english;
}

export function buildChoices(current, all, direction, count = 4) {
  const answer = target(current, direction);
  const candidates = all.filter(v => v.id !== current.id).map(v => target(v, direction)).filter(text => text && text !== answer);
  const scored = [...new Set(candidates)].map(text => ({
    text,
    score: Math.abs(text.length - answer.length) + (text[0]?.toLocaleLowerCase() === answer[0]?.toLocaleLowerCase() ? -2 : 0)
  })).sort((a, b) => a.score - b.score || a.text.localeCompare(b.text));
  const distractors = scored.slice(0, Math.max(0, count - 1)).map(x => x.text);
  const options = [answer, ...distractors];
  return options.sort((a, b) => stableHash(`${current.id}:${a}`) - stableHash(`${current.id}:${b}`));
}

function stableHash(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}
