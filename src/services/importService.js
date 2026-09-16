const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';

export async function recognizeVocabularyImage(file, onProgress = () => {}) {
  if (!file?.type?.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
  const { recognize } = await import(TESSERACT_URL);
  const result = await recognize(file, 'eng+deu', {
    logger: event => {
      if (event.status === 'recognizing text') onProgress(Math.round((event.progress ?? 0) * 100));
    }
  });
  return parseOcrData(result.data);
}

export function parseOcrData(data) {
  const rawLines = Array.isArray(data?.lines) && data.lines.length
    ? data.lines.map(line => ({ text: line.text, confidence: line.confidence ?? data.confidence ?? 0 }))
    : String(data?.text ?? '').split(/\r?\n/).map(text => ({ text, confidence: data?.confidence ?? 0 }));

  const normalized = rawLines.map(line => ({ ...line, text: line.text.trim() })).filter(line => line.text);
  let orientation = 'en-de';
  const header = normalized.find(line => /english|englisch|deutsch|german/i.test(line.text));
  if (header && /deutsch|german/i.test(header.text.split(/\s{2,}|\t|\||;/)[0] ?? '') && /english|englisch/i.test(header.text)) orientation = 'de-en';

  const rows = [];
  for (const line of normalized) {
    if (/^(english|englisch)\s+(deutsch|german)$/i.test(line.text) || /^(deutsch|german)\s+(english|englisch)$/i.test(line.text)) continue;
    const parts = splitPair(line.text);
    if (parts.length >= 2) {
      const first = parts[0];
      const second = parts.slice(1).join(' ').trim();
      rows.push(orientation === 'en-de'
        ? { english: first, german: second, confidence: line.confidence, uncertain: line.confidence < 75 }
        : { english: second, german: first, confidence: line.confidence, uncertain: line.confidence < 75 });
    } else {
      rows.push({ english: line.text, german: '', confidence: line.confidence, uncertain: true });
    }
  }
  return { rows, rawText: data?.text ?? '', averageConfidence: data?.confidence ?? 0 };
}

function splitPair(text) {
  const separators = [/\t+/, /\s{2,}/, /\s*[|;]\s*/, /\s+[–—-]\s+/];
  for (const separator of separators) {
    const parts = text.split(separator).map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) return parts;
  }
  return [text.trim()];
}
