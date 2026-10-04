import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const lock=html.slice(html.indexOf('const documentDeliveryPending ='),html.indexOf('async function emailDocumentOnce('));
const sms=html.slice(html.indexOf('async function textDocument('),html.indexOf('async function textDocumentOnce('));
const notices=[],calls=[];
let release;
const pending=new Promise(resolve=>release=resolve);
const context=vm.createContext({console:{error(){}},toast:(...v)=>notices.push(v),
  emailDocumentOnce:async(type,id)=>{calls.push(['email',id]);await pending;return 'accepted';},
  textDocumentOnce:async(type,id)=>{calls.push(['sms',id]);await pending;return 'accepted';}});
vm.runInContext(lock+sms,context);
const a=context.emailDocument('invoice','one');
await context.emailDocument('invoice','one');assert.equal(calls.length,1);
const b=context.textDocument('invoice','one'),c=context.emailDocument('invoice','two');
assert.equal(calls.length,3);release();assert.equal(await a,'accepted');await Promise.all([b,c]);
await context.emailDocument('invoice','one');assert.equal(calls.length,4);
context.emailDocumentOnce=async()=>{throw Error('Preparation failed');};
await context.emailDocument('invoice','one');assert.match(notices.at(-1)[0],/Preparation failed/);
context.emailDocumentOnce=async()=>{calls.push(['retry']);return 'accepted';};
assert.equal(await context.emailDocument('invoice','one'),'accepted');assert.equal(calls.length,5);
assert.match(notices[0][0],/already being sent/);
console.log('Document delivery lock: duplicate taps blocked, channels/documents independent, success and failure release the lock PASS');
