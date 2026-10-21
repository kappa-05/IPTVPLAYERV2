/**
 * IPTV Player V2 - High-Performance Virtualized Grid Engine
 * Capable of rendering 100,000+ items smoothly at 60 FPS by only
 * rendering items in the visible viewport.
 */

export class VirtualGrid {
  constructor(options) {
    this.container = options.container;
    this.renderItem = options.renderItem;
    this.cardType = options.cardType || 'live';
    this.viewMode = options.viewMode || 'grid';
    this.items = [];

    // Layout configuration
    this.gap = 18;
    this.itemHeight = 115;
    this.minItemWidth = 230;
    this.columns = 1;

    // Viewport and scroll state
    this.scrollTop = 0;
    this.containerHeight = 0;
    this.containerWidth = 0;
    this.totalRows = 0;
    this.totalHeight = 0;

    this.overscanRows = 2;
    this.isTicking = false;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.container.innerHTML = '';
    
    // Spacer element defines total scrollable height
    this.spacer = document.createElement('div');
    this.spacer.className = 'virtual-scroll-spacer';

    // Viewport holds only currently visible elements
    this.viewport = document.createElement('div');
    this.viewport.className = `virtual-grid-viewport grid-${this.cardType}`;

    this.spacer.appendChild(this.viewport);
    this.container.appendChild(this.spacer);
  }

  bindEvents() {
    this.onScroll = () => {
      this.scrollTop = this.container.scrollTop;
      this.requestRender();
    };

    this.onResize = () => {
      this.calculateDimensions();
      this.render();
    };

    this.container.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);
  }

  setCardType(type) {
    this.cardType = type;
    this.viewport.className = `virtual-grid-viewport grid-${this.cardType} ${this.viewMode === 'list' ? 'list-mode' : ''}`;
    this.calculateDimensions();
    this.render();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.viewport.className = `virtual-grid-viewport grid-${this.cardType} ${this.viewMode === 'list' ? 'list-mode' : ''}`;
    this.calculateDimensions();
    this.render();
  }

  setItems(items) {
    this.items = items || [];
    this.container.scrollTop = 0;
    this.scrollTop = 0;
    this.calculateDimensions();
    this.render();
  }

  calculateDimensions() {
    this.containerWidth = this.container.clientWidth - 48; // Account for padding
    this.containerHeight = this.container.clientHeight || 800;

    if (this.viewMode === 'list') {
      this.columns = 1;
      this.itemHeight = 72;
      this.gap = 8;
    } else {
      if (this.cardType === 'live') {
        this.minItemWidth = 230;
        this.itemHeight = 118;
      } else if (this.cardType === 'vod') {
        this.minItemWidth = 185;
        this.itemHeight = 310;
      } else if (this.cardType === 'series') {
        this.minItemWidth = 195;
        this.itemHeight = 320;
      }
      this.gap = 18;
      this.columns = Math.max(1, Math.floor((this.containerWidth + this.gap) / (this.minItemWidth + this.gap)));
    }

    this.totalRows = Math.ceil(this.items.length / this.columns);
    this.totalHeight = this.totalRows > 0 ? (this.totalRows * (this.itemHeight + this.gap) - this.gap) : 0;
    this.spacer.style.height = `${Math.max(this.totalHeight, 1)}px`;
  }

  requestRender() {
    if (!this.isTicking) {
      window.requestAnimationFrame(() => {
        this.render();
        this.isTicking = false;
      });
      this.isTicking = true;
    }
  }

  render() {
    if (!this.items.length) {
      this.viewport.innerHTML = '';
      return;
    }

    const rowHeight = this.itemHeight + this.gap;
    const startRow = Math.max(0, Math.floor(this.scrollTop / rowHeight) - this.overscanRows);
    const visibleRowCount = Math.ceil(this.containerHeight / rowHeight);
    const endRow = Math.min(this.totalRows - 1, startRow + visibleRowCount + (this.overscanRows * 2));

    const startIndex = startRow * this.columns;
    const endIndex = Math.min(this.items.length - 1, (endRow + 1) * this.columns - 1);

    const translateY = startRow * rowHeight;
    this.viewport.style.transform = `translateY(${translateY}px)`;

    // Efficient DocumentFragment batching
    const fragment = document.createDocumentFragment();
    for (let i = startIndex; i <= endIndex; i++) {
      const item = this.items[i];
      if (item) {
        const el = this.renderItem(item, i, this.cardType, this.viewMode);
        fragment.appendChild(el);
      }
    }

    this.viewport.innerHTML = '';
    this.viewport.appendChild(fragment);
  }

  destroy() {
    this.container.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
  }
}
