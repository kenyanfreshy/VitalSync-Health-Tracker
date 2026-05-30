const fs = require('fs');
const content = fs.readFileSync('lib/i18n.ts', 'utf8');
const lines = content.split('\n');
let issues = 0;

// Check for lines that are very long (>2000 chars) that start with a locale pattern
// These are likely corrupted collapsed blocks
const localePattern = /^  [a-z]{2}(_[a-zA-Z]+)?: \{/;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.length > 2000 && localePattern.test(line)) {
    console.log('Large collapsed block at line ' + (i+1) + ' (' + line.length + ' chars): ' + line.substring(0, 80));
    issues++;
  }
}

// Also check for lines that have mismatched braces (simple check)
// by looking for lines that end mid-string (truncated)
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.length > 100 && line.length < 2000) {
    // Check if line ends with a truncated string (no closing quote)
    const trimmed = line.trimEnd();
    if (trimmed.endsWith(',     ') || trimmed.endsWith(',   ')) {
      console.log('Possible truncated line at ' + (i+1) + ': ' + trimmed.substring(trimmed.length - 60));
      issues++;
      if (issues > 10) { console.log('...stopping'); break; }
    }
  }
}

if (issues === 0) {
  console.log('No obvious syntax issues found in i18n.ts');
} else {
  console.log('Total issues: ' + issues);
}
