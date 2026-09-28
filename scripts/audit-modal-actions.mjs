import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {modalDocument,modalSource} from './modal-test-fixture.mjs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function harness(){const dom=modalDocument();const context=vm.createContext(dom);vm.runInContext(modalSource(source),context);return {...dom,context,show:options=>context.showModal(options),button:()=>dom.document.getElementById('modalSaveBtn')};}
let count=0;async function check(name,fn){await fn();count++;console.log('PASS '+name);}
await check('Information-only dialogs close and return focus without invoking a missing save handler',async()=>{
  const h=harness(),opener=h.document.activeElement;h.show({title:'Preview',body:'Already saved'});
  assert.equal(h.button().textContent,'Close');await h.button().onclick();
  assert.equal(h.document.getElementById('modalOverlay'),null);assert.equal(h.document.activeElement,opener);
});
await check('Repeated clicks cannot invoke the same asynchronous save twice',async()=>{
  const h=harness();let calls=0,release;h.show({title:'Edit',body:'',onSave:()=>{calls++;return new Promise(r=>{release=r;});}});
  const button=h.button();const pending=button.onclick();assert.equal(button.disabled,true);await button.onclick();assert.equal(calls,1);
  release();await pending;assert.equal(button.disabled,false);assert.equal(button.textContent,'Save');
});
await check('A failed save preserves its error and restores the custom action label for retry',async()=>{
  const h=harness();h.show({title:'Edit',body:'',onSave:async()=>{throw Error('offline');}});const button=h.button();button.textContent='Save signature';
  await assert.rejects(button.onclick(),/offline/);assert.equal(button.disabled,false);assert.equal(button.textContent,'Save signature');
});
await check('A completing save cannot change the button in a replacement information dialog',async()=>{
  const h=harness();h.show({title:'Edit',body:'',onSave:async()=>h.show({title:'Saved',body:'Success'})});
  await h.button().onclick();assert.equal(h.button().textContent,'Close');assert.equal(h.button().disabled,false);
});
await check('Callers can rename the primary button without breaking its save handler',async()=>{
  const h=harness();let calls=0;h.show({title:'AI',body:'',onSave:async()=>{calls++;}});const button=h.button();button.id='techAiSubmitBtn';button.textContent='Submit for Approval';
  await button.onclick();assert.equal(calls,1);assert.equal(button.textContent,'Submit for Approval');
});
await check('Invoice and estimate document headers use the existing embedded official logo',()=>{
  const start=source.indexOf('function renderDocumentView('),end=source.indexOf('function ',start+30);
  const documentSource=source.slice(start,end);
  assert.match(documentSource,/<img src="\$\{getBrandLogoUrl\(\)\}" alt="EZfix logo"/);
  assert.doesNotMatch(documentSource,/<img src="" alt="EZfix logo"/);
  const data=source.match(/const LOGO_URL = "data:image\/png;base64,([^"\n]+)"/)[1];
  assert.equal(Buffer.from(data,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
});
await check('A failed document logo falls back on that image without changing the sidebar',()=>{
  const start=source.indexOf('const LOGO_SVG ='),end=source.indexOf('window.handleBrandMarkError',start);
  const context=vm.createContext({encodeURIComponent});vm.runInContext(source.slice(start,end),context);
  const img={onerror:()=>{},src:''};context.handleBrandMarkError(img);
  assert.equal(img.onerror,null);assert.match(img.src,/^data:image\/svg\+xml;charset=utf-8,/);
});
console.log(`Modal and logo audit: ${count}/${count} PASS`);
