import { getLang, t } from "../i18n/index.js";
import { langToggleLabel, toggleLanguage } from "../i18n/toggle-language.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import { getTg, hideBackButton, hideMainButton } from "../telegram.js";

export async function renderProfile(app: HTMLElement): Promise<void> {
  hideMainButton();
  hideBackButton();

  clearPageRoot(app);
  app.classList.add("page-with-nav");
  const pageRoot = ensurePageRoot(app);

  const tgUser = getTg()?.initDataUnsafe?.user;

  const displayName =
    [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ") ||
    tgUser?.username ||
    t("profile_guest");

  const main = document.createElement("main");
  main.className = "page page-tg-content";
  main.innerHTML = `
    <section class="profile-card">
      <div class="profile-card__avatar" aria-hidden="true">
        <span class="material-symbols-outlined">person</span>
      </div>
      <h2 class="profile-card__name">${displayName}</h2>
      ${tgUser?.username ? `<p class="profile-card__username">@${tgUser.username}</p>` : ""}
      ${tgUser?.id ? `<p class="profile-card__meta">ID ${tgUser.id}</p>` : ""}
    </section>
    <section class="profile-settings">
      <h3 class="section-title">${t("profile_settings")}</h3>
      <button type="button" class="profile-settings__row" id="profile-lang-btn">
        <span class="material-symbols-outlined">translate</span>
        <span class="profile-settings__label">${t("lang_switch")}</span>
        <span class="profile-settings__value" id="profile-lang-value">${langToggleLabel()}</span>
      </button>
      <p class="profile-settings__hint">${t("profile_lang_hint")} · ${getLang().toUpperCase()}</p>
    </section>
  `;
  pageRoot.appendChild(main);

  main.querySelector("#profile-lang-btn")?.addEventListener("click", () => {
    void toggleLanguage();
  });
}
