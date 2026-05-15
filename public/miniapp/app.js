const tg = window.Telegram?.WebApp || null;
if (tg) {
  tg.ready();
  tg.expand();
}

const initData = tg?.initData || "";
const headers = initData ? { Authorization: `tma ${initData}` } : {};
const devQuery = initData ? "" : "?user_id=dev";

const state = {
  dashboard: null,
  plans: null,
  usage: null,
  uploads: null,
};

function el(id) {
  return document.getElementById(id);
}

function setFacts(target, rows) {
  target.innerHTML = rows
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value ?? "—")}</dd>`)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const response = await fetch(`${path}${path.includes("?") ? "&" : devQuery}`, {
    ...options,
    headers: {
      ...headers,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || response.statusText);
  }
  return payload;
}

function renderSession(session) {
  const badge = el("sessionBadge");
  badge.textContent = session.authenticated ? session.mode : "unauthorized";
  badge.style.color = session.authenticated ? "var(--ok)" : "var(--warn)";
}

function renderDashboard(dashboard) {
  setFacts(el("runtimeSummary"), [
    ["User", dashboard.user?.id || "local"],
    ["Plan", dashboard.plan?.planType],
    ["Text left", dashboard.plan?.remaining?.text],
    ["Generation", dashboard.runtime?.generation],
    ["Access", dashboard.runtime?.access],
    ["Payments", dashboard.runtime?.payments],
  ]);
  el("expertsList").innerHTML = dashboard.experts.length
    ? dashboard.experts.map((expert) => `
      <div class="item">
        <strong>${escapeHtml(expert.displayName || expert.expertId)}</strong>
        <p>${escapeHtml(expert.niche || expert.status)}</p>
      </div>
    `).join("")
    : `<p>No experts configured.</p>`;
}

function renderPlans(payload) {
  const plans = Object.values(payload.plans || {});
  el("plansList").innerHTML = plans.map((plan) => `
    <article class="plan">
      <h3>${escapeHtml(plan.planType || plan.label)}</h3>
      <p>${escapeHtml(plan.description || (plan.premium ? "Premium plan" : "Free plan"))}</p>
      <dl class="facts">
        <dt>Text limit</dt><dd>${escapeHtml(plan.textLimit || plan.generationLimit || "—")}</dd>
        <dt>Stars</dt><dd>${escapeHtml(plan.starsPrice || "—")}</dd>
        <dt>Premium</dt><dd>${plan.premium ? "yes" : "no"}</dd>
      </dl>
    </article>
  `).join("");
}

function renderUsage(plan) {
  setFacts(el("usageFacts"), [
    ["Plan", plan.planType],
    ["Status", plan.status],
    ["Text", `${plan.usage?.text || 0}/${plan.limits?.text || 0}`],
    ["Photo", `${plan.usage?.photo || 0}/${plan.limits?.photo || 0}`],
    ["Audio", `${plan.usage?.audio || 0}/${plan.limits?.audio || 0}`],
    ["Video", `${plan.usage?.video || 0}/${plan.limits?.video || 0}`],
    ["Valid until", plan.validUntil || "not limited"],
  ]);
}

function renderUploads(uploads) {
  setFacts(el("uploadsFacts"), [
    ["Runtime profile", uploads.runtimeProfileFound ? "found" : "not found"],
    ["Uploads total", uploads.uploadsTotal],
    ["Knowledge", uploads.uploadTelemetry?.knowledge || 0],
    ["Style", uploads.uploadTelemetry?.style || 0],
    ["Avatar", uploads.uploadTelemetry?.avatar || 0],
    ["Voice", uploads.uploadTelemetry?.voice || 0],
    ["Flow", uploads.intakeHint],
  ]);
}

async function loadAll() {
  const sessionPayload = await api("/miniapp/api/session");
  renderSession(sessionPayload.session);

  const [dashboard, plans, usage, uploads] = await Promise.all([
    api("/miniapp/api/dashboard"),
    api("/miniapp/api/plans"),
    api("/miniapp/api/usage"),
    api("/miniapp/api/uploads"),
  ]);
  state.dashboard = dashboard.dashboard;
  state.plans = plans;
  state.usage = usage.plan;
  state.uploads = uploads.uploads;
  renderDashboard(state.dashboard);
  renderPlans(state.plans);
  renderUsage(state.usage);
  renderUploads(state.uploads);
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("is-active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
    button.classList.add("is-active");
    el(button.dataset.view).classList.add("is-active");
  });
});

el("generateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  el("generateResult").textContent = "Preparing...";
  try {
    const result = await api("/miniapp/api/generate", {
      method: "POST",
      body: JSON.stringify({
        topic: form.get("topic"),
        length: form.get("length"),
        platform: form.get("platform"),
      }),
    });
    el("generateResult").textContent = JSON.stringify(result.runtimePreview, null, 2);
    if (result.telegram?.deepLink && tg) {
      tg.MainButton.setText("Continue in Telegram");
      tg.MainButton.show();
      tg.MainButton.onClick(() => tg.openTelegramLink(result.telegram.deepLink));
    }
  } catch (error) {
    el("generateResult").textContent = error.message;
  }
});

loadAll().catch((error) => {
  el("sessionBadge").textContent = "error";
  setFacts(el("runtimeSummary"), [["Error", error.message]]);
});
