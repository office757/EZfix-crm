import { readFileSync, writeFileSync } from 'node:fs';

const MARK='/* EZFIX_TRANSCRIPT_REPLAY_UI_V1 */';
const OLD_COLS="calls:['id','mode','outcome','summary','duration_sec','transcript','lead_id','customer_id','provider_call_id','direction','remote_number','local_number','status','started_at','ended_at','recording_url','recording_asset','provider_data','lead_extraction_status','lead_extraction','lead_extracted_at','created_at']";
const NEW_COLS="calls:['id','mode','outcome','summary','duration_sec','transcript','lead_id','customer_id','provider_call_id','direction','remote_number','local_number','status','started_at','ended_at','recording_url','recording_asset','transcript_replay_asset','transcript_replay_status','transcript_replay_source_hash','transcript_replay_error','transcript_replay_updated_at','transcript_replay_generation','provider_data','lead_extraction_status','lead_extraction','lead_extracted_at','created_at']";
const OLD_BODY="showModal({ title: 'Call details', wide: true, body: \`${audio}${leadPanel}<div class=\"muted\"";
const NEW_BODY="showModal({ title: 'Call details', wide: true, body: \`${audio}${replayPanel}${leadPanel}<div class=\"muted\"";
const AUDIO_ANCHOR="  const lead = c.leadId ? getOne('leads', c.leadId) : null;";
const REPLAY_BLOCK=`/* EZFIX_TRANSCRIPT_REPLAY_UI_V1 */
  const replayAsset=c.transcriptReplayAsset&&typeof c.transcriptReplayAsset==='object'?c.transcriptReplayAsset:null;
  const replayUrl=replayAsset?.url||'';
  const replayStatus=String(c.transcriptReplayStatus||'');
  const replayNote='<div class="muted" style="font-size:11.5px;margin-top:5px">AI-generated reading of the transcript — not the original call recording. Voices and timing are synthetic.</div>';
  const replayPanel=replayUrl
    ?\`<div class="panel" style="margin-bottom:14px"><div class="panel-body pad"><b style="font-size:12px">AI transcript replay</b>\${replayNote}<audio controls preload="metadata" style="width:100%;margin-top:8px" src="\${esc(replayUrl)}"></audio></div></div>\`
    : replayStatus==='pending'||replayStatus==='generating'
      ?\`<div class="panel" style="margin-bottom:14px"><div class="panel-body pad"><b style="font-size:12px">AI transcript replay</b>\${replayNote}<div style="font-size:12px;margin-top:8px">\${replayStatus==='generating'?'Generating automatically…':'Queued for automatic generation.'}</div></div></div>\`
      : replayStatus==='failed'
        ?\`<div class="panel" style="margin-bottom:14px"><div class="panel-body pad"><b style="font-size:12px">AI transcript replay</b>\${replayNote}<div style="font-size:12px;margin-top:8px">Generation failed. The original transcript is unchanged.</div></div></div>\`
        :'';
  const lead = c.leadId ? getOne('leads', c.leadId) : null;`;

export function installTranscriptReplayUi(html){
  if(html.includes(MARK)) return html;
  if((html.split(OLD_COLS).length-1)!==1) throw new Error('Transcript replay UI: calls columns target mismatch');
  if((html.split(AUDIO_ANCHOR).length-1)!==1) throw new Error('Transcript replay UI: call detail target mismatch');
  if((html.split(OLD_BODY).length-1)!==1) throw new Error('Transcript replay UI: modal body target mismatch');
  return html.replace(OLD_COLS,NEW_COLS).replace(AUDIO_ANCHOR,REPLAY_BLOCK).replace(OLD_BODY,NEW_BODY);
}
export function stripTranscriptReplayUi(html){
  return html.replace(NEW_BODY,OLD_BODY).replace(REPLAY_BLOCK,AUDIO_ANCHOR).replace(NEW_COLS,OLD_COLS);
}
if(import.meta.url===new URL(process.argv[1],'file:///').href){
  const p=new URL('../index.html',import.meta.url); const src=readFileSync(p,'utf8'); const out=installTranscriptReplayUi(src);
  if(out!==src) writeFileSync(p,out,'utf8');
  console.log('Transcript replay UI built; original recording UI remains separate.');
}