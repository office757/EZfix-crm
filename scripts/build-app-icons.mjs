import fs from 'node:fs';

// Use the approved EZfix logo assets for installation, browser tabs and iOS.
const links = '<link rel="icon" type="image/png" sizes="192x192" href="/assets/ezfix-app-icon-192.png?v=2"><link rel="apple-touch-icon" sizes="180x180" href="/assets/ezfix-apple-touch-icon.png?v=2">';
for (const path of ['index.html', 'auth-shell.html']) {
  let html = fs.readFileSync(path, 'utf8');
  if (!html.includes('rel="apple-touch-icon"')) html = html.replace('</head>', `${links}\n</head>`);
  if (!html.includes('rel="manifest"')) html = html.replace('</head>', '<link rel="manifest" href="/manifest.webmanifest">\n</head>');
  fs.writeFileSync(path, html);
}
console.log('EZfix app branding links ready');
