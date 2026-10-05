/* Related workspaces reuse the existing routes and permission checks. */
function workspacePageSection(page) {
  if(IS_OWNER&&['communications','calls','ai_manager','ai_system'].includes(page))page='receptionist';
  
  const sections = [
    {id:'work',title:'Daily Work',description:'Leads and scheduled work.',keys:['leads','jobs','calendar',...(isTechnicianView()||isMarketingManager()?['customers']:[])]},
    {id:'operations',title:'Office',description:'Customers, follow-ups and daily tasks.',keys:['office','customers','followups']},
    {id:'office',title:'Office & AI',description:'Daily operations, Ashley and follow-ups.',keys:['receptionist','ai_manager','attention'],aliases:{ai_system:'ai_manager'}},
    {id:'finance',title:'Finance',description:'Estimates, invoices, payments and business expenses.',keys:['quickpay','estimates','invoices']},
    {id:'banking',title:'Banking',description:'Payments and banking records.',keys:['banking','payments']},
    {id:'team',title:'Team',description:'People, commissions and performance.',keys:['team','payroll','reports','earnings']},
    {id:'stock',title:'Products & Stock',description:'Products, inventory and supplier orders.',keys:['inventory','suppliers']},
    {id:'gallery',title:'Useful Tools',description:'Project photos and door design tools.',keys:['gallery','visualizer','products'],aliases:{viscatalog:'visualizer'}},
    {id:'communications',title:'Communications',description:'Email, calls, SMS and WhatsApp in one place.',keys:['communications'],aliases:{calls:'communications',walog:'communications',inbox:'communications'}},
    {id:'marketing',title:'Marketing',description:'Social posts and the project photos behind them.',keys:['socialposts'],related:['gallery']},
    {id:'system',title:'Settings & History',description:'Business settings and recorded activity.',keys:['settings','auditlog'],aliases:{checklist:'settings'}}
  ];
  if(page==='dashboard'||page==='more')return null;
  const section=sections.find(s=>s.keys.includes(page)||Object.hasOwn(s.aliases||{},page));
  if(!section)return null;
  const allowed=n=>n&&canAccessWorkspaceNav(n)&&(!n.hideForTech||!isTechnicianView())&&(!isTechnicianView()||technicianAllowedPage(n.key))&&(!isMarketingManager()||marketingAllowedPage(n.key));
  const requested=NAV.find(n=>n.key===page);if(requested&&!allowed(requested))return null;
  const items=section.keys.map(key=>NAV.find(n=>n.key===key)).filter(allowed);
  const related=(section.related||[]).map(key=>NAV.find(n=>n.key===key)).filter(allowed);
  if(!items.length)return null;
  return {...section,items,related,active:section.aliases?.[page]||page};
}
/* Shared presentation only. Routes, permissions, data and actions stay with their modules. */
(() => {
  'use strict';
  const pages = {
    dashboard: ['amber', '🏠'], more: ['amber', '🧰'],
    customers: ['blue', '👥'], leads: ['blue', '🎯'], communications: ['blue', '💬'], inbox: ['blue', '📥'],
    jobs: ['teal', '🛠️'], calendar: ['teal', '🗓️'],
    quickpay: ['amber', '⚡'], estimates: ['amber', '📝'], invoices: ['amber', '🧾'], payments: ['amber', '💵'], expenses: ['amber', '🧾'],
    gallery: ['blue', '🖼️'], visualizer: ['blue', '🏡'], viscatalog: ['blue', '🚪'],
    products: ['sage', '🛠️'], inventory: ['sage', '📦'], suppliers: ['sage', '🚚'], warranties: ['sage', '🛡️'],
    ai_manager: ['violet', '🧠'], receptionist: ['violet', '🎧'], ai_system: ['violet', '🤖'],
    team: ['rose', '👥'], payroll: ['rose', '💵'], reports: ['rose', '📊'], followups: ['rose', '🔔'], attention: ['rose', '🔔'],
    banking: ['teal', '🏦'], socialposts: ['teal', '📣'], office: ['teal', '🏢'],
    settings: ['teal', '⚙️'], auditlog: ['teal', '🕒'], checklist: ['teal', '📋'], walog: ['teal', '💬']
  };
  const categoryTones = {
    'Sales & Billing': 'amber', 'Useful Tools': 'blue', 'Service & Stock': 'sage',
    'Office & AI': 'violet', 'Team & Payroll': 'rose', 'Business Workspace': 'teal'
  };
  const meta = page => pages[page] || ['teal', '🧰'];
  // Trusted, existing navigation artwork supplies the same outline icon family everywhere.
  const iconPages = {'🏠':'dashboard','🧰':'more','👥':'team','🎯':'leads','💬':'communications','📥':'inbox','🛠':'products','🗓':'calendar','⚡':'quickpay','💳':'quickpay','📝':'estimates','🧾':'invoices','💵':'payments','🖼':'gallery','🏡':'visualizer','🚪':'visualizer','📦':'inventory','🚚':'suppliers','🛡':'warranties','🧠':'ai_manager','AI':'ai_manager','🎧':'receptionist','🤖':'ai_system','📊':'reports','🔔':'attention','🏦':'banking','📣':'socialposts','🏢':'office','⚙':'settings','🕒':'auditlog','📋':'checklist','📞':'calls','📁':'office','🧪':'ai_system','✉':'email'};
  Object.assign(iconPages, {'🌀':'spring','↔':'extension','📱':'phone-device','🌧':'weather','🔧':'wrench','👷':'labor','👤':'customers','💰':'payments','✅':'followups','📅':'calendar','✎':'edit','🔄':'refresh','📷':'gallery','✍':'edit','🗑':'delete','•':'inbox','⭐':'favorite'});
  const extraPaths = {
    favorite:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
    spring:'M3 12h3M6 7c0-3 3-3 3 0v10c0 3 3 3 3 0V7c0-3 3-3 3 0v10c0 3 3 3 3 0v-5h3',
    extension:'M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4',
    'phone-device':'M7 2h10v20H7zM10 18h4',
    weather:'M12 3s7 8 7 12a7 7 0 0 1-14 0c0-4 7-12 7-12z',
    wrench:'M14 5a5 5 0 0 0-6 6L3 16a3 3 0 0 0 5 5l5-5a5 5 0 0 0 6-6l-4 2-3-3z',
    labor:'M4 11h16M6 11V9a6 6 0 0 1 12 0v2M10 3v5M14 3v5M7 15a5 5 0 0 0 10 0M4 22v-2l4-2M20 22v-2l-4-2',
    edit:'M4 16v4h4L20 8l-4-4L4 16zM13 7l4 4',
    refresh:'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18a8 8 0 0 1-13-2',
    delete:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'
  };
  const normalizedIcon = value => String(value || '').replace(/\uFE0F/g, '').trim();
  function lineIcon(value) {
    const key = iconPages[normalizedIcon(value)];
    const mail = 'M3 5h18v14H3zM3 5l9 7 9-7';
    const fallback = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z';
    const path = extraPaths[key] || (key === 'email' ? mail : (typeof NAV !== 'undefined' && NAV.find(n => n.key === key)?.icon) || fallback);
    return `<svg class="royal-line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
  }
  const emoji = value => {
    const span = document.createElement('span');
    span.className = 'workspace-emoji';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = lineIcon(value);
    return span;
  };
  function decorateIcons(root) {
    if (!root) return;
    root.querySelectorAll('.launcher-tile-emoji,.wt-tool-icon,.wt-category-icon,.workspace-emoji,.notif-icon').forEach(icon => {
      if (icon.closest('.doc-sheet') || icon.querySelector('svg')) return;
      const value = normalizedIcon(icon.textContent);
      if (Object.hasOwn(iconPages, value)) icon.innerHTML = lineIcon(value);
    });
    root.querySelectorAll('.ashley-tool-grid .doc-tab,#pickerOverlay .modal-head h3').forEach(button => {
      if (button.querySelector('svg')) return;
      const text = [...button.childNodes].find(node => node.nodeType === 3 && node.textContent.trim());
      if (!text) return;
      const value = Object.keys(iconPages).find(key => key !== 'AI' && normalizedIcon(text.textContent).startsWith(key + ' '));
      if (!value) return;
      text.textContent = text.textContent.replace(/^(\s*)(?:[\p{Extended_Pictographic}\uFE0F]+|AI)\s*/u, '');
      button.insertBefore(emoji(value), text);
    });
  }
  function headingIcon(text, fallback) {
    const rules = [
      [/payment|collected|paid|payout|commission/i, '💵'], [/invoice|receipt/i, '🧾'],
      [/estimate|quote/i, '📝'], [/customer|contact/i, '👥'], [/lead|conversion|pipeline/i, '🎯'],
      [/schedule|appointment|calendar/i, '🗓️'], [/job|work order/i, '🛠️'],
      [/call|phone|voice|reception/i, '🎧'], [/sms|message|communication|whatsapp/i, '💬'],
      [/email/i, '✉️'], [/inventory|stock|parts/i, '📦'], [/supplier|purchase order/i, '🚚'],
      [/team|technician|staff/i, '👥'], [/follow.up|task|overdue|attention/i, '🔔'],
      [/report|performance|insight/i, '📊'], [/activity|history|log/i, '🕒'],
      [/bank|balance/i, '🏦'], [/social|marketing/i, '📣'], [/photo|gallery|image/i, '🖼️'],
      [/door|design|model/i, '🚪'], [/setting|integration|configuration/i, '⚙️'],
      [/business|office|company/i, '🏢']
    ];
    return rules.find(([match]) => match.test(text))?.[1] || fallback;
  }
  // Decorate only structural headings. Never alter record names, messages, documents or canvases.
  function decorate(root) {
    const fallback = meta(document.body.dataset.workspacePage)[1];
    root.querySelectorAll('.panel-head h3, .modal-head h3, .section-label, .stat-card > .label, .mkt-wizard-head h2, .vg-saved-head h3').forEach(heading => {
      if (heading.dataset.workspaceHeading || heading.closest('.doc-sheet, .overview-page, .workspace-tools')) return;
      heading.dataset.workspaceHeading = 'true';
      const text = heading.textContent.trim();
      if (!/\p{Extended_Pictographic}/u.test(text)) heading.prepend(emoji(headingIcon(text, fallback)));
      if (heading.matches('.stat-card > .label')) {
        const tone = /unpaid|outstanding|overdue|failed|need.*setup/i.test(text) ? 'rose' : /collected|\bpaid\b|completed|ready/i.test(text) ? 'sage' : null;
        if (tone) heading.parentElement.dataset.workspaceTone = tone;
      }
    });
    root.querySelectorAll('.launcher-cat').forEach(card => {
      const title = card.querySelector('.launcher-cat-head')?.textContent || '';
      const category = Object.keys(categoryTones).find(key => title.toLowerCase().includes(key.toLowerCase()));
      if (category) card.dataset.workspaceTone = categoryTones[category];
    });
    root.querySelectorAll('[data-workspace-link]').forEach(button => {
      const [tone, icon] = meta(button.dataset.workspaceLink);
      button.dataset.workspaceTone = tone;
      button.querySelector(':scope > svg')?.replaceWith(emoji(icon));
    });
    // Give long CRM tables their own keyboard-accessible horizontal scrolling area.
    root.querySelectorAll('table.list').forEach(table => {
      if (table.closest('.workspace-table-scroll, .doc-sheet, .overview-page')) return;
      const wrap = document.createElement('div');
      wrap.className = 'workspace-table-scroll';
      wrap.tabIndex = 0;
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', `${document.getElementById('pageTitle').textContent} table`);
      const focused = table.contains(document.activeElement) ? document.activeElement : null;
      table.before(wrap);
      wrap.append(table);
      if (focused) focused.focus({preventScroll: true});
    });
  }
  function renderPageNavigation(page) {
    const content=document.getElementById('content');
    if(!content)return;
    let shell=document.getElementById('workspacePageNavigation');
    const section=workspacePageSection(page);
    // The main Communications page already has its own unified channel row.
    const show=section && (section.items.length>1 || section.related.length || section.active!==page);
    if(!show){if(shell)shell.remove();delete document.body.dataset.workspaceSection;return;}
    if(!shell){shell=document.createElement('section');shell.id='workspacePageNavigation';shell.className='workspace-page-navigation no-print';content.before(shell);}
    document.body.dataset.workspaceSection=section.id;
    shell.setAttribute('aria-label',section.title+' workspace');
    const labels={jobs:'Jobs',ai_manager:'AI Manager',expenses:'Receipts',attention:'Needs Attention'};
    const tab=n=>`<button type="button" class="workspace-section-tab ${section.active===n.key?'is-current':''}" onclick="go('${n.key}')" ${section.active===n.key?'aria-current="page"':''}><span class="workspace-emoji" aria-hidden="true">${lineIcon(meta(n.key)[1])}</span><span>${esc(labels[n.key]||n.label)}</span></button>`;
    shell.innerHTML=`<div class="workspace-section-heading"><div><b>${esc(section.title)}</b><p>${esc(section.description)}</p></div><button type="button" class="workspace-all-tools" onclick="go('more')">All tools <span aria-hidden="true">↗</span></button></div><nav class="workspace-section-tabs" aria-label="${esc(section.title)} pages">${section.items.map(tab).join('')}${section.related.length?'<span class="workspace-section-divider" aria-hidden="true"></span>'+section.related.map(tab).join(''):''}</nav>`;
    const active=shell.querySelector('[aria-current="page"]'),tabs=shell.querySelector('.workspace-section-tabs');
    // Keep the current section visible on a narrow screen without moving the page.
    if(active&&tabs)tabs.scrollLeft=Math.max(0,active.offsetLeft-tabs.offsetLeft-12);
  }
  let queued = false;
  function scheduleDecoration() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const content = document.getElementById('content');
      if (content?.classList.contains('workspace-screen')) decorate(content);
      decorateIcons(content);
      decorateIcons(document.getElementById('notifPopover'));
      document.querySelectorAll('.overlay > .modal').forEach(modal => {
        modal.classList.add('workspace-dialog');
        decorate(modal);
        decorateIcons(modal);
      });
    });
  }
  function apply(page) {
    const [tone, icon] = meta(page);
    document.body.dataset.workspacePage = page;
    document.body.dataset.workspaceTone = tone;
    const content = document.getElementById('content');
    // Keep the approved owner dashboard untouched; role-specific dashboards use the shared components.
    const approvedDashboard = page === 'dashboard' && !isTechnicianView() && !isMarketingManager();
    content?.classList.toggle('workspace-screen', !approvedDashboard);
    const pageEmoji = document.getElementById('pageEmoji');
    if (pageEmoji) {
      pageEmoji.innerHTML = lineIcon(icon);
      pageEmoji.setAttribute('aria-hidden', 'true');
    }
    document.querySelectorAll('[data-workspace-nav]').forEach(button => {
      button.dataset.workspaceTone = meta(button.dataset.workspaceNav)[0];
    });
    document.querySelectorAll('.bn-item').forEach(button => {
      const [buttonTone, buttonIcon] = meta(button.dataset.marketingPage || button.dataset.page);
      button.dataset.workspaceTone = buttonTone;
      const currentIcon = button.querySelector('.workspace-emoji');
      if (currentIcon) {
        const svg = lineIcon(buttonIcon);
        if (currentIcon.innerHTML !== svg) currentIcon.innerHTML = svg;
      } else button.querySelector('svg')?.replaceWith(emoji(buttonIcon));
    });
    renderPageNavigation(page);
    decorateIcons(document.getElementById('workspacePageNavigation'));
    scheduleDecoration();
  }
  window.EZFIXWorkspaceTheme = {
    apply,
    navIcon: page => `<span class="workspace-nav-icon" aria-hidden="true"><span class="workspace-emoji">${lineIcon(meta(page)[1])}</span></span>`
  };
  const content = document.getElementById('content');
  if (content) new MutationObserver(scheduleDecoration).observe(content, {childList: true, subtree: true});
  // Dialogs are appended separately from #content; no observer on form values or input attributes.
  new MutationObserver(records => {
    if (records.some(record => record.target.closest?.('.overlay,#notifPopover') || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches('.overlay') || node.querySelector('.modal'))))) scheduleDecoration();
  }).observe(document.body, {childList: true, subtree: true});
  if (typeof route !== 'undefined') {
    renderNav();
    apply(route.page);
  }
})();
