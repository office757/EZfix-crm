import { readFileSync, writeFileSync } from 'node:fs';

const HEAD='<!-- EZFIX_VISUALIZER_GALLERY_PREMIUM_V1_HEAD --><link rel="stylesheet" href="/visualizer-gallery-premium.css" data-ezfix-vg="v1"><!-- /EZFIX_VISUALIZER_GALLERY_PREMIUM_V1_HEAD -->';
const BODY='<!-- EZFIX_VISUALIZER_GALLERY_PREMIUM_V1_BODY --><script src="/visualizer-gallery-premium.js" data-ezfix-vg="v1"></script><!-- /EZFIX_VISUALIZER_GALLERY_PREMIUM_V1_BODY -->';

export function stripVisualizerGallery(html){return html.replace(HEAD+'\n','').replace(BODY+'\n','')}
export function installVisualizerGallery(html){
  if(html.includes('data-ezfix-vg="v1"')){
    if((html.match(/data-ezfix-vg="v1"/g)||[]).length!==2)throw new Error('Visualizer/Gallery markers malformed');
    return html;
  }
  for(const required of ['function renderVisualizer(','function renderGallery(','function renderVisStep4(','function createEstimateFromDesign(']) if(!html.includes(required))throw new Error('Visualizer/Gallery incompatible source: '+required);
  return html.replace('</head>',HEAD+'\n</head>').replace('</body>',BODY+'\n</body>');
}
if(import.meta.url===new URL(process.argv[1],'file:///').href){
  const p=new URL('../index.html',import.meta.url),src=readFileSync(p,'utf8'),out=installVisualizerGallery(src);if(out!==src)writeFileSync(p,out,'utf8');console.log('Premium Visualizer/Gallery assets installed.');
}