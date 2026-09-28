// Minimal document adapter for executing the production modal handlers in Node.
// No application callbacks are replaced: button clicks execute showModal's code.
export function modalDocument() {
  const nodes = new Map(), listeners = new Map();
  class Element {
    constructor() { this.isConnected = false; this.disabled = false; this.textContent = ''; this.dataset = {}; }
    focus() { document.activeElement = this; }
    addEventListener() {}
    remove() { this.isConnected = false; for (const node of this.children || []) node.isConnected = false; nodes.delete(this.id); }
    set innerHTML(html) {
      this.html = html;
      const label = html.match(/id="modalSaveBtn">([^<]*)</)?.[1];
      this.primary = new Element(); this.primary.id = 'modalSaveBtn'; this.primary.textContent = label;
      this.modal = new Element();
      this.children = [this.primary, this.modal];
      this.modal.querySelector = () => this.primary;
      this.modal.querySelectorAll = () => [this.primary];
    }
    get innerHTML() { return this.html; }
    querySelector(selector) { return selector === '.modal' ? this.modal : selector === '#modalSaveBtn' ? this.primary : null; }
  }
  const document = {
    activeElement: new Element(),
    createElement: () => new Element(),
    getElementById: id => id === 'modalSaveBtn' ? nodes.get('modalOverlay')?.primary || null : nodes.get(id) || null,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); },
    body: { appendChild(el) { nodes.set(el.id, el); el.isConnected = true; el.children.forEach(child => { child.isConnected = true; }); } }
  };
  document.activeElement.isConnected = true;
  return {document, HTMLElement: Element, requestAnimationFrame: fn => fn()};
}
export function modalSource(source) {
  const start = source.indexOf('let modalReturnFocus = null;');
  const end = source.indexOf('window.closeModal = closeModal;', start);
  if (start < 0 || end < start) throw Error('Production modal source not found');
  return source.slice(start, end);
}
