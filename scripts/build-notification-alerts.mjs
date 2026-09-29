import fs from 'node:fs';
const path = new URL('../index.html', import.meta.url);
let html = fs.readFileSync(path, 'utf8');
const tag = '<script src="/notification-alerts.js"></script>';
if (!html.includes(tag)) html = html.replace('</body>', `${tag}\n</body>`);
fs.writeFileSync(path, html);
