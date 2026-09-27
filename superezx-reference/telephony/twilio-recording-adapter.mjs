import { TELEPHONY_RECORDING_CONTRACT_VERSION, validateNormalizedRecordingEvent, createTelephonyRecordingProvider } from './provider-contract.mjs';

const SID_RE=/^RE[a-fA-F0-9]{32}$/;
const CALL_RE=/^CA[a-fA-F0-9]{32}$/;
const STATUS_MAP=Object.freeze({'in-progress':'processing','completed':'ready','failed':'failed','absent':'absent'});

function clean(v,max=256){return typeof v==='string'?v.trim().slice(0,max):''}
function integer(v){const s=String(v??'').trim();return /^\d+$/.test(s)?Number(s):null}

export function normalizeTwilioRecordingWebhook({tenantId, body, signatureVerified, receivedAt=new Date().toISOString()}={}){
  if(signatureVerified!==true) throw new Error('unverified_twilio_webhook');
  if(typeof tenantId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) throw new Error('invalid_tenant_id');
  if(!body || typeof body!=='object' || Array.isArray(body)) throw new Error('invalid_twilio_payload');
  const recordingSid=clean(body.RecordingSid),callSid=clean(body.CallSid),rawStatus=clean(body.RecordingStatus).toLowerCase();
  if(!SID_RE.test(recordingSid)||!CALL_RE.test(callSid)||!STATUS_MAP[rawStatus]) throw new Error('invalid_twilio_payload');
  const duration=body.RecordingDuration==null||body.RecordingDuration===''?null:integer(body.RecordingDuration);
  const channels=body.RecordingChannels==null||body.RecordingChannels===''?null:integer(body.RecordingChannels);
  const track=clean(body.RecordingTrack||body.Track,32)||null;
  let mediaRef=null;
  if(rawStatus==='completed'){
    const rawUrl=clean(body.RecordingUrl,2048);
    let u;
    try{u=new URL(rawUrl)}catch{throw new Error('invalid_twilio_recording_url')}
    if(u.protocol!=='https:'||u.hostname.toLowerCase()!=='api.twilio.com'||u.username||u.password||u.hash) throw new Error('invalid_twilio_recording_url');
    mediaRef={url:u.toString(),authMode:'twilio_basic',formatOptions:['wav','mp3']};
  }
  return validateNormalizedRecordingEvent({
    version:TELEPHONY_RECORDING_CONTRACT_VERSION,
    tenantId,
    provider:'twilio',
    providerCallId:callSid,
    providerRecordingId:recordingSid,
    status:STATUS_MAP[rawStatus],
    durationSec:duration,
    channels,
    track,
    mediaRef,
    createdAt:receivedAt,
    providerMeta:Object.freeze({accountSid:clean(body.AccountSid,64)||null})
  });
}

export function twilioRecordingDownloadRequest({event,format='mp3',accountSid,apiKey,apiSecret}={}){
  const normalized=validateNormalizedRecordingEvent(event);
  if(normalized.provider!=='twilio'||normalized.status!=='ready'||!normalized.mediaRef) throw new Error('recording_not_ready');
  if(!['wav','mp3'].includes(format)) throw new Error('invalid_recording_format');
  if(typeof accountSid!=='string'||!/^AC[a-fA-F0-9]{32}$/.test(accountSid)) throw new Error('invalid_twilio_credentials');
  if(typeof apiKey!=='string'||!apiKey.trim()||typeof apiSecret!=='string'||!apiSecret) throw new Error('invalid_twilio_credentials');
  const u=new URL(normalized.mediaRef.url);
  u.pathname=u.pathname.replace(/\.(wav|mp3)$/i,'')+'.'+format;
  const auth='Basic '+Buffer.from(apiKey+':'+apiSecret).toString('base64');
  return Object.freeze({url:u.toString(),method:'GET',headers:Object.freeze({Authorization:auth}),expectedContentTypes:format==='mp3'?['audio/mpeg']:['audio/x-wav','audio/wav'],tenantId:normalized.tenantId,providerRecordingId:normalized.providerRecordingId});
}

export const twilioRecordingProvider=createTelephonyRecordingProvider({
  provider:'twilio',
  normalizeRecordingWebhook:normalizeTwilioRecordingWebhook,
  recordingDownloadRequest:twilioRecordingDownloadRequest
});
