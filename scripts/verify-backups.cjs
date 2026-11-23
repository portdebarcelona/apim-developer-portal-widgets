const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../artifacts/apim-auth-audit-2026-11-20');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'download-manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
for (const file of manifest) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file.path))).digest('hex');
  if (hash.toUpperCase() !== file.sha256.toUpperCase()) throw new Error(`Backup alterado: ${file.path}`);
}
console.log(`${manifest.length} archivos originales intactos (SHA-256).`);
