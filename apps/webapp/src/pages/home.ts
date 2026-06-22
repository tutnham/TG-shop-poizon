import type { ProductListItem } from "@poizon-shop/shared";
import { apiGet } from "../api/client.js";
import { mountCartPeek } from "../components/cart-peek.js";
import {
  renderCatalogPreview,
  setCatalogPreviewVisible,
} from "../components/catalog-preview.js";
import { renderHeader } from "../components/header.js";
import { renderProductCard } from "../components/product-card.js";
import { t } from "../i18n/index.js";
import { clearCartCache } from "../lib/cart-presence.js";
import {
  bindKeyboardDismiss,
  hideKeyboard,
  wireSearchInput,
} from "../lib/keyboard.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import { hideBackButton, hideMainButton } from "../telegram.js";

const PENDING_BRAND_KEY = "poizon_pending_brand";
const PENDING_CATEGORY_KEY = "poizon_pending_category";

// ── Конфигурация DOM-рециклинга для 9000+ товаров ──
const MAX_VISIBLE_CARDS = 120; // Максимум карточек в DOM одновременно
const RECYCLE_VIEWPORT_MULTIPLIER = 3; // Удалять карточки дальше 3 экранов от viewport
const LOAD_MORE_THRESHOLD = 60; // После 60 карточек показываем кнопку «Загрузить ещё»

export async function renderHome(app: HTMLElement): Promise<void> {
  hideMainButton();
  hideBackButton();
  clearCartCache();

  // Состояние каталога сбрасывается при каждом маунте страницы
  let page = 1;
  let loading = false;
  let hasMore = true;
  let activeBrand = "";
  let search = "";

  function badgeForIndex(
    index: number,
  ): { text: string; variant: "top" | "new" } | undefined {
    if (page > 1 || activeBrand || search) return undefined;
    if (index === 0) return { text: "Top 1", variant: "top" };
    if (index === 1) return { text: "New", variant: "new" };
    return undefined;
  }

  clearPageRoot(app);
  app.classList.add("page-with-nav");

  renderHeader(app, { showSearch: true });

  const pageRoot = ensurePageRoot(app);
  bindKeyboardDismiss(pageRoot);

  const main = document.createElement("main");
  main.className = "home-main";
  pageRoot.appendChild(main);

  // Pull-to-refresh indicator
  const ptrIndicator = document.createElement("div");
  ptrIndicator.className = "ptr-indicator";
  ptrIndicator.innerHTML = `<span class="material-symbols-outlined">refresh</span>`;
  main.appendChild(ptrIndicator);

  let ptrStartY = 0;
  let ptrPulling = false;

  main.addEventListener(
    "touchstart",
    (e) => {
      if (main.scrollTop <= 0 && !loading) {
        ptrStartY = e.touches[0]?.clientY ?? 0;
        ptrPulling = true;
      }
    },
    { passive: true },
  );

  main.addEventListener(
    "touchmove",
    (e) => {
      if (!ptrPulling) return;
      const clientY = e.touches[0]?.clientY ?? 0;
      const dy = clientY - ptrStartY;
      if (dy > 60 && main.scrollTop <= 0) {
        ptrIndicator.classList.add("ptr-indicator--visible");
      }
    },
    { passive: true },
  );

  main.addEventListener(
    "touchend",
    () => {
      if (!ptrPulling) return;
      ptrPulling = false;
      if (ptrIndicator.classList.contains("ptr-indicator--visible")) {
        doRefresh();
      }
    },
    { passive: true },
  );

  async function doRefresh() {
    page = 1;
    hasMore = true;
    cardIndex = 0;
    allCards.length = 0;
    grid.innerHTML = "";
    try {
      await loadMore();
    } finally {
      ptrIndicator.classList.remove("ptr-indicator--visible");
    }
  }

  const chips = document.createElement("section");
  chips.className = "chips-row hide-scrollbar";
  main.appendChild(chips);

  const trust = document.createElement("section");
  trust.innerHTML = `
    <div class="trust-banner">
      <div class="trust-banner__item">
        <span class="material-symbols-outlined">verified</span>
        <span class="trust-banner__label">${t("trust_auth")}</span>
      </div>
      <div class="trust-banner__divider"></div>
      <div class="trust-banner__item">
        <span class="material-symbols-outlined">local_shipping</span>
        <span class="trust-banner__label">${t("trust_delivery")}</span>
      </div>
      <div class="trust-banner__divider"></div>
      <div class="trust-banner__item">
        <span class="material-symbols-outlined">support_agent</span>
        <span class="trust-banner__label">${t("trust_support")}</span>
      </div>
    </div>
  `;
  main.appendChild(trust);

  main.appendChild(renderCatalogPreview());

  const catalog = document.createElement("section");
  catalog.className = "catalog-section";
  catalog.innerHTML = `
    <div class="section-head">
      <h2>${t("popular")}</h2>
    </div>
  `;
  const grid = document.createElement("div");
  grid.className = "grid-products";
  grid.id = "product-grid";
  catalog.appendChild(grid);
  main.appendChild(catalog);

  const syncBadge = document.createElement("p");
  syncBadge.className = "sync-footer";
  main.appendChild(syncBadge);

  void mountCartPeek(main);

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "chip active";
  allChip.dataset.brand = "";
  allChip.textContent = t("chip_all");
  allChip.onclick = () => filterBrand("");
  chips.appendChild(allChip);

  try {
    const { data: brands } = await apiGet<{
      data: string[];
    }>("/api/brands");
    for (const brandName of brands) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.brand = brandName;
      chip.textContent = brandName;
      chip.onclick = () => filterBrand(brandName);
      chips.appendChild(chip);
    }
  } catch {
    /* ignore */
  }

  const config = await apiGet<{
    last_synced_at: string | null;
  }>("/api/config").catch(() => null);
  if (config?.last_synced_at) {
    syncBadge.textContent = `${t("updated")}: ${new Date(config.last_synced_at).toLocaleDateString()}`;
  }

  let cardIndex = 0;
  const allCards: HTMLElement[] = [];
  let activeCategory = "";

  /** Удаляет карточки далеко за пределами viewport для экономии DOM */
  function recycleCards(): void {
    if (allCards.length < MAX_VISIBLE_CARDS) return;
    const vpTop = main.scrollTop;
    const thr = window.innerHeight * RECYCLE_VIEWPORT_MULTIPLIER;
    let removed = 0;
    while (allCards.length > 0 && removed < 20) {
      const c = allCards[0];
      if (!c?.isConnected) {
        allCards.shift();
        continue;
      }
      const cb = c.getBoundingClientRect().bottom + main.scrollTop;
      if (cb < vpTop - thr) {
        c.remove();
        allCards.shift();
        removed++;
      } else break;
    }
  }

  function updateLoadTrigger(): void {
    const btn = main.querySelector(
      "#load-more-btn",
    ) as HTMLButtonElement | null;
    if (allCards.length >= LOAD_MORE_THRESHOLD) {
      observer.unobserve(sentinel);
      sentinel.hidden = true;
      if (!btn) {
        const nb = document.createElement("button");
        nb.id = "load-more-btn";
        nb.type = "button";
        nb.className = "btn-primary load-more-btn";
        nb.textContent = t("load_more");
        nb.addEventListener("click", () => {
          if (!loading) void loadMore().then(() => updateLoadTrigger());
        });
        main.appendChild(nb);
      } else {
        btn.hidden = false;
      }
    } else {
      observer.observe(sentinel);
      sentinel.hidden = false;
      btn?.remove();
    }
  }

  async function filterBrand(brand: string) {
    activeBrand = brand;
    page = 1;
    hasMore = true;
    cardIndex = 0;
    allCards.length = 0;
    grid.innerHTML = "";
    for (const c of chips.querySelectorAll(".chip")) {
      const chipBrand = (c as HTMLElement).dataset.brand ?? "";
      c.classList.toggle("active", chipBrand === brand);
    }
    await loadMore();
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    const sk = document.createElement("div");
    sk.className = "skeleton";
    sk.style.height = "200px";
    sk.style.gridColumn = "1 / -1";
    grid.appendChild(sk);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: "20",
        sort: "new",
      });
      if (activeBrand) q.set("brand", activeBrand);
      if (activeCategory) q.set("category", activeCategory);
      if (search) q.set("search", search);
      const res = await apiGet<{
        data: ProductListItem[];
        pagination: { pages: number };
      }>(`/api/products?${q}`);
      sk.remove();
      for (const p of res.data) {
        const badge = badgeForIndex(cardIndex);
        const card = renderProductCard(p, badge ? { badge } : undefined);
        grid.appendChild(card);
        allCards.push(card);
        cardIndex++;
      }
      setCatalogPreviewVisible(page === 1 && res.data.length === 0);
      hasMore = page < res.pagination.pages;
      page++;
      recycleCards();
      updateLoadTrigger();
    } catch {
      sk.remove();
      setCatalogPreviewVisible(true);
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${t("error")}<br/><button type="button" class="btn-primary" style="margin-top:16px;width:auto">${t("retry")}</button></div>`;
      grid.querySelector("button")?.addEventListener("click", () => {
        page = 1;
        hasMore = true;
        cardIndex = 0;
        allCards.length = 0;
        grid.innerHTML = "";
        void loadMore();
      });
    }
    loading = false;
  }

  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  if (searchInput) wireSearchInput(searchInput);

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      search = searchInput.value.trim();
      page = 1;
      hasMore = true;
      cardIndex = 0;
      allCards.length = 0;
      grid.innerHTML = "";
      void loadMore().finally(() => hideKeyboard());
    }, 350);
  });

  const observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) void loadMore();
  });
  const sentinel = document.createElement("div");
  sentinel.style.height = "1px";
  main.appendChild(sentinel);
  observer.observe(sentinel);

  const cleanupObserver = () => {
    observer.disconnect();
    window.removeEventListener("hashchange", cleanupObserver);
  };
  window.addEventListener("hashchange", cleanupObserver, { once: true });

  // Рециклинг DOM при скролле (throttle через rAF)
  let recycleScheduled = false;
  main.addEventListener(
    "scroll",
    () => {
      if (recycleScheduled) return;
      recycleScheduled = true;
      requestAnimationFrame(() => {
        recycleScheduled = false;
        recycleCards();
      });
    },
    { passive: true },
  );

  const pendingBrand = sessionStorage.getItem(PENDING_BRAND_KEY);
  const pendingCategory = sessionStorage.getItem(PENDING_CATEGORY_KEY);
  if (pendingCategory !== null) {
    sessionStorage.removeItem(PENDING_CATEGORY_KEY);
    activeCategory = pendingCategory;
    await loadMore();
  } else if (pendingBrand !== null) {
    sessionStorage.removeItem(PENDING_BRAND_KEY);
    await filterBrand(pendingBrand);
  } else {
    await loadMore();
  }
}
