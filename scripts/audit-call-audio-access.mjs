import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {installTranscriptReplayUi} from './build-transcript-replay-ui.mjs';
const html=installTranscriptReplayUi(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
const section=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
let record={id:'call',transcript:[],transcriptReplayStatus:'pending'},modal=null,fail=false,refreshes=0;
const notices=[];
const c=vm.createContext({window:{},document:{getElementById:()=>({textContent:''})},
  refreshCollection:async()=>{refreshes++;if(fail)throw Error('offline');record={...record,transcriptReplayStatus:'ready',transcriptReplayAsset:{url:'https://example.test/fresh-signed-audio'}};},
  getOne:()=>record,canManageCallRecording:()=>true,esc:x=>String(x),showModal:m=>{modal=m;},closeModal:()=>{},toast:s=>notices.push(s)
});
vm.runInContext(section('function callRecordingUrl(', 'function callRecordingFileOk(')+section('function callAudioStatusLabel(', 'function renderCallHistory(')+section('async function viewCallDetail(', 'window.viewCallDetail ='),c);
let n=0;async function check(name,fn){await fn();n++;console.log('PASS '+name);}
await check('Opening a call refreshes audio instead of retaining a stale pending state',async()=>{
  await vm.runInContext("viewCallDetail('call')",c);assert.equal(refreshes,1);assert.match(modal.body,/fresh-signed-audio/);
});
await check('Playable synthetic replay appears before the unavailable original-recording panel',()=>{
  assert.ok(modal.body.indexOf('AI transcript replay')<modal.body.indexOf('Inkbox has not supplied'));
  assert.match(modal.body,/not the original call recording/);
});
await check('Refresh failures give an actionable error instead of a stale player',async()=>{
  modal=null;fail=true;await vm.runInContext("viewCallDetail('call')",c);assert.equal(modal,null);assert.match(notices.at(-1),/try again/);
});
await check('Call list labels distinguish original, synthetic, pending and absent audio',()=>{
  const run=code=>vm.runInContext(code,c);
  assert.equal(run("callAudioStatusLabel({recordingUrl:'url'})"),'Original recording available');
  assert.equal(run("callAudioStatusLabel({transcriptReplayStatus:'ready'})"),'AI transcript replay ready');
  assert.equal(run("callAudioStatusLabel({transcriptReplayStatus:'pending'})"),'AI transcript replay preparing');
  assert.equal(run('callAudioStatusLabel({})'),'No call audio available');
});
console.log(`Call audio access audit: ${n}/${n} PASS`);
