// ---- 我的紀錄：顯示 / 修改備註 / 刪除 ----
// 沿用 games.js 的 $ / esc / setMsg / profile / applyProfile / loadBoard 與 cloud.js
const GAME_NAMES = { typing: "⌨️ 假名打字", particle: "✏️ 助詞填空", number: "👂 聽數字" };
const recForm = $("#records-form"), recBody = $("#records-body"), recMsg = $("#records-msg");
let editingId = null;

const fmtTime = (iso) => new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function rowHtml(r) {
  const editing = r.id === editingId;
  const noteCell = editing
    ? `<input type="text" class="note-input" value="${esc(r.note || "")}" maxlength="50" placeholder="最多 50 字">`
    : esc(r.note || "") || `<span class="hint">—</span>`;
  const actions = editing
    ? `<button type="button" data-act="save" data-id="${r.id}">儲存</button> <button type="button" data-act="cancel">取消</button>`
    : `<button type="button" data-act="edit" data-id="${r.id}" title="修改備註">✏️</button> <button type="button" data-act="delete" data-id="${r.id}" title="刪除" class="danger">🗑️</button>`;
  return `<tr data-id="${r.id}">
    <td>${fmtTime(r.created_at)}</td><td>${GAME_NAMES[r.game] || esc(r.game)}</td>
    <td><b>${r.score} / ${r.total}</b></td><td>${r.duration_sec == null ? "—" : r.duration_sec + " 秒"}</td>
    <td>${noteCell}</td><td class="acts">${actions}</td></tr>`;
}

async function loadRecords() {
  const rows = await cloud.listScores(recForm.game.value);
  if (rows === null) {
    recBody.innerHTML = `<tr><td colspan="6" class="hint">離線模式，無法顯示雲端紀錄</td></tr>`;
    return;
  }
  recBody.innerHTML = rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="6" class="hint">還沒有紀錄，去玩一局吧！</td></tr>`;
  const input = recBody.querySelector(".note-input");
  if (input) input.focus();
}

recForm.onsubmit = (e) => { e.preventDefault(); editingId = null; setMsg(recMsg, ""); loadRecords(); };
recForm.game.onchange = () => { editingId = null; loadRecords(); };

recBody.onclick = async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = +btn.dataset.id;
  switch (btn.dataset.act) {
    case "edit": editingId = id; return loadRecords();
    case "cancel": editingId = null; return loadRecords();
    case "save": {
      const note = recBody.querySelector(".note-input").value.trim();
      const n = await cloud.updateNote(id, note);
      editingId = null;
      setMsg(recMsg, n === 1 ? "✔ 備註已更新" : "✘ 更新失敗", n === 1 ? "ok" : "bad");
      return loadRecords();
    }
    case "delete": {
      if (!confirm("確定要刪除這筆成績嗎？此動作無法復原。")) return;
      const n = await cloud.deleteScore(id);
      setMsg(recMsg, n === 1 ? "✔ 已刪除" : "✘ 刪除失敗", n === 1 ? "ok" : "bad");
      loadRecords(); loadBoard();
    }
  }
};
// 編輯備註時按 Enter 儲存、Esc 取消
recBody.onkeydown = (e) => {
  if (!e.target.classList.contains("note-input")) return;
  if (e.key === "Enter") recBody.querySelector('[data-act="save"]').click();
  if (e.key === "Escape") recBody.querySelector('[data-act="cancel"]').click();
};

$("#clear-scores").onclick = async () => {
  if (!confirm("確定要清空「全部」成績嗎？此動作無法復原，排行榜上的紀錄也會消失。")) return;
  const n = await cloud.deleteAllScores();
  setMsg(recMsg, n >= 0 ? `✔ 已刪除 ${n} 筆成績` : "✘ 刪除失敗（離線模式？）", n >= 0 ? "ok" : "bad");
  editingId = null; loadRecords(); loadBoard();
};

$("#delete-profile").onclick = async () => {
  if (!confirm("確定要刪除玩家資料（暱稱、程度、每日目標）嗎？成績不受影響。")) return;
  const n = await cloud.deleteProfile();
  if (n < 0) return setMsg(recMsg, "✘ 刪除失敗（離線模式？）", "bad");
  Object.assign(profile, { nick: "", level: "零基礎", goal: 10, sound: true });
  store.set("profile", profile);
  applyProfile();
  setMsg(recMsg, n === 1 ? "✔ 玩家資料已刪除" : "沒有可刪除的玩家資料", "ok");
  loadBoard();
};
