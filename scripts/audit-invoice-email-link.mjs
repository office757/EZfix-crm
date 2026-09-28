import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('async function emailDocument('),end=html.indexOf('\nfunction buildDocSmsText(',start);
assert.ok(start>=0&&end>start);
async function scenario({linkFails=false,pdfFails=false,type='invoice'}={}){
 const sends=[],notices=[],links=[],renders=[];
 const doc={id:'qa',number:'QA-1',customerName:'Synthetic customer',customerEmail:'qa@example.invalid',items:[{desc:'Labor',qty:1,rate:100}]};
 const c={console:{error(){}},COMPANY:{name:'EZfix'},getOne:col=>col==='customers'?{}:doc,
  createPublicInvoiceUrl:async id=>{links.push(id);if(linkFails)throw new Error('Square unavailable');return 'https://example.invalid/invoice-pay?synthetic=1';},
  buildDocSummaryText:(_type,_doc,url)=>{renders.push(url);return 'Text '+url;},buildDocEmailHtml:(_type,_doc,url)=>'<a href="'+url+'">View invoice</a>',
  buildPdfDoc:async()=>{if(pdfFails)throw new Error('PDF failed');return {output:()=>new ArrayBuffer(2)};},arrayBufferToBase64:()=> 'AAA=',
  tryGmailSend:async(...args)=>{sends.push(args);return {providerMessageId:'synthetic'};},logAudit(){},balanceDue:()=>100,toast:(...args)=>notices.push(args),promptContactInfo(){throw new Error('Unexpected missing email');}};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);await c.emailDocument(type,'qa');return {sends,notices,links,renders};
}
let r=await scenario({linkFails:true});assert.equal(r.sends.length,0);assert.equal(r.renders.length,0);assert.match(r.notices[0][0],/not emailed.*secure payment and signature page/);
r=await scenario();assert.equal(r.sends.length,1);assert.match(r.sends[0][2],/invoice-pay/);assert.match(r.sends[0][4],/invoice-pay/);assert.ok(r.sends[0][3]);
r=await scenario({pdfFails:true});assert.equal(r.sends.length,1);assert.match(r.sends[0][4],/invoice-pay/);assert.equal(r.sends[0][3],null);
r=await scenario({type:'estimate',linkFails:true});assert.equal(r.links.length,0);assert.equal(r.sends.length,1);
console.log('Invoice email: 4 real-handler cases PASS; failed payment/signature link preparation blocks sending');
