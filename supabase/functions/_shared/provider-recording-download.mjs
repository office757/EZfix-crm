/**
 * Fail-closed recording downloads. Approve exact provider-controlled hostnames
 * server-side after Inkbox documents the audio endpoint; no guessed default.
 * Never put API credentials here or log signed source URLs. Redirects are not
 * followed. The byte cap is enforced while reading, not after arrayBuffer().
 */
export const MAX_RECORDING_BYTES = 104857600;
const TYPES = new Map([
  ['audio/mpeg', 'mp3'], ['audio/mp3', 'mp3'],
  ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/wave', 'wav'],
  ['audio/mp4', 'm4a'], ['audio/x-m4a', 'm4a'], ['audio/aac', 'aac'],
  ['audio/ogg', 'ogg'], ['application/ogg', 'ogg'], ['audio/opus', 'opus'],
  ['audio/webm', 'webm'], ['video/webm', 'webm'], ['video/mp4', 'mp4'],
  ['audio/flac', 'flac'], ['audio/x-flac', 'flac']
]);
const fail = code => new Error(code);
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/;
const LOCAL = /(?:^|\.)(?:localhost|local|internal|invalid|test|example|lan|home|onion)$/;

/** Exact DNS names only. No wildcards, URLs, ports, IP literals or suffix rules. */
export function parseRecordingHosts(value) {
  if (typeof value !== 'string' || !value.trim()) throw fail('recording_hosts_not_configured');
  if (value.length > 4096) throw fail('invalid_recording_hosts');
  const hosts = value.split(',').map(h => h.trim().toLowerCase());
  if (hosts.some(h => !DOMAIN.test(h) || LOCAL.test(h))) throw fail('invalid_recording_hosts');
  return new Set(hosts);
}

export function validatedRecordingUrl(value, allowedHosts) {
  const hosts = parseRecordingHosts(allowedHosts);
  if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x20\x7f\\]/.test(value)) throw fail('invalid_recording_url');
  let u;
  try { u = new URL(value); } catch { throw fail('invalid_recording_url'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || !hosts.has(u.hostname)) {
    throw fail('recording_url_not_allowed');
  }
  return u;
}

/** A media signature is a format sanity check, NOT full decoding or malware scanning. */
function matchesFormat(bytes, ext) {
  const ascii = (at, text) => bytes.length >= at + text.length && [...text].every((c, i) => bytes[at+i] === c.charCodeAt(0));
  if (ext === 'mp3') return ascii(0, 'ID3') || (bytes.length > 3 && bytes[0] === 255 && (bytes[1] & 224) === 224 && (bytes[1] & 6) !== 0);
  if (ext === 'wav') return (ascii(0, 'RIFF') || ascii(0, 'RF64')) && ascii(8, 'WAVE');
  if (ext === 'm4a' || ext === 'mp4') return ascii(4, 'ftyp');
  if (ext === 'aac') return bytes.length > 3 && bytes[0] === 255 && (bytes[1] & 246) === 240;
  if (ext === 'ogg' || ext === 'opus') return ascii(0, 'OggS');
  if (ext === 'flac') return ascii(0, 'fLaC');
  if (ext === 'webm') return bytes.length >= 4 && [26, 69, 223, 163].every((v, i) => bytes[i] === v);
  return false;
}

/**
 * @param {string} value Signed audio URL from an authenticated provider payload.
 * @param {{allowedHosts:string, fetchImpl?:typeof fetch, maxBytes?:number, timeoutMs?:number}} options
 * @returns {Promise<{bytes:Uint8Array,contentType:string,ext:string,host:string}>}
 */
export async function downloadProviderRecording(value, {allowedHosts, fetchImpl=globalThis.fetch, maxBytes=MAX_RECORDING_BYTES, timeoutMs=15000}={}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RECORDING_BYTES || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw fail('invalid_recording_limits');
  const u = validatedRecordingUrl(value, allowedHosts);
  const controller = new AbortController();
  let reader, response, total=0;
  const chunks=[];
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(fail('recording_download_timeout')); }, timeoutMs);
  });
  const withinDeadline = promise => Promise.race([promise, expired]);
  try {
    response = await withinDeadline(fetchImpl(u.href, {
      method:'GET', redirect:'error', credentials:'omit', referrerPolicy:'no-referrer',
      cache:'no-store', signal:controller.signal
    }));
    if (response.status !== 200 || response.redirected || (response.url && response.url !== u.href)) throw fail('recording_response_rejected');
    const contentType=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    const ext=TYPES.get(contentType);
    // A .mp3 suffix must never make an HTML, JSON or unknown payload acceptable.
    if (!ext) throw fail('recording_media_type_rejected');
    const length=response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length)<1 || Number(length)>maxBytes)) throw fail('recording_size_rejected');
    if (!response.body) throw fail('recording_body_missing');
    reader=response.body.getReader();
    for (;;) {
      const {done,value:chunk}=await withinDeadline(reader.read());
      if (done) break;
      if (!(chunk instanceof Uint8Array) || chunk.byteLength>maxBytes-total) throw fail('recording_size_rejected');
      if (chunk.byteLength) { total+=chunk.byteLength; chunks.push(chunk); }
    }
    if (!total) throw fail('recording_body_empty');
    const encoding=response.headers.get('content-encoding');
    if (length !== null && (!encoding || encoding.toLowerCase()==='identity') && Number(length)!==total) throw fail('recording_body_incomplete');
    const bytes=new Uint8Array(total);
    let offset=0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
    if (!matchesFormat(bytes,ext)) throw fail('recording_format_rejected');
    return {bytes,contentType,ext,host:u.hostname};
  } catch (error) {
    controller.abort();
    // Native fetch errors may contain a signed URL; expose only our fixed codes.
    const code=error instanceof Error && /^recording_[a-z_]+$/.test(error.message) ? error.message : 'recording_download_failed';
    throw fail(code);
  } finally {
    clearTimeout(timer);
    if (reader) {
      try { void reader.cancel().catch(()=>{}); } catch {}
      try { reader.releaseLock(); } catch {}
    } else if (response?.body) {
      try { void response.body.cancel().catch(()=>{}); } catch {}
    }
    chunks.length=0;
  }
}
