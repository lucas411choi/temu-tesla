// 모든 JS 모듈의 상대 import 경로와 import 이름이 실제 export 와 맞는지 정적으로 검사한다 (three/외부 패키지는 제외)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['client', 'shared', 'server', 'tools'];
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } };
dirs.forEach((d) => walk(path.join(root, d)));
const exportsOf = (file) => {
  const src = fs.readFileSync(file, 'utf8'), out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach((x) => out.add(x.trim().split(/\s+as\s+/).pop()));
  if (/export\s+default/.test(src)) out.add('default');
  return out;
};
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+([A-Za-z0-9_$]+))?\s*from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[4];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(target)) { console.log(`✗ ${path.relative(root, f)}: 파일 없음 ${spec}`); bad++; continue; }
    const ex = exportsOf(target);
    if (m[2]) for (const n of m[2].split(',').map((x) => x.trim()).filter(Boolean)) { const nm = n.split(/\s+as\s+/)[0].trim(); if (!ex.has(nm)) { console.log(`✗ ${path.relative(root, f)}: '${nm}' 이(가) ${spec} 에 export 되지 않음`); bad++; } }
    if (m[1] && !ex.has('default')) { console.log(`✗ ${path.relative(root, f)}: ${spec} 에 default export 없음`); bad++; }
  }
}
console.log(bad ? `\n문제 ${bad}건` : `import/export 검사 통과 (${files.length}개 파일)`);
process.exit(bad ? 1 : 0);
