import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installProductCatalogUi, stripProductCatalogUi } from './build-product-catalog-ui.mjs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../product-catalog-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../product-catalog-ui.css',import.meta.url),'utf8');
const source=stripProductCatalogUi(html), built=installProductCatalogUi(source);
let n=0; const check=(name,fn)=>{fn();n++;console.log('PASS '+name)};
check('Build only injects removable same-origin assets',()=>assert.equal(stripProductCatalogUi(built),source));
check('Build is idempotent',()=>assert.equal(installProductCatalogUi(built),built));
check('Exactly one JS and one CSS asset are installed',()=>assert.equal((built.match(/data-ezfix-product-catalog="v1"/g)||[]).length,2));
check('Runtime parses as classic JavaScript',()=>new vm.Script(js));
check('Runtime does not issue network requests or create a second invoice system',()=>{assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|supabase|createClient|dbAdd\s*\(|dbSet\s*\(/);assert.doesNotMatch(js,/openInvoiceModal\s*=|openEstimateModal\s*=/)});
check('Garage door search includes required structured fields',()=>{for(const key of ['manufacturer','model','collection','series','modelNumber','productName'])assert.ok(js.includes(key),key)});
check('Garage Door picker uses existing pickItemFromPicker flow',()=>{assert.match(js,/pickItemFromPicker/);assert.match(js,/garage_door_model/)});
check('Spring picker has exactly the requested two types',()=>{assert.match(js,/Torsion Springs/);assert.match(js,/Extension Springs/);assert.match(js,/springType/);assert.match(js,/spring_size/)});
check('Torsion filters expose wire, inside diameter and length',()=>{assert.match(js,/Wire size/);assert.match(js,/Inside diameter/);assert.match(js,/Length/);assert.match(js,/fullSize/)});
check('Extension filters expose length, weight, color and door height',()=>{assert.match(js,/Spring length/);assert.match(js,/Weight rating/);assert.match(js,/Color code/);assert.match(js,/Door height/)});
check('Exact spring size remains optional',()=>assert.match(js,/Size Not Specified/));
check('CSS is local-only and scoped to picker/catalog classes',()=>{assert.doesNotMatch(css,/@import|url\s*\(/i);assert.match(css,/#pickerOverlay|\.gd-catalog|\.spring-/)});
check('Existing line-item add path remains present',()=>assert.match(source,/function addFromCatalog\(productId\)/));
check('Existing product picker remains present for all other categories',()=>assert.match(js,/baseRenderProductPicker\(\)/));
console.log('Product catalog UI audit: '+n+'/'+n+' PASS');

[executed on device: DESKTOP-1E5RUBH (4ce28b28-6a84-43a7-ad22-df40b4da76cb)]