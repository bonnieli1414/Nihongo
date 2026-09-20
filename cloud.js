// ---- Supabase 串接（Test-0920 專案）----
// URL 與 publishable key 設計上就是給前端用的；資料安全由資料庫的 RLS 規則把關。
const SUPABASE_URL = "https://aainfyqcbzchotrmactk.supabase.co";
const SUPABASE_KEY = "sb_publishable_EhP5d09NDYTcof7MkjTIEA_2mZyegBx";

const cloud = {
  client: null,
  user: null,
  status: "offline",   // offline | online

  // 匿名登入：不需註冊，每個瀏覽器一個身分。失敗時整個網站退回純本機模式。
  // 重複呼叫會共用同一次初始化；force = true 則重新來過（登出管理者後使用）。
  init(force = false) {
    if (force || !this._init) this._init = this._doInit();
    return this._init;
  },

  async _doInit() {
    try {
      if (!window.supabase) throw new Error("supabase-js 未載入");
      this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      let { data: { session } } = await this.client.auth.getSession();
      if (!session) {
        const { data, error } = await this.client.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      this.user = session.user;
      this.status = "online";
    } catch (err) {
      console.warn("[cloud] 離線模式：", err.message || err);
      this.status = "offline";
    }
    return this.status === "online";
  },

  async loadProfile() {
    if (this.status !== "online") return null;
    const { data, error } = await this.client.from("profiles").select("nickname, level, daily_goal, sound").maybeSingle();
    if (error) { console.warn("[cloud] loadProfile", error.message); return null; }
    return data && { nick: data.nickname, level: data.level, goal: data.daily_goal, sound: data.sound };
  },

  async saveProfile(p) {
    if (this.status !== "online") return false;
    const { error } = await this.client.from("profiles").upsert({
      id: this.user.id, nickname: p.nick, level: p.level, daily_goal: p.goal, sound: p.sound, updated_at: new Date().toISOString()
    });
    if (error) console.warn("[cloud] saveProfile", error.message);
    return !error;
  },

  async saveScore(game, score, total, durationSec = null) {
    if (this.status !== "online") return false;
    const { error } = await this.client.from("game_scores").insert({ game, score, total, duration_sec: durationSec });
    if (error) console.warn("[cloud] saveScore", error.message);
    return !error;
  },

  // ---- 我的紀錄：顯示 / 修改備註 / 刪除 ----
  async listScores(game = "") {
    if (this.status !== "online") return null;
    let q = this.client.from("game_scores").select("id, game, score, total, duration_sec, note, created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (game) q = q.eq("game", game);
    const { data, error } = await q;
    if (error) { console.warn("[cloud] listScores", error.message); return null; }
    return data;
  },

  // 回傳實際受影響的筆數；-1 代表失敗
  async updateNote(id, note) {
    if (this.status !== "online") return -1;
    const { data, error } = await this.client.from("game_scores").update({ note: note || null }).eq("id", id).select("id");
    if (error) { console.warn("[cloud] updateNote", error.message); return -1; }
    return data.length;
  },

  async deleteScore(id) {
    if (this.status !== "online") return -1;
    const { data, error } = await this.client.from("game_scores").delete().eq("id", id).select("id");
    if (error) { console.warn("[cloud] deleteScore", error.message); return -1; }
    return data.length;
  },

  async deleteAllScores() {
    if (this.status !== "online") return -1;
    const { data, error } = await this.client.from("game_scores").delete().gt("id", 0).select("id");  // RLS 只會刪到自己的
    if (error) { console.warn("[cloud] deleteAllScores", error.message); return -1; }
    return data.length;
  },

  async deleteProfile() {
    if (this.status !== "online") return -1;
    const { data, error } = await this.client.from("profiles").delete().eq("id", this.user.id).select("id");
    if (error) { console.warn("[cloud] deleteProfile", error.message); return -1; }
    return data.length;
  },

  // ---- 管理者模式 ----
  // 權限完全由資料庫把關（user_roles 群組 + 管理函式），前端只負責呈現。
  get isAnonymous() { return !!this.user?.is_anonymous; },

  async adminSignIn(email, password) {
    if (this.status !== "online") return { error: "離線模式，無法登入" };
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    this.user = data.user;
    return { error: null };
  },

  async adminSignOut() {
    if (this.client) await this.client.auth.signOut();
    return this.init(true);   // 回到新的匿名身分
  },

  // 目前登入者所屬群組：'admin'（管理者）或 'user'（使用者）；離線時為 null
  async myRole() {
    if (this.status !== "online") return null;
    const { data, error } = await this.client.from("user_roles").select("role").maybeSingle();
    return error ? null : (data?.role ?? "user");
  },

  // 管理者必須是管理者群組，且使用 Email 登入（匿名帳號不算）
  async isAdmin() {
    return !this.isAnonymous && (await this.myRole()) === "admin";
  },

  // 回傳 { data, error }；update / delete 的 data 為受影響筆數
  async admin(fn, args = {}) {
    if (this.status !== "online") return { data: null, error: "離線模式" };
    const { data, error } = await this.client.rpc(fn, args);
    if (error) console.warn("[cloud]", fn, error.message);
    return { data, error: error ? error.message : null };
  },

  async leaderboard(game, limit = 10) {
    if (this.status !== "online") return null;
    const { data, error } = await this.client.rpc("get_leaderboard", { p_game: game, p_limit: limit });
    if (error) { console.warn("[cloud] leaderboard", error.message); return null; }
    return data;
  }
};
