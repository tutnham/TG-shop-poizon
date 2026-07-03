import type { ProductGender, ProductListItem } from "@poizon-shop/shared";
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
  ProductImportError,
  importAndOpenProduct,
} from "../lib/import-actions.js";
import { looksLikeImportQuery } from "../lib/import-query.js";
import { hideKeyboard, wireFormInput } from "../lib/keyboard.js";
import {
  capturePageRenderGeneration,
  isActivePageRender,
} from "../lib/page-render-guard.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import { hideBackButton, hideMainButton } from "../telegram.js";

const PENDING_CATEGORY_KEY = "poizon_pending_category";
const WATCHES_CATEGORY_SLUG = "watches";

type CatalogStep = "category" | "brand" | "size" | "gender" | "results";

const STEP_TITLE_KEYS: Record<Exclude<CatalogStep, "results">, string> = {
  category: "catalog_step_category",
  brand: "catalog_step_brand",
  size: "catalog_step_size",
  gender: "catalog_step_gender",
};

// ── Конфигурация DOM-рециклинга для 9000+ товаров ──
const MAX_VISIBLE_CARDS = 120; // Максимум карточек в DOM одновременно
const RECYCLE_VIEWPORT_MULTIPLIER = 3; // Удалять карточки дальше 3 экранов от viewport
const LOAD_MORE_THRESHOLD = 60; // После 60 карточек показываем кнопку «Загрузить ещё»

export async function renderHome(app: HTMLElement): Promise<void> {
  const navGen = capturePageRenderGeneration();
  const stale = (): boolean => !isActivePageRender(navGen);

  hideMainButton();
  hideBackButton();
  clearCartCache();

  // Состояние каталога сбрасывается при каждом маунте страницы
  let page = 1;
  let loading = false;
  let hasMore = true;
  let activeBrand = "";
  let activeSize = "";
  let activeGender = "";
  let activeCategory = "";
  let search = "";
  let currentStep: CatalogStep = "category";
  let availableSizes: string[] = [];
  let availableGenders: ProductGender[] = [];
  const categoryLabels = new Map<string, string>([
    [WATCHES_CATEGORY_SLUG, t("category_watches")],
  ]);
  let apiCategories: { slug: string; name_ru: string }[] = [];

  function canShowCatalog(): boolean {
    return Boolean(search) || currentStep === "results";
  }

  function filtersActive(): boolean {
    return Boolean(
      activeBrand || activeSize || activeGender || activeCategory || search,
    );
  }

  function resetCatalogGrid(): void {
    page = 1;
    hasMore = true;
    cardIndex = 0;
    allCards.length = 0;
    grid.innerHTML = "";
  }

  function updateCatalogVisibility(): void {
    const visible = canShowCatalog();
    catalog.hidden = !visible;
    sentinel.hidden = !visible || allCards.length >= LOAD_MORE_THRESHOLD;
    if (!visible) {
      setCatalogPreviewVisible(false);
      main.querySelector("#load-more-btn")?.remove();
    }
  }

  function badgeForIndex(
    index: number,
  ): { text: string; variant: "top" | "new" } | undefined {
    if (page > 1 || filtersActive()) return undefined;
    if (index === 0) return { text: "Top 1", variant: "top" };
    if (index === 1) return { text: "New", variant: "new" };
    return undefined;
  }

  clearPageRoot(app);
  app.classList.add("page-with-nav");

  renderHeader(app, { showSearch: true, unifiedSearch: true });

  const pageRoot = ensurePageRoot(app);

  const main = document.createElement("main");
  main.className = "home-main";
  pageRoot.appendChild(main);

  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  const importBtn = document.getElementById(
    "search-import-btn",
  ) as HTMLButtonElement | null;
  const importStatus = document.getElementById(
    "search-import-status",
  ) as HTMLParagraphElement | null;

  if (searchInput) wireFormInput(searchInput);

  let importRunning = false;

  async function runImport(query: string): Promise<void> {
    if (importRunning) return;
    const trimmed = query.trim();
    if (!trimmed) {
      if (importStatus) {
        importStatus.textContent = t("poizon_import_invalid");
        importStatus.hidden = false;
      }
      return;
    }

    if (importStatus) {
      importStatus.textContent = t("poizon_import_loading");
      importStatus.classList.remove("is-error");
      importStatus.hidden = false;
    }
    importRunning = true;
    if (searchInput) searchInput.disabled = true;
    if (importBtn) importBtn.disabled = true;

    try {
      await importAndOpenProduct(trimmed);
    } catch (err) {
      const message =
        err instanceof ProductImportError ? err.message : t("error");
      if (importStatus) {
        importStatus.textContent = message;
        importStatus.classList.add("is-error");
        importStatus.hidden = false;
      }
    } finally {
      importRunning = false;
      if (searchInput) searchInput.disabled = false;
      if (importBtn) importBtn.disabled = false;
    }
  }

  importBtn?.addEventListener("click", () => {
    hideKeyboard();
    const q = searchInput?.value.trim() ?? "";
    if (looksLikeImportQuery(q) || q) {
      void runImport(q);
    }
  });

  searchInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    hideKeyboard();
    const q = searchInput.value.trim();
    if (looksLikeImportQuery(q)) {
      void runImport(q);
    }
  });

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
    if (stale() || !canShowCatalog()) return;
    resetCatalogGrid();
    try {
      await loadMore();
    } finally {
      ptrIndicator.classList.remove("ptr-indicator--visible");
    }
  }

  const wizard = document.createElement("section");
  wizard.className = "catalog-wizard";
  wizard.innerHTML = `
    <div class="catalog-wizard__path" id="catalog-path"></div>
    <div class="catalog-wizard__head">
      <button type="button" class="catalog-wizard__back" id="catalog-back" hidden>
        <span class="material-symbols-outlined">arrow_back</span>
        <span>${t("catalog_back")}</span>
      </button>
      <h3 class="catalog-wizard__title" id="catalog-step-title"></h3>
    </div>
    <section class="chips-row hide-scrollbar" id="catalog-step-chips"></section>
  `;
  main.appendChild(wizard);

  const pathEl = wizard.querySelector("#catalog-path") as HTMLElement;
  const backBtn = wizard.querySelector("#catalog-back") as HTMLButtonElement;
  const stepTitleEl = wizard.querySelector(
    "#catalog-step-title",
  ) as HTMLElement;
  const stepChips = wizard.querySelector("#catalog-step-chips") as HTMLElement;

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
  catalog.hidden = true;
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

  function renderFilterChip(
    container: HTMLElement,
    label: string,
    value: string,
    onSelect: (value: string) => void,
  ): void {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.value = value;
    chip.textContent = label;
    chip.onclick = () => onSelect(value);
    container.appendChild(chip);
  }

  function renderPath(): void {
    pathEl.innerHTML = "";
    const segments: { step: CatalogStep; label: string }[] = [];
    if (activeCategory) {
      segments.push({
        step: "category",
        label: categoryLabels.get(activeCategory) ?? activeCategory,
      });
    }
    if (activeBrand) segments.push({ step: "brand", label: activeBrand });
    if (activeSize) {
      segments.push({
        step: "size",
        label: `${t("filter_size")} ${activeSize}`,
      });
    }
    if (activeGender) {
      segments.push({
        step: "gender",
        label: t(`filter_gender_${activeGender}`),
      });
    }

    for (const [index, segment] of segments.entries()) {
      if (index > 0) {
        const sep = document.createElement("span");
        sep.className = "catalog-wizard__sep";
        sep.textContent = "›";
        sep.setAttribute("aria-hidden", "true");
        pathEl.appendChild(sep);
      }
      const crumb = document.createElement("button");
      crumb.type = "button";
      crumb.className = "catalog-wizard__crumb";
      crumb.textContent = segment.label;
      crumb.onclick = () => void goBackToStep(segment.step);
      pathEl.appendChild(crumb);
    }
    pathEl.hidden = segments.length === 0;
  }

  function renderStepTitle(): void {
    if (currentStep === "results") {
      stepTitleEl.hidden = true;
      return;
    }
    stepTitleEl.hidden = false;
    stepTitleEl.textContent = t(STEP_TITLE_KEYS[currentStep]);
  }

  function previousStep(step: CatalogStep): CatalogStep | null {
    switch (step) {
      case "brand":
        return "category";
      case "size":
        return "brand";
      case "gender":
        return availableSizes.length > 0 ? "size" : "brand";
      default:
        return null;
    }
  }

  async function goBackToStep(step: CatalogStep): Promise<void> {
    if (stale()) return;
    if (step === "category") {
      activeCategory = "";
      activeBrand = "";
      activeSize = "";
      activeGender = "";
      availableSizes = [];
      availableGenders = [];
      currentStep = "category";
    } else if (step === "brand") {
      activeBrand = "";
      activeSize = "";
      activeGender = "";
      currentStep = "brand";
    } else if (step === "size") {
      activeGender = "";
      currentStep = "size";
    } else if (step === "gender") {
      activeGender = "";
      currentStep = "gender";
    }
    resetCatalogGrid();
    renderWizard();
    updateCatalogVisibility();
    if (currentStep === "brand") await renderBrandStep();
  }

  async function goToPreviousStep(): Promise<void> {
    const prev = previousStep(currentStep);
    if (!prev) return;
    if (prev === "category") {
      activeCategory = "";
      activeBrand = "";
      activeSize = "";
      activeGender = "";
      availableSizes = [];
      availableGenders = [];
    } else if (prev === "brand") {
      activeBrand = "";
      activeSize = "";
      activeGender = "";
      availableSizes = [];
      availableGenders = [];
    } else if (prev === "size") {
      activeSize = "";
      activeGender = "";
    } else if (prev === "gender") {
      activeGender = "";
    }
    currentStep = prev;
    resetCatalogGrid();
    renderWizard();
    updateCatalogVisibility();
    if (currentStep === "brand") await renderBrandStep();
  }

  backBtn.onclick = () => void goToPreviousStep();

  async function refreshAvailableFilters(): Promise<void> {
    const requestCategory = activeCategory;
    const q = new URLSearchParams();
    if (requestCategory) q.set("category", requestCategory);
    const { data: filters } = await apiGet<{
      data: { sizes: string[]; genders: ProductGender[] };
    }>(`/api/product-filters${q.size ? `?${q}` : ""}`);
    if (stale() || requestCategory !== activeCategory) return;
    availableSizes = filters.sizes;
    availableGenders = filters.genders;
  }

  async function renderBrandStep(): Promise<void> {
    stepChips.innerHTML = "";
    const requestCategory = activeCategory;
    const q = new URLSearchParams();
    if (requestCategory) q.set("category", requestCategory);
    try {
      const { data: brands } = await apiGet<{ data: string[] }>(
        `/api/brands${q.size ? `?${q}` : ""}`,
      );
      if (stale() || requestCategory !== activeCategory) return;
      for (const brandName of brands) {
        renderFilterChip(stepChips, brandName, brandName, (value) =>
          void selectBrand(value),
        );
      }
    } catch {
      stepChips.innerHTML = `<p class="empty-state">${t("error")}</p>`;
    }
  }

  function renderCategoryStep(): void {
    stepChips.innerHTML = "";
    renderFilterChip(
      stepChips,
      t("category_watches"),
      WATCHES_CATEGORY_SLUG,
      (value) => void selectCategory(value),
    );
    for (const category of apiCategories) {
      if (category.slug === WATCHES_CATEGORY_SLUG) continue;
      renderFilterChip(
        stepChips,
        category.name_ru,
        category.slug,
        (value) => void selectCategory(value),
      );
    }
  }

  function renderSizeStep(): void {
    stepChips.innerHTML = "";
    for (const size of availableSizes) {
      renderFilterChip(
        stepChips,
        `${t("filter_size")} ${size}`,
        size,
        (value) => void selectSize(value),
      );
    }
  }

  function renderGenderStep(): void {
    stepChips.innerHTML = "";
    for (const gender of availableGenders) {
      renderFilterChip(
        stepChips,
        t(`filter_gender_${gender}`),
        gender,
        (value) => void selectGender(value as ProductGender),
      );
    }
  }

  async function renderCurrentStep(): Promise<void> {
    stepChips.hidden = currentStep === "results";
    switch (currentStep) {
      case "category":
        renderCategoryStep();
        break;
      case "brand":
        await renderBrandStep();
        break;
      case "size":
        renderSizeStep();
        break;
      case "gender":
        renderGenderStep();
        break;
      case "results":
        stepChips.innerHTML = "";
        break;
    }
  }

  function renderWizard(): void {
    renderPath();
    renderStepTitle();
    backBtn.hidden = currentStep === "category";
    void renderCurrentStep();
  }

  async function advanceAfterBrand(): Promise<void> {
    await refreshAvailableFilters();
    if (stale()) return;
    if (availableSizes.length > 0) {
      currentStep = "size";
      return;
    }
    if (availableGenders.length > 0) {
      currentStep = "gender";
      return;
    }
    currentStep = "results";
    updateCatalogVisibility();
    await loadMore();
  }

  async function advanceAfterSize(): Promise<void> {
    if (availableGenders.length > 0) {
      currentStep = "gender";
      return;
    }
    currentStep = "results";
    updateCatalogVisibility();
    await loadMore();
  }

  async function selectCategory(category: string): Promise<void> {
    if (stale()) return;
    activeCategory = category;
    activeBrand = "";
    activeSize = "";
    activeGender = "";
    availableSizes = [];
    availableGenders = [];
    currentStep = "brand";
    resetCatalogGrid();
    renderWizard();
    updateCatalogVisibility();
    await renderBrandStep();
  }

  async function selectBrand(brand: string): Promise<void> {
    if (stale()) return;
    activeBrand = brand;
    activeSize = "";
    activeGender = "";
    resetCatalogGrid();
    await advanceAfterBrand();
    if (stale()) return;
    renderWizard();
    updateCatalogVisibility();
  }

  async function selectSize(size: string): Promise<void> {
    if (stale()) return;
    activeSize = size;
    activeGender = "";
    resetCatalogGrid();
    await advanceAfterSize();
    if (stale()) return;
    renderWizard();
    updateCatalogVisibility();
  }

  async function selectGender(gender: ProductGender): Promise<void> {
    if (stale()) return;
    activeGender = gender;
    currentStep = "results";
    resetCatalogGrid();
    renderWizard();
    updateCatalogVisibility();
    await loadMore();
  }

  const config = await apiGet<{
    last_synced_at: string | null;
  }>("/api/config").catch(() => null);
  if (stale()) return;
  if (config?.last_synced_at) {
    syncBadge.textContent = `${t("updated")}: ${new Date(config.last_synced_at).toLocaleDateString()}`;
  }

  let cardIndex = 0;
  const allCards: HTMLElement[] = [];

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

  async function loadMore() {
    if (loading || !hasMore || stale() || !canShowCatalog()) return;
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
      if (activeSize) q.set("size", activeSize);
      if (activeGender) q.set("gender", activeGender);
      if (search) q.set("search", search);
      const res = await apiGet<{
        data: ProductListItem[];
        pagination: { pages: number };
      }>(`/api/products?${q}`);
      if (stale()) return;
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
      if (stale()) return;
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
    } finally {
      loading = false;
    }
  }

  const searchInputForCatalog = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  searchInputForCatalog?.addEventListener("input", () => {
    if (importStatus) importStatus.hidden = true;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      search = searchInputForCatalog.value.trim();
      resetCatalogGrid();
      updateCatalogVisibility();
      if (canShowCatalog()) void loadMore();
    }, 350);
  });

  const observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) void loadMore();
  });
  const sentinel = document.createElement("div");
  sentinel.style.height = "1px";
  sentinel.hidden = true;
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

  try {
    const { data: categories } = await apiGet<{
      data: { slug: string; name_ru: string }[];
    }>("/api/categories");
    if (stale()) return;
    apiCategories = categories;
    for (const category of categories) {
      categoryLabels.set(category.slug, category.name_ru);
    }
  } catch {
    /* ignore */
  }

  const pendingCategory = sessionStorage.getItem(PENDING_CATEGORY_KEY);
  if (pendingCategory !== null) {
    sessionStorage.removeItem(PENDING_CATEGORY_KEY);
    if (!stale()) {
      activeCategory = pendingCategory;
      currentStep = "brand";
      renderWizard();
      updateCatalogVisibility();
      await renderBrandStep();
    }
  } else if (!stale()) {
    renderWizard();
    updateCatalogVisibility();
  }
}
