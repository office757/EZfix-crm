import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Exercise the actual worker up to an empty queue, with no live data or network.
const source=readFileSync(new URL('../supabase/functions/generate-transcript-replay/index.ts',import.meta.url),'utf8');
const executable=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''),{mode:'strip'});
async function run({bucket={public:false,allowed_mime_types:['audio/wav']},error=null,throws=false,authorized=true,configured=true}={}){
  const trace=[];let handler;
  const db={storage:{async getBucket(id){trace.push('bucket:'+id);if(throws)throw Error('PRIVATE_STORAGE_DETAIL');return {data:bucket,error};}},from(table){
    trace.push('query:'+table);
    return {select(){return this;},eq(){return this;},gte(){return Promise.resolve({count:0,error:null});},not(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});}};
  }};
  const context=vm.createContext({Request,Response,Date,Number,console,createClient:()=>db,
    planTranscriptReplay(){throw Error('Unexpected planning');},renderTranscriptReplay(){throw Error('Unexpected paid generation');},createOpenAIReplaySynthesizer(){throw Error('Unexpected TTS');},
    Deno:{env:{get:key=>({EZFIX_CALL_SYNC_CRON_TOKEN:'synthetic-token',OPENAI_API_KEY:configured?'synthetic-key':'',SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic'})[key]},serve(fn){handler=fn;}}});
  new vm.Script(executable).runInContext(context);
  const response=await handler(new Request('https://example.invalid',{method:'POST',headers:authorized?{'x-ezfix-cron-token':'synthetic-token'}:{}}));
  return {status:response.status,body:await response.json(),trace};
}
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
await check('Actual image/PDF-only production configuration is blocked before queue reads or speech',async()=>{
  const r=await run({bucket:{public:false,allowed_mime_types:['image/jpeg','application/pdf']}});
  assert.equal(r.status,503);assert.equal(r.body.error,'replay_storage_wav_not_allowed');assert.deepEqual(r.trace,['bucket:crm-assets']);
});
await check('Public storage cannot receive private call transcripts',async()=>{const r=await run({bucket:{public:true,allowed_mime_types:['audio/wav']}});assert.equal(r.body.error,'replay_storage_must_be_private');assert.deepEqual(r.trace,['bucket:crm-assets']);});
await check('Missing bucket and storage errors fail closed without leaking details',async()=>{for(const options of [{bucket:null},{error:{message:'PRIVATE_STORAGE_DETAIL'}},{throws:true}]){const r=await run(options);assert.equal(r.status,503);assert.equal(r.body.error,'replay_storage_unavailable');assert.doesNotMatch(JSON.stringify(r),/PRIVATE_STORAGE_DETAIL/);assert.deepEqual(r.trace,['bucket:crm-assets']);}});
await check('Explicit WAV, audio wildcard and unrestricted MIME configurations reach the existing queue',async()=>{for(const types of [['audio/wav'],['audio/*'],['*/*'],null,undefined]){const r=await run({bucket:{public:false,allowed_mime_types:types}});assert.equal(r.status,200);assert.equal(r.body.queueEmpty,true);assert.deepEqual(r.trace,['bucket:crm-assets','query:calls','query:calls']);}});
await check('Malformed MIME configuration is blocked',async()=>{for(const types of [[],{},'audio/wav']){const r=await run({bucket:{public:false,allowed_mime_types:types}});assert.equal(r.body.error,'replay_storage_wav_not_allowed');}});
await check('Unauthorized requests never inspect storage',async()=>{const r=await run({authorized:false});assert.equal(r.status,401);assert.deepEqual(r.trace,[]);});
await check('Missing speech credentials preserve the existing safe response',async()=>{const r=await run({configured:false});assert.equal(r.body.configured,false);assert.deepEqual(r.trace,[]);});
console.log(`Replay storage preflight: ${passed}/${passed} PASS`);
