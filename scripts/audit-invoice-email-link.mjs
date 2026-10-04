import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('const documentDeliveryPending ='),end=html.indexOf('\nfunction buildDocSmsText(',start);
assert.ok(start>=0&&end>start);
async function scenario({linkFails=false,pdfFails=false,type='invoice',paid=false,markerFails=false}={}){
 const sends=[],notices=[],links=[],renders=[],pdfs=[],markers=[];
 const doc={id:'qa',number:'QA-1',customerName:'Synthetic customer',customerEmail:'qa@example.invalid',items:[{desc:'Labor',qty:1,rate:100}]};
 const c={console:{error(){}},COMPANY:{name:'EZfix'},getOne:col=>col==='customers'?{}:doc,
  createPublicInvoiceUrl:async id=>{links.push(id);if(linkFails)throw new Error('Square unavailable');return 'https://example.invalid/invoice-pay?synthetic=1';},
  buildDocSummaryText:(_type,_doc,url)=>{renders.push(url);return 'Text '+url;},buildDocEmailHtml:(_type,_doc,url)=>'<a href="'+url+'">View invoice</a>',
  buildPdfDoc:async()=>{pdfs.push(true);if(pdfFails)throw new Error('PDF failed');return {output:()=>new ArrayBuffer(2)};},arrayBufferToBase64:()=> 'AAA=',
  tryGmailSend:async(...args)=>{sends.push(args);return {providerMessageId:'synthetic'};},logAudit(){},balanceDue:()=>paid?0:100,SB:{functions:{invoke:async(name,args)=>{markers.push({name,args});return markerFails?{error:new Error('Tracking unavailable')}:{data:{ok:true}};}}},refreshCollection:async()=>{},toast:(...args)=>notices.push(args),promptContactInfo(){throw new Error('Unexpected missing email');}};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);await c.emailDocument(type,'qa');return {sends,notices,links,renders,pdfs,markers};
}
let r=await scenario({linkFails:true});assert.equal(r.sends.length,0);assert.equal(r.renders.length,0);assert.match(r.notices[0][0],/not emailed.*secure payment and signature page/);
r=await scenario();assert.equal(r.sends.length,1);assert.match(r.sends[0][2],/invoice-pay/);assert.match(r.sends[0][4],/invoice-pay/);assert.equal(r.sends[0][3],null);assert.equal(r.pdfs.length,0);
r=await scenario({pdfFails:true});assert.equal(r.sends.length,1);assert.match(r.sends[0][4],/invoice-pay/);assert.equal(r.sends[0][3],null);
r=await scenario({type:'estimate',linkFails:true});assert.equal(r.links.length,0);assert.equal(r.sends.length,1);
r=await scenario({paid:true,linkFails:true});assert.equal(r.links.length,0);assert.equal(r.sends.length,1);assert.match(r.sends[0][1],/^Receipt /);assert.ok(r.sends[0][3]);assert.equal(r.markers[0].name,'mark-receipt-delivery');
r=await scenario({paid:true,pdfFails:true});assert.equal(r.sends.length,0);assert.equal(r.markers.length,0);assert.match(r.notices[0][0],/Receipt was not emailed.*PDF/);
r=await scenario({paid:true,markerFails:true});assert.equal(r.sends.length,1);assert.match(r.notices[0][0],/email was sent.*tracking/);
console.log('Document email: 7 real-handler cases PASS; secure unpaid links, final receipt PDFs and truthful tracking errors');
