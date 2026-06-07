import { t } from "../i18n/index.js";
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
  `;
  pageRoot.appendChild(main);
}
