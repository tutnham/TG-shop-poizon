import { escapeHtml } from "./escape.js";

export function showToast(message: string, durationMs = 2200): void {
  const existing = document.querySelector(".app-toast");
  existing?.remove();

  const el = document.createElement("div");
  el.className = "app-toast";
  el.setAttribute("role", "status");
  el.innerHTML = `
    <span class="material-symbols-outlined app-toast__icon">check_circle</span>
    <span>${escapeHtml(message)}</span>
  `;
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add("app-toast--visible"));

  window.setTimeout(() => {
    el.classList.remove("app-toast--visible");
    window.setTimeout(() => el.remove(), 200);
  }, durationMs);
}
