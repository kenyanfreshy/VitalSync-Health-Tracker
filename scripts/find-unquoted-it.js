const fs = require('fs');
const content = fs.readFileSync('/home/ubuntu/VitalSync-App/lib/i18n.ts', 'utf8');
const lines = content.split('\n');
let found = 0;
lines.forEach((line, i) => {
  // Look for patterns like: someKey: it, or someKey: it} (unquoted 'it' as a value)
  if (/:\s+it\s*[,}]/.test(line)) {
    const afterColon = line.split(':').slice(1).join(':').trim();
    // Make sure it's not inside quotes
    if (!afterColon.startsWith('"') && !afterColon.startsWith("'") && !afterColon.startsWith('`')) {
      console.log(`Line ${i+1}: ${line.trim()}`);
      found++;
    }
  }
});
console.log(`Found ${found} suspicious lines`);
