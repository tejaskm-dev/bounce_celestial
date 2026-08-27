/**
 * Arcade Instruction & Info Modal for BOUNCE
 * No website clutter; clean, structured arcade reference guide.
 */
export class InfoModal {
  private modalEl: HTMLElement;
  private closeBtn: HTMLElement;
  private tabBtns: NodeListOf<HTMLButtonElement>;
  private tabPanels: NodeListOf<HTMLElement>;
  private isOpen: boolean = false;

  constructor() {
    this.modalEl = document.getElementById('modal-info')!;
    this.closeBtn = document.getElementById('btn-close-info')!;
    this.tabBtns = document.querySelectorAll('.info-tab-btn');
    this.tabPanels = document.querySelectorAll('.info-tab-panel');

    this.setupListeners();
  }

  private setupListeners(): void {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
      });
    }

    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.hide();
        }
      });
    }

    this.tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabId = btn.getAttribute('data-tab');
        this.switchTab(tabId || 'controls');
      });
    });
  }

  public switchTab(tabId: string): void {
    this.tabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    this.tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.getAttribute('data-panel') === tabId);
    });
  }

  public show(): void {
    this.isOpen = true;
    this.modalEl.classList.add('active');
    this.switchTab('controls');
  }

  public hide(): void {
    this.isOpen = false;
    this.modalEl.classList.remove('active');
  }

  public isVisible(): boolean {
    return this.isOpen;
  }
}
