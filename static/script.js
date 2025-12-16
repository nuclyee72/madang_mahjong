// ===== 공통 상수 =====
const UMA_VALUES = [50, 10, -10, -30];
const RETURN_SCORE = 30000;

// 전체 게임 / 플레이어 요약 캐시 (통계 화면용)
let ALL_GAMES = [];
let PLAYER_SUMMARY = [];
let ALL_BADGES = [];

// ===== 개인 레이팅(전체 등수) 정렬 상태 =====
let RANKING_SORT = { key: "total_pt", dir: "desc" }; // 기본: 총 pt 내림차순

// ===== 아카이브 캐시 / 정렬 상태 =====
let ARCHIVES = [];
let CURRENT_ARCHIVE_GAMES = [];
let ARCHIVE_PLAYER_SUMMARY = [];
let ARCHIVE_RANKING_SORT = { key: "total_pt", dir: "desc" }; // 아카이브 전체등수 정렬

// ===== 대회 전용 =====
let TOURNAMENT_GAMES = [];

// ===== 포인트 계산 =====
function calcPts(scores) {
  const order = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .map((o) => o.i);

  const uma = [0, 0, 0, 0];
  order.forEach((idx, rank) => {
    uma[idx] = UMA_VALUES[rank];
  });

  return scores.map((s, i) => {
    const base = (s - RETURN_SCORE) / 1000.0;
    return +(base + uma[i]).toFixed(1);
  });
}

// ===== 시간: 저장된 시간을 UTC로 보고 +9h 후 한국시간으로 표시 =====
function formatKoreanTime(isoString) {
  if (!isoString) return "";

  const parts = isoString.split(/[T ]/);
  if (parts.length < 2) return isoString;

  const [datePart, timePart] = parts;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return isoString;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const kstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);

  const y = kstDate.getUTCFullYear();
  const m = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kstDate.getUTCDate()).padStart(2, "0");
  const hh = String(kstDate.getUTCHours()).padStart(2, "0");
  const mm = String(kstDate.getUTCMinutes()).padStart(2, "0");

  return `${y}-${m}-${d} ${hh}:${mm}`;
}

// ===== 등수 분포 바 =====
function createRankDistBar(rankCounts, games) {
  const total = games || 1;
  const bar = document.createElement("div");
  bar.className = "rank-dist-bar";

  for (let i = 0; i < 4; i++) {
    const count = rankCounts[i] || 0;
    const percentage = total > 0 ? (count * 100) / total : 0;

    const seg = document.createElement("div");
    seg.className = `rank-seg rank-seg${i + 1}`;
    seg.style.width = percentage.toFixed(1) + "%";

    const span = document.createElement("span");
    span.textContent = count > 0 ? `${percentage.toFixed(0)}%` : "";

    seg.appendChild(span);
    bar.appendChild(seg);
  }
  return bar;
}

// ===== fetch 래퍼(JSON) =====
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      if (d && d.error) msg += ` - ${d.error}`;
    } catch (_) {}
    throw new Error(msg);
  }
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

// ===== 정렬 화살표(공용) =====
function updateSortIndicatorsForTable(tableId, sortState) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const headers = table.querySelectorAll("th.sortable[data-sort-key]");
  headers.forEach((th) => {
    const span = th.querySelector(".sort-indicator");
    if (span) span.textContent = "";
  });

  const active = table.querySelector(
    `th.sortable[data-sort-key="${sortState.key}"]`
  );
  if (!active) return;

  const span = active.querySelector(".sort-indicator");
  if (span) span.textContent = sortState.dir === "desc" ? "▼" : "▲";
}

// ===== 메인 엔트리 =====
document.addEventListener("DOMContentLoaded", () => {
  setupViewSwitch();

  setupPersonalForm();
  setupRankingSort(); // 개인레이팅(전체등수) 정렬

  setupStatsView();

  setupArchiveView();
  setupArchiveRankingSort(); // 아카이브 전체등수 정렬

  setupTournamentForm();

  setupAdminView();

  loadGamesAndRanking(); // 개인전 데이터 로드
  reloadBadgeList();
  reloadArchiveList();
});

// ======================= 상단 탭 전환 =======================
function setupViewSwitch() {
  const personalView = document.getElementById("personal-view");
  const statsView = document.getElementById("stats-view");
  const archiveView = document.getElementById("archive-view");
  const tournamentView = document.getElementById("tournament-view");
  const adminView = document.getElementById("admin-view");
  const buttons = document.querySelectorAll(".view-switch-btn");

  function showView(view) {
    if (personalView) personalView.style.display = view === "personal" ? "block" : "none";

    if (statsView) {
      statsView.style.display = view === "stats" ? "block" : "none";
      if (view === "stats") updateStatsPlayerSelect();
    }

    if (archiveView) {
      archiveView.style.display = view === "archive" ? "block" : "none";
      if (view === "archive") reloadArchiveList();
    }

    if (tournamentView) {
      tournamentView.style.display = view === "tournament" ? "block" : "none";
      if (view === "tournament") loadTournamentGamesAndRanking();
    }

    if (adminView) {
      adminView.style.display = view === "admin" ? "block" : "none";
      if (view === "admin") {
        reloadBadgeList();
        reloadArchiveList();
      }
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      showView(btn.dataset.view);
    });
  });

  showView("personal");
}

// ======================= 개인 레이팅(전체 등수) 정렬 =======================
function setupRankingSort() {
  const table = document.getElementById("ranking-table");
  if (!table) return;

  const headers = table.querySelectorAll("th.sortable[data-sort-key]");
  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;

      if (RANKING_SORT.key === key) {
        RANKING_SORT.dir = RANKING_SORT.dir === "desc" ? "asc" : "desc";
      } else {
        RANKING_SORT.key = key;
        RANKING_SORT.dir = "desc";
      }

      renderRankingTable();
      updateSortIndicatorsForTable("ranking-table", RANKING_SORT);
    });
  });
}

function sortPlayersByState(list, sortState) {
  const key = sortState.key;
  const dir = sortState.dir === "desc" ? -1 : 1;

  const arr = [...(list || [])];
  arr.sort((a, b) => {
    const av = Number(a[key] ?? 0);
    const bv = Number(b[key] ?? 0);
    if (av === bv) return String(a.name).localeCompare(String(b.name), "ko");
    return (av - bv) * dir;
  });
  return arr;
}

function renderRankingTable() {
  const rankingBody = document.getElementById("ranking-tbody");
  if (!rankingBody) return;

  const sorted = sortPlayersByState(PLAYER_SUMMARY, RANKING_SORT);

  rankingBody.innerHTML = "";
  if (!sorted.length) {
    rankingBody.innerHTML = `<tr><td colspan="7" class="ranking-placeholder">통계 없음</td></tr>`;
    return;
  }

  sorted.forEach((p, idx) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${p.name}</td>
      <td>${p.games}</td>
      <td>${Number(p.total_pt).toFixed(1)}</td>
      <td>${Number(p.avg_pt).toFixed(1)}</td>
      <td>${Number(p.yonde_rate).toFixed(1)}%</td>
      <td></td>
    `;
    tr.children[6].appendChild(createRankDistBar(p.rankCounts, p.games));
    rankingBody.appendChild(tr);
  });

  updateSortIndicatorsForTable("ranking-table", RANKING_SORT);
}

// ======================= 개인 레이팅 화면 =======================
function setupPersonalForm() {
  const form = document.getElementById("game-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    const p1_name = (fd.get("player1_name") || "").toString().trim();
    const p2_name = (fd.get("player2_name") || "").toString().trim();
    const p3_name = (fd.get("player3_name") || "").toString().trim();
    const p4_name = (fd.get("player4_name") || "").toString().trim();

    const s1 = parseInt(fd.get("player1_score"), 10);
    const s2 = parseInt(fd.get("player2_score"), 10);
    const s3 = parseInt(fd.get("player3_score"), 10);
    const s4 = parseInt(fd.get("player4_score"), 10);

    if ([s1, s2, s3, s4].some((v) => Number.isNaN(v))) {
      alert("점수는 숫자로 입력해주세요.");
      return;
    }

    const total = s1 + s2 + s3 + s4;
    if (total !== 100000) {
      alert(`네 사람 점수 합이 100000이 아닙니다.\n현재 합: ${total}`);
      return;
    }

    const payload = {
      player1_name: p1_name,
      player2_name: p2_name,
      player3_name: p3_name,
      player4_name: p4_name,
      player1_score: s1,
      player2_score: s2,
      player3_score: s3,
      player4_score: s4,
    };

    try {
      await fetchJSON("/api/games", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      await loadGamesAndRanking();
    } catch (err) {
      console.error(err);
      alert("게임 저장에 실패했습니다.\n" + err.message);
    }
  });
}

async function loadGamesAndRanking() {
  const tbody = document.getElementById("games-tbody");
  const rankingBody = document.getElementById("ranking-tbody");
  if (!tbody || !rankingBody) return;

  let games = [];
  try {
    games = await fetchJSON("/api/games");
  } catch (err) {
    console.error(err);
    return;
  }

  // ✅ 무조건 최신이 위로
  games = (games || []).slice().sort((a, b) => (b.id || 0) - (a.id || 0));

  ALL_GAMES = games;

  tbody.innerHTML = "";
  const playerStats = {};

  games.forEach((g) => {
    const scores = [
      Number(g.player1_score),
      Number(g.player2_score),
      Number(g.player3_score),
      Number(g.player4_score),
    ];
    const names = [
      g.player1_name,
      g.player2_name,
      g.player3_name,
      g.player4_name,
    ].map((n) => (n || "").trim());

    const pts = calcPts(scores);

    const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    const ranks = [0, 0, 0, 0];
    order.forEach((o, idx) => (ranks[o.i] = idx + 1));

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${g.id}</td>
      <td>${formatKoreanTime(g.created_at)}</td>
      <td></td><td></td><td></td><td></td>
      <td></td>
    `;

    for (let i = 0; i < 4; i++) {
      const td = tr.children[2 + i];
      const name = names[i] || "";
      const score = scores[i];
      const pt = pts[i];

      td.innerHTML = `<strong>${name}</strong><br>${score} (${pt})`;
      if (ranks[i] === 1) td.classList.add("winner-cell");

      if (!name) continue;
      if (!playerStats[name]) {
        playerStats[name] = { games: 0, total_pt: 0, rankCounts: [0, 0, 0, 0] };
      }
      playerStats[name].games += 1;
      playerStats[name].total_pt += pt;
      playerStats[name].rankCounts[ranks[i] - 1] += 1;
    }

    const tdDel = tr.children[6];
    const btn = document.createElement("button");
    btn.textContent = "삭제";
    btn.addEventListener("click", async () => {
      if (!confirm("이 판을 삭제할까요?")) return;
      try {
        await fetchJSON(`/api/games/${g.id}`, { method: "DELETE" });
        await loadGamesAndRanking();
      } catch (err) {
        console.error(err);
        alert("삭제 실패");
      }
    });
    tdDel.appendChild(btn);

    tbody.appendChild(tr);
  });

  // ===== PLAYER_SUMMARY 만들기 =====
  const players = Object.entries(playerStats).map(([name, st]) => {
    const games = st.games;
    const total_pt_raw = st.total_pt;
    const total_pt = +total_pt_raw.toFixed(1);
    const avg_pt = games > 0 ? total_pt_raw / games : 0;

    const c1 = st.rankCounts[0];
    const c2 = st.rankCounts[1];
    const yonde = games > 0 ? ((c1 + c2) * 100) / games : 0;

    return {
      name,
      games,
      total_pt,
      avg_pt: +avg_pt.toFixed(1),
      yonde_rate: +yonde.toFixed(1),
      rankCounts: st.rankCounts,
    };
  });

  PLAYER_SUMMARY = players;

  // ✅ 정렬 상태대로 렌더
  renderRankingTable();

  // 개인별 통계 화면 플레이어 목록 갱신
  updateStatsPlayerSelect();
}

// ======================= 개인별 통계 화면 =======================
function setupStatsView() {
  const select = document.getElementById("stats-player-select");
  if (!select) return;

  select.addEventListener("change", () => {
    renderStatsForPlayer(select.value);
  });
}

function updateStatsPlayerSelect() {
  const select = document.getElementById("stats-player-select");
  if (!select) return;

  const prev = select.value;
  select.innerHTML = '<option value="">플레이어를 선택하세요</option>';

  // 보기 좋게는 “총pt 내림차순” 기준으로 옵션 생성
  const sorted = [...PLAYER_SUMMARY].sort((a, b) => (b.total_pt || 0) - (a.total_pt || 0));

  sorted.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${p.name} (${p.games}판, ${p.total_pt.toFixed(1)}pt)`;
    select.appendChild(opt);
  });

  if (prev && sorted.some((p) => p.name === prev)) {
    select.value = prev;
    renderStatsForPlayer(prev);
  } else {
    renderStatsForPlayer("");
  }
}

function computePlayerDetailStats(playerName, games) {
  let totalGames = 0;
  let totalPt = 0;
  const rankCounts = [0, 0, 0, 0];
  const recent = [];
  const coMap = {};

  let tobiCount = 0;
  let maxScore = null;

  const gameRecords = [];

  games.forEach((g) => {
    const scores = [
      Number(g.player1_score),
      Number(g.player2_score),
      Number(g.player3_score),
      Number(g.player4_score),
    ];
    const names = [
      g.player1_name,
      g.player2_name,
      g.player3_name,
      g.player4_name,
    ].map((n) => (n || "").trim());

    const pts = calcPts(scores);
    const idx = names.findIndex((n) => n === playerName);
    if (idx === -1) return;

    const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    const ranks = [0, 0, 0, 0];
    order.forEach((o, pos) => (ranks[o.i] = pos + 1));
    const myRank = ranks[idx];

    totalGames += 1;
    totalPt += pts[idx];
    rankCounts[myRank - 1] += 1;

    if (scores[idx] < 0) tobiCount += 1;
    if (maxScore === null || scores[idx] > maxScore) maxScore = scores[idx];

    recent.push({ created_at: g.created_at, rank: myRank });

    for (let j = 0; j < 4; j++) {
      if (j === idx) continue;
      const cname = (names[j] || "").trim();
      if (!cname) continue;
      if (!coMap[cname]) coMap[cname] = { games: 0, my_rank_sum: 0, co_rank_sum: 0 };
      coMap[cname].games += 1;
      coMap[cname].my_rank_sum += myRank;
      coMap[cname].co_rank_sum += ranks[j];
    }

    gameRecords.push({
      id: g.id,
      created_at: g.created_at,
      names,
      scores,
      pts,
      ranks,
      myIndex: idx,
    });
  });

  const yonde = totalGames > 0 ? ((rankCounts[0] + rankCounts[1]) * 100.0) / totalGames : 0;
  const tobiRate = totalGames > 0 ? (tobiCount * 100.0) / totalGames : 0;

  const coPlayers = Object.entries(coMap)
    .map(([name, st]) => ({
      name,
      games: st.games,
      my_avg_rank: st.my_rank_sum / st.games,
      co_avg_rank: st.co_rank_sum / st.games,
    }))
    .sort((a, b) => b.games - a.games || String(a.name).localeCompare(String(b.name), "ko"));

  // ✅ 최근 그래프는 “오래된 → 최신”이 보기 좋게
  recent.reverse();

  // ✅ 개인 대국기록은 최신이 위로 보고싶다면 reverse 하지 말고(이미 최신이 위), 그대로 둔다
  // gameRecords는 games 순서(최신이 위)로 들어오니 그대로면 최신이 위.

  return {
    games: totalGames,
    total_pt: totalPt,
    rankCounts,
    yonde_rate: yonde,
    recent,
    coPlayers,
    tobi_count: tobiCount,
    tobi_rate: tobiRate,
    max_score: maxScore ?? 0,
    gameRecords,
  };
}

function renderStatsForPlayer(name) {
  const summaryDiv = document.getElementById("stats-summary");
  const distDiv = document.getElementById("stats-rank-dist");
  const recentDiv = document.getElementById("stats-recent-ranks");
  const coTbody = document.getElementById("stats-co-tbody");
  const playerGamesTbody = document.getElementById("stats-player-games-tbody");

  if (!summaryDiv || !distDiv || !recentDiv || !coTbody) return;

  if (!name) {
    summaryDiv.innerHTML = '<p class="hint-text">왼쪽 상단에서 플레이어를 선택하세요.</p>';
    distDiv.innerHTML = "";
    recentDiv.innerHTML = '<p class="hint-text">플레이어를 선택하면 최근 등수 그래프가 표시됩니다.</p>';
    coTbody.innerHTML = '<tr><td colspan="4" class="ranking-placeholder">데이터 없음</td></tr>';
    if (playerGamesTbody) {
      playerGamesTbody.innerHTML =
        '<tr><td colspan="5" class="ranking-placeholder">플레이어를 선택하면 기록이 표시됩니다.</td></tr>';
    }
    loadPlayerBadgesForStats("");
    return;
  }

  const detail = computePlayerDetailStats(name, ALL_GAMES);

  summaryDiv.innerHTML = `
    <div class="stats-summary-main">
      <div><span class="stats-label">플레이어</span> <span class="stats-value">${name}</span></div>
      <div><span class="stats-label">게임 수</span> <span class="stats-value">${detail.games}</span></div>
      <div><span class="stats-label">총 pt</span> <span class="stats-value">${detail.total_pt.toFixed(1)}</span></div>
      <div><span class="stats-label">연대율</span> <span class="stats-value">${detail.yonde_rate.toFixed(1)}%</span></div>
      <div><span class="stats-label">토비율</span> <span class="stats-value">${detail.tobi_rate.toFixed(1)}% (${detail.tobi_count}회)</span></div>
      <div><span class="stats-label">최다 점수</span> <span class="stats-value">${detail.max_score}</span></div>
    </div>
  `;

  // --- 총 등수 분포 바 + 1·2·3·4등 비율/판수 (한 줄) ---
  distDiv.innerHTML = "";
  distDiv.appendChild(createRankDistBar(detail.rankCounts, detail.games));

  const totalGames = detail.games || 0;
  const rankCounts = detail.rankCounts || [0, 0, 0, 0];

  const infoWrap = document.createElement("div");
  infoWrap.className = "rank-dist-detail";
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const cnt = rankCounts[i] || 0;
    const pct = totalGames > 0 ? (cnt * 100) / totalGames : 0;
    parts.push(`${i + 1}등: ${pct.toFixed(1)}% (${cnt}판)`);
  }
  infoWrap.textContent = parts.join("  |  ");
  distDiv.appendChild(infoWrap);

  // --- 최근 등수 그래프 (최대 30판) ---
  recentDiv.innerHTML = "";
  const recent = detail.recent.slice(-30);
  if (!recent.length) {
    recentDiv.innerHTML = '<p class="ranking-placeholder">최근 대국 데이터가 없습니다.</p>';
  } else {
    const wrapper = document.createElement("div");
    wrapper.className = "recent-rank-graph";
    recent.forEach((r) => {
      const item = document.createElement("div");
      item.className = `recent-rank-item rank-${r.rank}`;
      item.textContent = r.rank;
      item.title = `${formatKoreanTime(r.created_at)} - ${r.rank}등`;
      wrapper.appendChild(item);
    });
    recentDiv.appendChild(wrapper);
  }

  // --- 같이 한 플레이어별 기록 ---
  coTbody.innerHTML = "";
  if (!detail.coPlayers.length) {
    coTbody.innerHTML = '<tr><td colspan="4" class="ranking-placeholder">함께 친 플레이어가 없습니다.</td></tr>';
  } else {
    detail.coPlayers.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${c.name}</td>
        <td>${c.games}</td>
        <td>${c.my_avg_rank.toFixed(2)}</td>
        <td>${c.co_avg_rank.toFixed(2)}</td>
      `;
      coTbody.appendChild(tr);
    });
  }

  // --- 개인 대국 기록 (해당 플레이어 참가판만) ---
  if (playerGamesTbody) {
    playerGamesTbody.innerHTML = "";
    if (!detail.gameRecords.length) {
      playerGamesTbody.innerHTML =
        '<tr><td colspan="5" class="ranking-placeholder">대국 기록이 없습니다.</td></tr>';
    } else {
      detail.gameRecords.forEach((rec) => {
        const tr = document.createElement("tr");
        const tdTime = document.createElement("td");
        tdTime.textContent = formatKoreanTime(rec.created_at);
        tr.appendChild(tdTime);

        for (let i = 0; i < 4; i++) {
          const td = document.createElement("td");
          const n = rec.names[i] || "";
          const score = rec.scores[i];
          const pt = rec.pts[i];
          const r = rec.ranks[i];

          td.innerHTML = `<strong>${n}</strong><br>${score} (${pt.toFixed(1)} / ${r}등)`;
          if (i === rec.myIndex) td.classList.add("my-player-cell");
          tr.appendChild(td);
        }
        playerGamesTbody.appendChild(tr);
      });
    }
  }

  loadPlayerBadgesForStats(name);
}

async function loadPlayerBadgesForStats(name) {
  const container = document.getElementById("stats-badges");
  if (!container) return;

  container.innerHTML = "";
  if (!name) {
    container.innerHTML = '<p class="hint-text">플레이어를 선택하면 보유 뱃지가 표시됩니다.</p>';
    return;
  }

  let badges = [];
  try {
    badges = await fetchJSON(`/api/player_badges/by_player/${encodeURIComponent(name)}`);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="hint-text">뱃지 정보를 불러오지 못했습니다.</p>';
    return;
  }

  if (!badges || !badges.length) {
    container.innerHTML = '<p class="hint-text">보유한 뱃지가 없습니다.</p>';
    return;
  }

  const list = document.createElement("div");
  list.className = "badge-list-inner";

  badges.forEach((b) => {
    const chip = document.createElement("div");
    chip.className = `badge-chip badge-grade-${b.grade || "기타"}`;

    const main = document.createElement("div");
    main.className = "badge-main";
    main.textContent = b.name;

    chip.appendChild(main);

    if (b.description) {
      const desc = document.createElement("div");
      desc.className = "badge-desc";
      desc.textContent = b.description;
      chip.appendChild(desc);
    }

    list.appendChild(chip);
  });

  container.appendChild(list);
}

// ======================= 아카이브 화면 =======================
function setupArchiveView() {
  const archiveSelect = document.getElementById("archive-select");
  const playerSelect = document.getElementById("archive-player-select");

  if (archiveSelect) {
    archiveSelect.addEventListener("change", () => {
      loadArchiveGames(archiveSelect.value);
    });
  }

  if (playerSelect) {
    playerSelect.addEventListener("change", () => {
      renderArchiveStatsForPlayer(playerSelect.value);
    });
  }
}

// 아카이브 전체등수 정렬 헤더 클릭
function setupArchiveRankingSort() {
  const table = document.getElementById("archive-ranking-table");
  if (!table) return;

  const headers = table.querySelectorAll("th.sortable[data-sort-key]");
  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;

      if (ARCHIVE_RANKING_SORT.key === key) {
        ARCHIVE_RANKING_SORT.dir = ARCHIVE_RANKING_SORT.dir === "desc" ? "asc" : "desc";
      } else {
        ARCHIVE_RANKING_SORT.key = key;
        ARCHIVE_RANKING_SORT.dir = "desc";
      }

      renderArchiveRankingTable();
      updateSortIndicatorsForTable("archive-ranking-table", ARCHIVE_RANKING_SORT);
    });
  });
}

function renderArchiveRankingTable() {
  const rankingTbody = document.getElementById("archive-ranking-tbody");
  if (!rankingTbody) return;

  const sorted = sortPlayersByState(ARCHIVE_PLAYER_SUMMARY, ARCHIVE_RANKING_SORT);

  rankingTbody.innerHTML = "";
  if (!sorted.length) {
    rankingTbody.innerHTML =
      '<tr><td colspan="7" class="ranking-placeholder">이 아카이브에는 통계가 없습니다.</td></tr>';
    return;
  }

  sorted.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${p.name}</td>
      <td>${p.games}</td>
      <td>${p.total_pt.toFixed(1)}</td>
      <td>${p.avg_pt.toFixed(1)}</td>
      <td>${p.yonde_rate.toFixed(1)}%</td>
      <td></td>
    `;
    tr.children[6].appendChild(createRankDistBar(p.rankCounts, p.games));
    rankingTbody.appendChild(tr);
  });

  updateSortIndicatorsForTable("archive-ranking-table", ARCHIVE_RANKING_SORT);
}

function updateArchivePlayerSelect() {
  const select = document.getElementById("archive-player-select");
  if (!select) return;

  const prev = select.value;
  select.innerHTML = '<option value="">플레이어를 선택하세요</option>';

  // 보기 좋게 총pt 내림차순
  const sorted = [...ARCHIVE_PLAYER_SUMMARY].sort((a, b) => (b.total_pt || 0) - (a.total_pt || 0));

  sorted.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${p.name} (${p.games}판, ${p.total_pt.toFixed(1)}pt)`;
    select.appendChild(opt);
  });

  if (prev && sorted.some((p) => p.name === prev)) {
    select.value = prev;
    renderArchiveStatsForPlayer(prev);
  } else {
    renderArchiveStatsForPlayer("");
  }
}

async function reloadArchiveList() {
  const tbody = document.getElementById("archive-list-tbody");
  const archiveSelect = document.getElementById("archive-select");

  let archives = [];
  try {
    archives = await fetchJSON("/api/archives");
  } catch (err) {
    console.error(err);
    archives = [];
  }
  ARCHIVES = archives || [];

  // 관리자 화면: 아카이브 목록
  if (tbody) {
    tbody.innerHTML = "";
    if (!ARCHIVES.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="ranking-placeholder">등록된 아카이브가 없습니다.</td></tr>';
    } else {
      ARCHIVES.forEach((a) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${a.name}</td>
          <td>${formatKoreanTime(a.created_at)}</td>
          <td>${a.game_count || 0}</td>
          <td></td>
        `;
        const tdBtn = tr.children[3];
        const btn = document.createElement("button");
        btn.textContent = "삭제";
        btn.addEventListener("click", async () => {
          if (!confirm(`아카이브 "${a.name}"을(를) 삭제할까요?`)) return;
          try {
            await fetchJSON(`/api/archives/${a.id}`, { method: "DELETE" });
            await reloadArchiveList();
            const sel = document.getElementById("archive-select");
            if (sel && sel.value === String(a.id)) {
              sel.value = "";
              await loadArchiveGames("");
            }
          } catch (err) {
            console.error(err);
            alert("아카이브 삭제 실패: " + err.message);
          }
        });
        tdBtn.appendChild(btn);
        tbody.appendChild(tr);
      });
    }
  }

  // 아카이브 선택 드롭다운
  if (archiveSelect) {
    const prev = archiveSelect.value;
    archiveSelect.innerHTML = '<option value="">아카이브를 선택하세요</option>';
    ARCHIVES.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = `${a.name}`;
      archiveSelect.appendChild(opt);
    });

    if (prev && ARCHIVES.some((a) => String(a.id) === String(prev))) {
      archiveSelect.value = prev;
      await loadArchiveGames(prev);
    } else {
      await loadArchiveGames("");
    }
  }
}

async function loadArchiveGames(archiveId) {
  const gamesTbody = document.getElementById("archive-games-tbody");
  const rankingTbody = document.getElementById("archive-ranking-tbody");

  CURRENT_ARCHIVE_GAMES = [];
  ARCHIVE_PLAYER_SUMMARY = [];

  if (!gamesTbody || !rankingTbody) return;

  if (!archiveId) {
    gamesTbody.innerHTML =
      '<tr><td colspan="5" class="ranking-placeholder">아카이브를 선택하세요.</td></tr>';
    rankingTbody.innerHTML =
      '<tr><td colspan="7" class="ranking-placeholder">아카이브를 선택하세요.</td></tr>';
    updateArchivePlayerSelect();
    return;
  }

  let games = [];
  try {
    games = await fetchJSON(`/api/archives/${archiveId}/games`);
  } catch (err) {
    console.error(err);
    gamesTbody.innerHTML =
      '<tr><td colspan="5" class="ranking-placeholder">아카이브 데이터를 불러오지 못했습니다.</td></tr>';
    rankingTbody.innerHTML =
      '<tr><td colspan="7" class="ranking-placeholder">아카이브 데이터를 불러오지 못했습니다.</td></tr>';
    updateArchivePlayerSelect();
    return;
  }

  // 최신이 위로
  games = (games || []).slice().sort((a, b) => (b.id || 0) - (a.id || 0));
  CURRENT_ARCHIVE_GAMES = games;

  // ---- (왼쪽) 아카이브 대국 기록 ----
  gamesTbody.innerHTML = "";
  if (!CURRENT_ARCHIVE_GAMES.length) {
    gamesTbody.innerHTML =
      '<tr><td colspan="5" class="ranking-placeholder">이 아카이브에는 기록이 없습니다.</td></tr>';
  } else {
    CURRENT_ARCHIVE_GAMES.forEach((g) => {
      const scores = [
        Number(g.player1_score),
        Number(g.player2_score),
        Number(g.player3_score),
        Number(g.player4_score),
      ];
      const names = [
        g.player1_name,
        g.player2_name,
        g.player3_name,
        g.player4_name,
      ].map((n) => (n || "").trim());
      const pts = calcPts(scores);

      const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
      const ranks = [0, 0, 0, 0];
      order.forEach((o, idx) => (ranks[o.i] = idx + 1));

      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${formatKoreanTime(g.created_at)}</td><td></td><td></td><td></td><td></td>`;

      for (let i = 0; i < 4; i++) {
        const td = tr.children[1 + i];
        const name = names[i] || "";
        const score = scores[i];
        const pt = pts[i];
        td.innerHTML = `<strong>${name}</strong><br>${score} (${pt})`;
        if (ranks[i] === 1) td.classList.add("winner-cell");
      }

      gamesTbody.appendChild(tr);
    });
  }

  // ---- (오른쪽) 전체 등수 ----
  const playerStats = {};
  CURRENT_ARCHIVE_GAMES.forEach((g) => {
    const scores = [
      Number(g.player1_score),
      Number(g.player2_score),
      Number(g.player3_score),
      Number(g.player4_score),
    ];
    const names = [
      g.player1_name,
      g.player2_name,
      g.player3_name,
      g.player4_name,
    ].map((n) => (n || "").trim());
    const pts = calcPts(scores);

    const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    const ranks = [0, 0, 0, 0];
    order.forEach((o, idx) => (ranks[o.i] = idx + 1));

    for (let i = 0; i < 4; i++) {
      const name = names[i];
      if (!name) continue;
      if (!playerStats[name]) {
        playerStats[name] = { games: 0, total_pt: 0, rankCounts: [0, 0, 0, 0] };
      }
      playerStats[name].games += 1;
      playerStats[name].total_pt += pts[i];
      playerStats[name].rankCounts[ranks[i] - 1] += 1;
    }
  });

  const players = Object.entries(playerStats).map(([name, st]) => {
    const games = st.games;
    const total_pt_raw = st.total_pt;
    const total_pt = +total_pt_raw.toFixed(1);
    const avg_pt = games > 0 ? total_pt_raw / games : 0;

    const c1 = st.rankCounts[0];
    const c2 = st.rankCounts[1];
    const yonde = games > 0 ? ((c1 + c2) * 100) / games : 0;

    return {
      name,
      games,
      total_pt,
      avg_pt: +avg_pt.toFixed(1),
      yonde_rate: +yonde.toFixed(1),
      rankCounts: st.rankCounts,
    };
  });

  ARCHIVE_PLAYER_SUMMARY = players;

  // ✅ 아카이브 전체 등수는 “정렬 상태대로” 렌더
  renderArchiveRankingTable();

  // ✅ 아카이브 통계용 플레이어 셀렉트 갱신
  updateArchivePlayerSelect();
}

function renderArchiveStatsForPlayer(name) {
  const summaryDiv = document.getElementById("archive-stats-summary");
  const distDiv = document.getElementById("archive-stats-rank-dist");
  const recentDiv = document.getElementById("archive-stats-recent-ranks");
  const coTbody = document.getElementById("archive-stats-co-tbody");
  if (!summaryDiv || !distDiv || !recentDiv || !coTbody) return;

  if (!name) {
    summaryDiv.innerHTML = '<p class="hint-text">왼쪽에서 아카이브와 플레이어를 선택하세요.</p>';
    distDiv.innerHTML = "";
    recentDiv.innerHTML = '<p class="hint-text">플레이어를 선택하면 최근 등수 그래프가 표시됩니다.</p>';
    coTbody.innerHTML = '<tr><td colspan="4" class="ranking-placeholder">데이터 없음</td></tr>';
    return;
  }

  const detail = computePlayerDetailStats(name, CURRENT_ARCHIVE_GAMES);

  summaryDiv.innerHTML = `
    <div class="stats-summary-main">
      <div><span class="stats-label">플레이어</span> <span class="stats-value">${name}</span></div>
      <div><span class="stats-label">게임 수</span> <span class="stats-value">${detail.games}</span></div>
      <div><span class="stats-label">총 pt</span> <span class="stats-value">${detail.total_pt.toFixed(1)}</span></div>
      <div><span class="stats-label">연대율</span> <span class="stats-value">${detail.yonde_rate.toFixed(1)}%</span></div>
      <div><span class="stats-label">토비율</span> <span class="stats-value">${detail.tobi_rate.toFixed(1)}% (${detail.tobi_count}회)</span></div>
      <div><span class="stats-label">최다 점수</span> <span class="stats-value">${detail.max_score}</span></div>
    </div>
  `;

  // --- 총 등수 분포 바 + 1·2·3·4등 비율/판수 (한 줄) ---
  distDiv.innerHTML = "";
  distDiv.appendChild(createRankDistBar(detail.rankCounts, detail.games));

  const totalGames = detail.games || 0;
  const rankCounts = detail.rankCounts || [0, 0, 0, 0];
  const infoWrap = document.createElement("div");
  infoWrap.className = "rank-dist-detail";
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const cnt = rankCounts[i] || 0;
    const pct = totalGames > 0 ? (cnt * 100) / totalGames : 0;
    parts.push(`${i + 1}등: ${pct.toFixed(1)}% (${cnt}판)`);
  }
  infoWrap.textContent = parts.join("  |  ");
  distDiv.appendChild(infoWrap);

  // 최근 등수 그래프
  recentDiv.innerHTML = "";
  const recent = detail.recent.slice(-30);
  if (!recent.length) {
    recentDiv.innerHTML = '<p class="ranking-placeholder">최근 대국 데이터가 없습니다.</p>';
  } else {
    const wrapper = document.createElement("div");
    wrapper.className = "recent-rank-graph";
    recent.forEach((r) => {
      const item = document.createElement("div");
      item.className = `recent-rank-item rank-${r.rank}`;
      item.textContent = r.rank;
      item.title = `${formatKoreanTime(r.created_at)} - ${r.rank}등`;
      wrapper.appendChild(item);
    });
    recentDiv.appendChild(wrapper);
  }

  // 같이 한 플레이어별 기록
  coTbody.innerHTML = "";
  if (!detail.coPlayers.length) {
    coTbody.innerHTML =
      '<tr><td colspan="4" class="ranking-placeholder">함께 친 플레이어가 없습니다.</td></tr>';
  } else {
    detail.coPlayers.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${c.name}</td>
        <td>${c.games}</td>
        <td>${c.my_avg_rank.toFixed(2)}</td>
        <td>${c.co_avg_rank.toFixed(2)}</td>
      `;
      coTbody.appendChild(tr);
    });
  }
}

// ======================= 대회 전용(개인 레이팅 복제) =======================
function setupTournamentForm() {
  const form = document.getElementById("tournament-game-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    const p1_name = (fd.get("player1_name") || "").toString().trim();
    const p2_name = (fd.get("player2_name") || "").toString().trim();
    const p3_name = (fd.get("player3_name") || "").toString().trim();
    const p4_name = (fd.get("player4_name") || "").toString().trim();

    const s1 = parseInt(fd.get("player1_score"), 10);
    const s2 = parseInt(fd.get("player2_score"), 10);
    const s3 = parseInt(fd.get("player3_score"), 10);
    const s4 = parseInt(fd.get("player4_score"), 10);

    if ([s1, s2, s3, s4].some((v) => Number.isNaN(v))) {
      alert("점수는 숫자로 입력해주세요.");
      return;
    }

    const total = s1 + s2 + s3 + s4;
    if (total !== 100000) {
      alert(`네 사람 점수 합이 100000이 아닙니다.\n현재 합: ${total}`);
      return;
    }

    const payload = {
      player1_name: p1_name,
      player2_name: p2_name,
      player3_name: p3_name,
      player4_name: p4_name,
      player1_score: s1,
      player2_score: s2,
      player3_score: s3,
      player4_score: s4,
    };

    try {
      await fetchJSON("/api/tournament_games", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      await loadTournamentGamesAndRanking();
    } catch (err) {
      console.error(err);
      alert("대회 기록 저장에 실패했습니다.\n" + err.message);
    }
  });
}

async function loadTournamentGamesAndRanking() {
  const tbody = document.getElementById("tournament-games-tbody");
  const rankingBody = document.getElementById("tournament-ranking-tbody");
  if (!tbody || !rankingBody) return;

  let games = [];
  try {
    games = await fetchJSON("/api/tournament_games");
  } catch (err) {
    console.error(err);
    return;
  }

  games = (games || []).slice().sort((a, b) => (b.id || 0) - (a.id || 0));
  TOURNAMENT_GAMES = games;

  tbody.innerHTML = "";
  const playerStats = {};

  games.forEach((g) => {
    const scores = [
      Number(g.player1_score),
      Number(g.player2_score),
      Number(g.player3_score),
      Number(g.player4_score),
    ];
    const names = [
      g.player1_name,
      g.player2_name,
      g.player3_name,
      g.player4_name,
    ].map((n) => (n || "").trim());

    const pts = calcPts(scores);

    const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    const ranks = [0, 0, 0, 0];
    order.forEach((o, idx) => (ranks[o.i] = idx + 1));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${g.id}</td>
      <td>${formatKoreanTime(g.created_at)}</td>
      <td></td><td></td><td></td><td></td>
      <td></td>
    `;

    for (let i = 0; i < 4; i++) {
      const td = tr.children[2 + i];
      const name = names[i] || "";
      const score = scores[i];
      const pt = pts[i];
      td.innerHTML = `<strong>${name}</strong><br>${score} (${pt})`;
      if (ranks[i] === 1) td.classList.add("winner-cell");

      if (!name) continue;
      if (!playerStats[name]) playerStats[name] = { games: 0, total_pt: 0, rankCounts: [0, 0, 0, 0] };
      playerStats[name].games += 1;
      playerStats[name].total_pt += pt;
      playerStats[name].rankCounts[ranks[i] - 1] += 1;
    }

    const tdDel = tr.children[6];
    const btn = document.createElement("button");
    btn.textContent = "삭제";
    btn.addEventListener("click", async () => {
      if (!confirm("이 판을 삭제할까요?")) return;
      try {
        await fetchJSON(`/api/tournament_games/${g.id}`, { method: "DELETE" });
        await loadTournamentGamesAndRanking();
      } catch (err) {
        console.error(err);
        alert("삭제 실패");
      }
    });
    tdDel.appendChild(btn);

    tbody.appendChild(tr);
  });

  rankingBody.innerHTML = "";
  const players = Object.entries(playerStats).map(([name, st]) => {
    const games = st.games;
    const total_pt_raw = st.total_pt;
    const total_pt = +total_pt_raw.toFixed(1);
    const avg_pt = games > 0 ? +(total_pt_raw / games).toFixed(1) : 0.0;

    const c1 = st.rankCounts[0];
    const c2 = st.rankCounts[1];
    const yonde = games > 0 ? +(((c1 + c2) * 100) / games).toFixed(1) : 0.0;

    return { name, games, total_pt, avg_pt, yonde_rate: yonde, rankCounts: st.rankCounts };
  });

  players.sort((a, b) => b.total_pt - a.total_pt);

  if (!players.length) {
    rankingBody.innerHTML = `<tr><td colspan="7" class="ranking-placeholder">통계 없음</td></tr>`;
    return;
  }

  players.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${p.name}</td>
      <td>${p.games}</td>
      <td>${p.total_pt.toFixed(1)}</td>
      <td>${p.avg_pt.toFixed(1)}</td>
      <td>${p.yonde_rate.toFixed(1)}%</td>
      <td></td>
    `;
    tr.children[6].appendChild(createRankDistBar(p.rankCounts, p.games));
    rankingBody.appendChild(tr);
  });
}

// ======================= 관리자 화면 (뱃지 / 아카이브 / 초기화) =======================
function setupAdminView() {
  // 뱃지 생성
  const createForm = document.getElementById("badge-create-form");
  if (createForm) {
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(createForm);
      const payload = {
        code: Number(fd.get("code")),
        name: (fd.get("name") || "").toString().trim(),
        grade: (fd.get("grade") || "").toString().trim(),
        description: (fd.get("description") || "").toString().trim(),
      };
      if (!payload.code || !payload.name || !payload.grade) {
        alert("코드 / 이름 / 등급은 필수입니다.");
        return;
      }
      try {
        await fetchJSON("/api/badges", { method: "POST", body: JSON.stringify(payload) });
        createForm.reset();
        await reloadBadgeList();
      } catch (err) {
        console.error(err);
        alert("뱃지 추가 실패: " + err.message);
      }
    });
  }

  // 플레이어 뱃지 불러오기
  const loadBtn = document.getElementById("admin-load-player");
  const playerInput = document.getElementById("admin-player-name");
  if (loadBtn && playerInput) {
    loadBtn.addEventListener("click", () => {
      loadAdminPlayerBadges((playerInput.value || "").trim());
    });
  }

  // 뱃지 부여
  const assignForm = document.getElementById("badge-assign-form");
  if (assignForm) {
    assignForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(assignForm);
      const player = (fd.get("player_name") || "").toString().trim();
      const codeVal = fd.get("badge_code");
      const badge_code = codeVal ? Number(codeVal) : NaN;
      if (!player || !badge_code) {
        alert("플레이어와 뱃지를 선택하세요.");
        return;
      }
      try {
        await fetchJSON("/api/player_badges", {
          method: "POST",
          body: JSON.stringify({ player_name: player, badge_code }),
        });
        await loadAdminPlayerBadges(player);

        const statsSelect = document.getElementById("stats-player-select");
        if (statsSelect && statsSelect.value === player) {
          await loadPlayerBadgesForStats(player);
        }
      } catch (err) {
        console.error(err);
        alert("뱃지 부여 실패: " + err.message);
      }
    });
  }

  // 개인전 기록 초기화
  const resetBtn = document.getElementById("reset-games-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const ok = confirm("정말로 모든 개인전 대국 기록을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.");
      if (!ok) return;

      try {
        await fetchJSON("/api/admin/reset_games", { method: "POST" });
        alert("개인전 대국 기록을 모두 삭제했습니다.");
        await loadGamesAndRanking();
        updateStatsPlayerSelect();
      } catch (err) {
        console.error(err);
        alert("기록 초기화에 실패했습니다: " + err.message);
      }
    });
  }
}

async function reloadBadgeList() {
  const tbody = document.getElementById("badge-list-tbody");
  const select = document.getElementById("badge-assign-code");
  if (!tbody && !select) return;

  let badges = [];
  try {
    badges = await fetchJSON("/api/badges");
  } catch (err) {
    console.error(err);
    return;
  }
  ALL_BADGES = badges || [];

  if (tbody) {
    tbody.innerHTML = "";
    if (!ALL_BADGES.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="ranking-placeholder">등록된 뱃지가 없습니다.</td></tr>';
    } else {
      ALL_BADGES.forEach((b) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${b.code}</td>
          <td>${b.name}</td>
          <td>${b.grade}</td>
          <td>${b.description || ""}</td>
          <td></td>
        `;
        const tdBtn = tr.children[4];
        const btn = document.createElement("button");
        btn.textContent = "삭제";
        btn.addEventListener("click", async () => {
          if (!confirm(`뱃지 #${b.code}을(를) 삭제할까요?`)) return;
          try {
            await fetchJSON(`/api/badges/${b.id}`, { method: "DELETE" });
            await reloadBadgeList();
          } catch (err) {
            console.error(err);
            alert("삭제 실패: " + err.message);
          }
        });
        tdBtn.appendChild(btn);
        tbody.appendChild(tr);
      });
    }
  }

  if (select) {
    const prev = select.value;
    select.innerHTML = '<option value="">뱃지를 선택하세요</option>';
    ALL_BADGES.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.code;
      opt.textContent = `#${b.code} ${b.name} (${b.grade})`;
      select.appendChild(opt);
    });
    if (prev && ALL_BADGES.some((b) => String(b.code) === String(prev))) {
      select.value = prev;
    }
  }
}

async function loadAdminPlayerBadges(name) {
  const container = document.getElementById("admin-player-badges");
  const assignPlayerInput = document.getElementById("badge-assign-player");
  if (!container) return;

  container.innerHTML = "";
  if (assignPlayerInput && name) assignPlayerInput.value = name;

  if (!name) {
    container.innerHTML = '<p class="hint-text">플레이어 이름을 입력하고 "불러오기"를 누르세요.</p>';
    return;
  }

  let list = [];
  try {
    list = await fetchJSON(`/api/player_badges/by_player/${encodeURIComponent(name)}`);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="hint-text">뱃지를 불러오지 못했습니다.</p>';
    return;
  }

  if (!list || !list.length) {
    container.innerHTML = '<p class="hint-text">보유한 뱃지가 없습니다.</p>';
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "badge-list-inner";

  list.forEach((pb) => {
    const chip = document.createElement("div");
    chip.className = `badge-chip badge-grade-${pb.grade || "기타"}`;

    const topRow = document.createElement("div");
    topRow.className = "badge-top-row";

    const main = document.createElement("div");
    main.className = "badge-main";
    main.innerHTML = `<span class="badge-code">#${pb.code}</span> ${pb.name}`;

    const btn = document.createElement("button");
    btn.textContent = "삭제";
    btn.addEventListener("click", async () => {
      if (!confirm("이 뱃지를 제거할까요?")) return;
      try {
        await fetchJSON(`/api/player_badges/${pb.id}`, { method: "DELETE" });
        await loadAdminPlayerBadges(name);

        const statsSelect = document.getElementById("stats-player-select");
        if (statsSelect && statsSelect.value === name) {
          await loadPlayerBadgesForStats(name);
        }
      } catch (err) {
        console.error(err);
        alert("삭제 실패: " + err.message);
      }
    });

    topRow.appendChild(main);
    topRow.appendChild(btn);
    chip.appendChild(topRow);

    if (pb.description) {
      const desc = document.createElement("div");
      desc.className = "badge-desc";
      desc.textContent = pb.description;
      chip.appendChild(desc);
    }

    wrapper.appendChild(chip);
  });

  container.appendChild(wrapper);
}
