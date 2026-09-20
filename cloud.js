// ---- Supabase 串接（Test-0920 專案）----
// URL 與 publishable key 設計上就是給前端用的；資料安全由資料庫的 RLS 規則把關。
const SUPABASE_URL = "https://aainfyqcbzchotrmactk.supabase.co";
const SUPABASE_KEY = "sb_publishable_EhP5d09NDYTcof7MkjTIEA_2mZyegBx";

const cloud = {
  client: null,
  user: null,
  status: "offline",   // offline | online

  // 匿名登入：不需註冊，每個瀏覽器一個身分。失敗時整個網站退回純本機模式。
  async init() {
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

  async leaderboard(game, limit = 10) {
    if (this.status !== "online") return null;
    const { data, error } = await this.client.rpc("get_leaderboard", { p_game: game, p_limit: limit });
    if (error) { console.warn("[cloud] leaderboard", error.message); return null; }
    return data;
  }
};
