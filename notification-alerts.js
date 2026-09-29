/* Owner lead acknowledgement and verified notification read updates. */
(() => {
  let busy = false;
  let initialized = false;
  let identity = null;
  let seen = new Set();
  let pending = [];
  let activeDialog = null;
  let polling = false;
  const ownerActive = () => IS_OWNER && !isTechnicianView() && CURRENT_TEAM_MEMBER?.id;
  const storageKey = () => `ezfix-lead-alerts:${identity}`;
  function persist() {
    try {
      sessionStorage.setItem(storageKey(), JSON.stringify(pending));
      sessionStorage.setItem(storageKey() + ':seen', JSON.stringify([...seen]));
    } catch (_) {}
  }
  function resetIdentity() {
    const next = CURRENT_TEAM_MEMBER?.id || null;
    if (next === identity) return;
    if (activeDialog) { activeDialog.remove(); activeDialog = null; }
    identity = next; initialized = false; seen = new Set(); pending = [];
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey()) || '[]');
      if (Array.isArray(saved)) pending = saved.filter(id => typeof id === 'string');
      const baseline = JSON.parse(sessionStorage.getItem(storageKey() + ':seen') || 'null');
      if (Array.isArray(baseline)) { seen = new Set(baseline.filter(id => typeof id === 'string')); initialized = true; }
    } catch (_) {}
  }
  function displayNext() {
    if (!ownerActive() || activeDialog || !pending.length) return;
    const lead = STORE.leads.find(item => item.id === pending[0]);
    if (!lead) return; // A later authoritative refresh may load it.
    const focusBefore = document.activeElement;
    const dialog = document.createElement('dialog');
    activeDialog = dialog;
    dialog.id = 'ownerLeadAlert';
    dialog.setAttribute('aria-labelledby', 'ownerLeadAlertTitle');
    dialog.setAttribute('aria-describedby', 'ownerLeadAlertDetails');
    dialog.style.cssText = 'width:min(420px,calc(100vw - 40px));box-sizing:border-box;border:2px solid #f58220;border-radius:18px;padding:28px;background:#fff;color:#17202a;box-shadow:0 24px 90px #0007';
    const title = document.createElement('h2');
    title.id = 'ownerLeadAlertTitle'; title.textContent = 'New lead received';
    const details = document.createElement('p');
    details.id = 'ownerLeadAlertDetails';
    details.textContent = [lead.name || 'New customer', lead.phone, lead.city, lead.zip].filter(Boolean).join(' · ');
    const note = document.createElement('p');
    note.textContent = 'Acknowledge to continue. This does not assign a technician or change the lead status.';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn btn-primary'; button.textContent = 'Acknowledge';
    button.onclick = () => {
      pending = pending.filter(id => id !== lead.id); persist(); dialog.close(); dialog.remove(); activeDialog = null;
      if (focusBefore?.isConnected) focusBefore.focus();
      displayNext();
    };
    dialog.addEventListener('cancel', event => event.preventDefault());
    dialog.append(title, details, note, button); document.body.appendChild(dialog);
    dialog.showModal(); button.focus();
  }
  function syncLeads() {
    resetIdentity();
    const allowed = ownerActive();
    for (const lead of STORE.leads) {
      if (seen.has(lead.id)) continue;
      seen.add(lead.id);
      if (initialized && allowed && !pending.includes(lead.id)) pending.push(lead.id);
    }
    initialized = true;
    // Removed leads must not prevent later alerts from being acknowledged.
    const ids = new Set(STORE.leads.map(lead => lead.id));
    pending = pending.filter(id => ids.has(id));
    persist(); displayNext();
  }
  const refreshOriginal = refreshCollection;
  refreshCollection = async function(col, ...args) {
    const result = await refreshOriginal(col, ...args);
    if (col === 'leads') syncLeads();
    return result;
  };
  // WebSocket delivery can stop while the browser still displays a connected page.
  // Poll only the signed-in owner's visible page; preserve active forms and dialogs.
  async function refreshOwnerNotifications() {
    if (polling || !dbReady || document.hidden || !ownerActive()) return;
    polling = true;
    try {
      await Promise.all([refreshCollection('leads'), refreshCollection('auditLog')]);
      refreshNotifBadge();
    } catch (error) { console.warn('Owner notification refresh unavailable', error); }
    finally { polling = false; }
  }
  setInterval(refreshOwnerNotifications, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshOwnerNotifications(); });
  window.addEventListener('online', refreshOwnerNotifications);
  window.addEventListener('focus', refreshOwnerNotifications);
  const signOutOriginal = signOutCrm;
  signOutCrm = async function(...args) {
    if (activeDialog) { activeDialog.close(); activeDialog.remove(); activeDialog = null; }
    return signOutOriginal(...args);
  };
  window.signOutCrm = signOutCrm;
  async function saveRead(ids, read) {
    if (!await requireSession()) throw new Error('Sign in required');
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 100) {
      const batch = unique.slice(i, i + 100);
      const {data, error} = await SB.from('audit_log').update({read}).in('id', batch).select('id,read');
      if (error) throw error;
      const confirmed = new Set((data || []).filter(row => row.read === read).map(row => row.id));
      if (batch.some(id => !confirmed.has(id))) throw new Error('Notification update was not confirmed');
    }
    await refreshCollection('auditLog');
  }
  function redraw() { renderPreserveScroll(); refreshNotifBadge(); }
  markEventRead = async function(id, isRead) {
    try { await saveRead([id], isRead !== false); redraw(); return true; }
    catch (error) { console.error('Notification read update', error); toast('Could not save notification read status. Please retry.', true); return false; }
  };
  window.markEventRead = markEventRead;
  markAllEventsRead = async function() {
    if (busy) return;
    const ids = STORE.auditLog.filter(event => !event.read).map(event => event.id);
    if (!ids.length) return;
    busy = true;
    try { await saveRead(ids, true); toast('Notifications marked as read'); }
    catch (error) {
      console.error('Mark all read', error);
      toast('Not all notifications were marked as read. Please retry.', true);
      try { await refreshCollection('auditLog'); } catch (_) {}
    } finally { busy = false; redraw(); }
  };
  window.markAllEventsRead = markAllEventsRead;
})();
