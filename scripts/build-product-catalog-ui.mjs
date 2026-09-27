import { readFileSync, writeFileSync } from 'node:fs';

const MARK='EZFIX_PRODUCT_CATALOG_UI_V1';
const HEAD='<!-- EZFIX_PRODUCT_CATALOG_UI_V1_HEAD --><link rel="stylesheet" href="/product-catalog-ui.css" data-ezfix-product-catalog="v1"><!-- /EZFIX_PRODUCT_CATALOG_UI_V1_HEAD -->';
const BODY='<!-- EZFIX_PRODUCT_CATALOG_UI_V1_BODY --><script src="/product-catalog-ui.js" data-ezfix-product-catalog="v1"></script><!-- /EZFIX_PRODUCT_CATALOG_UI_V1_BODY -->';

export function stripProductCatalogUi(html){
  return html.replace(HEAD+'\n','').replace(BODY+'\n','');
}
export function installProductCatalogUi(html){
  if(html.includes('data-ezfix-product-catalog="v1"')){
    if((html.match(/data-ezfix-product-catalog="v1"/g)||[]).length!==2) throw new Error('Product catalog UI markers are malformed');
    return html;
  }
  if(!html.includes('function openProductPicker(')||!html.includes('function addFromCatalog(')||!html.includes("{ id:'garage_doors', label:'Garage Doors'")||!html.includes("{ id:'springs', label:'Springs'")) throw new Error('Product catalog UI: incompatible CRM source');
  if((html.match(/<\/head>/g)||[]).length!==1||(html.match(/<\/body>/g)||[]).length!==1) throw new Error('Product catalog UI: expected one head/body');
  return html.replace('</head>',HEAD+'\n</head>').replace('</body>',BODY+'\n</body>');
}
const indexPath=new URL('../index.html',import.meta.url);
const html=readFileSync(indexPath,'utf8');
const out=installProductCatalogUi(html);
if(out!==html) writeFileSync(indexPath,out,'utf8');
console.log(MARK+': product catalog UI installed; existing invoice/estimate code unchanged.');
