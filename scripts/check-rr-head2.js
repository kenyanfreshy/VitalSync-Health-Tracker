const ts = require('typescript');
const { execSync } = require('child_process');
const fs = require('fs');

// Get the HEAD version of native-health-service.ts
const headContent = execSync('git show HEAD:lib/health/native-health-service.ts', { cwd: '/home/ubuntu/VitalSync-App' }).toString();
fs.writeFileSync('/tmp/nhs-head.ts', headContent);

const files = ['/tmp/nhs-head.ts'];
const prog = ts.createProgram(files, { noEmit: true, skipLibCheck: true, strict: false });
const diag = ts.getPreEmitDiagnostics(prog);
let count = 0;
diag.forEach(d => {
  if (!d.file) return;
  const fname = d.file.fileName;
  if (fname.includes('node_modules')) return;
  const {line} = d.file.getLineAndCharacterOfPosition(d.start);
  const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
  console.log(line+1 + ': ' + msg.slice(0, 200));
  count++;
});
console.log('All errors in HEAD:', count);
