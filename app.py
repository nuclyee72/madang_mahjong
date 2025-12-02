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

    # 뱃지 정의
    conn.execute("""
        CREATE TABLE IF NOT EXISTS badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code INTEGER UNIQUE NOT NULL,
            name TEXT NOT NULL,
            grade TEXT NOT NULL,
            description TEXT
        )
    """)

    # 플레이어별 뱃지 부여
    conn.execute("""
        CREATE TABLE IF NOT EXISTS player_badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            badge_code INTEGER NOT NULL,
            granted_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)
init_db()

# 마작 포인트 계산용 상수
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

    # 🔥 여기 추가: 네 사람 점수 합이 100000 아니면 에러
    if s1 + s2 + s3 + s4 != 100000:
        return jsonify({"error": "total score must be 100000"}), 400

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

    def calc_pts(scores):
        order = sorted(range(4), key=lambda i: scores[i], reverse=True)

        uma_for_player = [0, 0, 0, 0]
        for rank, idx in enumerate(order):
            uma_for_player[idx] = UMA_VALUES[rank]

        pts = []
        for i in range(4):
            base = (scores[i] - RETURN_SCORE) / 1000.0
            pts.append(base + uma_for_player[i])
        return pts

    output = io.StringIO()
    writer = csv.writer(output)

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
        pts = calc_pts(scores)

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

    csv_bytes = csv_data.encode("cp949", errors="replace")

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
                  * /export 에서 받은 CSV나<br>
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

    import io as _io
    sample = "\n".join(text.splitlines()[:5])
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
    except Exception:
        dialect = csv.excel
        dialect.delimiter = ","

    reader = csv.DictReader(_io.StringIO(text), dialect=dialect)

    def pick(row, keys, default=""):
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
        created_at = pick(row, ["created_at", "시간"])
        if not created_at:
            created_at = datetime.now().isoformat(timespec="minutes")

        p1_name = pick(row, ["player1_name", "P1 이름", "P1이름"])
        p2_name = pick(row, ["player2_name", "P2 이름", "P2이름"])
        p3_name = pick(row, ["player3_name", "P3 이름", "P3이름"])
        p4_name = pick(row, ["player4_name", "P4 이름", "P4이름"])

        s1 = pick_int(row, ["player1_score", "P1 점수", "P1점수"])
        s2 = pick_int(row, ["player2_score", "P2 점수", "P2점수"])
        s3 = pick_int(row, ["player3_score", "P3 점수", "P3점수"])
        s4 = pick_int(row, ["player4_score", "P4 점수", "P4점수"])

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


# ================== 뱃지 / 관리자 API ==================

@app.route("/api/badges", methods=["GET", "POST"])
def badges_api():
    if request.method == "POST":
        data = request.get_json() or {}
        try:
            code = int(data.get("code", 0))
        except (TypeError, ValueError):
            return jsonify({"error": "code must be integer"}), 400

        name = str(data.get("name", "")).strip()
        grade = str(data.get("grade", "")).strip()
        description = str(data.get("description", "")).strip()

        if not code or not name or not grade:
            return jsonify({"error": "code, name, grade required"}), 400

        conn = get_db()
        try:
            cur = conn.execute(
                "INSERT INTO badges (code, name, grade, description) VALUES (?, ?, ?, ?)",
                (code, name, grade, description),
            )
            conn.commit()
            new_id = cur.lastrowid
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"error": "badge code already exists"}), 400
        conn.close()
        return jsonify({"id": new_id}), 201

    # GET
    conn = get_db()
    cur = conn.execute("""
        SELECT id, code, name, grade, description
        FROM badges
        ORDER BY code ASC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/badges/<int:badge_id>", methods=["DELETE"])
def delete_badge(badge_id):
    conn = get_db()
    cur = conn.execute("SELECT code FROM badges WHERE id = ?", (badge_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "badge not found"}), 404

    code = row["code"]

    conn.execute("DELETE FROM player_badges WHERE badge_code = ?", (code,))
    cur = conn.execute("DELETE FROM badges WHERE id = ?", (badge_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()

    if deleted == 0:
        return jsonify({"error": "badge not found"}), 404
    return jsonify({"ok": True})


@app.route("/api/player_badges", methods=["POST"])
def assign_badge():
    data = request.get_json() or {}
    player_name = str(data.get("player_name", "")).strip()
    try:
        badge_code = int(data.get("badge_code", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "badge_code must be integer"}), 400

    if not (player_name and badge_code):
        return jsonify({"error": "player_name and badge_code required"}), 400

    granted_at = datetime.now().isoformat(timespec="minutes")
    conn = get_db()

    cur = conn.execute("SELECT 1 FROM badges WHERE code = ?", (badge_code,))
    if not cur.fetchone():
        conn.close()
        return jsonify({"error": "badge not found"}), 400

    conn.execute("""
        INSERT INTO player_badges (player_name, badge_code, granted_at)
        VALUES (?, ?, ?)
    """, (player_name, badge_code, granted_at))
    conn.commit()
    conn.close()
    return jsonify({"ok": True}), 201


@app.route("/api/player_badges/by_player/<player_name>", methods=["GET"])
def list_player_badges(player_name):
    name = player_name.strip()
    conn = get_db()
    cur = conn.execute("""
        SELECT
            pb.id,
            pb.player_name,
            pb.badge_code AS code,
            pb.granted_at,
            b.name,
            b.grade,
            b.description
        FROM player_badges pb
        LEFT JOIN badges b ON pb.badge_code = b.code
        WHERE pb.player_name = ?
        ORDER BY pb.granted_at ASC, pb.id ASC
    """, (name,))
    rows = cur.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "player_name": r["player_name"],
            "code": r["code"],
            "name": r["name"] or "",
            "grade": r["grade"] or "",
            "description": r["description"] or "",
            "granted_at": r["granted_at"],
        })
    return jsonify(result)


@app.route("/api/player_badges/<int:assign_id>", methods=["DELETE"])
def delete_player_badge(assign_id):
    conn = get_db()
    cur = conn.execute("DELETE FROM player_badges WHERE id = ?", (assign_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if deleted == 0:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


# ================== 뱃지 CSV 백업/복구 ==================

# ---- 뱃지 정의 CSV 내보내기 ----
@app.route("/export_badges", methods=["GET"])
def export_badges():
    conn = get_db()
    cur = conn.execute("""
        SELECT code, name, grade, description
        FROM badges
        ORDER BY code ASC
    """)
    rows = cur.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)

    # 헤더
    writer.writerow(["code", "name", "grade", "description"])

    # 데이터
    for row in rows:
        writer.writerow([
            row["code"],
            row["name"],
            row["grade"],
            row["description"] or "",
        ])

    csv_data = output.getvalue()
    output.close()

    csv_bytes = csv_data.encode("cp949", errors="replace")

    return Response(
        csv_bytes,
        mimetype="text/csv; charset=cp949",
        headers={
            "Content-Disposition": "attachment; filename=badges.csv"
        },
    )


# ---- 뱃지 정의 CSV 업로드 ----
@app.route("/import_badges", methods=["GET", "POST"])
def import_badges():
    if request.method == "GET":
        return """
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <title>뱃지 CSV 업로드</title>
          <link rel="stylesheet" href="/static/style.css">
        </head>
        <body>
          <div class="top-bar">
            <h1>뱃지 CSV 업로드</h1>
            <div class="view-switch">
              <a href="/" class="view-switch-btn">메인으로 돌아가기</a>
            </div>
          </div>
          <div class="main-layout">
            <div class="left-panel">
              <section class="games-panel">
                <h2>뱃지 CSV 업로드</h2>
                <p class="hint-text">
                  * /export_badges에서 받은 CSV나<br>
                  * code, name, grade, description 컬럼이 있는 CSV를 업로드하세요.
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

    # POST
    file = request.files.get("file")
    if not file:
        return "파일이 없습니다.", 400

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

    import io as _io
    sample = "\n".join(text.splitlines()[:5])
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
    except Exception:
        dialect = csv.excel
        dialect.delimiter = ","

    reader = csv.DictReader(_io.StringIO(text), dialect=dialect)

    def pick(row, keys, default=""):
        for k in keys:
            if k in row and row[k] not in (None, ""):
                return row[k]
        return default

    conn = get_db()
    inserted = 0
    updated = 0

    for row in reader:
        code_val = pick(row, ["code", "코드"])
        if not code_val:
            continue
        try:
            code = int(code_val)
        except ValueError:
            continue

        name = pick(row, ["name", "이름"])
        grade = pick(row, ["grade", "등급"])
        description = pick(row, ["description", "설명"])

        if not (name and grade):
            # 필수값 없으면 스킵
            continue

        # 이미 있는 code면 update, 없으면 insert
        cur = conn.execute(
            "UPDATE badges SET name=?, grade=?, description=? WHERE code=?",
            (name, grade, description, code),
        )
        if cur.rowcount == 0:
            conn.execute(
                "INSERT INTO badges (code, name, grade, description) VALUES (?, ?, ?, ?)",
                (code, name, grade, description),
            )
            inserted += 1
        else:
            updated += 1

    conn.commit()
    conn.close()

    print(f"[IMPORT_BADGES] inserted={inserted}, updated={updated}")
    return redirect(url_for("index_page"))


# ---- 플레이어별 뱃지 부여 CSV 내보내기 ----
@app.route("/export_player_badges", methods=["GET"])
def export_player_badges():
    conn = get_db()
    cur = conn.execute("""
        SELECT
            pb.player_name,
            pb.badge_code,
            pb.granted_at,
            b.name AS badge_name,
            b.grade AS badge_grade,
            b.description AS badge_description
        FROM player_badges pb
        LEFT JOIN badges b ON pb.badge_code = b.code
        ORDER BY pb.player_name ASC, pb.badge_code ASC, pb.granted_at ASC, pb.id ASC
    """)
    rows = cur.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "player_name",
        "badge_code",
        "granted_at",
        "badge_name",
        "badge_grade",
        "badge_description",
    ])

    for row in rows:
        writer.writerow([
            row["player_name"],
            row["badge_code"],
            row["granted_at"],
            row["badge_name"] or "",
            row["badge_grade"] or "",
            row["badge_description"] or "",
        ])

    csv_data = output.getvalue()
    output.close()
    csv_bytes = csv_data.encode("cp949", errors="replace")

    return Response(
        csv_bytes,
        mimetype="text/csv; charset=cp949",
        headers={
            "Content-Disposition": "attachment; filename=player_badges.csv"
        },
    )


# ---- 플레이어별 뱃지 부여 CSV 업로드 ----
@app.route("/import_player_badges", methods=["GET", "POST"])
def import_player_badges():
    if request.method == "GET":
        return """
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <title>플레이어 뱃지 CSV 업로드</title>
          <link rel="stylesheet" href="/static/style.css">
        </head>
        <body>
          <div class="top-bar">
            <h1>플레이어 뱃지 CSV 업로드</h1>
            <div class="view-switch">
              <a href="/" class="view-switch-btn">메인으로 돌아가기</a>
            </div>
          </div>
          <div class="main-layout">
            <div class="left-panel">
              <section class="games-panel">
                <h2>플레이어 뱃지 CSV 업로드</h2>
                <p class="hint-text">
                  * /export_player_badges에서 받은 CSV를 업로드하면<br>
                  * player_name / badge_code / granted_at 기준으로 복원됩니다.<br>
                  * badge_code에 해당하는 뱃지가 badges 테이블에 없으면 스킵됩니다.
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

    # POST
    file = request.files.get("file")
    if not file:
        return "파일이 없습니다.", 400

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

    import io as _io
    sample = "\n".join(text.splitlines()[:5])
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
    except Exception:
        dialect = csv.excel
        dialect.delimiter = ","

    reader = csv.DictReader(_io.StringIO(text), dialect=dialect)

    def pick(row, keys, default=""):
        for k in keys:
            if k in row and row[k] not in (None, ""):
                return row[k]
        return default

    conn = get_db()
    inserted = 0
    skipped_no_badge = 0

    for row in reader:
        player_name = pick(row, ["player_name", "플레이어", "플레이어이름"]).strip()
        badge_code_val = pick(row, ["badge_code", "code", "코드"])

        if not (player_name and badge_code_val):
            continue

        try:
            badge_code = int(badge_code_val)
        except ValueError:
            continue

        granted_at = pick(row, ["granted_at", "시간", "부여시간"])
        if not granted_at:
            granted_at = datetime.now().isoformat(timespec="minutes")

        # 뱃지가 실제로 있는지 확인
        cur = conn.execute("SELECT 1 FROM badges WHERE code = ?", (badge_code,))
        if not cur.fetchone():
            skipped_no_badge += 1
            continue

        conn.execute("""
            INSERT INTO player_badges (player_name, badge_code, granted_at)
            VALUES (?, ?, ?)
        """, (player_name, badge_code, granted_at))
        inserted += 1

    conn.commit()
    conn.close()

    print(f"[IMPORT_PLAYER_BADGES] inserted={inserted}, skipped_no_badge={skipped_no_badge}")
    return redirect(url_for("index_page"))


# ================== 기본 페이지 ==================

@app.route("/")
def index_page():
    return render_template("index.html")


if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
