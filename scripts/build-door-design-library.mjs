import {readFileSync,writeFileSync} from 'node:fs';
const p=new URL('../index.html',import.meta.url);let html=readFileSync(p,'utf8');
const mark='<!-- EZFIX_DOOR_DESIGN_LIBRARY_V1 -->';
if(!html.includes(mark)){
 const anchor='<!-- EZFIX_VISUALIZER_GALLERY_PREMIUM_V1_BODY -->';
 if(!html.includes(anchor))throw Error('Premium visualizer must be installed first');
 html=html.replace(anchor,mark+'<script src="/door-design-data.js"></script><script src="/door-design-library.js"></script>\n'+anchor);
}
if(!html.includes('src="/door-config-options.js"'))html=html.replace('<script src="/door-design-library.js">','<script src="/door-config-options.js"></script><script src="/door-design-library.js">');
if(html!==readFileSync(p,'utf8'))writeFileSync(p,html);
console.log('Manufacturer door design library installed.');
