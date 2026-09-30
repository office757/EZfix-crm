
import {jsPDF} from "npm:jspdf@2.5.1";
// Use the existing invoice PDF renderer so archived receipts retain the approved branding.
export async function renderReceiptPdf(inv,customer,logoDataUrl){
 const doc={...inv,customerId:inv.customer_id,customerName:inv.customer_name||customer?.name||'',customerAddress:inv.customer_address||customer?.address||'',customerPhone:inv.customer_phone||customer?.phone||'',dueTerm:inv.due_term,taxRate:inv.tax_rate,depositRequired:inv.deposit_required};
 const COMPANY={name:'EZfix Garage Doors Inc',owner:'David Bernhardt',bn:'413000875',phone:'+1 (774) 244-5533',email:'office@ezfixgaragedoorsinc.com',address:'15 Birch St Milford MA 01757 #1112',hic:'HIC #218082',websiteLabel:'ezfixgaragedoorsinc.com'};
 const TERMS_TEXT="By approving this invoice, making a payment or deposit, or authorizing work to begin, the customer accepts the scope of work, pricing, payment terms, warranty terms, and conditions below.\nPayment & Deposits: Any required deposit must be paid before materials are ordered or installation is scheduled. Unless otherwise stated, the remaining balance is due upon completion of the contracted work.\nScope & Additional Work: Pricing covers only the services and materials listed on the approved estimate or invoice. Hidden damage, structural or electrical issues, improper previous installations, code requirements, or other unforeseen conditions are not included. Any additional chargeable work will require customer approval.\nSpecial Orders & Cancellations: Custom or special-order garage doors, colors, windows, hardware, openers, or other materials may become non-refundable once ordered, manufactured, shipped, or committed by a supplier. Customer-requested changes may result in additional charges or delays.\nRefund Policy: Except where required by law, completed labor, service calls, diagnostics, programming, repairs, installed/used materials, and completed installations are final and non-refundable. Approved cancellations or returns may be reduced by special-order costs, restocking fees, shipping, delivery, and other non-recoverable expenses.\nWarranty: Warranty coverage is limited to the warranty specifically stated on the estimate or invoice. Warranty does not cover normal wear, misuse, impact damage, unauthorized repairs or modifications, lack of maintenance, electrical/power issues, water damage, structural movement, pre-existing conditions, or damage outside EZfix's control. EZfix must be given a reasonable opportunity to inspect and correct a covered warranty issue before a refund or other remedy is considered.\nScheduling: Installation and service dates may be affected by product availability, supplier/manufacturer delays, weather, site conditions, or other circumstances outside EZfix's reasonable control.\nCustomer Responsibility: The customer must provide safe and reasonable access to the work area and confirms they have authority to approve work at the property.\nBy authorizing the work or making payment, the customer acknowledges and agrees to these terms.\nEZfix Garage Doors Inc | Massachusetts\nNothing in these terms waives any consumer cancellation, refund, warranty, or other rights that cannot legally be waived under applicable Massachusetts or federal law.";
 const window={jspdf:{jsPDF}},getOne=()=>customer,loadLogoDataUrl=async()=>logoDataUrl;
 const money=n=>'$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const fmtDate=d=>d?new Date(/^\d{4}-\d{2}-\d{2}$/.test(d)?d+'T12:00:00':d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
 const paymentAppliedAmount=p=>Number(p?.appliedAmount??p?.amount??0);
 const computeTotals=d=>{const subtotal=(d.items||[]).reduce((s,x)=>s+x.qty*x.rate,0),taxable=(d.items||[]).reduce((s,x)=>s+(x.taxable!==false?x.qty*x.rate:0),0),discount=Math.min(Number(d.discount)||0,subtotal),taxRate=Number(d.taxRate)||0,tax=Math.round(taxable*(subtotal>0?(subtotal-discount)/subtotal:1)*taxRate)/100;return {subtotal,discount,tax,taxRate,total:Math.round((subtotal-discount+tax)*100)/100,depositRequired:Number(d.depositRequired)||0};};
 const balanceDue=d=>Math.max(0,Math.round((computeTotals(d).total-(d.payments||[]).reduce((s,p)=>s+paymentAppliedAmount(p),0))*100)/100);
 const documentDoorImage=li=>/^data:image\/(png|jpeg|webp);base64,/.test(li?.imageDataUrl||'')?li.imageDataUrl:'';
 const freezeDoorImage=async li=>li;
 const PaymentProvider={createPaymentRequest:()=>null};
 const generateQrDataUrl=async()=>null,SETTINGS={ccSurchargePercent:0},amountWithCcSurcharge=x=>x;
 async function buildPdfDoc(type, doc) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 40;
  const isInvoice = type === 'invoice';
  const t = computeTotals(doc);
  const balance = isInvoice ? balanceDue(doc) : t.total;
  const docCust = getOne('customers', doc.customerId);
  const textX = margin + 164;

  // Header band
  pdf.setFillColor(30,30,30);
  pdf.rect(0, 0, pageW, 110, 'F');
  const logoData = await loadLogoDataUrl();
  if (logoData) {
    try { pdf.addImage(logoData, 'PNG', margin, 18, 150, 62); } catch(e) { console.error('addImage failed', e); }
  }
  pdf.setTextColor(247,148,29);
  pdf.setFont('helvetica','bold'); pdf.setFontSize(16);
  pdf.text(COMPANY.name, textX, 34);
  pdf.setTextColor(230,230,230);
  pdf.setFont('helvetica','normal'); pdf.setFontSize(9);
  pdf.text(COMPANY.owner, textX, 50);
  pdf.text(`Business Number ${COMPANY.bn}`, textX, 63);
  pdf.text(COMPANY.phone, textX, 76);
  pdf.text(COMPANY.email, textX, 89);
  pdf.text(COMPANY.address, pageW-margin, 34, { align:'right' });
  pdf.text(COMPANY.hic, pageW-margin, 47, { align:'right' });
  pdf.text(COMPANY.websiteLabel, pageW-margin, 60, { align:'right' });

  let y = 140;
  pdf.setTextColor(120,120,120); pdf.setFontSize(9); pdf.setFont('helvetica','bold');
  pdf.text('BILL TO', margin, y);
  const label = isInvoice ? 'INVOICE' : 'ESTIMATE';
  pdf.text(label, pageW-margin, y, { align:'right' });
  y += 16;
  pdf.setTextColor(20,20,20); pdf.setFontSize(13); pdf.setFont('helvetica','bold');
  pdf.text(doc.customerName||'', margin, y);
  pdf.text(doc.number||'', pageW-margin, y, { align:'right' });
  y += 15;
  pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5); pdf.setTextColor(60,60,60);
  if (doc.customerAddress) { pdf.text(doc.customerAddress, margin, y); }
  pdf.setTextColor(120,120,120); pdf.text('DATE', pageW-140, y, {align:'right'});
  pdf.setTextColor(20,20,20); pdf.text(fmtDate(doc.date), pageW-margin, y, {align:'right'});
  y += 14;
  if (doc.customerPhone) { pdf.setTextColor(60,60,60); pdf.text(doc.customerPhone, margin, y); }
  if (isInvoice) {
    pdf.setTextColor(120,120,120); pdf.text('DUE', pageW-140, y, {align:'right'});
    pdf.setTextColor(20,20,20); pdf.text(doc.dueTerm||'On Receipt', pageW-margin, y, {align:'right'});
  }
  y += 30;

  // Items table header
  pdf.setFillColor(38,38,38);
  pdf.rect(margin, y, pageW-margin*2, 22, 'F');
  pdf.setTextColor(255,255,255); pdf.setFontSize(9); pdf.setFont('helvetica','bold');
  pdf.text('DESCRIPTION', margin+8, y+14);
  pdf.text('RATE', pageW-margin-150, y+14, {align:'right'});
  pdf.text('QTY', pageW-margin-90, y+14, {align:'right'});
  pdf.text('AMOUNT', pageW-margin-8, y+14, {align:'right'});
  y += 22;

  pdf.setFont('helvetica','normal');
  for(const li of (doc.items||[])) {
    const image=documentDoorImage(li),descW=pageW-margin*2-190;
    pdf.setFontSize(10);pdf.setFont('helvetica','bold');
    const titleLines=pdf.splitTextToSize(li.desc||'',descW);
    pdf.setFontSize(8.5);pdf.setFont('helvetica','normal');
    const detailLines=li.details?pdf.splitTextToSize(li.details,descW):[];
    const textH=titleLines.length*12+detailLines.length*10+14;
    const rowH=textH+(image?100:0);
    if(y+rowH>700){pdf.addPage();y=40;}
    pdf.setTextColor(20,20,20);pdf.setFontSize(10);pdf.setFont('helvetica','bold');
    pdf.text(titleLines,margin+8,y+14);
    pdf.setFont('helvetica','normal');pdf.setFontSize(9.5);
    pdf.text(money(li.rate),pageW-margin-150,y+14,{align:'right'});
    pdf.text(String(li.qty),pageW-margin-90,y+14,{align:'right'});
    pdf.text(money(li.qty*li.rate),pageW-margin-8,y+14,{align:'right'});
    if(detailLines.length){pdf.setTextColor(110,110,110);pdf.setFontSize(8.5);pdf.text(detailLines,margin+8,y+titleLines.length*12+14);}
    if(image){
      const frozen=await freezeDoorImage(li),data=frozen.imageDataUrl||image,props=pdf.getImageProperties(data);
      const scale=Math.min(150/props.width,80/props.height);
      pdf.addImage(data,margin+8,y+textH,props.width*scale,props.height*scale);
      pdf.setFontSize(7.5);pdf.setTextColor(110,110,110);pdf.text(pdf.splitTextToSize(li.imageCaption||'Selected door',descW),margin+8,y+textH+90);
    }
    pdf.setDrawColor(230,230,230);pdf.line(margin,y+rowH,pageW-margin,y+rowH);y+=rowH;
  }
  y += 20;

  if(y>550){pdf.addPage();y=40;}
  // Totals
  const totalsX = pageW-margin-8;
  pdf.setFontSize(9.5);
  const depositPaidPdf = isInvoice ? (doc.payments||[]).filter(p=>p.type==='deposit').reduce((s,p)=>s+paymentAppliedAmount(p),0) : 0;
  const depositRemainingPdf = isInvoice ? Math.max(0, t.depositRequired - depositPaidPdf) : 0;
  if (t.discount > 0 || t.tax > 0) {
    pdf.setTextColor(110,110,110); pdf.text('Subtotal', totalsX-150, y, {align:'right'});
    pdf.setTextColor(20,20,20); pdf.text(money(t.subtotal), totalsX, y, {align:'right'});
    y += 15;
  }
  if (t.discount > 0) {
    pdf.setTextColor(110,110,110); pdf.text('Discount', totalsX-150, y, {align:'right'});
    pdf.setTextColor(20,20,20); pdf.text('-'+money(t.discount), totalsX, y, {align:'right'});
    y += 15;
  }
  if (t.tax > 0) {
    pdf.setTextColor(110,110,110); pdf.text(`Tax (${t.taxRate}%)`, totalsX-150, y, {align:'right'});
    pdf.setTextColor(20,20,20); pdf.text(money(t.tax), totalsX, y, {align:'right'});
    y += 15;
  }
  pdf.setFont('helvetica','bold'); pdf.setFontSize(11);
  pdf.setTextColor(20,20,20); pdf.text('TOTAL', totalsX-150, y, {align:'right'});
  pdf.text(money(t.total), totalsX, y, {align:'right'});
  y += 16;
  pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5);
  if (isInvoice && t.depositRequired > 0) {
    pdf.setTextColor(110,110,110); pdf.text('Deposit required', totalsX-150, y, {align:'right'});
    pdf.setTextColor(20,20,20); pdf.text(money(t.depositRequired), totalsX, y, {align:'right'});
    y += 15;
  }
  if (isInvoice) (doc.payments||[]).forEach(p => {
    pdf.setTextColor(110,110,110); pdf.text(`${p.type==='deposit'?'Deposit':'Payment'}${p.method?' · '+p.method:''}`, totalsX-150, y, {align:'right'});
    pdf.setTextColor(20,20,20); pdf.text('-'+money(paymentAppliedAmount(p)), totalsX, y, {align:'right'});
    y += 15;
  });
  if (isInvoice && depositRemainingPdf > 0) {
    pdf.setFillColor(242,240,236); pdf.rect(totalsX-190, y-11, 190, 20, 'F');
    pdf.setFont('helvetica','bold'); pdf.setFontSize(10.5); pdf.setTextColor(20,20,20);
    pdf.text('DEPOSIT DUE', totalsX-150, y+3, {align:'right'});
    pdf.text('USD '+money(depositRemainingPdf), totalsX, y+3, {align:'right'});
    y += 24;
    pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5);
  }
  pdf.setFillColor(242,240,236); pdf.rect(totalsX-190, y-11, 190, 20, 'F');
  pdf.setFont('helvetica','bold'); pdf.setFontSize(10.5); pdf.setTextColor(20,20,20);
  pdf.text(isInvoice?'BALANCE DUE':'ESTIMATE TOTAL', totalsX-150, y+3, {align:'right'});
  pdf.text('USD '+money(isInvoice?balance:t.total), totalsX, y+3, {align:'right'});
  y += 34;

  const payUrlPdf = isInvoice ? PaymentProvider.createPaymentRequest(doc) : null;
  if (isInvoice && balance > 0 && payUrlPdf) {
    const qrDataUrl = await generateQrDataUrl(payUrlPdf, 100);
    if (qrDataUrl) {
      try {
        pdf.addImage(qrDataUrl, 'PNG', margin, y-4, 70, 70);
        pdf.setTextColor(120,120,120); pdf.setFontSize(8); pdf.setFont('helvetica','normal');
        pdf.text('Scan to pay online', margin, y+76);
      } catch(e) { console.error('QR embed failed', e); }
    }
    pdf.setTextColor(200,90,0); pdf.setFont('helvetica','bold'); pdf.setFontSize(9.5);
    pdf.textWithLink('Pay online →', margin + (qrDataUrl?84:0), y+38, { url: payUrlPdf });
    if (SETTINGS.ccSurchargePercent > 0) {
      pdf.setTextColor(140,140,140); pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5);
      pdf.text(`Card payments include a ${SETTINGS.ccSurchargePercent}% surcharge: ${money(amountWithCcSurcharge(balance))} total`, margin + (qrDataUrl?84:0), y+50);
    }
    y += 90;
  }

  // Terms footer
  if (y > 620) { pdf.addPage(); y = 40; }
  pdf.setDrawColor(230,230,230); pdf.line(margin, y, pageW-margin, y); y += 16;
  pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); pdf.setTextColor(70,70,70);
  pdf.text(`${COMPANY.name} — Service Agreement & Refund Policy`, margin, y); y += 12;
  pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.setTextColor(130,130,130);
  TERMS_TEXT.split('\n').forEach(para => {
    const wrapped = pdf.splitTextToSize(para, pageW-margin*2);
    wrapped.forEach(line => {
      if (y > 760) { pdf.addPage(); y = 40; }
      pdf.text(line, margin, y);
      y += 9;
    });
    y += 3;
  });

  return pdf;
}

 const pdf=await buildPdfDoc('invoice',doc);
 return new Uint8Array(pdf.output('arraybuffer'));
}
