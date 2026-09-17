// Context makes each pronoun unambiguous; phrase choices also train word order.
const pronouns = ['I', 'you', 'he', 'she', 'it', 'we', 'they'];
const phrases = ['there is', 'there are', 'is there', 'are there'];
const definitions = [
  ['I', ['My name is Ruby. {} am ten.', 'This is my book. It belongs to me. {} like it.'], 'Ruby spricht über sich selbst.', '„I“ bedeutet „ich“. Dazu gehört „am“: I am.'],
  ['you', ['Ben, {} are my best friend.', 'Hello, Ruby! Can {} come with me?'], 'Sprich die genannte Person direkt an.', 'Für die direkt angesprochene Person steht „you“ (du/ihr).'],
  ['he', ['Ben is my brother. {} is ten.', 'This is my father. Today {} is at home.'], 'Ersetze die genannte männliche Person durch ein Personalpronomen.', 'Für Ben, den Bruder oder den Vater steht „he“. Dazu gehört „is“.'],
  ['she', ['Ruby is my sister. {} is happy.', 'This is my mother. Today {} is at home.'], 'Ersetze die genannte weibliche Person durch ein Personalpronomen.', 'Für Ruby, die Schwester oder die Mutter steht „she“. Dazu gehört „is“.'],
  ['it', ['This is my bike. {} is red.', 'Look at the book. {} is under the bed.'], 'Ersetze die einzelne Sache durch ein Personalpronomen.', 'Für eine einzelne Sache steht „it“. Dazu gehört „is“.'],
  ['we', ['Ben and I are friends. {} like football.', 'My sister and I are here. Today {} can play together.'], 'Die sprechende Person gehört zur Gruppe.', 'Wenn „ich“ zur Gruppe gehört, heißt es „we“ (wir).'],
  ['they', ['Ruby and Ben are friends. {} like football.', 'Look at the birds. {} are in the tree.'], 'Ersetze die genannten Personen oder Tiere durch ein Personalpronomen.', 'Für mehrere andere Personen oder Dinge steht „they“. Dazu gehört „are“.'],
  ['there is', ['{} a book on the bed.', 'Look! {} a cat under the tree.'], 'Beschreibe, was vorhanden ist. Achte auf die Einzahl.', 'In einer Aussage steht „there is“ vor einer einzelnen Sache: There is a book.'],
  ['there are', ['{} two books on the bed.', 'Look! {} three birds in the tree.'], 'Beschreibe, was vorhanden ist. Achte auf die Mehrzahl.', 'In einer Aussage steht „there are“ vor mehreren Dingen: There are two books.'],
  ['is there', ['{} a cat under the bed?', '{} a book in your schoolbag?'], 'Frage, ob eine einzelne Sache vorhanden ist.', 'In einer Frage steht „is“ vor „there“: Is there a book?'],
  ['are there', ['{} two cats under the tree?', '{} three books in your schoolbag?'], 'Frage, ob mehrere Dinge vorhanden sind.', 'In einer Frage steht „are“ vor „there“: Are there two books?']
];

export const grammarClozeTemplates = new Map(definitions.map(([answer, sentences, hint, explanation]) => [answer, {
  sentences, hint, explanation, choices: pronouns.includes(answer) ? pronouns : phrases
}]));

export function grammarChoices(current, all) {
  const definition = grammarClozeTemplates.get(current.english);
  if (!definition) return [];
  const available = new Set(all.map(v => v.english));
  return definition.choices.filter(answer => available.has(answer));
}
