const fs = require('fs');
const t = fs.readFileSync(
  'C:/Users/shiva/.cursor/projects/c-Users-shiva-Documents-AI/agent-tools/cf6612bb-70cc-4bb3-a0ed-4a3ffd9bc298.txt',
  'utf8',
);
const i = t.indexOf('REQS');
process.stdout.write(t.slice(0, 4000) + '\n---KEYS---\n');
const j = JSON.parse(t.slice(i + 4));
for (const k of Object.keys(j)) {
  if (/node|java|back|front|sql/i.test(k)) {
    console.log(k, '=>', j[k].join(' | '));
  }
}
