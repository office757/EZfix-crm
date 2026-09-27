import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTwilioRecordingWebhook,twilioRecordingDownloadRequest,twilioRecordingProvider} from '../superezx-reference/telephony/twilio-recording-adapter.mjs';
import {validateNormalizedRecordingEvent,TELEPHONY_RECORDING_CONTRACT_VERSION} from '../superezx-reference/telephony/provider-contract.mjs';

const rec='RE'+'a'.repeat(32), call='CA'+'b'.repeat(32), account='AC'+'c'.repeat(32);
const payload=(over={})=>({RecordingSid:rec,CallSid:call,RecordingStatus:'completed',RecordingUrl:'https://api.twilio.com/2010-04-01/Accounts/'+account+'/Recordings/'+rec,RecordingDuration:'42',RecordingChannels:'2',RecordingTrack:'both',AccountSid:account,...over});

test('normalizes completed Twilio recording to provider-neutral contract',()=>{
 const e=normalizeTwilioRecordingWebhook({tenantId:'tenant_1',body:payload(),signatureVerified:true,receivedAt:'2026-09-27T20:00:00Z'});
 assert.equal(e.version,TELEPHONY_RECORDING_CONTRACT_VERSION);assert.equal(e.provider,'twilio');assert.equal(e.status,'ready');assert.equal(e.durationSec,42);assert.equal(e.channels,2);assert.equal(e.mediaRef.authMode,'twilio_basic');
});
test('tenant identity is supplied by trusted connection context, not provider body',()=>{
 const e=normalizeTwilioRecordingWebhook({tenantId:'tenant_A',body:payload({tenantId:'tenant_B'}),signatureVerified:true});assert.equal(e.tenantId,'tenant_A');
});
test('rejects webhook without verified Twilio signature',()=>assert.throws(()=>normalizeTwilioRecordingWebhook({tenantId:'t',body:payload(),signatureVerified:false}),/unverified_twilio_webhook/));
test('rejects malformed recording and call SIDs',()=>{
 assert.throws(()=>normalizeTwilioRecordingWebhook({tenantId:'t',body:payload({RecordingSid:'REbad'}),signatureVerified:true}),/invalid_twilio_payload/);
 assert.throws(()=>normalizeTwilioRecordingWebhook({tenantId:'t',body:payload({CallSid:'CAbad'}),signatureVerified:true}),/invalid_twilio_payload/);
});
test('completed recording requires exact Twilio API HTTPS host',()=>{
 for(const url of ['http://api.twilio.com/x','https://evil.example/x','https://api.twilio.com.evil.example/x'])
   assert.throws(()=>normalizeTwilioRecordingWebhook({tenantId:'t',body:payload({RecordingUrl:url}),signatureVerified:true}),/invalid_twilio_recording_url/);
});
test('processing event carries no media reference',()=>{
 const e=normalizeTwilioRecordingWebhook({tenantId:'t',body:payload({RecordingStatus:'in-progress',RecordingUrl:''}),signatureVerified:true});assert.equal(e.status,'processing');assert.equal(e.mediaRef,null);
});
test('failed and absent status normalize without inventing recording media',()=>{
 for(const status of ['failed','absent']){const e=normalizeTwilioRecordingWebhook({tenantId:'t',body:payload({RecordingStatus:status,RecordingUrl:''}),signatureVerified:true});assert.equal(e.status,status);assert.equal(e.mediaRef,null);}
});
test('dual channels are preserved and impossible channel counts rejected',()=>{
 assert.equal(normalizeTwilioRecordingWebhook({tenantId:'t',body:payload({RecordingChannels:'2'}),signatureVerified:true}).channels,2);
 assert.throws(()=>normalizeTwilioRecordingWebhook({tenantId:'t',body:payload({RecordingChannels:'3'}),signatureVerified:true}),/invalid_channels/);
});
test('download request adds format and server-only basic auth',()=>{
 const e=normalizeTwilioRecordingWebhook({tenantId:'tenant_x',body:payload(),signatureVerified:true});
 const d=twilioRecordingDownloadRequest({event:e,format:'mp3',accountSid:account,apiKey:'SK123',apiSecret:'secret'});
 assert.match(d.url,/\.mp3$/);assert.match(d.headers.Authorization,/^Basic /);assert.equal(d.tenantId,'tenant_x');assert.deepEqual(d.expectedContentTypes,['audio/mpeg']);
});
test('download credentials never enter normalized event',()=>{
 const e=normalizeTwilioRecordingWebhook({tenantId:'t',body:payload(),signatureVerified:true});
 assert.equal(JSON.stringify(e).includes('apiSecret'),false);assert.equal(JSON.stringify(e).includes('SK123'),false);
});
test('download is unavailable until recording status is ready',()=>{
 const e=normalizeTwilioRecordingWebhook({tenantId:'t',body:payload({RecordingStatus:'in-progress',RecordingUrl:''}),signatureVerified:true});
 assert.throws(()=>twilioRecordingDownloadRequest({event:e,accountSid:account,apiKey:'SK',apiSecret:'s'}),/recording_not_ready/);
});
test('provider adapter exposes stable normalized methods',()=>{
 assert.equal(twilioRecordingProvider.provider,'twilio');assert.equal(typeof twilioRecordingProvider.normalizeRecordingWebhook,'function');assert.equal(typeof twilioRecordingProvider.recordingDownloadRequest,'function');assert.ok(Object.isFrozen(twilioRecordingProvider));
});
test('generic contract rejects cross-tenant unsafe identifiers',()=>{
 assert.throws(()=>validateNormalizedRecordingEvent({version:TELEPHONY_RECORDING_CONTRACT_VERSION,tenantId:'../tenant',provider:'twilio',providerCallId:call,providerRecordingId:rec,status:'ready',createdAt:new Date().toISOString()}),/invalid_tenant_id/);
});
