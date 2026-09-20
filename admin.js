// ---- 管理者模式：顯示 / 修改 / 刪除「所有玩家」的資料，並管理使用者群組 ----
// 沿用 games.js 的 $ / esc / setMsg / loadBoard、records.js 的 GAME_NAMES / fmtTime / loadRecords
const adminBox = $("#admin-box"), adminLogin = $("#admin-login"), adminPanel = $("#admin-panel");
const adminHead = $("#admin-head"), adminBody = $("#admin-body"), adminMsg = $("#admin-msg"), adminFilter = $("#admin-filter");
let adminTab = "scores", adminEditing = null;
const LEVELS = ["零基礎", "N5", "N4"];

const ROLE_NAMES = { admin: "管理者", user: "使用者" };
const ADMIN_ERRORS = {
  "cannot demote yourself": "不能把自己降為使用者",
  "cannot delete yourself": "不能刪除自己",
  "anonymous users cannot be admin": "匿名使用者不能設為管理者（需使用 Email 帳號）"
};
const friendly = (m) => ADMIN_ERRORS[m] || m;

async function refreshAdminState() {
  const role = await cloud.myRole();
  $("#role-badge").textContent = `群組：${ROLE_NAMES[role] || "使用者"}`;
  $("#role-badge").classList.toggle("online", role === "admin");
  const isAdmin = await cloud.isAdmin();
  adminLogin.hidden = isAdmin;
  adminPanel.hidden = !isAdmin;
  if (isAdmin) {
    $("#admin-who").textContent = `已登入：${cloud.user.email}`;
    adminBox.open = true;
    loadAdmin();
  } else {
    adminBody.innerHTML = "";
  }
  return isAdmin;
}

// ---- 表格 ----
const HEADS = {
  scores: ["玩家", "時間", "遊戲", "成績", "用時(秒)", "備註", "操作"],
  players: ["暱稱", "Email", "群組", "程度", "每日目標", "局數", "加入時間", "操作"]
};
const actions = (id, editing) => editing
  ? `<button type="button" data-act="save" data-id="${id}">儲存</button> <button type="button" data-act="cancel">取消</button>`
  : `<button type="button" data-act="edit" data-id="${id}" title="修改">✏️</button> <button type="button" data-act="delete" data-id="${id}" title="刪除" class="danger">🗑️</button>`;

function scoreRow(r) {
  const ed = adminEditing === r.id;
  return `<tr>
    <td>${esc(r.nickname)}</td><td>${fmtTime(r.created_at)}</td><td>${GAME_NAMES[r.game] || esc(r.game)}</td>
    <td>${ed ? `<input type="number" class="cell-num" data-f="score" min="0" value="${r.score}"> / <input type="number" class="cell-num" data-f="total" min="1" max="50" value="${r.total}">`
              : `<b>${r.score} / ${r.total}</b>`}</td>
    <td>${ed ? `<input type="number" class="cell-num" data-f="duration" min="0" value="${r.duration_sec ?? ""}">` : r.duration_sec ?? "—"}</td>
    <td>${ed ? `<input type="text" class="cell-text" data-f="note" maxlength="50" value="${esc(r.note || "")}">` : esc(r.note || "") || `<span class="hint">—</span>`}</td>
    <td class="acts">${actions(r.id, ed)}</td></tr>`;
}

function playerRow(p) {
  const ed = adminEditing === p.id, self = p.id === cloud.user.id;
  const roleCell = ed
    ? `<select data-f="role"${self ? " disabled" : ""}>${Object.entries(ROLE_NAMES).map(([v, n]) =>
        `<option value="${v}"${v === p.role ? " selected" : ""}${v === "admin" && p.is_anonymous ? " disabled" : ""}>${n}</option>`).join("")}</select>`
    : `<span class="role-tag ${p.role}">${ROLE_NAMES[p.role]}</span>`;
  const acts = ed ? actions(p.id, true)
    : `<button type="button" data-act="edit" data-id="${p.id}" title="修改">✏️</button>` +
      (self ? "" : ` <button type="button" data-act="delete" data-id="${p.id}" title="刪除" class="danger">🗑️</button>`);
  return `<tr>
    <td>${ed ? `<input type="text" class="cell-text" data-f="nickname" maxlength="12" value="${esc(p.nickname)}">` : esc(p.nickname) || `<span class="hint">（未命名）</span>`}${self ? " <span class=\"hint\">（我）</span>" : ""}</td>
    <td>${p.is_anonymous ? `<span class="hint">匿名</span>` : esc(p.email || "")}</td>
    <td>${roleCell}</td>
    <td>${ed ? `<select data-f="level">${LEVELS.map((l) => `<option${l === p.level ? " selected" : ""}>${l}</option>`).join("")}</select>` : esc(p.level)}</td>
    <td>${ed ? `<input type="number" class="cell-num" data-f="goal" min="5" max="50" value="${p.daily_goal}">` : p.daily_goal}</td>
    <td>${p.plays}</td><td>${fmtTime(p.created_at)}</td>
    <td class="acts">${acts}</td></tr>`;
}

async function loadAdmin() {
  adminHead.innerHTML = `<tr>${HEADS[adminTab].map((h) => `<th>${h}</th>`).join("")}</tr>`;
  adminFilter.hidden = adminTab !== "scores";
  const cols = HEADS[adminTab].length;
  const { data, error } = adminTab === "scores"
    ? await cloud.admin("admin_list_scores", { p_game: adminFilter.game.value || null, p_limit: 200 })
    : await cloud.admin("admin_list_players");
  if (error) { adminBody.innerHTML = `<tr><td colspan="${cols}" class="hint">載入失敗：${esc(error)}</td></tr>`; return; }
  adminBody.innerHTML = data.length
    ? data.map(adminTab === "scores" ? scoreRow : playerRow).join("")
    : `<tr><td colspan="${cols}" class="hint">沒有資料</td></tr>`;
  const first = adminBody.querySelector("input,select");
  if (first) first.focus();
}

const done = (ok, okText, failText) => setMsg(adminMsg, ok ? "✔ " + okText : "✘ " + failText, ok ? "ok" : "bad");
const afterChange = () => { adminEditing = null; loadAdmin(); loadBoard(); loadRecords(); };

adminBody.onclick = async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = adminTab === "scores" ? +btn.dataset.id : btn.dataset.id;
  const val = (f) => adminBody.querySelector(`[data-f="${f}"]`).value;
  switch (btn.dataset.act) {
    case "edit": adminEditing = id; return loadAdmin();
    case "cancel": adminEditing = null; return loadAdmin();
    case "save": {
      const r = adminTab === "scores"
        ? await cloud.admin("admin_update_score", {
            p_id: id, p_score: +val("score"), p_total: +val("total"),
            p_duration: val("duration") === "" ? null : +val("duration"), p_note: val("note") })
        : await cloud.admin("admin_update_player", {
            p_id: id, p_nickname: val("nickname"), p_level: val("level"), p_goal: +val("goal"), p_role: val("role") });
      done(!r.error && r.data === 1, "已更新", r.error ? friendly(r.error) + "（請檢查數值：分數不可大於題數等）" : "找不到這筆資料");
      return afterChange();
    }
    case "delete": {
      const msg = adminTab === "scores" ? "確定要刪除這筆成績嗎？此動作無法復原。" : "確定要刪除這位玩家嗎？他的所有成績也會一併刪除，且無法復原。";
      if (!confirm(msg)) return;
      const r = await cloud.admin(adminTab === "scores" ? "admin_delete_score" : "admin_delete_player", { p_id: id });
      done(!r.error && r.data >= 1, "已刪除", r.error ? friendly(r.error) : "刪除失敗");
      return afterChange();
    }
  }
};
adminBody.onkeydown = (e) => {
  if (!e.target.matches("input")) return;
  if (e.key === "Enter") adminBody.querySelector('[data-act="save"]')?.click();
  if (e.key === "Escape") adminBody.querySelector('[data-act="cancel"]')?.click();
};

document.querySelectorAll("#admin-tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("#admin-tabs button").forEach((x) => x.classList.toggle("active", x === b));
    adminTab = b.dataset.a; adminEditing = null; setMsg(adminMsg, "");
    loadAdmin();
  };
});
adminFilter.onsubmit = (e) => { e.preventDefault(); adminEditing = null; loadAdmin(); };
adminFilter.game.onchange = () => { adminEditing = null; loadAdmin(); };

// ---- 登入 / 登出 ----
adminLogin.onsubmit = async (e) => {
  e.preventDefault();
  const msg = $("#admin-login-msg");
  setMsg(msg, "登入中…");
  const { error } = await cloud.adminSignIn(adminLogin.email.value.trim(), adminLogin.password.value);
  adminLogin.password.value = "";
  if (error) return setMsg(msg, "✘ " + error, "bad");
  if (await refreshAdminState()) { setMsg(msg, ""); }
  else {
    setMsg(msg, "✘ 這個帳號屬於「使用者」群組，不是管理者", "bad");
    await cloud.adminSignOut();
  }
  loadBoard(); loadRecords();
};

$("#admin-logout").onclick = async () => {
  await cloud.adminSignOut();
  adminEditing = null;
  await refreshAdminState();
  loadBoard(); loadRecords();
};

cloud.init().then(refreshAdminState);
