import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {downloadProviderRecording, validatedRecordingUrl, parseRecordingHosts, MAX_RECORDING_BYTES} from '../supabase/functions/_shared/provider-recording-download.mjs';

// No live provider, network, account, storage or customer data is used.
globalThis.fetch=async()=>{throw new Error('Unexpected live network access in recording audit');};
const host='media.provider.example.com';
const url='https://'+host+'/recording.wav?signature=PRIVATE_TEST_VALUE';
const wav=new Uint8Array(52); const w=new DataView(wav.buffer);
for(const [at,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']]) for(let i=0;i<text.length;i++)wav[at+i]=text.charCodeAt(i);
w.setUint32(4,44,true);w.setUint32(16,16,true);w.setUint16(20,1,true);w.setUint16(22,1,true);w.setUint32(24,8000,true);w.setUint32(28,16000,true);w.setUint16(32,2,true);w.setUint16(34,16,true);w.setUint32(40,8,true);
let n=0;
async function check(name,fn){await fn();n++;console.log('PASS '+name);}
const response=(bytes=wav,headers={},status=200)=>new Response(bytes,{status,headers:{'content-type':'audio/wav',...headers}});
const run=(fetchImpl,options={})=>downloadProviderRecording(url,{allowedHosts:host,fetchImpl,...options});
const rejects=(fn,code)=>assert.rejects(fn,e=>e.message===code);

await check('Missing host approval fails closed before any request',async()=>{
  let requests=0;await rejects(()=>downloadProviderRecording(url,{fetchImpl:async()=>{requests++;return response();}}),'recording_hosts_not_configured');assert.equal(requests,0);
});
await check('Exact hostname matching and comma-separated approved hosts',()=>{
  assert.deepEqual([...parseRecordingHosts(' '+host.toUpperCase()+', audio.provider.example.com ')],[host,'audio.provider.example.com']);
  assert.equal(validatedRecordingUrl(url,host).hostname,host);
});
await check('Invalid host configurations cannot broaden the allowlist',()=>{
  for(const config of ['*','*.example.com','https://'+host,host+':443',host+'/path',host+',','127.0.0.1','[::1]','localhost','metadata.internal','x.local', 'x'.repeat(4097)]) assert.throws(()=>parseRecordingHosts(config));
});
await check('Subdomains, suffix lookalikes and unrelated hosts are rejected',()=>{
  for(const candidate of ['https://child.'+host+'/x','https://'+host+'.attacker.com/x','https://attacker.com/'+host])assert.throws(()=>validatedRecordingUrl(candidate,host));
});
await check('IP literals including alternative and IPv6 encodings are rejected',()=>{
  for(const ip of ['127.0.0.2','2130706433','0x7f000001','10.0.0.1','169.254.169.254','192.168.1.1','172.16.0.1','[::1]','[::ffff:127.0.0.1]','[fd00::1]'])assert.throws(()=>validatedRecordingUrl('https://'+ip+'/x',host));
});
await check('HTTP, credentials, fragments, odd ports and parser control characters are rejected',()=>{
  for(const candidate of ['http://'+host+'/x','https://u:p@'+host+'/x','https://'+host+':8443/x',url+'#x','https://'+host+'/a\nb','https://'+host+'\\@attacker.com/x',' '+url,'https://'+host+'/x'+'a'.repeat(8192)])assert.throws(()=>validatedRecordingUrl(candidate,host));
});
await check('Signed query is preserved, not moved into headers or logs',async()=>{
  await run(async(target,options)=>{assert.equal(target,url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.cache,'no-store');assert.equal(options.headers,undefined);return response();});
});
await check('Valid WAV bytes and durable non-sensitive metadata are returned',async()=>{
  const result=await run(async()=>response());assert.deepEqual(result.bytes,wav);assert.equal(result.ext,'wav');assert.equal(result.contentType,'audio/wav');assert.equal(result.host,host);assert.deepEqual(Object.keys(result).sort(),['bytes','contentType','ext','host']);
});
await check('Known exact-size Content-Length is accepted',async()=>{assert.equal((await run(async()=>response(wav,{'content-length':String(wav.length)}))).bytes.length,wav.length);});
await check('No Content-Length is required for bounded chunked audio',async()=>{
  let i=0;const chunks=[wav.slice(0,5),wav.slice(5,30),wav.slice(30)];
  const stream=new ReadableStream({pull(c){i<chunks.length?c.enqueue(chunks[i++]):c.close();}});
  assert.deepEqual((await run(async()=>new Response(stream,{headers:{'content-type':'audio/wav'}}))).bytes,wav);
});
await check('Every redirect status is rejected without a second request',async()=>{
  for(const status of [301,302,303,307,308]){let requests=0;await rejects(()=>run(async()=>{requests++;return response(wav,{location:'https://127.0.0.1/'},status);}), 'recording_response_rejected');assert.equal(requests,1);}
});
await check('Unexpected already-followed response is rejected',async()=>{
  const r=response();Object.defineProperty(r,'redirected',{value:true});await rejects(()=>run(async()=>r),'recording_response_rejected');
});
await check('Unexpected final response URL is rejected',async()=>{
  const r=response();Object.defineProperty(r,'url',{value:'https://attacker.com/audio'});await rejects(()=>run(async()=>r),'recording_response_rejected');
});
await check('Expired URLs, server errors and partial responses do not return an asset',async()=>{
  for(const status of [401,403,404,429,500,206])await rejects(()=>run(async()=>response(wav,{},status)), 'recording_response_rejected');
});
await check('Filename extensions do not authorize HTML, JSON or binary downloads',async()=>{
  for(const type of ['text/html','application/json','application/octet-stream','image/svg+xml','text/plain'])await rejects(()=>downloadProviderRecording('https://'+host+'/fake.mp3',{allowedHosts:host,fetchImpl:async()=>response(wav,{'content-type':type})}),'recording_media_type_rejected');
});
await check('Supported MIME aliases are normalized without relying on URL suffix',async()=>{
  assert.equal((await run(async()=>response(wav,{'content-type':'AUDIO/X-WAV; charset=binary'}))).ext,'wav');
});
await check('HTML disguised with an audio MIME type is rejected by format sanity check',async()=>{
  await rejects(()=>run(async()=>response(new TextEncoder().encode('<!DOCTYPE html><html>not a recording</html>'))),'recording_format_rejected');
});
await check('Valid declared size over the cap is rejected before reading body',async()=>{
  let reads=0,cancels=0;const fake={status:200,redirected:false,url:'',headers:new Headers({'content-type':'audio/wav','content-length':'65'}),body:{getReader(){reads++;},cancel(){cancels++;return Promise.resolve();}}};
  await rejects(()=>run(async()=>fake,{maxBytes:64}),'recording_size_rejected');assert.equal(reads,0);assert.equal(cancels,1);
});
await check('Malformed, negative, zero and unsafe Content-Length values fail',async()=>{
  for(const size of ['NaN','Infinity','-1','0','1.5','9007199254740992'])await rejects(()=>run(async()=>response(wav,{'content-length':size})),'recording_size_rejected');
});
await check('Streaming over limit cancels before retaining an oversized chunk',async()=>{
  let reads=0,cancels=0;const reader={async read(){reads++;return {done:false,value:reads===1?wav:new Uint8Array(20)};},cancel(){cancels++;return Promise.resolve();},releaseLock(){}};
  const fake={status:200,redirected:false,url:'',headers:new Headers({'content-type':'audio/wav'}),body:{getReader(){return reader;}}};
  await rejects(()=>run(async()=>fake,{maxBytes:64}),'recording_size_rejected');assert.equal(reads,2);assert.equal(cancels,1);
});
await check('Exact byte limit succeeds',async()=>{assert.equal((await run(async()=>response(),{maxBytes:wav.length})).bytes.length,wav.length);});
await check('A lying small Content-Length cannot bypass stream limit',async()=>{await rejects(()=>run(async()=>response(wav,{'content-length':'1'}),{maxBytes:40}),'recording_size_rejected');});
await check('Truncated identity-encoded Content-Length is rejected',async()=>{await rejects(()=>run(async()=>response(wav,{'content-length':'60'})),'recording_body_incomplete');});
await check('Decoded compressed bytes still obey cap without false length comparison',async()=>{
  const result=await run(async()=>response(wav,{'content-length':'20','content-encoding':'gzip'}));assert.equal(result.bytes.length,wav.length);
});
await check('Empty media and missing response body are rejected',async()=>{
  await rejects(()=>run(async()=>response(new Uint8Array())),'recording_body_empty');await rejects(()=>run(async()=>new Response(null,{headers:{'content-type':'audio/wav'}})),'recording_body_missing');
});
await check('Fetch timeout aborts and settles even if the adapter does not settle',async()=>{
  let signal;await rejects(()=>run(async(_,options)=>{signal=options.signal;return new Promise(()=>{});},{timeoutMs:15}),'recording_download_timeout');assert.equal(signal.aborted,true);
});
await check('Body timeout cancels and releases the reader',async()=>{
  let cancelled=0,released=0;const fake={status:200,redirected:false,url:'',headers:new Headers({'content-type':'audio/wav'}),body:{getReader(){return {read(){return new Promise(()=>{});},cancel(){cancelled++;return Promise.resolve();},releaseLock(){released++;}};}}};
  await rejects(()=>run(async()=>fake,{timeoutMs:15}),'recording_download_timeout');assert.equal(cancelled,1);assert.equal(released,1);
});
await check('Native network errors do not expose a signed URL',async()=>{
  await rejects(()=>run(async()=>{throw new Error('Fetch failed '+url);}), 'recording_download_failed');
});
await check('Synchronous transport and stream failures are sanitized',async()=>{
  await rejects(()=>run(()=>{throw new Error(url);}), 'recording_download_failed');
  await rejects(()=>run(async()=>new Response(new ReadableStream({start(c){c.error(new Error(url));}}),{headers:{'content-type':'audio/wav'}})), 'recording_download_failed');
});
await check('Limits cannot be increased beyond production ceilings',async()=>{
  for(const maxBytes of [0,-1,1.5,NaN,MAX_RECORDING_BYTES+1])await rejects(()=>run(async()=>response(),{maxBytes}),'invalid_recording_limits');
  for(const timeoutMs of [0,-1,1.5,15001])await rejects(()=>run(async()=>response(),{timeoutMs}),'invalid_recording_limits');
});
await check('Supported binary signatures pass; mismatched signatures fail',async()=>{
  const enc=s=>new TextEncoder().encode(s);
  for(const [type,bytes,ext] of [
    ['audio/mpeg',enc('ID3\0\0\0\0\0\0\0'),'mp3'],['audio/mp4',new Uint8Array([0,0,0,24,102,116,121,112,0,0,0,0]),'m4a'],
    ['audio/ogg',enc('OggS\0\0\0\0'),'ogg'],['audio/opus',enc('OggS\0\0\0\0'),'opus'],
    ['audio/aac',new Uint8Array([255,241,80,128,0,0,0]),'aac'],['audio/flac',enc('fLaC\0\0\0\0'),'flac'],
    ['audio/webm',new Uint8Array([26,69,223,163,0,0,0,0]),'webm']]){
    assert.equal((await run(async()=>response(bytes,{'content-type':type}))).ext,ext);
    await rejects(()=>run(async()=>response(wav,{'content-type':type})),'recording_format_rejected');
  }
});
await check('Repeated failures retain no timer or unexpected side effects',async()=>{
  for(let i=0;i<20;i++)await rejects(()=>run(async()=>response(wav,{'content-type':'text/html'})),'recording_media_type_rejected');
});
if(!process.argv.includes('--module-only')){
  for(const name of ['sync-inkbox-calls','inkbox-webhook']){
    const source=readFileSync(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8');
    await check(name+' uses shared downloader and server-side host approval',()=>{
      assert.match(source,/import \{ downloadProviderRecording \} from "\.\.\/_shared\/provider-recording-download\.mjs"/);
      assert.match(source,/await downloadProviderRecording\(recordingUrl,/);assert.match(source,/Deno\.env\.get\("INKBOX_RECORDING_ALLOWED_HOSTS"\)/);
    });
    await check(name+' preserves atomic attachment and removes unsafe full-buffer download',()=>{
      assert.match(source,/return await persistProviderRecording\(db,callId,asset\)/);
      assert.doesNotMatch(source,/r\.arrayBuffer\(|redirect:"follow"|function safeRecordingUrl\(|function recordingExt\(/);
      assert.match(source,/existing\?\.recording_asset\?\.path/);
    });
  }
}
console.log(`Recording download audit: ${n}/${n} PASS (synthetic transports; no live provider audio or data writes)`);
