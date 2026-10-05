
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {totals,isPaid} from '../supabase/functions/_shared/customer-receipts.mjs';
test('receipt uses applied amounts, proportional tax and discounts',()=>{
 const doc={items:[{qty:2,rate:100},{qty:1,rate:50,taxable:false}],discount:25,tax_rate:6.25,payments:[{amount:100,appliedAmount:96.5,cardFee:3.5},{amount:139.75}]};
 assert.equal(totals(doc).total,236.25);assert.equal(totals(doc).paid,236.25);assert.equal(totals(doc).fees,3.5);assert.equal(isPaid(doc),true);
 assert.equal(isPaid({...doc,payments:[{amount:236.24}]}),false);
 assert.equal(isPaid({...doc,deleted_at:'now'}),false);
 assert.equal(isPaid({items:[],payments:[{amount:500}]}),false);
 assert.throws(()=>totals({...doc,items:[{qty:'bad',rate:1}]}));
});
function harness({fail=false}={}){
 let calls=0;let release;let fullRefreshes=0;const readIds=[];
 const gateway=new Promise(resolve=>release=resolve),nodes=[];
 const c={window:{},CAN_EDIT:true,isTechnicianView:()=>false,isMarketingManager:()=>false,STORE:{invoices:[]},
 invoiceTotal:d=>d.total,balanceDue:d=>d.balance,paidTotal:d=>d.total,paymentCardFee:p=>Number(p.cardFee)||0,
 SB:{functions:{invoke:async()=>{calls++;await gateway;if(fail)throw new Error('Provider busy');return {data:{ok:true,asset:{path:'receipts/one.pdf',filename:'Receipt.pdf'}}};}},from:table=>({select(){assert.equal(table,'invoices');return this},eq(key,id){assert.equal(key,'id');readIds.push(id);this.id=id;return this},maybeSingle:async function(){return {data:{id:this.id,total:100,balance:0,row_version:1,customerReceiptPdf:{path:'receipts/one.pdf'}}};}})},
 fromDbRow:r=>({...r,rowVersion:r.row_version}),refreshCollection:async()=>{fullRefreshes++;return []},replaceStoreRecord:(col,row)=>{const at=c.STORE.invoices.findIndex(i=>i.id===row.id);if(at>=0)c.STORE.invoices[at]=row;},renderExpenses:()=>{},queueMicrotask:()=>{},setInterval:()=>{},
 route:{page:'dashboard'},console,recordTimestamp:d=>Date.parse(d)||0,fmtDate:d=>d,money:n=>'$'+n,
 esc:s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
 getOne:()=>null,emptyState:()=>'',document:{createElement:()=>({innerHTML:''})}};
 vm.createContext(c);vm.runInContext(readFileSync(new URL('../customer-receipts.js',import.meta.url),'utf8'),c);
 return {c,nodes,readIds,get fullRefreshes(){return fullRefreshes;},get calls(){return calls;},release};
}
test('concurrent downloads share one server request and do not build PDFs in the browser',async()=>{
 const h=harness(),a=h.c.window.CustomerReceipts.ensure('i1'),b=h.c.window.CustomerReceipts.ensure('i1');h.release();await Promise.all([a,b]);assert.equal(h.calls,1);
 assert.deepEqual(h.readIds,['i1']);assert.equal(h.fullRefreshes,0);
 h.c.CAN_EDIT=false;await assert.rejects(h.c.window.CustomerReceipts.ensure('i1'));assert.equal(h.calls,1);
});
test('background generation processes a bounded queue and excludes deleted invoices',async()=>{
 const h=harness();h.c.STORE.invoices=[...Array.from({length:6},(_,i)=>({id:'i'+i,total:100,balance:0})),{id:'deleted',total:100,balance:0,deletedAt:'now'}];
 h.c.window.CustomerReceipts.sync();assert.equal(h.calls,2);h.c.window.CustomerReceipts.sync();assert.equal(h.calls,2);
 h.release();await new Promise(r=>setImmediate(r));h.c.window.CustomerReceipts.sync();assert.equal(h.calls,4);await new Promise(r=>setImmediate(r));h.c.window.CustomerReceipts.sync();await new Promise(r=>setImmediate(r));assert.equal(h.calls,6);assert.equal(h.fullRefreshes,0);
});
test('failed background jobs back off while manual retries remain available',async()=>{
 const h=harness({fail:true});h.c.STORE.invoices=[{id:'i1',total:100,balance:0}];h.c.window.CustomerReceipts.sync();h.release();await new Promise(r=>setImmediate(r));h.c.window.CustomerReceipts.sync();assert.equal(h.calls,1);
 await assert.rejects(h.c.window.CustomerReceipts.ensure('i1'));assert.equal(h.calls,2);
});
test('customer receipt module is loaded by the production CRM after its export helpers',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/<script src="\/customer-receipts\.js/);assert(html.indexOf('<script src="/receipt-archive-utils.js')<html.indexOf('<script src="/customer-receipts.js'));
});
test('customer receipts remain separate from supplier receipts, filter paid invoices and escape customer names',()=>{
 const h=harness();h.c.CAN_EDIT=false;
 h.c.STORE.invoices=[{id:'paid',number:'INV-1',customerName:'<script>bad</script>',total:100,balance:0,date:'2026-09-29',customerReceiptPdf:{path:'one.pdf'}},{id:'unpaid',number:'UNPAID',total:100,balance:10}];
 let node;h.c.renderExpenses({prepend:n=>node=n},{});
 assert.match(node.innerHTML,/Customer receipts/);assert.match(node.innerHTML,/INV-1/);assert.doesNotMatch(node.innerHTML,/UNPAID|<script>/);assert.match(node.innerHTML,/&lt;script&gt;/);
});
