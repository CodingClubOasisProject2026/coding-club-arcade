import { tetrisAudio } from "./audio.js";

(() => {
  "use strict";

  // Set ?api=http://localhost:8000 when the frontend and backend use different origins.
  const API_BASE = (
    new URLSearchParams(location.search).get("api") || ""
  ).replace(/\/$/, "");
  const ROWS = 20;
  const COLUMNS = 10;
  const POINTS_PER_DROP = 10;
  const PIECE_SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [
      [1, 1],
      [1, 1],
    ],
    T: [
      [1, 1, 1],
      [0, 1, 0],
    ],
    S: [
      [1, 1, 1],
      [1, 0, 0],
    ],
    Z: [
      [1, 1, 1],
      [0, 0, 1],
    ],
    J: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    L: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    B: [[1]],
  };
  const PIECE_COLORS = {
    I: "#55d9e9",
    O: "#f2d15c",
    T: "#b38cff",
    S: "#65dfcf",
    Z: "#f07883",
    J: "#68a6fa",
    L: "#f2a35d",
    B: "#f45136",
  };
  const getElement = (id) => document.getElementById(id);

  // ─── Score-based speed config ────────────────────────────────────────────────
  // A small speed bonus for score milestones, separate from level progression:
  const SCORE_SPEED_THRESHOLD = 1000;
  const SCORE_SPEED_REDUCTION_PER_STEP = 15;
  // Keep gravity playable even at high levels and scores:
  const MIN_GRAVITY_DELAY = 100;
  // ─────────────────────────────────────────────────────────────────────────────

  const game = {
    status: "idle",
    board: [],
    piece: null,
    nextPiece: null,
    randomizer: null,
    score: 0,
    lines: 0,
    level: 1,
    consecutiveClears: 0,
    stackState: "safe",
    lastGoodStackPromptAt: 0,
    startedAt: 0,
    durationMs: null,
    gravityTimer: null,
    clearAnimationTimer: null,
    clearFragmentsTimer: null,
    calloutTimer: null,
    stackCalloutTimer: null,
    pendingClearRows: null,
    elapsedTimer: null,
    session: null,
    actions: [],
    completionPayload: null,
    submitted: false,
    taskId: null,
    keyHandler: null,
    keyUpHandler: null,
    horizontalHeldCode: null,
    horizontalRepeatTimeout: null,
    horizontalRepeatInterval: null,
  };

  class SeededPieceGenerator {
    constructor(seed) {
      // Match the seeded Python RNG, bag shuffle, and bomb schedule in
      // tetris.pieces.SeededPieceRandomizer, or the backend replay will reject the run.
      this.state = new Uint32Array(624);
      let value = BigInt(seed);
      if (value < 0n) value = -value;
      const key = [];
      do {
        key.push(Number(value & 0xffffffffn));
        value >>= 32n;
      } while (value > 0n);

      this.state[0] = 19650218;
      for (let index = 1; index < 624; index++) {
        const previous = this.state[index - 1];
        this.state[index] = (Math.imul(previous ^ (previous >>> 30), 1812433253) + index) >>> 0;
      }
      let i = 1;
      let j = 0;
      for (let count = Math.max(624, key.length); count > 0; count--) {
        const previous = this.state[i - 1];
        const mix = Math.imul(previous ^ (previous >>> 30), 1664525);
        this.state[i] = ((this.state[i] ^ mix) + key[j] + j) >>> 0;
        i++;
        j++;
        if (i >= 624) {
          this.state[0] = this.state[623];
          i = 1;
        }
        if (j >= key.length) j = 0;
      }
      for (let count = 623; count > 0; count--) {
        const previous = this.state[i - 1];
        const mix = Math.imul(previous ^ (previous >>> 30), 1566083941);
        this.state[i] = ((this.state[i] ^ mix) - i) >>> 0;
        i++;
        if (i >= 624) {
          this.state[0] = this.state[623];
          i = 1;
        }
      }
      this.state[0] = 0x80000000;
      this.index = 624;
      this.bag = [];
      this.bagsUntilBomb = 2 + this.below(3);
    }

    nextUint32() {
      if (this.index >= 624) {
        for (let i = 0; i < 624; i++) {
          const y = (this.state[i] & 0x80000000) | (this.state[(i + 1) % 624] & 0x7fffffff);
          this.state[i] = (this.state[(i + 397) % 624] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0)) >>> 0;
        }
        this.index = 0;
      }
      let y = this.state[this.index++];
      y ^= y >>> 11;
      y ^= (y << 7) & 0x9d2c5680;
      y ^= (y << 15) & 0xefc60000;
      y ^= y >>> 18;
      return y >>> 0;
    }

    below(limit) {
      const bits = Math.floor(Math.log2(limit)) + 1;
      while (true) {
        const value = this.nextUint32() >>> (32 - bits);
        if (value < limit) return value;
      }
    }

    shuffle(items) {
      for (let index = items.length - 1; index > 0; index--) {
        const swap = this.below(index + 1);
        [items[index], items[swap]] = [items[swap], items[index]];
      }
      return items;
    }

    next() {
      if (this.bag.length === 0) {
        this.bag = Object.keys(PIECE_SHAPES).filter((type) => type !== "B");
        if (this.bagsUntilBomb === 0) {
          this.bag.push("B");
          this.bagsUntilBomb = 2 + this.below(3);
        } else {
          this.bagsUntilBomb--;
        }
        this.shuffle(this.bag);
      }
      const type = this.bag.pop();
      return {
        type,
        shape: PIECE_SHAPES[type].map((row) => row.slice()),
        x: 0,
        y: 0,
      };
    }
  }

  function setGameStatus(status, label) {
    game.status = status;
    const badge = getElement("status-badge");
    if (badge) badge.className = `board-status-badge status-${status}`;
    getElement("game-state-label").textContent = label;
  }

  function showOverlay(title, message, buttonLabel, onClick, disabled = false) {
    getElement("overlay-title").textContent = title;
    getElement("overlay-copy").textContent = message;
    const button = getElement("start-button");
    button.textContent = buttonLabel;
    button.disabled = disabled;
    button.onclick = onClick;
    getElement("overlay").classList.remove("hidden");
  }

  function showStackPrompt(title, detail, tone) {
    const prompt = getElement("stack-callout");
    prompt.className = "stack-callout";
    prompt.replaceChildren();
    const heading = document.createElement("span");
    heading.className = "stack-callout-title";
    heading.textContent = title;
    const message = document.createElement("span");
    message.className = "stack-callout-detail";
    message.textContent = detail;
    prompt.append(heading, message);
    prompt.setAttribute("aria-label", `${title}. ${detail}`);
    void prompt.offsetWidth;
    prompt.className = `stack-callout visible ${tone}`;
    clearTimeout(game.stackCalloutTimer);
    game.stackCalloutTimer = setTimeout(() => {
      prompt.classList.remove("visible");
    }, 1450);
  }

  function updateStackFeedback(clearedLines) {
    const firstOccupiedRow = game.board.findIndex((row) => row.some(Boolean));
    const height = firstOccupiedRow < 0 ? 0 : ROWS - firstOccupiedRow;
    const previous = game.stackState;
    const next = height >= 17 ? "critical" : height >= 13 ? "danger" : height <= 8 ? "safe" : "building";
    game.stackState = next;

    if (next === "critical" && previous !== "critical") {
      showStackPrompt("TOPPING OUT", "CLEAR LINES NOW", "critical");
    } else if (next === "danger" && previous !== "danger" && previous !== "critical") {
      showStackPrompt("STACK WARNING", "CLEAR LINES TO MAKE ROOM", "danger");
    } else if (next === "safe" && (previous === "danger" || previous === "critical")) {
      showStackPrompt("STACK RECOVERED", "ROOM TO BUILD", "good");
    } else if (next === "safe" && clearedLines > 0 && Date.now() - game.lastGoodStackPromptAt > 4500) {
      showStackPrompt("STACK STEADY", "NICE CLEAR", "good");
      game.lastGoodStackPromptAt = Date.now();
    }
  }

  async function requestApi(path, method = "GET", body) {
    const csrfToken =
      document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith("csrftoken="))
        ?.split("=")
        .slice(1)
        .join("=") || "";
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { "X-CSRFToken": csrfToken } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        data?.detail || data?.actions || data?.error?.message || data?.tickets;
      const fallback = response.status === 500
        ? "The arcade backend returned HTTP 500. Start the backend stack with `cd docker && docker compose up -d`, then retry."
        : `Request failed (${response.status})`;
      const error = new Error(
        typeof detail === "string"
          ? detail
          : JSON.stringify(detail) || fallback,
      );
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function startGame() {
    if (game.status === "creating") return;
    setGameStatus("creating", "CONNECTING");
    getElement("start-button").disabled = true;
    game.session = null;

    try {
      const response = await requestApi("/games/");
      const games = Array.isArray(response) ? response : response.results;
      const tetris = games?.find(
        (item) => String(item.name).toUpperCase() === "TETRIS",
      );
      if (!tetris) throw new Error("Blockbind is not listed by this server.");

      const session = await requestApi(
        `/sessions/start/${tetris.id}/`,
        "POST",
        {},
      );
      if (!session.id || session.seed === undefined)
        throw new Error("Unexpected session response.");
      game.session = session;
      initializeGame(session.seed);
    } catch (error) {
      console.warn("Could not start Blockbind session:", error.message);
      setGameStatus("idle", "READY");

      if (error.status === 400) {
        showOverlay(
          "ADD A TICKET",
          "No tickets left. Please add a ticket to your account to play Blockbind.",
          "ADD A TICKET",
          () => returnToHub(),
          true,
        );
      } else {
        showOverlay(
          "SIGN IN & ADD A TICKET",
          "Sign in and add a ticket to your account to play Blockbind.",
          "SIGN IN & ADD A TICKET",
          () => returnToHub(),
          false,
        );
      }
    }
  }

  function initializeGame(seed) {
    stopTimers();
    removeKeyboardListener();
    game.board = Array.from({ length: ROWS }, () => Array(COLUMNS).fill(null));
    game.pendingClearRows = null;
    clearTimeout(game.clearFragmentsTimer);
    getElement("board").parentElement.querySelector(".clear-burst-layer")?.remove();
    game.score = 0;
    game.lines = 0;
    game.level = 1;
    game.consecutiveClears = 0;
    game.stackState = "safe";
    game.lastGoodStackPromptAt = 0;
    clearTimeout(game.stackCalloutTimer);
    getElement("stack-callout").classList.remove("visible");
    game.actions = [];
    game.completionPayload = null;
    game.submitted = false;
    game.taskId = null;
    game.durationMs = null;
    game.randomizer = new SeededPieceGenerator(seed);
    game.startedAt = Date.now();
    game.nextPiece = game.randomizer.next();
    setGameStatus("playing", "IN GAME");
    spawnPiece();
    tetrisAudio.playStart();

    renderGame();
    getElement("overlay").classList.add("hidden");
    addKeyboardListener();
    game.elapsedTimer = setInterval(updateElapsedTime, 1000);
    scheduleGravity();
    tetrisAudio.startBgm();
  }

  function collides(piece, dx = 0, dy = 0, shape = piece.shape) {
    // Cells above the visible board are allowed while a piece enters the playfield.
    return shape.some((row, y) =>
      row.some((filled, x) => {
        if (!filled) return false;
        const boardX = piece.x + x + dx;
        const boardY = piece.y + y + dy;
        return (
          boardX < 0 ||
          boardX >= COLUMNS ||
          boardY >= ROWS ||
          (boardY >= 0 && game.board[boardY][boardX] !== null)
        );
      }),
    );
  }

  function spawnPiece() {
    game.piece = game.nextPiece;
    game.nextPiece = game.randomizer.next();
    game.piece.x = Math.floor((COLUMNS - game.piece.shape[0].length) / 2);
    game.piece.y = 0;
    if (collides(game.piece)) {
      game.piece = null;
      finishGame();
      return false;
    }
    return true;
  }

  function rotateClockwise(shape) {
    return shape[0].map((_, index) => shape.map((row) => row[index]).reverse());
  }

  function recordAction(action) {
    const elapsed = Math.max(0, Date.now() - game.startedAt);
    const previousTime = game.actions.at(-1)?.at_ms ?? 0;
    game.actions.push({ action, at_ms: Math.max(elapsed, previousTime) });
  }

  function performAction(action) {
    if (game.status !== "playing" || !game.piece) return;
    recordAction(action);

    if (action === "left" && !collides(game.piece, -1)) {
      game.piece.x--;
      tetrisAudio.playMove();
    }
    if (action === "right" && !collides(game.piece, 1)) {
      game.piece.x++;
      tetrisAudio.playMove();
    }
    if (action === "rotate") {
      const rotated = rotateClockwise(game.piece.shape);
      for (const offset of [0, -1, 1, -2, 2]) {
        if (!collides(game.piece, offset, 0, rotated)) {
          game.piece.x += offset;
          game.piece.shape = rotated;
          tetrisAudio.playRotate();
          break;
        }
      }
    }
    if (action === "soft_drop") {
      if (collides(game.piece, 0, 1)) lockPiece();
      else {
        game.piece.y++;
        tetrisAudio.playDrop();
      }
    }
    if (action === "hard_drop") {
      let distance = 0;
      while (!collides(game.piece, 0, distance + 1)) distance++;
      game.piece.y += distance;
      tetrisAudio.playSlam();
      lockPiece();
    }
    renderGame();
  }

  function advanceGravity() {
    if (game.status !== "playing" || !game.piece) return;
    recordAction("gravity");
    if (collides(game.piece, 0, 1)) lockPiece();
    else game.piece.y++;
    renderGame();
    scheduleGravity();
  }

  function lockPiece() {
    const piece = game.piece;
    if (!piece) return;

    // Must match ScoringSystem.POINTS_PER_DROP in backend/tetris/scoring.py.
    game.score += POINTS_PER_DROP;

    if (piece.type === "B") {
      // Must match resolve_piece in backend/tetris/tasks.py: clear a 3x3 blast,
      // drop each column, then clear any lines that formed.
      tetrisAudio.playBomb();
      for (let y = Math.max(0, piece.y - 1); y < Math.min(ROWS, piece.y + 2); y++) {
        for (let x = Math.max(0, piece.x - 1); x < Math.min(COLUMNS, piece.x + 2); x++) {
          game.board[y][x] = null;
        }
      }
      for (let x = 0; x < COLUMNS; x++) {
        const remaining = game.board.map((row) => row[x]).filter(Boolean);
        for (let y = ROWS - 1; y >= 0; y--) game.board[y][x] = remaining.pop() || null;
      }
      showBombCallout();
    } else {
      piece.shape.forEach((row, y) =>
        row.forEach((filled, x) => {
          if (filled && piece.y + y >= 0)
            game.board[piece.y + y][piece.x + x] = piece.type;
        }),
      );
    }

    const clearedRows = [];
    game.board = game.board.filter((row, rowIndex) => {
      if (row.every(Boolean)) {
        clearedRows.push({ rowIndex, types: row.slice() });
        return false;
      }
      return true;
    });
    const cleared = clearedRows.length;
    game.pendingClearRows = cleared ? clearedRows : null;
    while (game.board.length < ROWS)
      game.board.unshift(Array(COLUMNS).fill(null));
    if (cleared) {
      tetrisAudio.playClear(cleared);
      game.lines += cleared;
      game.consecutiveClears += 1;
      // Must match ScoringSystem in backend/tetris/scoring.py.
      const pointsEarned = 100 * cleared * game.consecutiveClears;
      game.score += pointsEarned;
      game.level = Math.floor(game.lines / 10) + 1;
      const boardElement = getElement("board");
      const callout = getElement("clear-callout");
      const clearNames = ["", "SINGLE!", "DOUBLE!", "TRIPLE!", "MEGA!"];
      const clearName = clearNames[Math.min(cleared, 4)] || "MEGA!";
      const clearTitle = document.createElement("span");
      clearTitle.className = "clear-callout-title";
      clearTitle.textContent = clearName;
      const clearDetail = document.createElement("span");
      clearDetail.className = "clear-callout-detail";
      clearDetail.textContent = game.consecutiveClears > 1
        ? `${game.consecutiveClears}× COMBO  ·  +${pointsEarned}`
        : `+${pointsEarned} POINTS`;
      callout.className = "clear-callout";
      callout.replaceChildren(clearTitle, clearDetail);
      callout.setAttribute("aria-label", `${clearName} ${clearDetail.textContent}`);
      void callout.offsetWidth;
      callout.className = `clear-callout visible count-${Math.min(cleared, 4)}${game.consecutiveClears > 1 ? " is-combo" : ""}`;
      clearTimeout(game.calloutTimer);
      game.calloutTimer = setTimeout(() => {
        callout.classList.remove("visible");
      }, 1250);
      const scoreElement = getElement("score");
      scoreElement.classList.remove("score-pop");
      void scoreElement.offsetWidth;
      scoreElement.classList.add("score-pop");
      boardElement.classList.remove("line-clear-effect");
      void boardElement.offsetWidth;
      boardElement.classList.add("line-clear-effect");
      clearTimeout(game.clearAnimationTimer);
      game.clearAnimationTimer = setTimeout(
        () => boardElement.classList.remove("line-clear-effect"),
        700,
      );
    } else game.consecutiveClears = 0;

    updateStackFeedback(cleared);
    game.piece = null;
    if (game.status === "playing") spawnPiece();
    if (game.status === "playing") scheduleGravity();
  }

  function showBombCallout() {
    const boardElement = getElement("board");
    const callout = getElement("clear-callout");
    callout.className = "clear-callout";
    callout.textContent = "BOOM!";
    void callout.offsetWidth;
    callout.className = "clear-callout visible count-bomb";
    clearTimeout(game.calloutTimer);
    game.calloutTimer = setTimeout(() => callout.classList.remove("visible"), 950);
    boardElement.classList.remove("line-clear-effect");
    void boardElement.offsetWidth;
    boardElement.classList.add("line-clear-effect");
    clearTimeout(game.clearAnimationTimer);
    game.clearAnimationTimer = setTimeout(
      () => boardElement.classList.remove("line-clear-effect"),
      700,
    );
  }

  function scheduleGravity() {
    clearTimeout(game.gravityTimer);
    if (game.status === "playing") {
      // Levels 1–3 speed up gently; after level 3, each level removes only 25 ms.
      const earlyLevelSpeedup = Math.min(game.level - 1, 2) * 40;
      const laterLevelSpeedup = Math.max(0, game.level - 3) * 25;
      const levelDelay = Math.max(420, 800 - earlyLevelSpeedup - laterLevelSpeedup);
      // Score bonus: shave a small amount for each 1,000 points.
      const scoreSteps = Math.floor(game.score / SCORE_SPEED_THRESHOLD);
      const scoreBonus = scoreSteps * SCORE_SPEED_REDUCTION_PER_STEP;
      const delay = Math.max(MIN_GRAVITY_DELAY, levelDelay - scoreBonus);
      game.gravityTimer = setTimeout(advanceGravity, delay);
    }
  }

  function renderGame() {
    const cells = game.board.map((row) => row.slice());
    const ghostCells = new Set();
    if (game.piece) {
      let ghostY = game.piece.y;
      while (!collides(game.piece, 0, ghostY - game.piece.y + 1)) ghostY++;
      game.piece.shape.forEach((row, y) =>
        row.forEach((filled, x) => {
          const boardY = ghostY + y;
          const boardX = game.piece.x + x;
          if (filled && boardY >= 0 && boardY < ROWS)
            ghostCells.add(boardY * COLUMNS + boardX);
        }),
      );
      game.piece.shape.forEach((row, y) =>
        row.forEach((filled, x) => {
          const boardY = game.piece.y + y;
          const boardX = game.piece.x + x;
          if (
            filled &&
            boardY >= 0 &&
            boardY < ROWS &&
            boardX >= 0 &&
            boardX < COLUMNS
          ) {
            cells[boardY][boardX] = game.piece.type;
          }
        }),
      );
    }

    const board = getElement("board");
    board.replaceChildren();
    cells.forEach((row, y) =>
      row.forEach((type, x) => {
        const cell = document.createElement("div");
        const isGhost = !type && ghostCells.has(y * COLUMNS + x);
        const isBomb = type === "B" || (isGhost && game.piece.type === "B");
        cell.className = `board-cell${type ? " filled" : isGhost ? " ghost" : ""}${isBomb ? " bomb" : ""}`;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute(
          "aria-label",
          type === "B" ? `Bomb row ${y + 1} column ${x + 1}` : type ? `${type} block row ${y + 1} column ${x + 1}` : "Empty",
        );
        if (type) cell.style.setProperty("--piece-color", PIECE_COLORS[type]);
        else if (isGhost) cell.style.setProperty("--piece-color", PIECE_COLORS[game.piece.type]);
        board.append(cell);
      }),
    );
    const scoreStr = String(game.score).padStart(6, "0");
    const linesStr = String(game.lines).padStart(2, "0");
    const levelStr = String(game.level).padStart(2, "0");

    const scoreEl = getElement("score");
    if (scoreEl) scoreEl.textContent = scoreStr;
    const mobileScoreEl = getElement("mobile-score");
    if (mobileScoreEl) mobileScoreEl.textContent = scoreStr;

    const linesEl = getElement("lines");
    if (linesEl) linesEl.textContent = linesStr;
    const mobileLinesEl = getElement("mobile-lines");
    if (mobileLinesEl) mobileLinesEl.textContent = linesStr;

    const levelEl = getElement("level");
    if (levelEl) levelEl.textContent = levelStr;
    const mobileLevelEl = getElement("mobile-level");
    if (mobileLevelEl) mobileLevelEl.textContent = levelStr;

    if (game.pendingClearRows?.length) {
      animateClearedRows(board, game.pendingClearRows);
      game.pendingClearRows = null;
    }
    renderNextPiece();
  }

  function animateClearedRows(board, clearedRows) {
    clearTimeout(game.clearFragmentsTimer);
    const boardWrap = board.parentElement;
    boardWrap.querySelector(".clear-burst-layer")?.remove();

    const layer = document.createElement("div");
    layer.className = "clear-burst-layer";
    layer.setAttribute("aria-hidden", "true");
    const boardRect = board.getBoundingClientRect();
    const wrapRect = boardWrap.getBoundingClientRect();
    layer.style.left = `${boardRect.left - wrapRect.left - boardWrap.clientLeft}px`;
    layer.style.top = `${boardRect.top - wrapRect.top - boardWrap.clientTop}px`;
    layer.style.width = `${boardRect.width}px`;
    layer.style.height = `${boardRect.height}px`;
    const shards = [
      { x: -1, y: -1 },
      { x: 1, y: -0.7 },
      { x: -0.7, y: 1 },
      { x: 1, y: 1 },
    ];

    clearedRows.forEach(({ rowIndex, types }, rowOrder) => {
      types.forEach((type, column) => {
        const cell = board.children[rowIndex * COLUMNS + column];
        if (!cell || !type) return;
        const rect = cell.getBoundingClientRect();
        const shardWidth = rect.width * 0.4;
        const shardHeight = rect.height * 0.4;

        shards.forEach((direction, shardIndex) => {
          const fragment = document.createElement("span");
          const xOffset = shardIndex % 2 ? rect.width * 0.55 : rect.width * 0.05;
          const yOffset = shardIndex > 1 ? rect.height * 0.55 : rect.height * 0.05;
          const travel = 1.1 + ((column + shardIndex) % 3) * 0.22;
          const turn = (shardIndex % 2 ? 1 : -1) * (55 + ((column + rowIndex) % 4) * 18);
          fragment.className = "clear-fragment";
          fragment.style.left = `${rect.left - boardRect.left + xOffset}px`;
          fragment.style.top = `${rect.top - boardRect.top + yOffset}px`;
          fragment.style.width = `${shardWidth}px`;
          fragment.style.height = `${shardHeight}px`;
          fragment.style.setProperty("--fragment-color", PIECE_COLORS[type]);
          fragment.style.setProperty(
            "--fragment-x",
            `${Math.round(direction.x * rect.width * travel)}px`,
          );
          fragment.style.setProperty(
            "--fragment-y",
            `${Math.round(direction.y * rect.height * travel + rect.height * 0.25)}px`,
          );
          fragment.style.setProperty("--fragment-turn", `${turn}deg`);
          fragment.style.setProperty(
            "--fragment-delay",
            `${rowOrder * 55 + column * 5 + shardIndex * 12}ms`,
          );
          layer.append(fragment);
        });
      });
    });

    boardWrap.append(layer);
    game.clearFragmentsTimer = setTimeout(() => layer.remove(), 1100);
  }

  function renderNextPiece() {
    const previews = [
      getElement("next-preview"),
      getElement("mobile-next-preview"),
    ].filter(Boolean);
    if (!previews.length) return;

    previews.forEach((preview) => {
      preview.replaceChildren();
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const cell = document.createElement("div");
          cell.className = "preview-cell";
          if (game.nextPiece?.shape[y]?.[x]) {
            cell.classList.add("filled");
            if (game.nextPiece.type === "B") cell.classList.add("bomb");
            cell.style.setProperty(
              "--piece-color",
              PIECE_COLORS[game.nextPiece.type],
            );
          }
          preview.append(cell);
        }
      }
    });
  }

  function updateElapsedTime() {
    const elapsed = Math.floor((Date.now() - game.startedAt) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const timeStr = `${String(minutes).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
    const el = getElement("elapsed");
    if (el) el.textContent = timeStr;
    const mobileEl = getElement("mobile-elapsed");
    if (mobileEl) mobileEl.textContent = timeStr;
  }

  function stopHorizontalRepeat() {
    clearTimeout(game.horizontalRepeatTimeout);
    clearInterval(game.horizontalRepeatInterval);
    game.horizontalRepeatTimeout = null;
    game.horizontalRepeatInterval = null;
    game.horizontalHeldCode = null;
  }

  function addKeyboardListener() {
    removeKeyboardListener();
    const actions = {
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      ArrowUp: "rotate",
      KeyW: "rotate",
      ArrowDown: "soft_drop",
      KeyS: "soft_drop",
      Space: "hard_drop",
    };
    const horizontalCodes = new Set(["ArrowLeft", "KeyA", "ArrowRight", "KeyD"]);
    game.keyHandler = (event) => {
      const action = actions[event.code];
      if (event.code === "KeyP") {
        if (!event.repeat) pauseGame();
        return;
      }
      if (!action) return;
      event.preventDefault();
      if (horizontalCodes.has(event.code)) {
        if (event.repeat) return;
        stopHorizontalRepeat();
        game.horizontalHeldCode = event.code;
        performAction(action);
        game.horizontalRepeatTimeout = setTimeout(() => {
          game.horizontalRepeatInterval = setInterval(() => {
            if (game.status !== "playing") stopHorizontalRepeat();
            else performAction(action);
          }, 35);
        }, 110);
        return;
      }
      if (!event.repeat) performAction(action);
    };
    game.keyUpHandler = (event) => {
      if (event.code === game.horizontalHeldCode) stopHorizontalRepeat();
    };
    window.addEventListener("keydown", game.keyHandler);
    window.addEventListener("keyup", game.keyUpHandler);
    window.addEventListener("blur", stopHorizontalRepeat);
  }

  function removeKeyboardListener() {
    stopHorizontalRepeat();
    if (game.keyHandler) window.removeEventListener("keydown", game.keyHandler);
    if (game.keyUpHandler) window.removeEventListener("keyup", game.keyUpHandler);
    window.removeEventListener("blur", stopHorizontalRepeat);
    game.keyHandler = null;
    game.keyUpHandler = null;
  }

  function stopTimers() {
    clearTimeout(game.gravityTimer);
    clearInterval(game.elapsedTimer);
    game.gravityTimer = null;
    game.elapsedTimer = null;
  }

  function pauseGame() {
    if (game.status !== "playing") return;
    tetrisAudio.stopBgm();
    setGameStatus("paused", "PAUSED");
    stopTimers();
    removeKeyboardListener();
    showOverlay("Take a breather", "Your game is paused.", "RESUME", () => {
      setGameStatus("playing", "IN GAME");
      getElement("overlay").classList.add("hidden");
      addKeyboardListener();
      scheduleGravity();
      game.elapsedTimer = setInterval(updateElapsedTime, 1000);
      tetrisAudio.startBgm();
    });
  }

  async function finishGame() {
    if (game.status !== "playing") return;
    tetrisAudio.stopBgm();
    tetrisAudio.playGameOver();
    setGameStatus("submitting", "RUN COMPLETE");
    stopTimers();
    removeKeyboardListener();
    game.durationMs = Math.max(
      0,
      Date.now() - game.startedAt,
      game.actions.at(-1)?.at_ms ?? 0,
    );
    const actionCodes = {
      gravity: "T",
      left: "L",
      right: "R",
      rotate: "C",
      soft_drop: "S",
      hard_drop: "H",
    };
    game.completionPayload = {
      actions: game.actions.map(({ action }) => actionCodes[action]).join(""),
    };

    const best = Math.max(
      game.score,
      Number(localStorage.getItem("arcade-tetris-best")) || 0,
    );
    localStorage.setItem("arcade-tetris-best", best);
    const bestScore = getElement("best-score");
    if (bestScore) bestScore.textContent = String(best).padStart(6, "0");
    renderGame();

    if (!game.session?.id) {
      setGameStatus("idle", "READY");
      showOverlay(
        "Session ended",
        "This run was not attached to an active ticket session.",
        "START GAME",
        startGame,
      );
      return;
    }

    showOverlay(
      "Run complete",
      "Sending your action list to the backend validator…",
      "SUBMITTING",
      () => {},
      true,
    );

    try {
      await submitRun();
      setGameStatus("queued", "QUEUED FOR VALIDATION");
      showOverlay(
        "Run queued",
        `Your action list was accepted for backend validation. Task: ${game.taskId || "queued"}. Your displayed score follows the local scoring preview.`,
        "PLAY AGAIN",
        startGame,
      );
    } catch (error) {
      if (error.status === 400 || error.status === 422) {
        setGameStatus("rejected", "RUN REJECTED");
        showOverlay("Run rejected", error.message, "PLAY AGAIN", startGame);
        return;
      }
      setGameStatus("submit-error", "SUBMISSION ERROR");
      showOverlay(
        "Could not submit run",
        `${error.message} Your completed action list is available for retry.`,
        "RETRY SUBMISSION",
        retrySubmission,
      );
    }
  }

  async function submitRun() {
    if (game.submitted || !game.session?.id || !game.completionPayload) {
      throw new Error("No completed session is available to submit.");
    }
    const result = await requestApi(
      `/sessions/submit/${game.session.id}/`,
      "PUT",
      {
        actions: game.completionPayload.actions,
      },
    );
    // The backend returns its standard updated-session payload after enqueueing;
    // it does not include a queue status or Celery task id.
    game.submitted = true;
    game.taskId = result?.task_id || null;
  }

  async function retrySubmission() {
    showOverlay(
      "Submitting…",
      "Retrying the saved action list.",
      "SUBMITTING",
      () => {},
      true,
    );
    try {
      game.submitted = false;
      await submitRun();
      setGameStatus("queued", "QUEUED FOR VALIDATION");
      showOverlay(
        "Run queued",
        `Your action list was accepted for backend validation. Task: ${game.taskId || "queued"}.`,
        "PLAY AGAIN",
        startGame,
      );
    } catch (error) {
      if (error.status === 400 || error.status === 422) {
        setGameStatus("rejected", "RUN REJECTED");
        showOverlay("Run rejected", error.message, "PLAY AGAIN", startGame);
      } else {
        showOverlay(
          "Still unable to submit",
          error.message,
          "RETRY SUBMISSION",
          retrySubmission,
        );
      }
    }
  }

  function updateBestScore(best) {
    const formatted = String(best).padStart(6, "0");
    const bestEl = getElement("best-score");
    if (bestEl) bestEl.textContent = formatted;
    const navBestEl = getElement("nav-best-score");
    if (navBestEl) navBestEl.textContent = formatted;
    const mobileBestEl = getElement("mobile-best-score");
    if (mobileBestEl) mobileBestEl.textContent = formatted;
  }

  function setupTouchControls() {
    function bindAutoRepeat(button, action, initialDelay = 150, repeatInterval = 55) {
      if (!button) return;
      let timer = null;
      let interval = null;

      const trigger = () => {
        if (game.status === "playing") {
          performAction(action);
          if (navigator.vibrate) {
            try { navigator.vibrate(8); } catch {}
          }
        }
      };

      const start = (e) => {
        e.preventDefault();
        if (game.status !== "playing") return;
        button.classList.add("touch-active");
        trigger();

        clearTimeout(timer);
        clearInterval(interval);
        timer = setTimeout(() => {
          interval = setInterval(() => {
            if (game.status === "playing") {
              trigger();
            } else {
              stop();
            }
          }, repeatInterval);
        }, initialDelay);
      };

      const stop = (e) => {
        if (e && e.cancelable) e.preventDefault();
        button.classList.remove("touch-active");
        clearTimeout(timer);
        clearInterval(interval);
      };

      button.addEventListener("pointerdown", start);
      button.addEventListener("pointerup", stop);
      button.addEventListener("pointercancel", stop);
      button.addEventListener("pointerleave", stop);
      button.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    function bindSingleTap(button, action, vibrateMs = 15) {
      if (!button) return;
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        button.classList.add("touch-active");
        if (game.status === "playing") {
          performAction(action);
          if (navigator.vibrate) {
            try { navigator.vibrate(vibrateMs); } catch {}
          }
        }
      });
      const end = () => button.classList.remove("touch-active");
      button.addEventListener("pointerup", end);
      button.addEventListener("pointercancel", end);
      button.addEventListener("pointerleave", end);
      button.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    bindAutoRepeat(getElement("btn-touch-left"), "left", 150, 55);
    bindAutoRepeat(getElement("btn-touch-right"), "right", 150, 55);
    bindAutoRepeat(getElement("btn-touch-down"), "soft_drop", 140, 50);
    bindSingleTap(getElement("btn-touch-rotate"), "rotate", 18);
    bindSingleTap(getElement("btn-touch-drop"), "hard_drop", 35);

    const pauseBtn = getElement("btn-touch-pause");
    if (pauseBtn) {
      pauseBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        pauseBtn.classList.add("touch-active");
        if (game.status === "playing") {
          pauseGame();
          if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
        } else if (game.status === "paused") {
          setGameStatus("playing", "IN GAME");
          getElement("overlay").classList.add("hidden");
          addKeyboardListener();
          scheduleGravity();
          game.elapsedTimer = setInterval(updateElapsedTime, 1000);
          if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
        }
      });
      const endPause = () => pauseBtn.classList.remove("touch-active");
      pauseBtn.addEventListener("pointerup", endPause);
      pauseBtn.addEventListener("pointercancel", endPause);
      pauseBtn.addEventListener("pointerleave", endPause);
      pauseBtn.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    setupBoardTouchGestures();
  }

  function setupBoardTouchGestures() {
    const board = getElement("board");
    if (!board) return;

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let startTime = 0;
    let hasMoved = false;
    let activePointerId = null;

    board.addEventListener("pointerdown", (e) => {
      if (game.status !== "playing") return;
      board.setPointerCapture(e.pointerId);
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      startTime = Date.now();
      hasMoved = false;
    });

    board.addEventListener("pointermove", (e) => {
      if (activePointerId !== e.pointerId || game.status !== "playing") return;
      const rect = board.getBoundingClientRect();
      const cellWidth = Math.max(16, rect.width / COLUMNS);
      const cellHeight = Math.max(16, rect.height / ROWS);

      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;

      // Horizontal dragging moves piece left/right column by column
      if (Math.abs(deltaX) >= cellWidth) {
        const steps = Math.trunc(deltaX / cellWidth);
        for (let i = 0; i < Math.abs(steps); i++) {
          performAction(steps > 0 ? "right" : "left");
        }
        lastX += steps * cellWidth;
        hasMoved = true;
        if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
      }

      // Dragging down soft drops
      if (deltaY >= cellHeight * 1.3) {
        const steps = Math.trunc(deltaY / (cellHeight * 1.3));
        for (let i = 0; i < steps; i++) {
          performAction("soft_drop");
        }
        lastY += steps * (cellHeight * 1.3);
        hasMoved = true;
      }
    });

    const onPointerEnd = (e) => {
      if (activePointerId !== e.pointerId) return;
      activePointerId = null;
      if (game.status !== "playing") return;

      const totalDistX = e.clientX - startX;
      const totalDistY = e.clientY - startY;
      const totalDist = Math.hypot(totalDistX, totalDistY);
      const duration = Date.now() - startTime;

      // Quick downward flick -> Hard drop
      if (totalDistY > 55 && totalDistY > Math.abs(totalDistX) * 1.6 && duration < 240) {
        performAction("hard_drop");
        if (navigator.vibrate) try { navigator.vibrate(30); } catch {}
        return;
      }

      // Tap on board without dragging -> Rotate piece!
      if (!hasMoved && totalDist < 14 && duration < 260) {
        performAction("rotate");
        if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
      }
    };

    board.addEventListener("pointerup", onPointerEnd);
    board.addEventListener("pointercancel", onPointerEnd);
  }

  const initialBest = Number(localStorage.getItem("arcade-tetris-best")) || 0;
  function returnToHub() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "arcade-navigate-hub" }, "*");
    } else {
      try {
        window.top.location.href = "/";
      } catch {
        window.location.href = "/";
      }
    }
  }

  const backLink = document.querySelector(".tetris-back-link");
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      returnToHub();
    });
  }

  updateBestScore(initialBest);
  getElement("start-button").onclick = startGame;
  setupTouchControls();

  requestApi("/me/")
    .then((me) => {
      if (!me?.authenticated) {
        showOverlay(
          "SIGN IN & ADD A TICKET",
          "Sign in and add a ticket to your account to play Blockbind.",
          "SIGN IN & ADD A TICKET",
          () => returnToHub(),
          false,
        );
      } else if (me.tickets <= 0) {
        showOverlay(
          "ADD A TICKET",
          "No tickets left. Please add a ticket to your account to play Blockbind.",
          "ADD A TICKET",
          () => returnToHub(),
          true,
        );
      }
    })
    .catch(() => {
      showOverlay(
        "SIGN IN & ADD A TICKET",
        "Sign in and add a ticket to your account to play Blockbind.",
        "SIGN IN & ADD A TICKET",
        () => returnToHub(),
        false,
      );
    });

  document.addEventListener("visibilitychange", () => {
    // Pause when hidden so background time does not advance the local board.
    if (document.hidden && game.status === "playing") pauseGame();
  });

  const soundBtn = getElement("btn-sound-toggle");
  const soundIcon = getElement("sound-icon");
  const ICON_ON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" fill-opacity="0.2"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
  const ICON_OFF = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" fill-opacity="0.1"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`;

  if (soundBtn && soundIcon) {
    soundIcon.innerHTML = tetrisAudio.enabled ? ICON_ON : ICON_OFF;
    soundBtn.onclick = () => {
      const on = tetrisAudio.toggle();
      soundIcon.innerHTML = on ? ICON_ON : ICON_OFF;
      if (on && game.status === "playing") {
        tetrisAudio.startBgm();
      }
    };
  }
})();
