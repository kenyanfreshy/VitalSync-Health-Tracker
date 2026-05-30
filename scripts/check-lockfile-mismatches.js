const pkg = require('../package.json');
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const mismatches = [];
for (const [name, specifier] of Object.entries(allDeps)) {
  try {
    const installed = require('../node_modules/' + name + '/package.json').version;
    const spec = specifier.replace(/^[\^~>=<]/, '');
    const specMajorMinor = spec.split('.').slice(0, 2).join('.');
    const instMajorMinor = installed.split('.').slice(0, 2).join('.');
    if (specMajorMinor !== instMajorMinor && specifier.indexOf('*') === -1) {
      mismatches.push({ name, specifier, installed });
    }
  } catch (e) {
    // package not installed — skip
  }
}
if (mismatches.length === 0) {
  console.log('No major/minor mismatches found.');
} else {
  console.log('Mismatches between package.json and installed node_modules:');
  mismatches.forEach(m => {
    console.log('  ' + m.name + ': package.json=' + m.specifier + '  installed=' + m.installed);
  });
}
