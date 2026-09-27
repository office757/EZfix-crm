/**
 * Attach a newly uploaded provider recording without replacing an existing asset.
 * The webhook and reconciliation worker may run concurrently. Only the worker
 * whose conditional UPDATE succeeds owns the attachment; the loser removes only
 * its own upload. An ambiguous database response is reconciled before deleting
 * anything, so a committed recording is never removed merely after a timeout.
 */
export async function persistProviderRecording(db, callId, asset) {
  if (!asset?.path || !asset.path.startsWith('call-recordings/provider/')) {
    throw new Error('Invalid provider recording storage path');
  }

  let saved = null;
  let saveError = null;
  try {
    const result = await db.from('calls')
      .update({ recording_asset: asset })
      .eq('provider_call_id', callId)
      .is('recording_asset', null)
      .select('id,recording_asset')
      .maybeSingle();
    saved = result.data;
    saveError = result.error;
  } catch (error) {
    // The UPDATE may have committed before the transport failed.
    saveError = error;
  }

  if (!saveError && saved?.recording_asset?.path === asset.path) {
    return saved.recording_asset;
  }

  let current;
  try {
    const result = await db.from('calls')
      .select('id,recording_asset')
      .eq('provider_call_id', callId)
      .maybeSingle();
    if (result.error) throw result.error;
    current = result.data;
  } catch {
    // Do not delete an upload that might now be referenced by the call.
    throw new Error('Recording save could not be verified; uploaded audio retained');
  }

  if (current?.recording_asset?.path === asset.path) {
    return current.recording_asset;
  }

  // Our unique upload is not the attached asset. Never remove the winner's file.
  try {
    const result = await db.storage.from('crm-assets').remove([asset.path]);
    if (result.error) throw result.error;
  } catch {
    throw new Error('Unattached provider recording cleanup failed');
  }

  if (current?.recording_asset?.path) return current.recording_asset;
  if (saveError) throw new Error('Provider recording could not be attached');
  throw new Error('Call unavailable or provider recording was not attached');
}
