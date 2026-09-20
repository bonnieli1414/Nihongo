// ---- 互動遊戲（表單）----
// 沿用 app.js 的 $ / store / shuffle / speak / KANA / ROMAJI
const baseSpeak = speak;
const profile = Object.assign({ nick: "", level: "零基礎", goal: 10, sound: true }, store.get("profile", {}));
speak = (t) => { if (profile.sound) baseSpeak(t); };

// 拉桿旁的 <output> 即時顯示數值
document.querySelectorAll(".game-form input[type=range]").forEach((r) => {
  const o = r.parentElement.querySelector("output");
  const sync = () => (o.textContent = r.value);
  r.addEventListener("input", sync);
  sync();
});

const setMsg = (el, text, cls = "") => { el.textContent = text; el.className = "form-msg " + cls; };

// ---- 玩家資料 ----
const pf = $("#profile-form");
function applyProfile() {
  pf.nick.value = profile.nick;
  pf.level.value = profile.level;
  pf.goal.value = profile.goal;
  pf.goal.dispatchEvent(new Event("input"));
  pf.sound.checked = profile.sound;
  $(".hero-jp").textContent = profile.nick ? `こんにちは、${profile.nick}さん！` : "こんにちは！";
}
pf.onsubmit = async (e) => {
  e.preventDefault();
  Object.assign(profile, { nick: pf.nick.value.trim(), level: pf.level.value, goal: +pf.goal.value, sound: pf.sound.checked });
  store.set("profile", profile);
  applyProfile();
  const synced = await cloud.saveProfile(profile);
  const base = profile.nick ? `已儲存，${profile.nick}！目標：每天 ${profile.goal} 個單字。` : "已儲存。";
  setMsg($("#profile-msg"), base + (synced ? "（已同步到雲端）" : "（僅存於本機）"), "ok");
  loadBoard();
};
applyProfile();

// ---- 雲端狀態 / 排行榜 ----
const badge = $("#cloud-badge");
const boardForm = $("#board-form"), boardList = $("#board-list");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function loadBoard() {
  const rows = await cloud.leaderboard(boardForm.game.value, 10);
  if (rows === null) { boardList.innerHTML = `<li class="hint">離線模式，無法顯示排行榜</li>`; return; }
  boardList.innerHTML = rows.length
    ? rows.map((r) => `<li><span class="who">${esc(r.nickname)}</span><span class="pts">${r.best_score} / ${r.total}</span></li>`).join("")
    : `<li class="hint">還沒有人上榜，來當第一名吧！</li>`;
}
boardForm.onsubmit = (e) => { e.preventDefault(); loadBoard(); };
boardForm.game.onchange = loadBoard;

(async () => {
  const online = await cloud.init();
  badge.textContent = online ? "☁️ 已連線" : "離線模式";
  badge.classList.toggle("online", online);
  if (online) {
    const remote = await cloud.loadProfile();
    if (remote) { Object.assign(profile, remote); store.set("profile", profile); applyProfile(); }
    else if (profile.nick) cloud.saveProfile(profile);   // 首次連線：把本機資料補傳上去
  }
  loadBoard();
  if (typeof loadRecords === "function") loadRecords();
})();

// ---- 遊戲切換 ----
const panels = { typing: $("#g-typing"), particle: $("#g-particle"), number: $("#g-number") };
const resultBox = $("#game-result");
document.querySelectorAll("#game-tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("#game-tabs button").forEach((x) => x.classList.toggle("active", x === b));
    Object.entries(panels).forEach(([k, p]) => (p.hidden = k !== b.dataset.g));
    resetPanels();
  };
});
function resetPanels() {
  resultBox.hidden = true;
  ["typing", "particle", "number"].forEach((g) => { $(`#${g}-setup`).hidden = false; $(`#${g}-play`).hidden = true; });
}

function showResult(game, score, total, extra = "", durationSec = null) {
  const key = "game-best-" + game, best = store.get(key, -1);
  const isBest = score > best;
  if (isBest) store.set(key, score);
  cloud.saveScore(game, score, total, durationSec).then((ok) => {
    if (!ok) return;
    if (boardForm.game.value === game) loadBoard();
    if (typeof loadRecords === "function") loadRecords();
  });
  const who = profile.nick ? `${profile.nick}，` : "";
  const msg = score === total ? "全對！すごい！" : score >= total * 0.7 ? "不錯喔！" : "再練習一次吧！";
  resultBox.hidden = false;
  resultBox.innerHTML = `<div class="q-result"><div class="score">${score} / ${total}</div>
    <p>${who}${msg}${extra}</p><p class="hint">${isBest ? "🎉 新紀錄！" : `最佳紀錄：${best} / ${total}`}</p>
    <button id="game-again">再玩一次</button></div>`;
  $("#game-again").onclick = resetPanels;
  resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---- 1. 假名打字 ----
const ALIAS = { shi: ["si"], chi: ["ti"], tsu: ["tu"], fu: ["hu"], wo: ["o"], n: ["nn"] };
const romajiOk = (ans, exp) => ans === exp || (ALIAS[exp] || []).includes(ans);
{
  const setup = $("#typing-setup"), play = $("#typing-play"), msg = $("#t-msg");
  let qs, i, score, t0, locked;
  const pool = (type) => {
    const types = type === "mix" ? ["hira", "kata"] : [type], out = [];
    types.forEach((t) => KANA[t].forEach((row, r) => row.forEach((ch, c) => ch && out.push({ q: ch, a: ROMAJI[r][c] }))));
    return out;
  };
  const next = () => {
    if (i >= qs.length) {
      const sec = Math.round((Date.now() - t0) / 1000);
      play.hidden = true;
      return showResult("typing", score, qs.length, `　用時 ${sec} 秒。`, sec);
    }
    locked = false;
    $("#t-progress").textContent = `第 ${i + 1} / ${qs.length} 題`;
    $("#t-score").textContent = `得分 ${score}`;
    $("#t-prompt").textContent = qs[i].q;
    play.ans.value = ""; play.ans.focus();
    setMsg(msg, "");
  };
  setup.onsubmit = (e) => {
    e.preventDefault();
    qs = shuffle(pool(setup.type.value)).slice(0, +setup.count.value);
    i = 0; score = 0; t0 = Date.now();
    resultBox.hidden = true; setup.hidden = true; play.hidden = false;
    next();
  };
  play.onsubmit = (e) => {
    e.preventDefault();
    if (locked) return;
    locked = true;
    const cur = qs[i], ans = play.ans.value.trim().toLowerCase();
    if (romajiOk(ans, cur.a)) { score++; setMsg(msg, "✔ 正確！", "ok"); }
    else setMsg(msg, `✘ 正解是 ${cur.a}`, "bad");
    speak(cur.q);
    i++;
    setTimeout(next, 900);
  };
}

// ---- 2. 助詞填空 ----
{
  const PARTICLES = ["は", "を", "に", "の", "で"];
  const BANK = [
    ["わたし", "学生です。", "は", "我是學生。", "「は」標示主題"],
    ["水", "飲みます。", "を", "喝水。", "「を」標示動作的對象"],
    ["これはわたし", "本です。", "の", "這是我的書。", "「の」表示所屬（的）"],
    ["学校", "行きます。", "に", "去學校。", "「に」表示移動的目的地"],
    ["図書館", "勉強します。", "で", "在圖書館讀書。", "「で」表示動作發生的場所"],
    ["ご飯", "食べます。", "を", "吃飯。", "「を」標示動作的對象"],
    ["友達", "会います。", "に", "跟朋友見面。", "「に」表示動作的對象／目標"],
    ["先生", "名前は田中です。", "の", "老師的名字是田中。", "「の」連接兩個名詞"],
    ["これ", "水です。", "は", "這是水。", "「は」標示主題"],
    ["公園", "遊びます。", "で", "在公園玩。", "「で」表示動作發生的場所"]
  ];
  const setup = $("#particle-setup"), play = $("#particle-play"), msg = $("#p-msg"), opts = $("#p-options");
  let qs, i, score, showHint, answered;
  const next = () => {
    if (i >= qs.length) { play.hidden = true; return showResult("particle", score, qs.length); }
    const [pre, post, , zh] = qs[i];
    answered = false;
    $("#p-progress").textContent = `第 ${i + 1} / ${qs.length} 題`;
    $("#p-score").textContent = `得分 ${score}`;
    $("#p-sentence").innerHTML = `${pre}<span class="blank">＿</span>${post}`;
    $("#p-hint").textContent = showHint ? zh : "";
    opts.innerHTML = PARTICLES.map((p) => `<label><input type="radio" name="pt" value="${p}" required> ${p}</label>`).join("");
    play.querySelector("button[type=submit]").textContent = "確定";
    setMsg(msg, "");
  };
  setup.onsubmit = (e) => {
    e.preventDefault();
    showHint = setup.hint.checked;
    qs = shuffle(BANK).slice(0, 8); i = 0; score = 0;
    resultBox.hidden = true; setup.hidden = true; play.hidden = false;
    next();
  };
  play.onsubmit = (e) => {
    e.preventDefault();
    if (answered) { i++; return next(); }   // 第二次按下：進入下一題
    const pick = play.pt.value, [pre, post, ans, , why] = qs[i];
    answered = true;
    opts.querySelectorAll("label").forEach((l) => {
      const inp = l.querySelector("input");
      inp.disabled = true;
      if (inp.value === ans) l.classList.add("ok"); else if (inp.value === pick) l.classList.add("bad");
    });
    $("#p-sentence").innerHTML = `${pre}<span class="blank">${ans}</span>${post}`;
    if (pick === ans) { score++; setMsg(msg, `✔ 正確！${why}`, "ok"); } else setMsg(msg, `✘ 答案是「${ans}」。${why}`, "bad");
    speak(pre + ans + post);
    play.querySelector("button[type=submit]").textContent = i + 1 >= qs.length ? "看結果" : "下一題";
  };
}

// ---- 3. 聽數字 ----
{
  const D = ["ぜろ", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];
  const toKana = (n) => n < 10 ? D[n] : (n >= 20 ? D[Math.floor(n / 10)] : "") + "じゅう" + (n % 10 ? D[n % 10] : "");
  const setup = $("#number-setup"), play = $("#number-play"), msg = $("#n-msg");
  let nums, i, score, showKana, locked;
  const say = () => baseSpeak(toKana(nums[i]));   // 即使關閉發音，本遊戲仍需要聲音
  const next = () => {
    if (i >= nums.length) { play.hidden = true; return showResult("number", score, nums.length); }
    locked = false;
    $("#n-progress").textContent = `第 ${i + 1} / ${nums.length} 題`;
    $("#n-score").textContent = `得分 ${score}`;
    $("#n-prompt").textContent = showKana ? toKana(nums[i]) : "🔊";
    play.ans.value = ""; play.ans.focus();
    setMsg(msg, "");
    say();
  };
  setup.onsubmit = (e) => {
    e.preventDefault();
    const max = +setup.max.value;
    showKana = setup.kana.checked;
    nums = Array.from({ length: 8 }, () => Math.floor(Math.random() * (max + 1)));
    i = 0; score = 0;
    resultBox.hidden = true; setup.hidden = true; play.hidden = false;
    next();
  };
  $("#n-replay").onclick = () => nums && say();
  play.onsubmit = (e) => {
    e.preventDefault();
    if (locked) return;
    locked = true;
    const n = nums[i];
    if (+play.ans.value === n) { score++; setMsg(msg, `✔ 正確！${n}（${toKana(n)}）`, "ok"); }
    else setMsg(msg, `✘ 答案是 ${n}（${toKana(n)}）`, "bad");
    $("#n-prompt").textContent = n;
    i++;
    setTimeout(next, 1400);
  };
}
