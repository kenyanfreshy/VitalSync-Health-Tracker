const fs = require('fs');
const content = fs.readFileSync('lib/i18n.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  const trimmed = line.trim();
  if (trimmed.includes('grams:') && !trimmed.endsWith(',') && !trimmed.endsWith('{')) {
    console.log((i+1) + ': ' + line);
  }
});
console.log('Done');
