import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
import {socialInstructions,parseSocialDraft,imagePrompt} from '../supabase/functions/_shared/social-content.mjs';
const require=createRequire(import.meta.url),archive=require('../receipt-archive-utils.js');
test('annual receipt selection uses latest payment date and does not mix years',()=>{
 const docs=[{id:'one',number:'INV1',customerName:'Alice',date:'2025-12-30',payments:[{date:'2026-01-03'},{date:'2025-12-31'}]},{id:'two',customerName:'Bob',date:'2025-01-01'}];
 assert.equal(archive.year(docs[0]),'2026');assert.deepEqual(archive.filter(docs,'2026','alice'),[docs[0]]);assert.equal(archive.filter(docs,'2025','alice').length,0);assert.notEqual(archive.filename(docs[0]),archive.filename({...docs[0],id:'different'}));
});
test('CSV exports escape quotes and spreadsheet formulas',()=>{const csv=archive.csv([['=HYPERLINK("bad")','A, B','Name "quoted"']]);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/"A, B"/);assert.match(csv,/"Name ""quoted"""/);});
test('ZIP preserves PDFs and UTF-8 names with matching central directory',async()=>{
 const bytes=new Uint8Array(await archive.zip([{name:'Receipt.pdf',data:new TextEncoder().encode('%PDF-test')},{name:'receipts.csv',data:new TextEncoder().encode('Customer,Amount')}]).arrayBuffer());
 const view=new DataView(bytes.buffer);assert.equal(view.getUint32(0,true),0x04034b50);const end=bytes.length-22;assert.equal(view.getUint32(end,true),0x06054b50);assert.equal(view.getUint16(end+10,true),2);const offset=view.getUint32(end+16,true);assert.equal(view.getUint32(offset,true),0x02014b50);assert.equal(view.getUint32(offset+16,true),view.getUint32(14,true));assert.throws(()=>archive.zip([{name:'x',data:'invalid'}]));
});
test('social writer applies platform limits and prevents invented claims or DIY repair',()=>{
 assert.match(socialInstructions('google_business'),/1450/);assert.match(socialInstructions('facebook'),/220–300/);assert.match(socialInstructions('instagram'),/2100/);assert.match(socialInstructions('facebook'),/Never invent/);assert.match(imagePrompt('springs'),/torsion spring/);
 assert.deepEqual(parseSocialDraft(JSON.stringify({title:'Spring replacement',caption:'a'.repeat(600)}),'google_business'),{title:'Spring replacement',caption:'a'.repeat(600)});assert.throws(()=>parseSocialDraft('{"title":"x","caption":"tiny"}','facebook'));assert.throws(()=>parseSocialDraft(JSON.stringify({title:'x',caption:'a'.repeat(1501)}),'google_business'));
});
function edge(name,{member={id:'owner1',role:'owner',status:'active'},key=true,failImage=false}={}){
 let handler,uploads=0,requests=[];
 const query={select(){return this},eq(){return this},gte(){return this},maybeSingle:async()=>({data:member}),then(resolve){return Promise.resolve({count:0}).then(resolve)},insert:async()=>({error:null})};
 const client={auth:{getUser:async()=>({data:{user:{id:'user1'}}})},from:()=>query,storage:{from:()=>({upload:async()=>{uploads++;return {error:null}},createSignedUrl:async()=>({data:{signedUrl:'https://example.test/signed-image'}})})}};
 const env={SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',OPENAI_API_KEY:key?'private-key':'',SQUARE_ACCESS_TOKEN:'private-square',SQUARE_LOCATION_ID:'loc1'};
 const source=readFileSync(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8').replace(/^import.*\n/gm,'');
 const ctx=vm.createContext({Response,Request,AbortSignal,Uint8Array,crypto:globalThis.crypto,atob,createClient:()=>client,socialInstructions,parseSocialDraft,imagePrompt,Deno:{env:{get:k=>env[k]},serve:f=>handler=f},fetch:async(url,init)=>{
 requests.push({url,init});if(url.includes('/responses'))return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({title:'Springs',caption:'Garage door springs. '.repeat(40)})}]}]});
 if(url.includes('/images/'))return failImage?Response.json({}, {status:503}):Response.json({data:[{b64_json:btoa('image')}]});
 if(url.includes('bank-accounts'))return Response.json({bank_accounts:[{id:'b1',bank_name:'Bank of America',account_number_suffix:'1234',status:'VERIFIED',primary_bank_identification_number:'PRIVATE',holder_name:'PRIVATE'}]});
 return Response.json({payouts:[{id:'p1',amount_money:{amount:10000,currency:'USD'},status:'PAID'}]});
 }});
 vm.runInContext(stripTypeScriptTypes(source),ctx);
 return {call:body=>handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer user-token','Content-Type':'application/json'},body:JSON.stringify(body)})),unauthorized:()=>handler(new Request('https://example.test',{method:'POST',body:'{}'})),requests,get uploads(){return uploads}};
}
test('bank endpoint is owner-only, read-only and returns masked bank metadata',async()=>{
 const h=edge('business-finance-status');const result=await (await h.call({})).json();assert.equal(result.bank_accounts[0].name,'Bank of America');assert.equal(result.payouts[0].amount,10000);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|private-square/);assert(h.requests.every(r=>!r.init.method||r.init.method==='GET'));assert.equal((await h.unauthorized()).status,401);assert.equal((await edge('business-finance-status',{member:{role:'technician',status:'active'}}).call({})).status,403);
});
test('social generation saves a generated asset and keeps publish separate',async()=>{
 const h=edge('generate-social-post');const result=await(await h.call({topic:'springs',platform:'google_business',generate_image:true})).json();assert.equal(result.ok,true);assert.equal(h.uploads,1);assert(result.photo.id.startsWith('crm-assets/social/generated/'));assert.equal(result.photo.aiGenerated,true);assert(!h.requests.some(r=>/facebook|instagram|googleapis/.test(r.url)));assert.equal((await h.unauthorized()).status,401);assert.equal((await edge('generate-social-post',{key:false}).call({topic:'springs'})).status,503);
});
test('image provider failure preserves a usable text draft, tech users cannot generate',async()=>{
 const result=await(await edge('generate-social-post',{failImage:true}).call({topic:'springs',generate_image:true})).json();assert.equal(result.ok,true);assert(result.caption.length>300);assert.equal(result.photo,null);assert(result.image_error);assert.equal((await edge('generate-social-post',{member:{role:'technician',status:'active'}}).call({topic:'springs'})).status,403);
});
