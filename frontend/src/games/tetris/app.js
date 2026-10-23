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
    startedAt: 0,
    gravityTimer: null,
    clearAnimationTimer: null,
    calloutTimer: null,
    elapsedTimer: null,
    session: null,
    // One character per action, joined into a string on submit.
    actions: [],
    completionPayload: null,
    submitted: false,
    keyHandler: null,
  };

  class SeededPieceGenerator {
    constructor(seed) {
      // Match the seeded Python RNG, bag shuffle, and bomb schedule on the backend.
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

  function updateBestScoreDisplay(val) {
    const text = String(val).padStart(6, "0");
    const bestEl = getElement("best-score");
    if (bestEl) bestEl.textContent = text;
    const navBest = getElement("nav-best-score");
    if (navBest) navBest.textContent = text;
  }

  function setGameStatus(status, label) {
    game.status = status;
    const labelEl = getElement("game-state-label");
    if (labelEl) labelEl.textContent = label;
    const badgeEl = getElement("status-badge");
    if (badgeEl) {
      badgeEl.className = "board-status-badge status-" + status.toLowerCase();
    }
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
    getElement("start-button").disabled = true;

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
      initializeGame(session.seed);
    } catch (error) {
      setGameStatus("error", "CONNECTION ERROR");
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
    game.consecutiveClears = 0;
    game.actions = [];
    game.completionPayload = null;
    game.submitted = false;
    game.randomizer = new SeededPieceGenerator(seed);
    game.startedAt = Date.now();
    game.nextPiece = game.randomizer.next();
    setGameStatus("playing", "IN GAME");
    spawnPiece();

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

  // Must match ACTION_CODES in backend/tetris/tasks.py.
  const ACTION_CODES = {
    gravity: "T",
    left: "L",
    right: "R",
    rotate: "C",
    soft_drop: "S",
    hard_drop: "H",
  };

  function recordAction(action) {
    game.actions.push(ACTION_CODES[action]);
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

    if (piece.type === "B") {
      for (let y = Math.max(0, piece.y - 1); y < Math.min(ROWS, piece.y + 2); y++) {
        for (let x = Math.max(0, piece.x - 1); x < Math.min(COLUMNS, piece.x + 2); x++) {
          game.board[y][x] = null;
        }
      }
      for (let x = 0; x < COLUMNS; x++) {
        const remaining = game.board.map((row) => row[x]).filter(Boolean);
        for (let y = ROWS - 1; y >= 0; y--) game.board[y][x] = remaining.pop() || null;
      }
      const boardElement = getElement("board");
      const callout = getElement("clear-callout");
      callout.className = "clear-callout";
      callout.textContent = "💥 BOOM!";
      void callout.offsetWidth;
      callout.className = "clear-callout visible count-bomb";
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
    } else {
      piece.shape.forEach((row, y) =>
        row.forEach((filled, x) => {
          if (filled && piece.y + y >= 0)
            game.board[piece.y + y][piece.x + x] = piece.type;
        }),
      );
    }

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
      game.consecutiveClears += 1;
      game.score += ([0, 100, 200, 300, 400][cleared] || 0) * game.consecutiveClears;
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
    } else game.consecutiveClears = 0;

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
        cell.className = `board-cell${type ? " filled" : isGhost ? " ghost" : ""}${type === "B" || (!type && isGhost && game.piece.type === "B") ? " bomb" : ""}`;
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

    getElement("score").textContent = String(game.score).padStart(6, "0");
    getElement("lines").textContent = String(game.lines).padStart(2, "0");
    getElement("level").textContent = String(game.level).padStart(2, "0");
    renderNextPiece();
  }

  function renderNextPiece() {
    const preview = getElement("next-preview");
    preview.replaceChildren();
    if (!game.nextPiece) return;

    const shape = game.nextPiece.shape;
    const height = shape.length;
    const width = shape[0].length;
    const offsetY = Math.floor((4 - height) / 2);
    const offsetX = Math.floor((4 - width) / 2);

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";
        const shapeY = y - offsetY;
        const shapeX = x - offsetX;
        if (
          shapeY >= 0 &&
          shapeY < height &&
          shapeX >= 0 &&
          shapeX < width &&
          shape[shapeY][shapeX]
        ) {
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
    game.completionPayload = { actions: game.actions.join("") };

    const best = Math.max(
      game.score,
      Number(localStorage.getItem("arcade-tetris-best")) || 0,
    );
    localStorage.setItem("arcade-tetris-best", best);
    updateBestScoreDisplay(best);
    renderGame();
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
        "Run submitted",
        "Your action list was accepted for backend validation. Your displayed score follows the local scoring preview.",
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
    if (!result?.id) throw new Error("The backend did not accept the Tetris action list.");
    game.submitted = true;
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
        "Run submitted",
        "Your action list was accepted for backend validation.",
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

  updateBestScoreDisplay(localStorage.getItem("arcade-tetris-best") || 0);
  getElement("start-button").onclick = startGame;
  document.addEventListener("visibilitychange", () => {
    // Pause when hidden so background time does not advance the local board.
    if (document.hidden && game.status === "playing") pauseGame();
  });
})();
