// Regenerates api/_lib/data.mjs from the TypeScript sources of truth.
// Run after editing src/data/foods.ts or src/data/coachPrompt.ts:
//   npm run gen:api          (needs Node >= 22.6)
// The generated file is COMMITTED so Vercel never needs to run this.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { FOODS } = await import('../src/data/foods.ts');
const { coachSystemPrompt } = await import('../src/data/coachPrompt.ts');

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'api', '_lib', 'data.mjs');

const banner = `// GENERATED FILE — do not edit by hand.
// Source of truth: src/data/foods.ts + src/data/coachPrompt.ts
// Regenerate with: npm run gen:api
`;

writeFileSync(
  out,
  banner +
    `export const FOODS = ${JSON.stringify(FOODS, null, 1)};\n\n` +
    `export const coachSystemPrompt = ${JSON.stringify(coachSystemPrompt)};\n`,
  'utf8',
);
console.log(`wrote ${out} (${FOODS.length} foods)`);
