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

export async function renderHome(app: HTMLElement): Promise<void> {
  hideMainButton();
  hideBackButton();
  app.innerHTML = '<div class="page" id="home-page"></div>';
  const pageEl = app.querySelector("#home-page") as HTMLElement;
  renderHeader(app, { showSearch: true });

  const trust = document.createElement("div");
  trust.className = "trust-block";
  trust.style.cssText =
    "margin:12px 16px;padding:14px;background:var(--color-surface);border-radius:var(--radius-card);";
  trust.innerHTML = `<strong>${t("trust_title")}</strong><br/><span style="color:var(--color-text-muted);font-size:var(--font-sm)">${t("trust_text")}</span>`;
  pageEl.before(trust);

  const chips = document.createElement("div");
  chips.style.cssText =
    "display:flex;gap:8px;overflow-x:auto;padding:0 16px 12px;-webkit-overflow-scrolling:touch";
  pageEl.before(chips);

  const grid = document.createElement("div");
  grid.className = "grid-products";
  grid.id = "product-grid";
  pageEl.appendChild(grid);

  const syncBadge = document.createElement("p");
  syncBadge.style.cssText =
    "font-size:var(--font-xs);color:var(--color-text-faint);text-align:center";
  pageEl.appendChild(syncBadge);

  try {
    const { data: cats } = await apiGet<{
      data: { slug: string; name_ru: string }[];
    }>("/api/categories");
    const allChip = document.createElement("button");
    allChip.className = "chip active";
    allChip.dataset.slug = "";
    allChip.textContent = "All";
    allChip.onclick = () => filterCategory("");
    chips.appendChild(allChip);
    for (const c of cats) {
      const chip = document.createElement("button");
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
    markup_disclaimer_ru: string;
  }>("/api/config").catch(() => null);
  if (config?.last_synced_at) {
    syncBadge.textContent = `${t("updated")}: ${new Date(config.last_synced_at).toLocaleDateString()}`;
  }

  async function filterCategory(slug: string) {
    category = slug;
    page = 1;
    hasMore = true;
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
        grid.appendChild(renderProductCard(p));
      }
      hasMore = page < res.pagination.pages;
      page++;
    } catch {
      sk.remove();
      grid.innerHTML = `<div class="empty-state">${t("error")}<br/><button class="btn-primary" style="margin-top:16px;width:auto">${t("retry")}</button></div>`;
      grid.querySelector("button")?.addEventListener("click", () => {
        page = 1;
        hasMore = true;
        grid.innerHTML = "";
        void loadMore();
      });
    }
    loading = false;
  }

  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  searchInput?.addEventListener("change", () => {
    search = searchInput.value.trim();
    page = 1;
    hasMore = true;
    grid.innerHTML = "";
    void loadMore();
  });

  const observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) void loadMore();
  });
  const sentinel = document.createElement("div");
  sentinel.style.height = "1px";
  pageEl.appendChild(sentinel);
  observer.observe(sentinel);

  await loadMore();
}
