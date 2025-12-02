// ===== 공통 상수 =====
const UMA_VALUES = [50, 10, -10, -30];
const RETURN_SCORE = 30000;

// 전체 게임 / 플레이어 요약 캐시 (통계 화면용)
let ALL_GAMES = [];
let PLAYER_SUMMARY = [];
let ALL_BADGES = [];

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
  setupAdminView();
  loadGamesAndRanking();
});

// ======================= 상단 탭 전환 =======================
function setupViewSwitch() {
  const personalView = document.getElementById("personal-view");
  const statsView = document.getElementById("stats-view");
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
    if (adminView) {
      adminView.style.display = view === "admin" ? "block" : "none";
      if (view === "admin") {
        reloadBadgeList();
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

    // 점수는 text라서 직접 정수로 변환
    const s1 = parseInt(fd.get("player1_score"), 10);
    const s2 = parseInt(fd.get("player2_score"), 10);
    const s3 = parseInt(fd.get("player3_score"), 10);
    const s4 = parseInt(fd.get("player4_score"), 10);

    // 숫자 체크
    if ([s1, s2, s3, s4].some((v) => Number.isNaN(v))) {
      alert("점수는 숫자로 입력해주세요.");
      return;
    }

    // 🔥 합 100000 체크
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

function computePlayerDetailStats(playerName, games) {
  let totalGames = 0;
  let totalPt = 0;
  const rankCounts = [0, 0, 0, 0];
  const recent = [];
  const coMap = {};

  let tobiCount = 0;   // 점수가 음수인 판 수
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

    // 등수 계산
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

    // 토비: 점수가 0 미만인 경우
    if (scores[idx] < 0) {
      tobiCount += 1;
    }

    // 최다 점수
    if (maxScore === null || scores[idx] > maxScore) {
      maxScore = scores[idx];
    }

    // 최근 등수 그래프용
    recent.push({
      created_at: g.created_at,
      rank: myRank,
    });

    // 같이 친 사람들 통계
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

    // 개인 대국 기록용 전체 정보 저장
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

  // games는 id DESC 기준이니까 그래프 보기 좋게 오래된 순으로 뒤집기
  recent.reverse();
  gameRecords.reverse();

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

  // --- 플레이어가 선택되지 않았을 때 초기 상태 ---
  if (!name) {
    summaryDiv.innerHTML =
      '<p class="hint-text">왼쪽 상단에서 플레이어를 선택하세요.</p>';
    distDiv.innerHTML = "";
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

  // --- 상세 통계 계산 ---
  const detail = computePlayerDetailStats(name, ALL_GAMES);

  // 요약 정보 (게임 수, 총 pt, 연대율, 토비율, 최다 점수)
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


  // --- 최근 등수 그래프 (최대 30판) ---
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

  // --- 같이 한 플레이어별 기록 테이블 ---
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

  // --- 개인 대국 기록 테이블 (해당 플레이어가 참가한 판만) ---
  if (playerGamesTbody) {
    playerGamesTbody.innerHTML = "";
    if (!detail.gameRecords.length) {
      playerGamesTbody.innerHTML =
        '<tr><td colspan="5" class="ranking-placeholder">대국 기록이 없습니다.</td></tr>';
    } else {
      detail.gameRecords.forEach((rec) => {
        const tr = document.createElement("tr");

        // 시간
        const tdTime = document.createElement("td");
        tdTime.textContent = formatKoreanTime(rec.created_at);
        tr.appendChild(tdTime);

        // P1~P4
        for (let i = 0; i < 4; i++) {
          const td = document.createElement("td");
          const n = rec.names[i] || "";
          const score = rec.scores[i];
          const pt = rec.pts[i];
          const r = rec.ranks[i];

          td.innerHTML = `<strong>${n}</strong><br>${score} (${pt.toFixed(
            1
          )} / ${r}등)`;

          // 선택한 플레이어가 앉아 있던 자리 강조
          if (i === rec.myIndex) {
            td.classList.add("my-player-cell");
          }

          tr.appendChild(td);
        }

        playerGamesTbody.appendChild(tr);
      });
    }
  }

  // --- 뱃지 정보 로딩 ---
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
    main.textContent = b.name;   // 코드(#1234) 빼고 이름만 표시


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

// ======================= 관리자 화면 (뱃지) =======================

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
