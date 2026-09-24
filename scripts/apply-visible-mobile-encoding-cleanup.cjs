const fs=require('fs');
const p=process.argv[2]||'index.html';
let s=fs.readFileSync(p,'utf8');
for(const [a,b] of [
 ['ðŸ“‹ Copy text','Copy text'],
 ['Ã°Å¸â€“Â¨ Print','Print'],
 ['A��,�?o�_ Call','Call'],
 ["dY'� Text",'Text'],
 ["btn:'A�AA? Send Receipt / Request Review'","btn:'Send Receipt / Request Review'"],
 ['A��,�?o�_ ${esc(doc.customerPhone)}','Phone: ${esc(doc.customerPhone)}'],
 ["${p.type==='deposit'?'Deposit':'Payment'}${p.method?' &middot; '+p.method:''}","${p.type==='deposit'?'Deposit':'Payment'}${p.method?' - '+p.method:''}"]
]) s=s.split(a).join(b);
s=s.replace(/(<button[^>]+onclick="export[A-Za-z]+CSV\(\)"[^>]*>)[^<]*CSV<\/button>/g,'$1Export CSV</button>');
fs.writeFileSync(p,s);
console.log('Visible mobile encoding cleanup applied');
