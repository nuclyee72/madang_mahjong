// ===== 공통 유틸 =====
const UMA_VALUES = [50, 10, -10, -30];
const RETURN_SCORE = 30000;

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
// ===== 시간 출력: 저장된 시간을 +9h (KST)로 바꿔서 예쁘게 표시 =====
function formatKoreanTime(isoString) {
  if (!isoString) return "";

  // "2025-11-19T05:30" 또는 "2025-11-19 05:30" 둘 다 처리
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

  // 원래 문자열을 "UTC 기준"이라고 보고 +9시간
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const kstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);

  const y = kstDate.getUTCFullYear();
  const m = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kstDate.getUTCDate()).padStart(2, "0");
  const hh = String(kstDate.getUTCHours()).padStart(2, "0");
  const mm = String(kstDate.getUTCMinutes()).padStart(2, "0");

  // 화면에 찍히는 형식: 2025-11-19 14:30
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

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

    // 기록이 있는 등수만 숫자 표시
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
  setupTeamForms();
  loadGamesAndRanking();
});

// ===== 상단 탭 전환 =====
function setupViewSwitch() {
  const personalView = document.getElementById("personal-view");
  const teamView = document.getElementById("team-view");
  const teamManageView = document.getElementById("team-manage-view");
  const buttons = document.querySelectorAll(".view-switch-btn");

  if (!personalView || !teamView || !buttons.length) return;

  function showView(view) {
    personalView.style.display = view === "personal" ? "block" : "none";
    teamView.style.display = view === "team" ? "block" : "none";
    if (teamManageView) {
      teamManageView.style.display = view === "team-manage" ? "block" : "none";
    }

    if (view === "team") {
      loadTeamOverview();
      loadTeamRanking();
      loadTeamGamesTable();
    } else if (view === "team-manage") {
      loadTeamManageTables();
    } else if (view === "personal") {
      loadGamesAndRanking();
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

// ===== 개인전: 입력 + 기록 + 랭킹 =====
function setupPersonalForm() {
  const form = document.getElementById("game-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      player1_name: (fd.get("player1_name") || "").toString().trim(),
      player2_name: (fd.get("player2_name") || "").toString().trim(),
      player3_name: (fd.get("player3_name") || "").toString().trim(),
      player4_name: (fd.get("player4_name") || "").toString().trim(),
      player1_score: Number(fd.get("player1_score")),
      player2_score: Number(fd.get("player2_score")),
      player3_score: Number(fd.get("player3_score")),
      player4_score: Number(fd.get("player4_score")),
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
      alert("게임 저장에 실패했습니다.");
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

      // 이름은 볼드, 아래 줄에 "점수 (pt)" 형식
      const name = names[i] || "";
      const score = scores[i];
      const pt = pts[i];

      td.innerHTML = `<strong>${name}</strong><br>${score} (${pt})`;

      if (ranks[i] === 1) td.classList.add("winner-cell");
      tr.appendChild(td);

      const pname = name;
      if (!pname) continue;
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

  // 개인 랭킹
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

  if (players.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "ranking-placeholder";
    td.textContent = "통계 없음";
    tr.appendChild(td);
    rankingBody.appendChild(tr);
    return;
  }

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

// ===== 팀: 폼들 =====
function setupTeamForms() {
  // 팀전 기록 입력 폼
  const teamGameForm = document.getElementById("team-game-form");
  if (teamGameForm) {
    teamGameForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(teamGameForm);
      const payload = {
        g1_player: (fd.get("g1_player") || "").toString().trim(),
        g1_team: (fd.get("g1_team") || "").toString().trim(),
        g1_score: Number(fd.get("g1_score")),
        g2_player: (fd.get("g2_player") || "").toString().trim(),
        g2_team: (fd.get("g2_team") || "").toString().trim(),
        g2_score: Number(fd.get("g2_score")),
        g3_player: (fd.get("g3_player") || "").toString().trim(),
        g3_team: (fd.get("g3_team") || "").toString().trim(),
        g3_score: Number(fd.get("g3_score")),
        g4_player: (fd.get("g4_player") || "").toString().trim(),
        g4_team: (fd.get("g4_team") || "").toString().trim(),
        g4_score: Number(fd.get("g4_score")),
      };
      try {
        await fetchJSON("/api/team_games", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        teamGameForm.reset();
        await loadTeamRanking();
        await loadTeamGamesTable();
      } catch (err) {
        console.error(err);
        alert("팀전 기록 저장 실패");
      }
    });
  }

  // 팀 생성 폼 (팀 관리 탭)
  const teamCreateForm = document.getElementById("team-create-form");
  if (teamCreateForm) {
    teamCreateForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(teamCreateForm);
      const name = (fd.get("team_name") || "").toString().trim();
      if (!name) return;
      try {
        await fetchJSON("/api/teams", {
          method: "POST",
          body: JSON.stringify({ team_name: name }),
        });
        teamCreateForm.reset();
        await loadTeamManageTables();
        await loadTeamOverview();
        await loadTeamRanking();
      } catch (err) {
        console.error(err);
        alert("팀 생성 실패");
      }
    });
  }

  // 팀원 추가 폼 (팀 관리 탭)
  const addMemberForm = document.getElementById("team-add-member-form");
  if (addMemberForm) {
    addMemberForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(addMemberForm);
      const playerName = (fd.get("player_name") || "").toString().trim();
      const teamName = (fd.get("team_name") || "").toString().trim();
      if (!playerName || !teamName) return;
      try {
        await fetchJSON("/api/team_members", {
          method: "POST",
          body: JSON.stringify({
            player_name: playerName,
            team_name: teamName,
          }),
        });
        addMemberForm.reset();
        await loadTeamManageTables();
        await loadTeamOverview();
        await loadTeamRanking();
      } catch (err) {
        console.error(err);
        alert("팀원 추가 실패");
      }
    });
  }
}

// ===== 팀: 팀 목록 / 팀원 (보기용) =====
async function loadTeamOverview() {
  const container = document.getElementById("team-overview");
  if (!container) return;

  let teams = [];
  let members = [];
  try {
    teams = await fetchJSON("/api/teams");
    members = await fetchJSON("/api/team_members");
  } catch (err) {
    console.error("팀 개요 로딩 실패:", err);
    return;
  }

  container.innerHTML = "";

  if (!teams || teams.length === 0) {
    const div = document.createElement("div");
    div.className = "ranking-placeholder";
    div.textContent = "등록된 팀이 없습니다.";
    container.appendChild(div);
    return;
  }

  const memberMap = {};
  if (members && members.length) {
    members.forEach((m) => {
      const t = m.team_name;
      if (!memberMap[t]) memberMap[t] = [];
      memberMap[t].push(m.player_name);
    });
  }

  teams.forEach((t) => {
    const teamName = t.name;
    const list = memberMap[teamName] || [];

    const item = document.createElement("div");
    item.className = "team-overview-item";

    const header = document.createElement("div");
    header.className = "team-overview-header";
    header.textContent = `${teamName} (${list.length}명)`;

    const body = document.createElement("div");
    body.className = "team-overview-members";
    if (list.length === 0) {
      body.textContent = "팀원이 없습니다.";
    } else {
      body.textContent = list.join(", ");
    }

    item.appendChild(header);
    item.appendChild(body);
    container.appendChild(item);
  });
}

// ===== 팀: 팀전 대국 기록 표 =====
async function loadTeamGamesTable() {
  const tbody = document.getElementById("team-games-tbody");
  if (!tbody) return;

  let games = [];
  try {
    games = await fetchJSON("/api/team_games");
  } catch (err) {
    console.error("팀전 기록 로드 실패:", err);
    return;
  }

  tbody.innerHTML = "";
  if (!games || games.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7; // ID, 시간, T1~T4, 삭제
    td.className = "ranking-placeholder";
    td.textContent = "팀전 기록이 없습니다.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  games.forEach((g) => {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = g.id;
    tr.appendChild(tdId);

    const tdTime = document.createElement("td");
    tdTime.textContent = formatKoreanTime(g.created_at);
    tr.appendChild(tdTime);


    const formatCell = (pn, tn, sc) => `${pn} [${tn}] (${sc})`;

    const tdP1 = document.createElement("td");
    tdP1.textContent = formatCell(
      g.p1_player_name,
      g.p1_team_name,
      g.p1_score
    );
    tr.appendChild(tdP1);

    const tdP2 = document.createElement("td");
    tdP2.textContent = formatCell(
      g.p2_player_name,
      g.p2_team_name,
      g.p2_score
    );
    tr.appendChild(tdP2);

    const tdP3 = document.createElement("td");
    tdP3.textContent = formatCell(
      g.p3_player_name,
      g.p3_team_name,
      g.p3_score
    );
    tr.appendChild(tdP3);

    const tdP4 = document.createElement("td");
    tdP4.textContent = formatCell(
      g.p4_player_name,
      g.p4_team_name,
      g.p4_score
    );
    tr.appendChild(tdP4);

    // 팀전 기록 삭제 버튼
    const tdDel = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "삭제";
    btn.addEventListener("click", async () => {
      if (!confirm("이 팀전 기록을 삭제할까요?")) return;
      try {
        await fetchJSON(`/api/team_games/${g.id}`, { method: "DELETE" });
        await loadTeamGamesTable();
        await loadTeamRanking();
      } catch (err) {
        console.error(err);
        alert("팀전 기록 삭제 실패");
      }
    });
    tdDel.appendChild(btn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });
}

// ===== 팀: 순위 테이블 =====
async function loadTeamRanking() {
  const tbody = document.getElementById("team-ranking-tbody");
  if (!tbody) return;

  let data = [];
  try {
    data = await fetchJSON("/api/team_ranking");
  } catch (err) {
    console.error("팀 랭킹 로드 실패:", err);
    return;
  }

  tbody.innerHTML = "";
  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "ranking-placeholder";
    td.textContent = "아직 팀 데이터가 없습니다.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  data.forEach((t, idx) => {
    const tr = document.createElement("tr");

    const tdRank = document.createElement("td");
    tdRank.textContent = idx + 1;
    tr.appendChild(tdRank);

    const tdName = document.createElement("td");
    tdName.textContent = t.team_name;
    tr.appendChild(tdName);

    const tdGames = document.createElement("td");
    tdGames.textContent = t.games;
    tr.appendChild(tdGames);

    const totalPt = Number(t.total_pt || 0);
    const tdPt = document.createElement("td");
    tdPt.textContent = totalPt.toFixed(1);
    tr.appendChild(tdPt);

    const yonde = Number(t.yonde_rate || 0);
    const tdY = document.createElement("td");
    tdY.textContent = yonde.toFixed(1) + "%";
    tr.appendChild(tdY);

    const tdDist = document.createElement("td");
    tdDist.appendChild(
      createRankDistBar(t.rank_counts || [0, 0, 0, 0], t.games || 1)
    );
    tr.appendChild(tdDist);

    tbody.appendChild(tr);
  });
}

// ===== 팀 관리 탭: 팀/팀원 삭제 =====
async function loadTeamManageTables() {
  const teamTable = document.getElementById("manage-team-table");
  const memberTable = document.getElementById("manage-members-table");
  if (!teamTable || !memberTable) return;

  const teamTbody = teamTable.querySelector("tbody");
  const memberTbody = memberTable.querySelector("tbody");

  let teams = [];
  let members = [];
  try {
    teams = await fetchJSON("/api/teams");
    members = await fetchJSON("/api/team_members");
  } catch (err) {
    console.error("팀 관리 데이터 로딩 실패:", err);
    return;
  }

  // 팀 목록 관리
  teamTbody.innerHTML = "";
  if (!teams || teams.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "ranking-placeholder";
    td.textContent = "팀이 없습니다.";
    tr.appendChild(td);
    teamTbody.appendChild(tr);
  } else {
    teams.forEach((t) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = t.name;
      tr.appendChild(tdName);

      const tdCount = document.createElement("td");
      tdCount.textContent = t.member_count;
      tr.appendChild(tdCount);

      const tdBtn = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = "팀 삭제";
      btn.addEventListener("click", async () => {
        if (!confirm(`팀 '${t.name}'을(를) 삭제할까요?`)) return;
        try {
          await fetchJSON(`/api/teams/${t.id}`, { method: "DELETE" });
          await loadTeamManageTables();
          await loadTeamOverview();
          await loadTeamRanking();
        } catch (err) {
          console.error(err);
          alert("팀 삭제 실패");
        }
      });
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);

      teamTbody.appendChild(tr);
    });
  }

  // 팀원 목록 관리
  memberTbody.innerHTML = "";
  if (!members || members.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "ranking-placeholder";
    td.textContent = "팀원이 없습니다.";
    tr.appendChild(td);
    memberTbody.appendChild(tr);
  } else {
    members.forEach((m) => {
      const tr = document.createElement("tr");

      const tdTeam = document.createElement("td");
      tdTeam.textContent = m.team_name;
      tr.appendChild(tdTeam);

      const tdPlayer = document.createElement("td");
      tdPlayer.textContent = m.player_name;
      tr.appendChild(tdPlayer);

      const tdBtn = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = "제거";
      btn.addEventListener("click", async () => {
        if (
          !confirm(
            `'${m.team_name}' 팀에서 '${m.player_name}'을(를) 제거할까요?`
          )
        )
          return;
        try {
          await fetchJSON(`/api/team_members/${m.id}`, { method: "DELETE" });
          await loadTeamManageTables();
          await loadTeamOverview();
          await loadTeamRanking();
        } catch (err) {
          console.error(err);
          alert("팀원 제거 실패");
        }
      });
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);

      memberTbody.appendChild(tr);
    });
  }
}
