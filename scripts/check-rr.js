const ts = require('typescript');
const files = [
  'lib/health/native-health-service.ts',
  'lib/data-sources/adapters/healthkit-adapter.ts',
  'lib/health/permissions.ts',
];
const prog = ts.createProgram(files, { noEmit: true, skipLibCheck: true, strict: false });
const diag = ts.getPreEmitDiagnostics(prog);
let count = 0;
diag.forEach(d => {
  if (!d.file) return;
  const fname = d.file.fileName;
  if (fname.includes('node_modules')) return;
  const {line} = d.file.getLineAndCharacterOfPosition(d.start);
  const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
  if (msg.includes('respiratoryRate') || msg.includes('Property') || msg.includes('missing')) {
    console.log(fname + ':' + (line+1) + ' - ' + msg.slice(0, 200));
    count++;
  }
});
console.log('Relevant errors:', count);
