/* EZfix Remote Estimate Signing client integration.
   Safe to include from the CRM shell after the main app script. */
(function(){
  async function sendEstimateForSigning(id) {
    const doc = typeof getOne==='function' ? getOne('estimates', id) : null;
    if (!doc) return;
    if (doc.signature) return toast('This estimate is already signed.', true);
    const cust = typeof getOne==='function' ? getOne('customers', doc.customerId) : null;
    const email = doc.customerEmail || cust?.email;
    if (!email) return promptContactInfo('estimate', id, 'email');
    try {
      const { data:{ session } } = await SB.auth.getSession();
      if (!session?.access_token) throw new Error('Your CRM session expired. Please sign in again.');
      const { data, error } = await SB.functions.invoke('send-estimate-signing-email', {
        body: { estimate_id:id },
        headers: { Authorization:`Bearer ${session.access_token}` }
      });
      if (error || !data?.ok) throw error || new Error(data?.error || 'Could not send signing email.');
      await logAudit('estimate_signing_email_sent', `Secure signing link sent for estimate ${doc.number} to ${email}`, 'estimates', id, 'resend_message', data.provider_message_id||null);
      toast('Secure signing link emailed to customer');
    } catch(e) {
      console.error('sendEstimateForSigning failed', e);
      toast(e?.message || 'Could not send signing link', true);
    }
  }

  function signingActionHtml(doc){
    if (!doc || doc.signature) return '';
    return `<button class="btn btn-sm" style="width:100%;text-align:left" onclick="closeDocMenu(); sendEstimateForSigning('${doc.id}')">✍ Email secure signing link</button>`;
  }

  window.sendEstimateForSigning = sendEstimateForSigning;
  window.estimateSigningActionHtml = signingActionHtml;
})();