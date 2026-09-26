import fs from 'node:fs';

const sourcePath = 'supabase/functions/ai-technician-assistant/index.ts';
const source = fs.readFileSync(sourcePath, 'utf8');

let pass = 0;
let fail = 0;
const check = (name, ok, detail='') => {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.error('FAIL ' + name + (detail ? ': ' + detail : '')); }
};

check(
  'garage door category uses real catalog id',
  source.includes('category: "garage_doors", kind: "garage door"'),
  'Expected garage_doors category mapping.'
);

check(
  'legacy doors category is absent',
  !source.includes('category: "doors", kind: "garage door"'),
  'Legacy doors category would miss the live catalog.'
);

check(
  'for/at amount parser requires money context or end of request',
  source.includes('(?=(?:dollars?\\b|total\\b|including\\b|incl\\.?\\b|$))'),
  'Dimensions after "for" must not be parsed as totals.'
);

const moneyPatterns = [
  /[$₪]\s*([0-9][0-9,]*(?:\.\d{1,2})?)/,
  /\b(?:for|at)\s+[$]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?=(?:dollars?\b|total\b|including\b|incl\.?\b|$))/i,
  /\b(?:total(?:\s+of)?|amount(?:\s+of)?)\s*[:=-]?\s*[$]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)\b/i,
  /\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:dollars?|total|including\s+(?:tax|labor)|incl\.?\s*(?:tax|labor))\b/i,
];

function parseMoney(request) {
  for (const pattern of moneyPatterns) {
    const match = request.match(pattern);
    if (match) return Number(match[1].replaceAll(',', ''));
  }
  return 0;
}

const cases = [
  ['install 16/7 garage door for 2100', 2100],
  ['install garage door for $2,100', 2100],
  ['garage door total of 2100', 2100],
  ['amount: $2100', 2100],
  ['16/7 garage door', 0],
  ['door for 16/7 opening', 0],
  ['9/7 garage door', 0],
  ['spring repair 750 including labor', 750],
  ['spring repair $750 including tax', 750],
];

for (const [request, expected] of cases) {
  const actual = parseMoney(request);
  check(`parseMoney: ${request}`, actual === expected, `expected ${expected}, got ${actual}`);
}

console.log(`${pass}/${pass + fail} technician parser regression assertions passed`);
if (fail) process.exit(1);
