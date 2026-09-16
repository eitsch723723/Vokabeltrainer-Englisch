const DICTIONARY = new Map([
  ['house', 'Haus'], ['school', 'Schule'], ['book', 'Buch'], ['friend', 'Freund / Freundin'],
  ['family', 'Familie'], ['mother', 'Mutter'], ['father', 'Vater'], ['brother', 'Bruder'], ['sister', 'Schwester'],
  ['dog', 'Hund'], ['cat', 'Katze'], ['day', 'Tag'], ['week', 'Woche'], ['year', 'Jahr'], ['time', 'Zeit'],
  ['hello', 'Hallo'], ['goodbye', 'Auf Wiedersehen'], ['please', 'bitte'], ['thanks', 'danke'],
  ['to go', 'gehen'], ['to come', 'kommen'], ['to begin', 'anfangen'], ['to start', 'beginnen'],
  ['to have', 'haben'], ['to be', 'sein'], ['to make', 'machen'], ['to play', 'spielen'], ['to learn', 'lernen'],
  ['big', 'groß'], ['small', 'klein'], ['good', 'gut'], ['bad', 'schlecht'], ['new', 'neu'], ['old', 'alt'],
  ['because', 'weil'], ['where', 'wo'], ['when', 'wann'], ['why', 'warum'], ['what', 'was'], ['who', 'wer']
]);

const REVERSE = new Map([...DICTIONARY.entries()].flatMap(([en, de]) => de.split('/').map(part => [part.trim().toLocaleLowerCase('de-DE'), en])));

export function suggestTranslation(term, sourceLanguage, vocabularies = []) {
  const key = String(term ?? '').trim().toLocaleLowerCase('de-DE');
  if (!key) return null;
  if (sourceLanguage === 'english') {
    const existing = vocabularies.find(v => v.english.toLocaleLowerCase('en-US') === key);
    if (existing) return { text: existing.german, source: 'existing' };
    const text = DICTIONARY.get(key);
    return text ? { text, source: 'local-dictionary' } : null;
  }
  const existing = vocabularies.find(v => v.german.toLocaleLowerCase('de-DE') === key);
  if (existing) return { text: existing.english, source: 'existing' };
  const text = REVERSE.get(key);
  return text ? { text, source: 'local-dictionary' } : null;
}
