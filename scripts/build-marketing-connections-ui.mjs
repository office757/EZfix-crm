import { readFileSync, writeFileSync } from 'node:fs';
const HEAD='<!-- EZFIX_MARKETING_CONNECTION_UI_V1_HEAD --><link rel="stylesheet" href="/marketing-connections-ui.css" data-ezfix-marketing-ui="v1"><!-- /EZFIX_MARKETING_CONNECTION_UI_V1_HEAD -->';
const BODY='<!-- EZFIX_MARKETING_CONNECTION_UI_V1_BODY --><script src="/marketing-connections-ui.js" data-ezfix-marketing-ui="v1"></script><!-- /EZFIX_MARKETING_CONNECTION_UI_V1_BODY -->';
export function stripMarketingUi(html){return html.replace(HEAD+'\n','').replace(BODY+'\n','')}
export function installMarketingUi(html){
 if(html.includes('data-ezfix-marketing-ui="v1"')){if((html.match(/data-ezfix-marketing-ui="v1"/g)||[]).length!==2)throw new Error('Marketing UI markers malformed');return html}
 if(!html.includes('function renderAiManagerAds(')||!html.includes("aiManagerState.subview==='google_ads'"))throw new Error('Marketing UI incompatible CRM source');
 return html.replace('</head>',HEAD+'\n</head>').replace('</body>',BODY+'\n</body>');
}
if(import.meta.url===new URL(process.argv[1],'file:///').href){const p=new URL('../index.html',import.meta.url),src=readFileSync(p,'utf8'),out=installMarketingUi(src);if(out!==src)writeFileSync(p,out,'utf8');console.log('Marketing connection UI assets installed.');}