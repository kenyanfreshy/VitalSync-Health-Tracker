import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Use npx tsx to type-check the file
try {
  execSync('npx tsx --noEmit lib/health/report-generator.ts', { stdio: 'inherit', cwd: '/home/ubuntu/VitalSync-App' });
  console.log('✅ No syntax errors in report-generator.ts');
} catch (e) {
  console.error('❌ Syntax error found');
  process.exit(1);
}
