const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

// ---- 發音 ----
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

// ---- 五十音 ----
function renderKana(type) {
  const grid = $("#kana-grid");
  grid.innerHTML = "";
  KANA[type].forEach((row, r) => row.forEach((ch, c) => {
    const cell = document.createElement("div");
    if (!ch) { cell.className = "kana-cell empty"; grid.append(cell); return; }
    cell.className = "kana-cell";
    cell.innerHTML = `<b>${ch}</b><span>${ROMAJI[r][c]}</span>`;
    cell.onclick = () => speak(ch);
    grid.append(cell);
  }));
}
document.querySelectorAll("#kana-tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("#kana-tabs button").forEach((x) => x.classList.toggle("active", x === b));
    renderKana(b.dataset.k);
  };
});
renderKana("hira");

// ---- 單字卡 ----
let cat = Object.keys(VOCAB)[0], idx = 0;
const flash = $("#flash");
function renderCard() {
  const list = VOCAB[cat], [jp, kana, zh] = list[idx];
  flash.classList.remove("flipped");
  $("#f-jp").textContent = jp;
  $("#f-kana").textContent = kana;
  $("#f-zh").textContent = zh;
  $("#f-count").textContent = `${cat}　${idx + 1} / ${list.length}`;
}
function move(d) {
  const n = VOCAB[cat].length;
  idx = (idx + d + n) % n;
  renderCard();
}
Object.keys(VOCAB).forEach((k, i) => {
  const b = document.createElement("button");
  b.textContent = k;
  if (i === 0) b.classList.add("active");
  b.onclick = () => {
    cat = k; idx = 0;
    document.querySelectorAll("#vocab-tabs button").forEach((x) => x.classList.toggle("active", x === b));
    renderCard();
  };
  $("#vocab-tabs").append(b);
});
flash.onclick = () => flash.classList.toggle("flipped");
flash.onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flash.classList.toggle("flipped"); }
  if (e.key === "ArrowRight") move(1);
  if (e.key === "ArrowLeft") move(-1);
};
$("#f-prev").onclick = () => move(-1);
$("#f-next").onclick = () => move(1);
$("#f-speak").onclick = () => { const [jp, kana] = VOCAB[cat][idx]; speak(kana ? kana.split("／")[0] : jp); };
renderCard();

// ---- 常用會話 ----
PHRASES.forEach(([jp, ro, zh]) => {
  const d = document.createElement("div");
  d.className = "phrase";
  d.innerHTML = `<div><div class="jp">${jp}</div><div class="ro">${ro}</div></div><div class="zh">${zh}</div>`;
  d.onclick = () => speak(jp.replace("〇〇", ""));
  $("#phrase-list").append(d);
});

// ---- 文法 ----
GRAMMAR.forEach((g, i) => {
  const d = document.createElement("details");
  if (i === 0) d.open = true;
  d.innerHTML = `<summary>${g.title}</summary><p>${g.body}</p>` +
    g.ex.map(([jp, zh]) => `<div class="ex" data-jp="${jp}">${jp}<small>${zh}</small></div>`).join("");
  d.querySelectorAll(".ex").forEach((e) => (e.onclick = () => speak(e.dataset.jp)));
  $("#grammar-list").append(d);
});

// ---- 測驗 ----
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
let quizType = "hira";

function buildPool(type) {
  if (type === "vocab") return Object.values(VOCAB).flat().map(([jp, kana, zh]) => ({ q: jp, a: zh, hint: kana }));
  const pool = [];
  KANA[type].forEach((row, r) => row.forEach((ch, c) => { if (ch) pool.push({ q: ch, a: ROMAJI[r][c] }); }));
  return pool;
}

function startQuiz() {
  const pool = buildPool(quizType);
  const qs = shuffle(pool).slice(0, 10);
  let i = 0, score = 0;
  const box = $("#quiz-box");

  function show() {
    if (i >= qs.length) return finish();
    const cur = qs[i];
    const wrong = shuffle(pool.filter((p) => p.a !== cur.a)).slice(0, 3).map((p) => p.a);
    const opts = shuffle([cur.a, ...wrong]);
    box.innerHTML = `<div class="q-meta"><span>第 ${i + 1} / ${qs.length} 題</span><span>得分 ${score}</span></div>
      <div class="q-prompt">${cur.q}</div>
      ${cur.hint ? `<p class="hint" style="text-align:center">${cur.hint}</p>` : ""}
      <div class="q-opts">${opts.map((o) => `<button>${o}</button>`).join("")}</div>`;
    box.querySelector(".q-prompt").onclick = () => speak(cur.hint || cur.q);
    box.querySelectorAll(".q-opts button").forEach((b) => {
      b.onclick = () => {
        const right = b.textContent === cur.a;
        if (right) score++;
        b.classList.add(right ? "ok" : "bad");
        box.querySelectorAll(".q-opts button").forEach((x) => {
          x.disabled = true;
          if (x.textContent === cur.a) x.classList.add("ok");
        });
        setTimeout(() => { i++; show(); }, 800);
      };
    });
  }

  function finish() {
    const best = store.get("best", {});
    if (score > (best[quizType] ?? -1)) best[quizType] = score;
    store.set("best", best);
    updateStat();
    const msg = score >= 9 ? "太棒了！すごい！" : score >= 6 ? "不錯喔，繼續加油！" : "再多練習幾次吧！";
    box.innerHTML = `<div class="q-result"><div class="score">${score} / ${qs.length}</div><p>${msg}</p>
      <button id="again">再測一次</button></div>`;
    $("#again").onclick = startQuiz;
  }
  show();
}
document.querySelectorAll("#quiz-tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("#quiz-tabs button").forEach((x) => x.classList.toggle("active", x === b));
    quizType = b.dataset.q;
    startQuiz();
  };
});
startQuiz();

// ---- 最佳成績 ----
function updateStat() {
  const best = store.get("best", {});
  const names = { hira: "平假名", kata: "片假名", vocab: "單字" };
  const parts = Object.keys(best).map((k) => `${names[k]} ${best[k]}/10`);
  $("#stat").textContent = parts.length ? "最佳成績：" + parts.join("　") : "";
}
updateStat();

// ---- 認識日本圖片 ----
document.querySelectorAll(".gallery figure").forEach((f) => (f.onclick = () => speak(f.dataset.say)));
