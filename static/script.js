// ===== 공통 상수 =====
const UMA_VALUES = [50, 10, -10, -30];
const RETURN_SCORE = 30000;

// 전체 게임 / 플레이어 요약 캐시 (통계 화면용)
let ALL_GAMES = [];
let PLAYER_SUMMARY = [];
let ALL_BADGES = [];

// 아카이브용 캐시
let ARCHIVES = [];
let CURRENT_ARCHIVE_GAMES = [];
let ARCHIVE_PLAYER_SUMMARY = [];

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
    if (count > 0) {
      span.textContent = `${percentage.toFixed(0)}%`;
    } else {
      span.textContent = "";
    }

    seg.appendChild(span);
    bar.appendChild(seg);
  }
  return bar;
}

// ===== fetch 래퍼 =====
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

// ===== 메인 엔트리 =====
document.addEventListener("DOMContentLoaded", () => {
  setupViewSwitch();
  setupPersonalForm();
  setupStatsView();
  setupArchiveView();
  setupAdminView();
  loadGamesAndRanking();
  reloadBadgeList();
  reloadArchiveList();
});

// ======================= 상단 탭 전환 =======================
function setupViewSwitch() {
  const personalView = document.getElementById("personal-view");
  const statsView = document.getElementById("stats-view");
  const archiveView = document.getElementById("archive-view");
  const adminView = document.getElementById("admin-view");
  const buttons = document.querySelectorAll(".view-switch-btn");

  function showView(view) {
    if (personalView) {
      personalView.style.display = view === "personal" ? "block" : "none";
    }
    if (statsView) {
      statsView.style.display = view === "stats" ? "block" : "none";
      if (view === "stats") {
        updateStatsPlayerSelect();
      }
    }
    if (archiveView) {
      archiveView.style.display = view === "archive" ? "block" : "none";
      if (view === "archive") {
        reloadArchiveList();
      }
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
      const view = btn.dataset.view;
      showView(view);
    });
  });

  // 초기 상태
  showView("personal");
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

  ALL_GAMES = games || [];

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

    
    const order = scores
      .map((s, i) => ({ s, i }))
      .sort((a, b) => b.s - a.s);
    const ranks = [0, 0, 0, 0];
    order.forEach((o, idx) => {
      ranks[o.i] = idx + 1;
    });

    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = g.id;
    tr.appendChild(tdId);

    const tdTime = document.createElement("td");
    tdTime.textContent = formatKoreanTime(g.created_at);
    tr.appendChild(tdTime);

    for (let i = 0; i < 4; i++) {
      const td = document.createElement("td");
      const name = names[i] || "";
      const score = scores[i];
      const pt = pts[i];

      td.innerHTML = `<strong>${name}</strong><br>${score} (${pt})`;

      if (ranks[i] === 1) td.classList.add("winner-cell");
      tr.appendChild(td);

      if (!name) continue;
      if (!playerStats[name]) {
        playerStats[name] = {
          games: 0,
          total_pt: 0,
          rankCounts: [0, 0, 0, 0],
        };
      }
      const st = playerStats[name];
      st.games += 1;
      st.total_pt += pts[i];
      st.rankCounts[ranks[i] - 1] += 1;
    }

    const tdDel = document.createElement("td");
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
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });

  // 개인 랭킹 테이블
  rankingBody.innerHTML = "";
  const players = Object.entries(playerStats).map(([name, st]) => {
    const games = st.games;
    const total_pt = +st.total_pt.toFixed(1);
    const c1 = st.rankCounts[0];
    const c2 = st.rankCounts[1];
    const yonde =
      games > 0 ? +(((c1 + c2) * 100) / games).toFixed(1) : 0.0;
    return {
      name,
      games,
      total_pt,
      yonde_rate: yonde,
      rankCounts: st.rankCounts,
    };
  });

  players.sort((a, b) => b.total_pt - a.total_pt);
  PLAYER_SUMMARY = players;

  if (players.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "ranking-placeholder";
    td.textContent = "통계 없음";
    tr.appendChild(td);
    rankingBody.appendChild(tr);
  } else {
    players.forEach((p, idx) => {
      const tr = document.createElement("tr");

      const tdRank = document.createElement("td");
      tdRank.textContent = idx + 1;
      tr.appendChild(tdRank);

      const tdName = document.createElement("td");
      tdName.textContent = p.name;
      tr.appendChild(tdName);

      const tdGames = document.createElement("td");
      tdGames.textContent = p.games;
      tr.appendChild(tdGames);

      const tdPt = document.createElement("td");
      tdPt.textContent = p.total_pt.toFixed(1);
      tr.appendChild(tdPt);

      const tdY = document.createElement("td");
      tdY.textContent = p.yonde_rate.toFixed(1) + "%";
      tr.appendChild(tdY);

      const tdDist = document.createElement("td");
      tdDist.appendChild(createRankDistBar(p.rankCounts, p.games));
      tr.appendChild(tdDist);

      rankingBody.appendChild(tr);
    });
  }

  // 개인별 통계 화면의 플레이어 선택 박스 갱신
  updateStatsPlayerSelect();
}

// ======================= 개인별 통계 화면 =======================

function setupStatsView() {
  const select = document.getElementById("stats-player-select");
  if (!select) return;

  select.addEventListener("change", () => {
    const name = select.value;
    renderStatsForPlayer(name);
  });
}

function updateStatsPlayerSelect() {
  const select = document.getElementById("stats-player-select");
  if (!select) return;

  const prev = select.value;
  select.innerHTML = '<option value="">플레이어를 선택하세요</option>';

  PLAYER_SUMMARY.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${p.name} (${p.games}판, ${p.total_pt.toFixed(1)}pt)`;
    select.appendChild(opt);
  });

  if (prev && PLAYER_SUMMARY.some((p) => p.name === prev)) {
    select.value = prev;
    renderStatsForPlayer(prev);
  } else {
    renderStatsForPlayer("");
  }
}

// ======================= 개인별 통계 화면 =======================

function setupStatsView() {
  const select = document.getElementById("stats-player-select");
  if (!select) return;

  select.addEventListener("change", () => {
    const name = select.value;
    renderStatsForPlayer(name);
  });
}

function updateStatsPlayerSelect() {
  const select = document.getElementById("stats-player-select");
  if (!select) return;

  const prev = select.value;
  select.innerHTML = '<option value="">플레이어를 선택하세요</option>';

  PLAYER_SUMMARY.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${p.name} (${p.games}판, ${p.total_pt.toFixed(1)}pt)`;
    select.appendChild(opt);
  });

  if (prev && PLAYER_SUMMARY.some((p) => p.name === prev)) {
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

  let tobiCount = 0;   // 점수가 음수인
  // 판 수
  let maxScore = null; // 한 판에서 얻은 최고 점수

  const gameRecords = []; // 개인이 참가한 게임 전체 기록

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
    if (idx === -1) return; // 이 판에 안 나왔으면 무시

    const order = scores
      .map((s, i) => ({ s, i }))
      .sort((a, b) => b.s - a.s);
    const ranks = [0, 0, 0, 0];
    order.forEach((o, pos) => {
      ranks[o.i] = pos + 1;
    });

    const myRank = ranks[idx];

    totalGames += 1;
    totalPt += pts[idx];
    rankCounts[myRank - 1] += 1;

    if (scores[idx] < 0) {
      tobiCount += 1;
    }

    if (maxScore === null || scores[idx] > maxScore) {
      maxScore = scores[idx];
    }

    recent.push({
      created_at: g.created_at,
      rank: myRank,
    });

    for (let j = 0; j < 4; j++) {
      if (j === idx) continue;
      const cname = (names[j] || "").trim();
      if (!cname) continue;
      if (!coMap[cname]) {
        coMap[cname] = { games: 0, my_rank_sum: 0, co_rank_sum: 0 };
      }
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

  const yonde =
    totalGames > 0
      ? ((rankCounts[0] + rankCounts[1]) * 100.0) / totalGames
      : 0;

  const tobiRate = totalGames > 0 ? (tobiCount * 100.0) / totalGames : 0;

  const coPlayers = Object.entries(coMap)
    .map(([name, st]) => ({
      name,
      games: st.games,
      my_avg_rank: st.my_rank_sum / st.games,
      co_avg_rank: st.co_rank_sum / st.games,
    }))
    .sort((a, b) => b.games - a.games);

  recent.reverse();

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
  const numbersDiv = document.getElementById("stats-rank-numbers");

  if (!summaryDiv || !distDiv || !recentDiv || !coTbody) return;

  if (!name) {
    summaryDiv.innerHTML =
      '<p class="hint-text">왼쪽 상단에서 플레이어를 선택하세요.</p>';
    distDiv.innerHTML = "";
    if (numbersDiv) numbersDiv.textContent = "";
    recentDiv.innerHTML =
      '<p class="hint-text">플레이어를 선택하면 최근 등수 그래프가 표시됩니다.</p>';
    coTbody.innerHTML =
      '<tr><td colspan="4" class="ranking-placeholder">데이터 없음</td></tr>';

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
      <div><span class="stats-label">총 pt</span> <span class="stats-value">${detail.total_pt.toFixed(
        1
      )}</span></div>
      <div><span class="stats-label">연대율</span> <span class="stats-value">${detail.yonde_rate.toFixed(
        1
      )}%</span></div>
      <div><span class="stats-label">토비율</span> <span class="stats-value">${detail.tobi_rate.toFixed(
        1
      )}% (${detail.tobi_count}회)</span></div>
      <div><span class="stats-label">최다 점수</span> <span class="stats-value">${detail.max_score}</span></div>
    </div>
  `;

  // --- 총 등수 분포 바 + 1·2·3·4등 비율/판수 텍스트 ---
  distDiv.innerHTML = "";

  // 막대 그래프
  const barEl = createRankDistBar(detail.rankCounts, detail.games);
  distDiv.appendChild(barEl);

  // 비율/판수 텍스트 (한 줄에 가로로)
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

  // 최근 등수 그래프 (최대 30판)
  recentDiv.innerHTML = "";
  const recent = detail.recent.slice(-30);
  if (recent.length === 0) {
    recentDiv.innerHTML =
      '<p class="ranking-placeholder">최근 대국 데이터가 없습니다.</p>';
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
  if (detail.coPlayers.length === 0) {
    coTbody.innerHTML =
      '<tr><td colspan="4" class="ranking-placeholder">함께 친 플레이어가 없습니다.</td></tr>';
  } else {
    detail.coPlayers.forEach((c) => {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.textContent = c.name;
      const tdGames = document.createElement("td");
      tdGames.textContent = c.games;
      const tdMy = document.createElement("td");
      tdMy.textContent = c.my_avg_rank.toFixed(2);
      const tdCo = document.createElement("td");
      tdCo.textContent = c.co_avg_rank.toFixed(2);

      tr.appendChild(tdName);
      tr.appendChild(tdGames);
      tr.appendChild(tdMy);
      tr.appendChild(tdCo);
      coTbody.appendChild(tr);
    });
  }

  // 개인 대국 기록 테이블 (HTML에 있으면)
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

          td.innerHTML = `<strong>${n}</strong><br>${score} (${pt.toFixed(
            1
          )} / ${r}등)`;

          if (i === rec.myIndex) {
            td.classList.add("my-player-cell");
          }

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
    container.innerHTML =
      '<p class="hint-text">플레이어를 선택하면 보유 뱃지가 표시됩니다.</p>';
    return;
  }

  let badges = [];
  try {
    badges = await fetchJSON(
      `/api/player_badges/by_player/${encodeURIComponent(name)}`
    );
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<p class="hint-text">뱃지 정보를 불러오지 못했습니다.</p>';
    return;
  }

  if (!badges || badges.length === 0) {
    container.innerHTML =
      '<p class="hint-text">보유한 뱃지가 없습니다.</p>';
    return;
  }

  const list = document.createElement("div");
  list.className = "badge-list-inner";

  badges.forEach((b) => {
    const chip = document.createElement("div");
    chip.className = `badge-chip badge-grade-${b.grade || "기타"}`;

    const main = document.createElement("div");
    main.className = "badge-main";
    main.textContent = b.name; // 코드 없이 이름만 표시

    if (b.description) {
      const desc = document.createElement("div");
      desc.className = "badge-desc";
      desc.textContent = b.description;
      chip.appendChild(desc);
    }

    chip.insertBefore(main, chip.firstChild);
    list.appendChild(chip);
  });

  container.appendChild(list);
}

// ======================= 아카이브 화면 =======================

function setupArchiveView() {
  const archiveSelect = document.getElementById("archive-select");
  if (archiveSelect) {
    archiveSelect.addEventListener("change", () => {
      const id = archiveSelect.value;
      loadArchiveGames(id);
    });
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

  // 관리자 화면: 아카이브 목록 (삭제 버튼 포함)
  if (tbody) {
    tbody.innerHTML = "";
    if (!ARCHIVES.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.className = "ranking-placeholder";
      td.textContent = "등록된 아카이브가 없습니다.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      ARCHIVES.forEach((a) => {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.textContent = a.name;

        const tdTime = document.createElement("td");
        tdTime.textContent = formatKoreanTime(a.created_at);

        const tdGames = document.createElement("td");
        tdGames.textContent = a.game_count || 0;

        const tdBtn = document.createElement("td");
        const btn = document.createElement("button");
        btn.textContent = "삭제";
        btn.addEventListener("click", async () => {
          if (!confirm(`아카이브 "${a.name}"을(를) 삭제할까요?`)) return;
          try {
            await fetchJSON(`/api/archives/${a.id}`, { method: "DELETE" });
            await reloadArchiveList();

            const archiveSelectEl = document.getElementById("archive-select");
            if (archiveSelectEl && archiveSelectEl.value === String(a.id)) {
              archiveSelectEl.value = "";
              await loadArchiveGames("");
            }
          } catch (err) {
            console.error(err);
            alert("아카이브 삭제 실패: " + err.message);
          }
        });
        tdBtn.appendChild(btn);

        tr.appendChild(tdName);
        tr.appendChild(tdTime);
        tr.appendChild(tdGames);
        tr.appendChild(tdBtn);
        tbody.appendChild(tr);
      });
    }
  }

  // 아카이브 선택 드롭다운
  if (archiveSelect) {
    const prev = archiveSelect.value;
    archiveSelect.innerHTML =
      '<option value="">아카이브를 선택하세요</option>';
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
      '<tr><td colspan="6" class="ranking-placeholder">아카이브를 선택하세요.</td></tr>';
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
      '<tr><td colspan="6" class="ranking-placeholder">아카이브 데이터를 불러오지 못했습니다.</td></tr>';
    return;
  }

  CURRENT_ARCHIVE_GAMES = games || [];

  // ---- 1) 왼쪽: 아카이브 대국 기록 ----
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

      const order = scores
        .map((s, i) => ({ s, i }))
        .sort((a, b) => b.s - a.s);
      const ranks = [0, 0, 0, 0];
      order.forEach((o, idx) => {
        ranks[o.i] = idx + 1;
      });

      const tr = document.createElement("tr");

      const tdTime = document.createElement("td");
      tdTime.textContent = formatKoreanTime(g.created_at);
      tr.appendChild(tdTime);

      for (let i = 0; i < 4; i++) {
        const td = document.createElement("td");
        const name = names[i] || "";
        const score = scores[i];
        const pt = pts[i];
        td.innerHTML = `<strong>${name}</strong><br>${score} (${pt})`;
        if (ranks[i] === 1) td.classList.add("winner-cell");
        tr.appendChild(td);
      }

      gamesTbody.appendChild(tr);
    });
  }

  // ---- 2) 오른쪽: 전체 등수 (플레이어별 요약) ----
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

    const order = scores
      .map((s, i) => ({ s, i }))
      .sort((a, b) => b.s - a.s);
    const ranks = [0, 0, 0, 0];
    order.forEach((o, idx) => {
      ranks[o.i] = idx + 1;
    });

    for (let i = 0; i < 4; i++) {
      const name = names[i];
      if (!name) continue;
      if (!playerStats[name]) {
        playerStats[name] = {
          games: 0,
          total_pt: 0,
          rankCounts: [0, 0, 0, 0],
        };
      }
      const st = playerStats[name];
      st.games += 1;
      st.total_pt += pts[i];
      st.rankCounts[ranks[i] - 1] += 1;
    }
  });

  const players = Object.entries(playerStats).map(([name, st]) => {
    const games = st.games;
    const total_pt = +st.total_pt.toFixed(1);
    const c1 = st.rankCounts[0];
    const c2 = st.rankCounts[1];
    const yonde =
      games > 0 ? +(((c1 + c2) * 100) / games).toFixed(1) : 0.0;
    return {
      name,
      games,
      total_pt,
      yonde_rate: yonde,
      rankCounts: st.rankCounts,
    };
  });
  players.sort((a, b) => b.total_pt - a.total_pt);
  ARCHIVE_PLAYER_SUMMARY = players;

  rankingTbody.innerHTML = "";
  if (!players.length) {
    rankingTbody.innerHTML =
      '<tr><td colspan="6" class="ranking-placeholder">이 아카이브에는 통계가 없습니다.</td></tr>';
  } else {
    players.forEach((p, idx) => {
      const tr = document.createElement("tr");

      const tdRank = document.createElement("td");
      tdRank.textContent = idx + 1;
      tr.appendChild(tdRank);

      const tdName = document.createElement("td");
      tdName.textContent = p.name;
      tr.appendChild(tdName);

      const tdGames = document.createElement("td");
      tdGames.textContent = p.games;
      tr.appendChild(tdGames);

      const tdPt = document.createElement("td");
      tdPt.textContent = p.total_pt.toFixed(1);
      tr.appendChild(tdPt);

      const tdY = document.createElement("td");
      tdY.textContent = p.yonde_rate.toFixed(1) + "%";
      tr.appendChild(tdY);

      const tdDist = document.createElement("td");
      tdDist.appendChild(createRankDistBar(p.rankCounts, p.games));
      tr.appendChild(tdDist);

      rankingTbody.appendChild(tr);
    });
  }
}


function renderArchiveStatsForPlayer(name) {
  const summaryDiv = document.getElementById("archive-stats-summary");
  const distDiv = document.getElementById("archive-stats-rank-dist");
  const numbersDiv = document.getElementById("archive-stats-rank-numbers");
  const recentDiv = document.getElementById("archive-stats-recent-ranks");
  const coTbody = document.getElementById("archive-stats-co-tbody");

  if (!summaryDiv || !distDiv || !recentDiv || !coTbody) return;

  if (!name) {
    summaryDiv.innerHTML =
      '<p class="hint-text">왼쪽에서 아카이브와 플레이어를 선택하세요.</p>';
    distDiv.innerHTML = "";
    if (numbersDiv) numbersDiv.textContent = "";
    recentDiv.innerHTML =
      '<p class="hint-text">플레이어를 선택하면 최근 등수 그래프가 표시됩니다.</p>';
    coTbody.innerHTML =
      '<tr><td colspan="4" class="ranking-placeholder">데이터 없음</td></tr>';
    return;
  }

  const detail = computePlayerDetailStats(name, CURRENT_ARCHIVE_GAMES);

  summaryDiv.innerHTML = `
    <div class="stats-summary-main">
      <div><span class="stats-label">플레이어</span> <span class="stats-value">${name}</span></div>
      <div><span class="stats-label">게임 수</span> <span class="stats-value">${detail.games}</span></div>
      <div><span class="stats-label">총 pt</span> <span class="stats-value">${detail.total_pt.toFixed(
        1
      )}</span></div>
      <div><span class="stats-label">연대율</span> <span class="stats-value">${detail.yonde_rate.toFixed(
        1
      )}%</span></div>
      <div><span class="stats-label">토비율</span> <span class="stats-value">${detail.tobi_rate.toFixed(
        1
      )}% (${detail.tobi_count}회)</span></div>
      <div><span class="stats-label">최다 점수</span> <span class="stats-value">${detail.max_score}</span></div>
    </div>
  `;

  distDiv.innerHTML = "";
  distDiv.appendChild(createRankDistBar(detail.rankCounts, detail.games));

  if (numbersDiv) {
    const g = detail.games || 0;
    const [c1, c2, c3, c4] = detail.rankCounts;
    const p1 = g ? ((c1 * 100) / g).toFixed(1) : "0.0";
    const p2 = g ? ((c2 * 100) / g).toFixed(1) : "0.0";
    const p3 = g ? ((c3 * 100) / g).toFixed(1) : "0.0";
    const p4 = g ? ((c4 * 100) / g).toFixed(1) : "0.0";
    numbersDiv.textContent = `1등: ${c1}판 (${p1}%) · 2등: ${c2}판 (${p2}%) · 3등: ${c3}판 (${p3}%) · 4등: ${c4}판 (${p4}%)`;
  }

  recentDiv.innerHTML = "";
  const recent = detail.recent.slice(-30);
  if (!recent.length) {
    recentDiv.innerHTML =
      '<p class="ranking-placeholder">최근 대국 데이터가 없습니다.</p>';
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

  coTbody.innerHTML = "";
  if (!detail.coPlayers.length) {
    coTbody.innerHTML =
      '<tr><td colspan="4" class="ranking-placeholder">함께 친 플레이어가 없습니다.</td></tr>';
  } else {
    detail.coPlayers.forEach((c) => {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.textContent = c.name;
      const tdGames = document.createElement("td");
      tdGames.textContent = c.games;
      const tdMy = document.createElement("td");
      tdMy.textContent = c.my_avg_rank.toFixed(2);
      const tdCo = document.createElement("td");
      tdCo.textContent = c.co_avg_rank.toFixed(2);
      tr.appendChild(tdName);
      tr.appendChild(tdGames);
      tr.appendChild(tdMy);
      tr.appendChild(tdCo);
      coTbody.appendChild(tr);
    });
  }
}

// ======================= 관리자 화면 (뱃지 / 아카이브) =======================

function setupAdminView() {
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
        await fetchJSON("/api/badges", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        createForm.reset();
        await reloadBadgeList();
      } catch (err) {
        console.error(err);
        alert("뱃지 추가 실패: " + err.message);
      }
    });
  }

  const loadBtn = document.getElementById("admin-load-player");
  const playerInput = document.getElementById("admin-player-name");
  if (loadBtn && playerInput) {
    loadBtn.addEventListener("click", () => {
      const name = (playerInput.value || "").trim();
      loadAdminPlayerBadges(name);
    });
  }

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
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "ranking-placeholder";
      td.textContent = "등록된 뱃지가 없습니다.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      ALL_BADGES.forEach((b) => {
        const tr = document.createElement("tr");
        const tdCode = document.createElement("td");
        tdCode.textContent = b.code;
        const tdName = document.createElement("td");
        tdName.textContent = b.name;
        const tdGrade = document.createElement("td");
        tdGrade.textContent = b.grade;
        const tdDesc = document.createElement("td");
        tdDesc.textContent = b.description || "";
        const tdBtn = document.createElement("td");
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

        tr.appendChild(tdCode);
        tr.appendChild(tdName);
        tr.appendChild(tdGrade);
        tr.appendChild(tdDesc);
        tr.appendChild(tdBtn);
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
  if (assignPlayerInput && name) {
    assignPlayerInput.value = name;
  }

  if (!name) {
    container.innerHTML =
      '<p class="hint-text">플레이어 이름을 입력하고 "불러오기"를 누르세요.</p>';
    return;
  }

  let list = [];
  try {
    list = await fetchJSON(
      `/api/player_badges/by_player/${encodeURIComponent(name)}`
    );
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<p class="hint-text">뱃지를 불러오지 못했습니다.</p>';
    return;
  }

  if (!list || list.length === 0) {
    container.innerHTML =
      '<p class="hint-text">보유한 뱃지가 없습니다.</p>';
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
