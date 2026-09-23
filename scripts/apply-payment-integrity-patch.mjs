import fs from 'node:fs';

const file = 'index.html';
let src = fs.readFileSync(file, 'utf8');
let changed = false;

if (!src.includes('async recordPayment(invoiceId, payment, expectedRowVersion)')) {
  const start = src.indexOf('  async recordPayment(invoiceId, payment) {');
  const end = src.indexOf('\n\n  // Refund', start);
  if (start < 0 || end < 0) throw new Error('Could not locate PaymentProvider.recordPayment block');
  const replacement = `  async recordPayment(invoiceId, payment, expectedRowVersion) {
    return queueMutation(\`record:invoices:\${invoiceId}\`, async()=>{
      if (!await requireSession()) throw markHandled(new Error('Sign in required'));
      if (!Number.isFinite(Number(expectedRowVersion))) {
        toast("Couldn't record payment because the invoice version is missing. Refresh and try again.", true);
        throw markHandled(new Error('Expected invoice row version is required.'));
      }
      // Append atomically in Postgres. The expected row version makes concurrent
      // payment attempts conflict instead of silently overwriting or double-paying.
      // The payment id makes retries idempotent if the client repeats a request.
      const { data:updatedRaw, error:updateError } = await SB.rpc('append_invoice_payment', {
        p_invoice_id: invoiceId,
        p_payment: payment,
        p_expected_row_version: Number(expectedRowVersion)
      });
      if (updateError) {
        const isConflict = updateError.code === '40001' || /changed while payment/i.test(updateError.message||'');
        toast(isConflict
          ? 'This invoice changed while the payment was being recorded. Refresh the balance and try again.'
          : "Couldn't record payment. Please try again.", true);
        throw markHandled(updateError);
      }
      const updated = Array.isArray(updatedRaw) ? updatedRaw[0] : updatedRaw;
      if (!updated?.id) {
        toast("Couldn't record payment because the update was not acknowledged.", true);
        throw markHandled(new Error('Payment update was not acknowledged.'));
      }
      replaceStoreRecord('invoices', updated);
      return payment;
    });
  },`;
  src = src.slice(0, start) + replacement + src.slice(end);
  changed = true;
}

if (!src.includes('id: newId(),\n        amount: appliedAmount')) {
  const needle = `      const paymentRecord = {
        amount: appliedAmount,`;
  const replacement = `      const paymentRecord = {
        id: newId(),
        amount: appliedAmount,`;
  if (!src.includes(needle)) throw new Error('Could not locate paymentRecord block');
  src = src.replace(needle, replacement);
  changed = true;
}

if (!src.includes('PaymentProvider.recordPayment(inv.id, paymentRecord, Number(latestRow.row_version))')) {
  const needle = '      await PaymentProvider.recordPayment(inv.id, paymentRecord);';
  if (!src.includes(needle)) throw new Error('Could not locate recordPayment call');
  src = src.replace(needle, '      await PaymentProvider.recordPayment(inv.id, paymentRecord, Number(latestRow.row_version));');
  changed = true;
}

if (changed) fs.writeFileSync(file, src, 'utf8');
console.log(changed ? 'Payment integrity patch applied.' : 'Payment integrity patch already present.');
