import type { ProductListItem } from "@poizon-shop/shared";
import { apiGet } from "../api/client.js";
import { renderHeader } from "../components/header.js";
import { renderProductCard } from "../components/product-card.js";
import { t } from "../i18n/index.js";
import { hideBackButton, hideMainButton } from "../telegram.js";

let page = 1;
let loading = false;
let hasMore = true;
let category = "";
let search = "";

function badgeForIndex(index: number): { text: string; variant: "top" | "new" } | undefined {
  if (page > 1 || category || search) return undefined;
  if (index === 0) return { text: "Top 1", variant: "top" };
  if (index === 1) return { text: "New", variant: "new" };
  return undefined;
}

export async function renderHome(app: HTMLElement): Promise<void> {
  hideMainButton();
  hideBackButton();

  app.innerHTML = "";
  app.classList.add("page-with-nav");

  renderHeader(app, { showSearch: true });

  const main = document.createElement("main");
  main.className = "home-main";
  app.appendChild(main);

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

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "chip active";
  allChip.dataset.slug = "";
  allChip.textContent = t("chip_all");
  allChip.onclick = () => filterCategory("");
  chips.appendChild(allChip);

  try {
    const { data: cats } = await apiGet<{
      data: { slug: string; name_ru: string }[];
    }>("/api/categories");
    for (const c of cats) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.slug = c.slug;
      chip.textContent = c.name_ru;
      chip.onclick = () => filterCategory(c.slug);
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

  async function filterCategory(slug: string) {
    category = slug;
    page = 1;
    hasMore = true;
    cardIndex = 0;
    grid.innerHTML = "";
    for (const c of chips.querySelectorAll(".chip")) {
      const chipSlug = (c as HTMLElement).dataset.slug ?? "";
      c.classList.toggle("active", chipSlug === slug);
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
        sort: "popular",
      });
      if (category) q.set("category", category);
      if (search) q.set("search", search);
      const res = await apiGet<{
        data: ProductListItem[];
        pagination: { pages: number };
      }>(`/api/products?${q}`);
      sk.remove();
      for (const p of res.data) {
        const badge = badgeForIndex(cardIndex);
        grid.appendChild(
          renderProductCard(p, badge ? { badge } : undefined),
        );
        cardIndex++;
      }
      hasMore = page < res.pagination.pages;
      page++;
    } catch {
      sk.remove();
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${t("error")}<br/><button type="button" class="btn-primary" style="margin-top:16px;width:auto">${t("retry")}</button></div>`;
      grid.querySelector("button")?.addEventListener("click", () => {
        page = 1;
        hasMore = true;
        cardIndex = 0;
        grid.innerHTML = "";
        void loadMore();
      });
    }
    loading = false;
  }

  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      search = searchInput.value.trim();
      page = 1;
      hasMore = true;
      cardIndex = 0;
      grid.innerHTML = "";
      void loadMore();
    }, 350);
  });

  const observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) void loadMore();
  });
  const sentinel = document.createElement("div");
  sentinel.style.height = "1px";
  main.appendChild(sentinel);
  observer.observe(sentinel);

  await loadMore();
}
