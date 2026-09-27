import { readFileSync, writeFileSync } from 'node:fs';

const MARK='/* EZFIX_ASSIGNMENT_WHATSAPP_V1 */';
const OLD=`  } catch(e) { console.warn('Technician assignment SMS failed without blocking assignment', e); }
}
window.syncJobAssignment = syncJobAssignment;`;
const NEW=`  } catch(e) { console.warn('Technician assignment SMS failed without blocking assignment', e); }
  /* EZFIX_ASSIGNMENT_WHATSAPP_V1 */
  if (techWantsNotification(technicianName, 'newJob')) {
    try {
      const when=[job.scheduledDate||'date pending',job.appointmentWindow||''].filter(Boolean).join(' · ');
      await logWaNotification(
        technicianName,
        'newJob',
        'jobs',
        jobId,
        \`New job assigned: \${job.title||'Service call'} · \${job.customerName||'Customer'} · \${when}\`
      );
    } catch(e) { console.warn('Technician assignment WhatsApp failed without blocking assignment', e); }
  }
}
window.syncJobAssignment = syncJobAssignment;`;

export function installAssignmentWhatsApp(html){
  if(html.includes(MARK)) return html;
  const count=html.split(OLD).length-1;
  if(count!==1) throw new Error('Assignment WhatsApp build: expected exactly one syncJobAssignment target');
  return html.replace(OLD,NEW);
}
export function stripAssignmentWhatsApp(html){ return html.replace(NEW,OLD); }

if(import.meta.url===new URL(process.argv[1],'file:///').href){
  const p=new URL('../index.html',import.meta.url);
  const src=readFileSync(p,'utf8');
  const out=installAssignmentWhatsApp(src);
  if(out!==src) writeFileSync(p,out,'utf8');
  console.log('Assignment WhatsApp hook built; existing SMS assignment flow preserved.');
}
