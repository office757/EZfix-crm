export const TELEPHONY_RECORDING_CONTRACT_VERSION = 'superezx-telephony-recording-v1';

const PROVIDER_STATUSES = new Set(['processing','ready','failed','absent']);

export function validateNormalizedRecordingEvent(event){
  if(!event || typeof event!=='object' || Array.isArray(event)) throw new Error('invalid_recording_event');
  const required=['version','tenantId','provider','providerCallId','providerRecordingId','status','createdAt'];
  for(const key of required) if(typeof event[key]!=='string' || !event[key].trim()) throw new Error('invalid_recording_event');
  if(event.version!==TELEPHONY_RECORDING_CONTRACT_VERSION) throw new Error('unsupported_recording_contract');
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(event.tenantId)) throw new Error('invalid_tenant_id');
  if(!/^[a-z0-9_-]{1,40}$/.test(event.provider)) throw new Error('invalid_provider');
  if(!PROVIDER_STATUSES.has(event.status)) throw new Error('invalid_recording_status');
  if(event.durationSec!=null && (!Number.isFinite(event.durationSec)||event.durationSec<0||event.durationSec>86400)) throw new Error('invalid_duration');
  if(event.channels!=null && ![1,2].includes(event.channels)) throw new Error('invalid_channels');
  if(event.mediaRef!=null){
    if(!event.mediaRef || typeof event.mediaRef!=='object' || Array.isArray(event.mediaRef)) throw new Error('invalid_media_ref');
    if(typeof event.mediaRef.url!=='string' || !event.mediaRef.url.startsWith('https://')) throw new Error('invalid_media_ref');
    if(typeof event.mediaRef.authMode!=='string' || !event.mediaRef.authMode) throw new Error('invalid_media_ref');
  }
  return Object.freeze({...event,mediaRef:event.mediaRef?Object.freeze({...event.mediaRef}):null});
}

export function createTelephonyRecordingProvider(definition){
  const required=['provider','normalizeRecordingWebhook','recordingDownloadRequest'];
  if(!definition || typeof definition!=='object') throw new Error('invalid_provider_adapter');
  for(const key of required) if(typeof definition[key]!== (key==='provider'?'string':'function')) throw new Error('invalid_provider_adapter');
  return Object.freeze({...definition});
}
