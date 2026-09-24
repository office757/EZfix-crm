const fs=require('fs');
const p=process.argv[2]||'index.html';
let s=fs.readFileSync(p,'utf8');
s=s.replaceAll('+1 (413) 961-3223','+1 (508) 351-0523');
s=s.replaceAll('+14139613223','+15083510523');
s=s.replaceAll('outbound SMS carrier delivery is under investigation','fully registered for carrier delivery with T-Mobile, AT&T and Verizon');
fs.writeFileSync(p,s);
console.log('Ashley number updated to +1 (508) 351-0523');
