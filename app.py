from flask import Flask, request, jsonify, render_template, Response, redirect, url_for
from flask_cors import CORS
import sqlite3
from datetime import datetime
import os
import io
import csv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "games.db")



def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()

    # 개인전 게임 기록 (4인 마작)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            player1_name TEXT NOT NULL,
            player2_name TEXT NOT NULL,
            player3_name TEXT NOT NULL,
            player4_name TEXT NOT NULL,
            player1_score INTEGER NOT NULL,
            player2_score INTEGER NOT NULL,
            player3_score INTEGER NOT NULL,
            player4_score INTEGER NOT NULL
        )
    """)

    # 팀 목록
    conn.execute("""
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    """)

    # 팀원 매핑
    conn.execute("""
        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT NOT NULL,
            player_name TEXT NOT NULL,
            joined_at TEXT NOT NULL
        )
    """)

    # 팀전 게임 기록
    conn.execute("""
        CREATE TABLE IF NOT EXISTS team_games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            p1_player_name TEXT NOT NULL,
            p1_team_name   TEXT NOT NULL,
            p1_score       INTEGER NOT NULL,
            p2_player_name TEXT NOT NULL,
            p2_team_name   TEXT NOT NULL,
            p2_score       INTEGER NOT NULL,
            p3_player_name TEXT NOT NULL,
            p3_team_name   TEXT NOT NULL,
            p3_score       INTEGER NOT NULL,
            p4_player_name TEXT NOT NULL,
            p4_team_name   TEXT NOT NULL,
            p4_score       INTEGER NOT NULL
        )
    """)

    conn.commit()
    conn.close()


app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)
init_db()

# 마작 포인트 계산용 상수 (개인/팀 공통)
UMA_VALUES = [50, 10, -10, -30]   # 1등~4등 우마 (+오카 반영한 버전)
RETURN_SCORE = 30000


# ================== 개인전 API ==================

@app.route("/api/games", methods=["GET"])
def list_games():
    conn = get_db()
    cur = conn.execute("SELECT * FROM games ORDER BY id DESC")
    rows = cur.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@app.route("/api/games", methods=["POST"])
def create_game():
    data = request.get_json() or {}

    required = [
        "player1_name", "player2_name", "player3_name", "player4_name",
        "player1_score", "player2_score", "player3_score", "player4_score",
    ]
    if not all(k in data for k in required):
        return jsonify({"error": "missing fields"}), 400

    p1 = str(data["player1_name"]).strip()
    p2 = str(data["player2_name"]).strip()
    p3 = str(data["player3_name"]).strip()
    p4 = str(data["player4_name"]).strip()
    if not (p1 and p2 and p3 and p4):
        return jsonify({"error": "all player names required"}), 400

    try:
        s1 = int(data["player1_score"])
        s2 = int(data["player2_score"])
        s3 = int(data["player3_score"])
        s4 = int(data["player4_score"])
    except (ValueError, TypeError):
        return jsonify({"error": "scores must be integers"}), 400

    created_at = datetime.now().isoformat(timespec="minutes")

    conn = get_db()
    cur = conn.execute("""
        INSERT INTO games (
            created_at,
            player1_name, player2_name, player3_name, player4_name,
            player1_score, player2_score, player3_score, player4_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (created_at, p1, p2, p3, p4, s1, s2, s3, s4))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()

    return jsonify({"id": new_id}), 201


@app.route("/api/games/<int:game_id>", methods=["DELETE"])
def delete_game(game_id):
    conn = get_db()
    cur = conn.execute("DELETE FROM games WHERE id = ?", (game_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()

    if deleted == 0:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


# ---- 개인전 CSV 내보내기 ----

@app.route("/export", methods=["GET"])
def export_games():
    conn = get_db()
    cur = conn.execute("""
        SELECT
            id, created_at,
            player1_name, player2_name, player3_name, player4_name,
            player1_score, player2_score, player3_score, player4_score
        FROM games
        ORDER BY id ASC
    """)
    rows = cur.fetchall()
    conn.close()

    # pts 계산용 함수 (프론트랑 똑같이)
    def calc_pts(scores):
        # scores: [s1, s2, s3, s4]
        order = sorted(range(4), key=lambda i: scores[i], reverse=True)

        uma_for_player = [0, 0, 0, 0]
        for rank, idx in enumerate(order):
            uma_for_player[idx] = UMA_VALUES[rank]  # 전역에 정의된 [50,10,-10,-30]

        pts = []
        for i in range(4):
            base = (scores[i] - RETURN_SCORE) / 1000.0  # RETURN_SCORE = 30000
            pts.append(base + uma_for_player[i])
        return pts

    import io
    import csv

    output = io.StringIO()
    writer = csv.writer(output)

    # 🔹 헤더: 네가 보내준 형식 그대로
    writer.writerow([
        "ID", "시간",
        "P1 이름", "P1 점수", "P1 pt",
        "P2 이름", "P2 점수", "P2 pt",
        "P3 이름", "P3 점수", "P3 pt",
        "P4 이름", "P4 점수", "P4 pt",
    ])

    for row in rows:
        s1 = row["player1_score"]
        s2 = row["player2_score"]
        s3 = row["player3_score"]
        s4 = row["player4_score"]
        scores = [s1, s2, s3, s4]
        pts = calc_pts(scores)  # [pt1, pt2, pt3, pt4]

        writer.writerow([
            row["id"],
            row["created_at"],
            row["player1_name"], s1, f"{pts[0]:.1f}",
            row["player2_name"], s2, f"{pts[1]:.1f}",
            row["player3_name"], s3, f"{pts[2]:.1f}",
            row["player4_name"], s4, f"{pts[3]:.1f}",
        ])

    csv_data = output.getvalue()
    output.close()

    # 🔥 엑셀 호환을 위해 CP949(ANSI)로 인코딩
    csv_bytes = csv_data.encode("cp949", errors="replace")

    from flask import Response
    return Response(
        csv_bytes,
        mimetype="text/csv; charset=cp949",
        headers={
            "Content-Disposition": "attachment; filename=madang_majhong_rating.csv"
        },
    )



# ---- 개인전 CSV 업로드 ----

@app.route("/import", methods=["GET", "POST"])
def import_games():
    if request.method == "GET":
        # 업로드 페이지
        return """
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <title>개인전 CSV 업로드</title>
          <link rel="stylesheet" href="/static/style.css">
        </head>
        <body>
          <div class="top-bar">
            <h1>개인전 CSV 업로드</h1>
            <div class="view-switch">
              <a href="/" class="view-switch-btn">메인으로 돌아가기</a>
            </div>
          </div>
          <div class="main-layout">
            <div class="left-panel">
              <section class="games-panel">
                <h2>개인전 CSV 업로드</h2>
                <p class="hint-text">
                  * /export 에서 받은 games.csv 나<br>
                  * ID / 시간 / P1 이름 / P1 점수 / ... 형식의 파일 모두 인식합니다.
                </p>
                <form method="post" enctype="multipart/form-data">
                  <p><input type="file" name="file" accept=".csv" required></p>
                  <p><button type="submit">업로드</button></p>
                </form>
              </section>
            </div>
          </div>
        </body>
        </html>
        """

    file = request.files.get("file")
    if not file:
        return "파일이 없습니다.", 400

    # 1) 인코딩 대충 자동 감지 (utf-8 / cp949 우선)
    raw = file.read()
    text = None
    for enc in ("utf-8-sig", "utf-8", "cp949"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue

    if text is None:
        return "알 수 없는 인코딩입니다. UTF-8 또는 CP949로 저장해주세요.", 400

    # 2) 구분자 자동 감지(, 또는 ;)
    import io as _io
    sample = "\n".join(text.splitlines()[:5])
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
    except Exception:
        dialect = csv.excel
        dialect.delimiter = ","

    reader = csv.DictReader(_io.StringIO(text), dialect=dialect)

    def pick(row, keys, default=""):
        """여러 후보 키 중 먼저 나오는 값 사용"""
        for k in keys:
            if k in row and row[k] not in (None, ""):
                return row[k]
        return default

    def pick_int(row, keys, default=0):
        val = pick(row, keys, None)
        if val is None or val == "":
            return default
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return default

    conn = get_db()
    inserted = 0

    for row in reader:
        # 시간 / created_at
        created_at = pick(row, ["created_at", "시간"])
        if not created_at:
            created_at = datetime.now().isoformat(timespec="minutes")

        # 이름/점수 매핑 (영문 헤더 + 한글 헤더 둘 다 지원)
        p1_name = pick(row, ["player1_name", "P1 이름", "P1이름"])
        p2_name = pick(row, ["player2_name", "P2 이름", "P2이름"])
        p3_name = pick(row, ["player3_name", "P3 이름", "P3이름"])
        p4_name = pick(row, ["player4_name", "P4 이름", "P4이름"])

        s1 = pick_int(row, ["player1_score", "P1 점수", "P1점수"])
        s2 = pick_int(row, ["player2_score", "P2 점수", "P2점수"])
        s3 = pick_int(row, ["player3_score", "P3 점수", "P3점수"])
        s4 = pick_int(row, ["player4_score", "P4 점수", "P4점수"])

        # 이름이 하나도 없으면 애매하니까 스킵
        if not (p1_name or p2_name or p3_name or p4_name):
            continue

        conn.execute("""
            INSERT INTO games (
                created_at,
                player1_name, player2_name, player3_name, player4_name,
                player1_score, player2_score, player3_score, player4_score
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (created_at,
              p1_name, p2_name, p3_name, p4_name,
              s1, s2, s3, s4))
        inserted += 1

    conn.commit()
    conn.close()

    print(f"[IMPORT] inserted rows: {inserted}")
    return redirect(url_for("index_page"))



# ================== 팀 / 팀전 API ==================

# ---- 팀 목록 ----

@app.route("/api/teams", methods=["GET", "POST"])
def teams_api():
    if request.method == "POST":
        data = request.get_json() or {}
        name = str(data.get("team_name", "")).strip()
        if not name:
            return jsonify({"error": "team_name required"}), 400

        conn = get_db()
        try:
            cur = conn.execute("INSERT INTO teams (name) VALUES (?)", (name,))
            conn.commit()
            new_id = cur.lastrowid
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"error": "team already exists"}), 400
        conn.close()
        return jsonify({"id": new_id, "name": name}), 201

    # GET
    conn = get_db()
    cur = conn.execute("""
        SELECT t.id,
               t.name,
               COUNT(m.player_name) AS member_count
        FROM teams t
        LEFT JOIN team_members m ON t.name = m.team_name
        GROUP BY t.id, t.name
        ORDER BY t.name
    """)
    rows = cur.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@app.route("/api/teams/<int:team_id>", methods=["DELETE"])
def delete_team(team_id):
    conn = get_db()
    cur = conn.execute("SELECT name FROM teams WHERE id = ?", (team_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "team not found"}), 404

    team_name = row["name"]

    conn.execute("DELETE FROM team_members WHERE team_name = ?", (team_name,))
    cur = conn.execute("DELETE FROM teams WHERE id = ?", (team_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()

    if deleted == 0:
        return jsonify({"error": "team not found"}), 404
    return jsonify({"ok": True})


# ---- 팀원 매핑 ----

@app.route("/api/team_members", methods=["GET", "POST"])
def team_members_api():
    if request.method == "POST":
        data = request.get_json() or {}
        player_name = str(data.get("player_name", "")).strip()
        team_name = str(data.get("team_name", "")).strip()
        if not (player_name and team_name):
            return jsonify({"error": "player_name and team_name required"}), 400

        joined_at = datetime.now().isoformat(timespec="minutes")
        conn = get_db()
        conn.execute("""
            INSERT INTO team_members (team_name, player_name, joined_at)
            VALUES (?, ?, ?)
        """, (team_name, player_name, joined_at))
        conn.commit()
        conn.close()
        return jsonify({"ok": True}), 201

    # GET
    team = request.args.get("team", "").strip()
    conn = get_db()

    if team:
        cur = conn.execute("""
            SELECT id, team_name, player_name, joined_at
            FROM team_members
            WHERE team_name = ?
            ORDER BY player_name
        """, (team,))
    else:
        cur = conn.execute("""
            SELECT id, team_name, player_name, joined_at
            FROM team_members
            ORDER BY team_name, player_name
        """)
    rows = cur.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@app.route("/api/team_members/<int:member_id>", methods=["DELETE"])
def delete_team_member(member_id):
    conn = get_db()
    cur = conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()

    if deleted == 0:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


# ---- 팀전 기록 (GET/POST) ----

@app.route("/api/team_games", methods=["GET", "POST"])
def team_games_api():
    if request.method == "POST":
        data = request.get_json() or {}

        required = [
            "g1_player", "g1_team", "g1_score",
            "g2_player", "g2_team", "g2_score",
            "g3_player", "g3_team", "g3_score",
            "g4_player", "g4_team", "g4_score",
        ]
        if not all(k in data for k in required):
            return jsonify({"error": "missing fields"}), 400

        g = {}
        for i in range(1, 5):
            p_key = f"g{i}_player"
            t_key = f"g{i}_team"
            s_key = f"g{i}_score"

            g[p_key] = str(data[p_key]).strip()
            g[t_key] = str(data[t_key]).strip()
            try:
                g[s_key] = int(data[s_key])
            except (ValueError, TypeError):
                return jsonify({"error": "score must be integer"}), 400

        created_at = datetime.now().isoformat(timespec="minutes")

        conn = get_db()
        conn.execute("""
            INSERT INTO team_games (
                created_at,
                p1_player_name, p1_team_name, p1_score,
                p2_player_name, p2_team_name, p2_score,
                p3_player_name, p3_team_name, p3_score,
                p4_player_name, p4_team_name, p4_score
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            created_at,
            g["g1_player"], g["g1_team"], g["g1_score"],
            g["g2_player"], g["g2_team"], g["g2_score"],
            g["g3_player"], g["g3_team"], g["g3_score"],
            g["g4_player"], g["g4_team"], g["g4_score"],
        ))
        conn.commit()
        conn.close()
        return jsonify({"ok": True}), 201

    # GET: 팀전 기록 리스트
    conn = get_db()
    cur = conn.execute("""
        SELECT id, created_at,
               p1_player_name, p1_team_name, p1_score,
               p2_player_name, p2_team_name, p2_score,
               p3_player_name, p3_team_name, p3_score,
               p4_player_name, p4_team_name, p4_score
        FROM team_games
        ORDER BY id DESC
    """)
    rows = cur.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


# ---- 팀전 CSV 내보내기 ----

@app.route("/team_export", methods=["GET"])
def team_export():
    conn = get_db()
    cur = conn.execute("SELECT * FROM team_games ORDER BY id ASC")
    rows = cur.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "id", "created_at",
        "p1_player_name", "p1_team_name", "p1_score",
        "p2_player_name", "p2_team_name", "p2_score",
        "p3_player_name", "p3_team_name", "p3_score",
        "p4_player_name", "p4_team_name", "p4_score",
    ])

    for r in rows:
        writer.writerow([
            r["id"], r["created_at"],
            r["p1_player_name"], r["p1_team_name"], r["p1_score"],
            r["p2_player_name"], r["p2_team_name"], r["p2_score"],
            r["p3_player_name"], r["p3_team_name"], r["p3_score"],
            r["p4_player_name"], r["p4_team_name"], r["p4_score"],
        ])

    csv_data = output.getvalue()
    output.close()

    return Response(
        csv_data,
        mimetype="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": "attachment; filename=team_games.csv"}
    )


# ---- 팀전 CSV 업로드 ----

@app.route("/team_import", methods=["GET", "POST"])
def team_import():
    if request.method == "GET":
        return """
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <title>팀전 CSV 업로드</title>
          <link rel="stylesheet" href="/static/style.css">
        </head>
        <body>
          <div class="top-bar">
            <h1>팀전 CSV 업로드</h1>
            <div class="view-switch">
              <a href="/" class="view-switch-btn">메인으로 돌아가기</a>
            </div>
          </div>

          <div class="main-layout">
            <div class="left-panel">
              <section class="team-panel">
                <h2>팀전 CSV 업로드</h2>
                <p class="hint-text">
                  * /team_export 에서 받은 team_games.csv를 수정한 뒤 업로드하면 됩니다.<br>
                  * 인코딩은 UTF-8(또는 UTF-8 BOM)을 권장합니다.
                </p>
                <form method="post" enctype="multipart/form-data">
                  <p><input type="file" name="file" accept=".csv" required></p>
                  <p><button type="submit">업로드</button></p>
                </form>
              </section>
            </div>
          </div>
        </body>
        </html>
        """

    file = request.files.get("file")
    if not file:
        return "파일이 없습니다.", 400

    stream = io.TextIOWrapper(file.stream, encoding="utf-8-sig")
    reader = csv.DictReader(stream)

    conn = get_db()
    for row in reader:
        created_at = row.get("created_at") or datetime.now().isoformat(timespec="minutes")
        try:
            p1_score = int(row.get("p1_score", 0))
            p2_score = int(row.get("p2_score", 0))
            p3_score = int(row.get("p3_score", 0))
            p4_score = int(row.get("p4_score", 0))
        except (ValueError, TypeError):
            continue

        conn.execute("""
            INSERT INTO team_games (
                created_at,
                p1_player_name, p1_team_name, p1_score,
                p2_player_name, p2_team_name, p2_score,
                p3_player_name, p3_team_name, p3_score,
                p4_player_name, p4_team_name, p4_score
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            created_at,
            row.get("p1_player_name", ""), row.get("p1_team_name", ""), p1_score,
            row.get("p2_player_name", ""), row.get("p2_team_name", ""), p2_score,
            row.get("p3_player_name", ""), row.get("p3_team_name", ""), p3_score,
            row.get("p4_player_name", ""), row.get("p4_team_name", ""), p4_score,
        ))
    conn.commit()
    conn.close()

    return redirect(url_for("index_page"))


# ---- 팀 랭킹 계산 ----

@app.route("/api/team_ranking", methods=["GET"])
def team_ranking():
    conn = get_db()
    cur = conn.execute("""
        SELECT
            id, created_at,
            p1_player_name, p1_team_name, p1_score,
            p2_player_name, p2_team_name, p2_score,
            p3_player_name, p3_team_name, p3_score,
            p4_player_name, p4_team_name, p4_score
        FROM team_games
    """)
    rows = cur.fetchall()
    conn.close()

    team_stats = {}

    for r in rows:
        scores = [
            r["p1_score"],
            r["p2_score"],
            r["p3_score"],
            r["p4_score"],
        ]
        teams = [
            r["p1_team_name"],
            r["p2_team_name"],
            r["p3_team_name"],
            r["p4_team_name"],
        ]

        # 랭크 계산 (내림차순)
        order = sorted(range(4), key=lambda i: scores[i], reverse=True)
        ranks = [0, 0, 0, 0]
        for pos, idx in enumerate(order):
            ranks[idx] = pos + 1

        # 우마
        uma = [0, 0, 0, 0]
        for pos, idx in enumerate(order):
            uma[idx] = UMA_VALUES[pos]

        # pt 계산
        pts = []
        for i in range(4):
            base = (scores[i] - RETURN_SCORE) / 1000.0
            pts.append(base + uma[i])

        # 팀별로 합산
        for i in range(4):
            tname = (teams[i] or "").strip()
            if not tname:
                continue
            if tname not in team_stats:
                team_stats[tname] = {
                    "games": 0,
                    "total_pt": 0.0,
                    "rank_counts": [0, 0, 0, 0],
                }
            st = team_stats[tname]
            st["games"] += 1
            st["total_pt"] += pts[i]
            st["rank_counts"][ranks[i] - 1] += 1

    result = []
    for tname, st in team_stats.items():
        games = st["games"]
        total_pt = st["total_pt"]
        c1, c2, c3, c4 = st["rank_counts"]
        yonde = 0.0
        if games > 0:
            yonde = ((c1 + c2) * 100.0) / games
        result.append({
            "team_name": tname,
            "games": games,
            "total_pt": float(round(total_pt, 1)),
            "yonde_rate": float(round(yonde, 1)),
            "rank_counts": st["rank_counts"],
        })

    result.sort(key=lambda x: x["total_pt"], reverse=True)
    return jsonify(result)


# ================== 기본 페이지 ==================

@app.route("/")
def index_page():
    return render_template("index.html")


if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
