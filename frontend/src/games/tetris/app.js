(() => {
  "use strict";

  // Set ?api=http://localhost:8000 when the frontend and backend use different origins.
  const API_BASE = (
    new URLSearchParams(location.search).get("api") || ""
  ).replace(/\/$/, "");
  const ROWS = 20;
  const COLUMNS = 10;
  const PIECE_SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [
      [1, 1],
      [1, 1],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  };
  const PIECE_COLORS = {
    I: "#55d9e9",
    O: "#f2d15c",
    T: "#b38cff",
    S: "#72dc8e",
    Z: "#f07883",
    J: "#68a6fa",
    L: "#f2a35d",
  };
  const getElement = (id) => document.getElementById(id);

  const game = {
    status: "idle",
    board: [],
    piece: null,
    nextPiece: null,
    randomizer: null,
    score: 0,
    lines: 0,
    level: 1,
    startedAt: 0,
    durationMs: null,
    gravityTimer: null,
    clearAnimationTimer: null,
    calloutTimer: null,
    elapsedTimer: null,
    session: null,
    actions: [],
    completionPayload: null,
    submitted: false,
    keyHandler: null,
  };

  class SeededPieceGenerator {
    constructor(seed) {
      // Keep only the low 32 bits; the backend applies the same reduction.
      this.state = Number(BigInt(seed) & 0xffffffffn) >>> 0;
      if (this.state === 0) this.state = 0x6d2b79f5;
      this.bag = [];
    }

    random() {
      this.state ^= this.state << 13;
      this.state ^= this.state >>> 17;
      this.state ^= this.state << 5;
      this.state >>>= 0;
      return this.state / 0x100000000;
    }

    next() {
      if (this.bag.length === 0) {
        this.bag = Object.keys(PIECE_SHAPES);
        for (let index = this.bag.length - 1; index > 0; index--) {
          const swapIndex = Math.floor(this.random() * (index + 1));
          [this.bag[index], this.bag[swapIndex]] = [
            this.bag[swapIndex],
            this.bag[index],
          ];
        }
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
    getElement("game-state-label").textContent = label;
  }

  function setSessionStatus(message, active = false) {
    getElement("session-label").textContent = message;
    getElement("session-dot").classList.toggle("active", active);
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
    getElement("connection-label").textContent = "Connecting…";
    getElement("start-button").disabled = true;
    setSessionStatus("Creating session…");

    try {
      const response = await requestApi("/games/");
      const games = Array.isArray(response) ? response : response.results;
      const tetris = games?.find(
        (item) => String(item.name).toUpperCase() === "TETRIS",
      );
      if (!tetris) throw new Error("Tetris is not listed by this server.");

      const session = await requestApi(
        `/sessions/start/${tetris.id}/`,
        "POST",
        {},
      );
      if (!session.id || session.seed === undefined)
        throw new Error("Unexpected session response.");
      game.session = session;
      getElement("session-id").textContent = session.id;
      getElement("session-seed").textContent = session.seed;
      getElement("connection-label").textContent = "Session connected";
      setSessionStatus("Session active", true);
      initializeGame(session.seed);
    } catch (error) {
      setGameStatus("error", "CONNECTION ERROR");
      getElement("connection-label").textContent = "Connection error";
      setSessionStatus("Could not start session");
      showOverlay(
        "Could not start game",
        error.message,
        "TRY AGAIN",
        startGame,
      );
    }
  }

  function initializeGame(seed) {
    stopTimers();
    removeKeyboardListener();
    game.board = Array.from({ length: ROWS }, () => Array(COLUMNS).fill(null));
    game.score = 0;
    game.lines = 0;
    game.level = 1;
    game.actions = [];
    game.completionPayload = null;
    game.submitted = false;
    game.durationMs = null;
    game.randomizer = new SeededPieceGenerator(seed);
    game.startedAt = Date.now();
    game.nextPiece = game.randomizer.next();
    setGameStatus("playing", "IN GAME");
    spawnPiece();

    getElement("connection-label").textContent = "Playing";
    renderGame();
    getElement("overlay").classList.add("hidden");
    addKeyboardListener();
    game.elapsedTimer = setInterval(updateElapsedTime, 1000);
    scheduleGravity();
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

    if (action === "left" && !collides(game.piece, -1)) game.piece.x--;
    if (action === "right" && !collides(game.piece, 1)) game.piece.x++;
    if (action === "rotate") {
      const rotated = rotateClockwise(game.piece.shape);
      for (const offset of [0, -1, 1, -2, 2]) {
        if (!collides(game.piece, offset, 0, rotated)) {
          game.piece.x += offset;
          game.piece.shape = rotated;
          break;
        }
      }
    }
    if (action === "soft_drop") {
      if (collides(game.piece, 0, 1)) lockPiece();
      else game.piece.y++;
    }
    if (action === "hard_drop") {
      let distance = 0;
      while (!collides(game.piece, 0, distance + 1)) distance++;
      game.piece.y += distance;
      game.score += 2 * distance;
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

    piece.shape.forEach((row, y) =>
      row.forEach((filled, x) => {
        if (filled && piece.y + y >= 0)
          game.board[piece.y + y][piece.x + x] = piece.type;
      }),
    );

    let cleared = 0;
    game.board = game.board.filter((row) => {
      if (row.every(Boolean)) {
        cleared++;
        return false;
      }
      return true;
    });
    while (game.board.length < ROWS)
      game.board.unshift(Array(COLUMNS).fill(null));
    if (cleared) {
      game.lines += cleared;
      game.score += ([0, 100, 300, 500, 800][cleared] || 1000) * game.level;
      game.level = Math.floor(game.lines / 10) + 1;
      const boardElement = getElement("board");
      const callout = getElement("clear-callout");
      const clearNames = ["", "SINGLE!", "DOUBLE!", "TRIPLE!", "MEGA!"];
      const clearName = clearNames[Math.min(cleared, 4)] || "MEGA!";
      callout.className = "clear-callout";
      callout.textContent = clearName;
      void callout.offsetWidth;
      callout.className = `clear-callout visible count-${Math.min(cleared, 4)}`;
      clearTimeout(game.calloutTimer);
      game.calloutTimer = setTimeout(() => {
        callout.classList.remove("visible");
      }, 950);
      boardElement.classList.remove("line-clear-effect");
      void boardElement.offsetWidth;
      boardElement.classList.add("line-clear-effect");
      clearTimeout(game.clearAnimationTimer);
      game.clearAnimationTimer = setTimeout(
        () => boardElement.classList.remove("line-clear-effect"),
        700,
      );
    }

    game.piece = null;
    if (game.status === "playing") spawnPiece();
    if (game.status === "playing") scheduleGravity();
  }

  function scheduleGravity() {
    clearTimeout(game.gravityTimer);
    if (game.status === "playing") {
      const delay = Math.max(120, 800 - (game.level - 1) * 55);
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
        cell.className = `board-cell${type ? " filled" : isGhost ? " ghost" : ""}`;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute(
          "aria-label",
          type ? `${type} block row ${y + 1} column ${x + 1}` : "Empty",
        );
        if (type) cell.style.setProperty("--piece-color", PIECE_COLORS[type]);
        else if (isGhost) cell.style.setProperty("--piece-color", PIECE_COLORS[game.piece.type]);
        board.append(cell);
      }),
    );

    getElement("score").textContent = String(game.score).padStart(6, "0");
    getElement("lines").textContent = String(game.lines).padStart(2, "0");
    getElement("level").textContent = String(game.level).padStart(2, "0");
    renderNextPiece();
  }

  function renderNextPiece() {
    const preview = getElement("next-preview");
    preview.replaceChildren();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";
        if (game.nextPiece?.shape[y]?.[x]) {
          cell.classList.add("filled");
          cell.style.setProperty(
            "--piece-color",
            PIECE_COLORS[game.nextPiece.type],
          );
        }
        preview.append(cell);
      }
    }
  }

  function updateElapsedTime() {
    const elapsed = Math.floor((Date.now() - game.startedAt) / 1000);
    const minutes = Math.floor(elapsed / 60);
    getElement("elapsed").textContent =
      `${String(minutes).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  }

  function addKeyboardListener() {
    removeKeyboardListener();
    game.keyHandler = (event) => {
      const actions = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "rotate",
        ArrowDown: "soft_drop",
        Space: "hard_drop",
      };
      if (event.code === "KeyP") {
        pauseGame();
        return;
      }
      if (actions[event.code]) {
        event.preventDefault();
        performAction(actions[event.code]);
      }
    };
    window.addEventListener("keydown", game.keyHandler);
  }

  function removeKeyboardListener() {
    if (game.keyHandler) window.removeEventListener("keydown", game.keyHandler);
    game.keyHandler = null;
  }

  function stopTimers() {
    clearTimeout(game.gravityTimer);
    clearInterval(game.elapsedTimer);
    game.gravityTimer = null;
    game.elapsedTimer = null;
  }

  function pauseGame() {
    if (game.status !== "playing") return;
    setGameStatus("paused", "PAUSED");
    stopTimers();
    removeKeyboardListener();
    showOverlay("Take a breather", "Your game is paused.", "RESUME", () => {
      setGameStatus("playing", "IN GAME");
      getElement("overlay").classList.add("hidden");
      addKeyboardListener();
      scheduleGravity();
      game.elapsedTimer = setInterval(updateElapsedTime, 1000);
    });
  }

  async function finishGame() {
    if (game.status !== "playing") return;
    setGameStatus("submitting", "RUN COMPLETE");
    stopTimers();
    removeKeyboardListener();
    game.durationMs = Math.max(
      0,
      Date.now() - game.startedAt,
      game.actions.at(-1)?.at_ms ?? 0,
    );
    game.completionPayload = {
      action_log: game.actions.map((event) => ({ ...event })),
      duration_ms: game.durationMs,
    };

    const best = Math.max(
      game.score,
      Number(localStorage.getItem("arcade-tetris-best")) || 0,
    );
    localStorage.setItem("arcade-tetris-best", best);
    getElement("best-score").textContent = String(best).padStart(6, "0");
    renderGame();
    setSessionStatus("Verifying run…", true);
    showOverlay(
      "Run complete",
      "Replaying your input log on the server…",
      "VERIFYING",
      () => {},
      true,
    );

    try {
      await submitRun();
      setGameStatus("verified", "VERIFIED");
      setSessionStatus("Run verified", true);
      showOverlay(
        "Run verified",
        `Authoritative score: ${game.verifiedScore}. The server replay matched your run.`,
        "PLAY AGAIN",
        startGame,
      );
    } catch (error) {
      if (error.status === 400 || error.status === 422) {
        setGameStatus("rejected", "RUN REJECTED");
        setSessionStatus("Run rejected");
        showOverlay("Run rejected", error.message, "PLAY AGAIN", startGame);
        return;
      }
      setGameStatus("submit-error", "VERIFICATION ERROR");
      setSessionStatus("Verification unavailable");
      showOverlay(
        "Could not verify run",
        `${error.message} Your exact completed run is saved for a safe retry.`,
        "RETRY VERIFICATION",
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
        actions: game.completionPayload,
      },
    );
    if (result.verified !== true || result.authoritative_score == null) {
      throw new Error(
        "The server did not return a verified authoritative score.",
      );
    }
    game.submitted = true;
    game.verifiedScore = result.authoritative_score;
    game.score = result.authoritative_score;
    renderGame();
  }

  async function retrySubmission() {
    showOverlay(
      "Verifying…",
      "Retrying the saved action log.",
      "VERIFYING",
      () => {},
      true,
    );
    try {
      game.submitted = false;
      await submitRun();
      setGameStatus("verified", "VERIFIED");
      setSessionStatus("Run verified", true);
      showOverlay(
        "Run verified",
        `Authoritative score: ${game.verifiedScore}. The server replay matched your run.`,
        "PLAY AGAIN",
        startGame,
      );
    } catch (error) {
      if (error.status === 400 || error.status === 422) {
        setGameStatus("rejected", "RUN REJECTED");
        setSessionStatus("Run rejected");
        showOverlay("Run rejected", error.message, "PLAY AGAIN", startGame);
      } else {
        showOverlay(
          "Still unable to verify",
          error.message,
          "RETRY VERIFICATION",
          retrySubmission,
        );
      }
    }
  }

  getElement("best-score").textContent = String(
    localStorage.getItem("arcade-tetris-best") || 0,
  ).padStart(6, "0");
  getElement("start-button").onclick = startGame;
  getElement("connection-label").textContent = API_BASE
    ? `API ${API_BASE}`
    : "API same origin";
  document.addEventListener("visibilitychange", () => {
    // Pause when hidden so background time does not advance the local board.
    if (document.hidden && game.status === "playing") pauseGame();
  });
})();
