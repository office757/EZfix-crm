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
    'Sales & Billing': 'amber', 'Gallery & Visualizer': 'blue', 'Service & Stock': 'sage',
    'Office & AI': 'violet', 'Team & Payroll': 'rose', 'Business Workspace': 'teal'
  };
  const meta = page => pages[page] || ['teal', '🧰'];
  const emoji = value => {
    const span = document.createElement('span');
    span.className = 'workspace-emoji';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = value;
    return span;
  };
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
      const category = Object.keys(categoryTones).find(key => title.includes(key));
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
  let queued = false;
  function scheduleDecoration() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const content = document.getElementById('content');
      if (content?.classList.contains('workspace-screen')) decorate(content);
      document.querySelectorAll('.overlay > .modal').forEach(modal => {
        modal.classList.add('workspace-dialog');
        decorate(modal);
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
      pageEmoji.textContent = icon;
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
        if (currentIcon.textContent !== buttonIcon) currentIcon.textContent = buttonIcon;
      } else button.querySelector('svg')?.replaceWith(emoji(buttonIcon));
    });
    scheduleDecoration();
  }
  window.EZFIXWorkspaceTheme = {
    apply,
    navIcon: page => `<span class="workspace-nav-icon" aria-hidden="true"><span class="workspace-emoji">${meta(page)[1]}</span></span>`
  };
  const content = document.getElementById('content');
  if (content) new MutationObserver(scheduleDecoration).observe(content, {childList: true, subtree: true});
  // Dialogs are appended separately from #content; no observer on form values or input attributes.
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches('.overlay') || node.querySelector('.modal'))))) scheduleDecoration();
  }).observe(document.body, {childList: true});
  if (typeof route !== 'undefined') {
    renderNav();
    apply(route.page);
  }
})();
