import {
  GRID_SIZE,
  Difficulty,
  DifficultySelection,
  DifficultyAnalysis,
  cloneBoard,
  createEmptyNotes,
  cloneNotes,
  generatePuzzle,
  isBoardCompleteAndValid,
  isValidShape,
  analyzePuzzleDifficulty,
} from '../engine/sudoku';

export type ThemeMode = 'light' | 'dark';

export interface CellCoord {
  row: number;
  col: number;
}

export interface HistorySnapshot {
  board: number[][];
  notes: number[][][];
  hintedCells: boolean[][];
  selectedCell: CellCoord | null;
}

export interface HintFeedback {
  row: number;
  col: number;
  value: number;
  type: 'correction' | 'reveal';
  message: string;
}

export interface GameState {
  puzzle: number[][];
  solution: number[][];
  board: number[][];
  notes: number[][][];
  hintedCells: boolean[][];
  selectedCell: CellCoord | null;
  notesMode: boolean;
  selectedDifficulty: DifficultySelection;
  actualDifficulty: Difficulty;
  analysis: DifficultyAnalysis;
  elapsedSeconds: number;
  hintsUsed: number;
  isCompleted: boolean;
  history: HistorySnapshot[];
  lastHint: HintFeedback | null;
}

export const STORAGE_KEY_GAME = 'mini_sudoku_6x6_state_v1';
export const STORAGE_KEY_THEME = 'mini_sudoku_6x6_theme_v1';

export function createEmptyBooleanGrid(): boolean[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
}

export function cloneBooleanGrid(grid: boolean[][]): boolean[][] {
  return grid.map((row) => [...row]);
}

function findFirstEmptyCell(board: number[][]): CellCoord | null {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (board[r][c] === 0) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

export function createNewGameState(
  selection: DifficultySelection = 'easy',
  options?: { rng?: () => number; maxAttempts?: number }
): GameState {
  const generated = generatePuzzle(selection, options);
  const firstEmpty = findFirstEmptyCell(generated.puzzle);

  return {
    puzzle: cloneBoard(generated.puzzle),
    solution: cloneBoard(generated.solution),
    board: cloneBoard(generated.puzzle),
    notes: createEmptyNotes(),
    hintedCells: createEmptyBooleanGrid(),
    selectedCell: firstEmpty ?? { row: 0, col: 0 },
    notesMode: false,
    selectedDifficulty: selection,
    actualDifficulty: generated.difficulty,
    analysis: generated.analysis,
    elapsedSeconds: 0,
    hintsUsed: 0,
    isCompleted: false,
    history: [],
    lastHint: null,
  };
}

export function createGameStateFromCustomPuzzle(
  puzzle: number[][],
  solution: number[][],
  selectedDifficulty: DifficultySelection = 'easy',
  actualDifficulty?: Difficulty
): GameState {
  const analysis = analyzePuzzleDifficulty(puzzle);
  const resolvedDifficulty = actualDifficulty ?? analysis.difficulty;
  const firstEmpty = findFirstEmptyCell(puzzle);

  return {
    puzzle: cloneBoard(puzzle),
    solution: cloneBoard(solution),
    board: cloneBoard(puzzle),
    notes: createEmptyNotes(),
    hintedCells: createEmptyBooleanGrid(),
    selectedCell: firstEmpty ?? { row: 0, col: 0 },
    notesMode: false,
    selectedDifficulty,
    actualDifficulty: resolvedDifficulty,
    analysis,
    elapsedSeconds: 0,
    hintsUsed: 0,
    isCompleted: isBoardCompleteAndValid(puzzle),
    history: [],
    lastHint: null,
  };
}

/**
 * Determines whether the current game is unfinished AND has meaningful player progress
 * (any player/hinted entry, any pencil notes, or any hints/moves recorded).
 */
export function hasMeaningfulProgress(state: GameState): boolean {
  if (state.isCompleted) return false;
  if (state.hintsUsed > 0) return true;

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (state.puzzle[r][c] === 0 && state.board[r][c] !== 0) {
        return true;
      }
      if (state.notes[r][c].length > 0) {
        return true;
      }
    }
  }

  return false;
}

function createSnapshot(state: GameState): HistorySnapshot {
  return {
    board: cloneBoard(state.board),
    notes: cloneNotes(state.notes),
    hintedCells: cloneBooleanGrid(state.hintedCells),
    selectedCell: state.selectedCell ? { ...state.selectedCell } : null,
  };
}

/**
 * Selects a cell on the 6x6 board.
 */
export function selectCell(state: GameState, row: number, col: number): GameState {
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
    return state;
  }
  return {
    ...state,
    selectedCell: { row, col },
  };
}

/**
 * Moves the selected cell by (dRow, dCol) using keyboard arrow navigation.
 * Wraps cleanly around the 6x6 grid.
 */
export function moveSelection(state: GameState, dRow: number, dCol: number): GameState {
  const current = state.selectedCell ?? { row: 0, col: 0 };
  const nextRow = (current.row + dRow + GRID_SIZE) % GRID_SIZE;
  const nextCol = (current.col + dCol + GRID_SIZE) % GRID_SIZE;
  return {
    ...state,
    selectedCell: { row: nextRow, col: nextCol },
  };
}

/**
 * Toggles Notes mode ON or OFF.
 */
export function toggleNotesMode(state: GameState): GameState {
  return {
    ...state,
    notesMode: !state.notesMode,
  };
}

/**
 * Handles number input (1-6) on the currently selected cell.
 * - Never modifies original clues.
 * - In Notes mode: adds or removes the candidate in the selected empty cell.
 * - In Normal mode: enters the final value and clears that cell's notes.
 */
export function handleNumberInput(state: GameState, digit: number): GameState {
  if (state.isCompleted) return state;
  if (!Number.isInteger(digit) || digit < 1 || digit > GRID_SIZE) return state;
  if (!state.selectedCell) return state;

  const { row, col } = state.selectedCell;
  // Original clues are strictly immutable
  if (state.puzzle[row][col] !== 0) {
    return state;
  }

  if (state.notesMode) {
    // In Notes mode, selecting a number adds or removes that candidate in the selected empty cell
    if (state.board[row][col] !== 0) {
      return state;
    }

    const snapshot = createSnapshot(state);
    const nextNotes = cloneNotes(state.notes);
    const currentCellNotes = nextNotes[row][col];
    const exists = currentCellNotes.includes(digit);
    nextNotes[row][col] = exists
      ? currentCellNotes.filter((n) => n !== digit)
      : [...currentCellNotes, digit].sort((a, b) => a - b);

    return {
      ...state,
      notes: nextNotes,
      history: [...state.history, snapshot],
      lastHint: null,
    };
  }

  // Normal mode: enter final value and clear that cell's notes
  if (state.board[row][col] === digit && state.notes[row][col].length === 0) {
    return state;
  }

  const snapshot = createSnapshot(state);
  const nextBoard = cloneBoard(state.board);
  const nextNotes = cloneNotes(state.notes);
  const nextHinted = cloneBooleanGrid(state.hintedCells);

  nextBoard[row][col] = digit;
  nextNotes[row][col] = [];
  nextHinted[row][col] = false;

  const completed = isBoardCompleteAndValid(nextBoard);

  return {
    ...state,
    board: nextBoard,
    notes: nextNotes,
    hintedCells: nextHinted,
    isCompleted: completed,
    history: [...state.history, snapshot],
    lastHint: null,
  };
}

/**
 * Erases the selected cell's player entry or notes.
 * Never modifies original clues.
 */
export function eraseSelectedCell(state: GameState): GameState {
  if (state.isCompleted) return state;
  if (!state.selectedCell) return state;

  const { row, col } = state.selectedCell;
  if (state.puzzle[row][col] !== 0) {
    return state;
  }

  if (state.board[row][col] === 0 && state.notes[row][col].length === 0) {
    return state;
  }

  const snapshot = createSnapshot(state);
  const nextBoard = cloneBoard(state.board);
  const nextNotes = cloneNotes(state.notes);
  const nextHinted = cloneBooleanGrid(state.hintedCells);

  nextBoard[row][col] = 0;
  nextNotes[row][col] = [];
  nextHinted[row][col] = false;

  return {
    ...state,
    board: nextBoard,
    notes: nextNotes,
    hintedCells: nextHinted,
    history: [...state.history, snapshot],
    lastHint: null,
  };
}

/**
 * Reverts the most recent board/note/hint change from the history stack.
 */
export function undoLastMove(state: GameState): GameState {
  if (state.isCompleted || state.history.length === 0) return state;

  const previous = state.history[state.history.length - 1];
  const nextHistory = state.history.slice(0, -1);
  if (
    !previous ||
    !isValidShape(previous.board) ||
    !isValidNotesGrid(previous.notes) ||
    !isValidBooleanGrid(previous.hintedCells)
  ) {
    return {
      ...state,
      history: nextHistory,
    };
  }

  const completed = isBoardCompleteAndValid(previous.board);

  return {
    ...state,
    board: cloneBoard(previous.board),
    notes: cloneNotes(previous.notes),
    hintedCells: cloneBooleanGrid(previous.hintedCells),
    selectedCell: previous.selectedCell ? { ...previous.selectedCell } : state.selectedCell,
    isCompleted: completed,
    history: nextHistory,
    lastHint: null,
  };
}

/**
 * Applies a smart Hint:
 * 1. If any incorrect player entries exist (board[r][c] !== 0 && board[r][c] !== solution[r][c]),
 *    identifies one for correction first (prioritizing the selected cell if it is incorrect,
 *    otherwise the first incorrect player entry), reveals its true value, and marks it hinted.
 * 2. Otherwise, reveals the correct value in the selected empty cell, or the first empty cell
 *    if no empty cell is selected.
 * 3. Never modifies original clues. Tracks hintsUsed and visually identifies hinted entries.
 */
export function applyHint(state: GameState): GameState {
  if (state.isCompleted) return state;

  // Step 1: Check for incorrect player entries
  const incorrectCells: CellCoord[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (
        state.puzzle[r][c] === 0 &&
        state.board[r][c] !== 0 &&
        state.board[r][c] !== state.solution[r][c]
      ) {
        incorrectCells.push({ row: r, col: c });
      }
    }
  }

  let targetCell: CellCoord | null = null;
  let hintType: 'correction' | 'reveal' = 'reveal';

  if (incorrectCells.length > 0) {
    hintType = 'correction';
    const selectedIsIncorrect =
      state.selectedCell &&
      incorrectCells.some(
        (c) => c.row === state.selectedCell!.row && c.col === state.selectedCell!.col
      );
    targetCell = selectedIsIncorrect ? { ...state.selectedCell! } : incorrectCells[0];
  } else {
    // Step 2: Selected empty cell, or another empty cell if none is selected
    if (
      state.selectedCell &&
      state.puzzle[state.selectedCell.row][state.selectedCell.col] === 0 &&
      state.board[state.selectedCell.row][state.selectedCell.col] === 0
    ) {
      targetCell = { ...state.selectedCell };
    } else {
      targetCell = findFirstEmptyCell(state.board);
    }
  }

  if (!targetCell) {
    return state;
  }

  const { row, col } = targetCell;
  // Double-check immutability of original clues
  if (state.puzzle[row][col] !== 0) {
    return state;
  }

  const snapshot = createSnapshot(state);
  const nextBoard = cloneBoard(state.board);
  const nextNotes = cloneNotes(state.notes);
  const nextHinted = cloneBooleanGrid(state.hintedCells);
  const correctValue = state.solution[row][col];
  const previousValue = state.board[row][col];

  nextBoard[row][col] = correctValue;
  nextNotes[row][col] = [];
  nextHinted[row][col] = true;

  const completed = isBoardCompleteAndValid(nextBoard);
  const message =
    hintType === 'correction'
      ? `Corrected Row ${row + 1}, Column ${col + 1} from ${previousValue} to ${correctValue}.`
      : `Revealed ${correctValue} at Row ${row + 1}, Column ${col + 1}.`;

  return {
    ...state,
    board: nextBoard,
    notes: nextNotes,
    hintedCells: nextHinted,
    selectedCell: { row, col },
    hintsUsed: state.hintsUsed + 1,
    isCompleted: completed,
    history: [...state.history, snapshot],
    lastHint: {
      row,
      col,
      value: correctValue,
      type: hintType,
      message,
    },
  };
}

export function tickTimer(state: GameState): GameState {
  if (state.isCompleted) return state;
  return {
    ...state,
    elapsedSeconds: state.elapsedSeconds + 1,
  };
}

export function formatElapsedTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const MAX_SAVED_HISTORY = 100;

export function saveGameStateToStorage(state: GameState): void {
  try {
    const serialized = JSON.stringify({
      puzzle: state.puzzle,
      solution: state.solution,
      board: state.board,
      notes: state.notes,
      hintedCells: state.hintedCells,
      selectedCell: state.selectedCell,
      notesMode: state.notesMode,
      selectedDifficulty: state.selectedDifficulty,
      actualDifficulty: state.actualDifficulty,
      elapsedSeconds: state.elapsedSeconds,
      hintsUsed: state.hintsUsed,
      isCompleted: state.isCompleted,
      history: state.history.slice(-MAX_SAVED_HISTORY),
    });
    window.localStorage.setItem(STORAGE_KEY_GAME, serialized);
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function isValidNotesGrid(notes: unknown): notes is number[][][] {
  if (!Array.isArray(notes) || notes.length !== GRID_SIZE) return false;
  for (let r = 0; r < GRID_SIZE; r++) {
    if (!Array.isArray(notes[r]) || notes[r].length !== GRID_SIZE) return false;
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = notes[r][c];
      if (!Array.isArray(cell)) return false;
      for (const n of cell) {
        if (!Number.isInteger(n) || n < 1 || n > GRID_SIZE) return false;
      }
    }
  }
  return true;
}

function sanitizeNotesGrid(notes: number[][][], board: number[][]): number[][][] {
  return Array.from({ length: GRID_SIZE }, (_, r) =>
    Array.from({ length: GRID_SIZE }, (__, c) => {
      if (board[r][c] !== 0) return [];
      const uniqueSorted = [...new Set(notes[r][c])].sort((a, b) => a - b);
      return uniqueSorted;
    })
  );
}

function isValidBooleanGrid(grid: unknown): grid is boolean[][] {
  if (!Array.isArray(grid) || grid.length !== GRID_SIZE) return false;
  for (let r = 0; r < GRID_SIZE; r++) {
    if (!Array.isArray(grid[r]) || grid[r].length !== GRID_SIZE) return false;
    for (let c = 0; c < GRID_SIZE; c++) {
      if (typeof grid[r][c] !== 'boolean') return false;
    }
  }
  return true;
}

function isValidCellCoord(coord: unknown): coord is CellCoord {
  if (!coord || typeof coord !== 'object') return false;
  const candidate = coord as Record<string, unknown>;
  return (
    typeof candidate.row === 'number' &&
    typeof candidate.col === 'number' &&
    Number.isInteger(candidate.row) &&
    Number.isInteger(candidate.col) &&
    candidate.row >= 0 &&
    candidate.row < GRID_SIZE &&
    candidate.col >= 0 &&
    candidate.col < GRID_SIZE
  );
}

function sanitizeHistory(rawHistory: unknown, puzzle: number[][]): HistorySnapshot[] {
  if (!Array.isArray(rawHistory)) return [];
  const validSnapshots: HistorySnapshot[] = [];
  for (const item of rawHistory.slice(-MAX_SAVED_HISTORY)) {
    if (!item || typeof item !== 'object') continue;
    const snap = item as Record<string, unknown>;
    if (
      !isValidShape(snap.board as number[][]) ||
      !isValidNotesGrid(snap.notes) ||
      !isValidBooleanGrid(snap.hintedCells)
    ) {
      continue;
    }
    const snapBoard = snap.board as number[][];
    let cluesIntact = true;
    for (let r = 0; r < GRID_SIZE && cluesIntact; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (puzzle[r][c] !== 0 && snapBoard[r][c] !== puzzle[r][c]) {
          cluesIntact = false;
          break;
        }
      }
    }
    if (!cluesIntact) continue;

    validSnapshots.push({
      board: cloneBoard(snapBoard),
      notes: sanitizeNotesGrid(snap.notes, snapBoard),
      hintedCells: cloneBooleanGrid(snap.hintedCells),
      selectedCell: isValidCellCoord(snap.selectedCell)
        ? { row: snap.selectedCell.row, col: snap.selectedCell.col }
        : null,
    });
  }
  return validSnapshots;
}

export function loadGameStateFromStorage(): GameState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_GAME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    if (
      !isValidShape(parsed.puzzle) ||
      !isValidShape(parsed.solution) ||
      !isBoardCompleteAndValid(parsed.solution) ||
      !isValidShape(parsed.board) ||
      !isValidNotesGrid(parsed.notes)
    ) {
      return null;
    }

    // Ensure original clues in board and solution match puzzle
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (
          parsed.puzzle[r][c] !== 0 &&
          (parsed.board[r][c] !== parsed.puzzle[r][c] ||
            parsed.solution[r][c] !== parsed.puzzle[r][c])
        ) {
          return null;
        }
      }
    }

    const analysis = analyzePuzzleDifficulty(parsed.puzzle);
    if (!analysis.solvable || !analysis.uniqueSolution) {
      return null;
    }

    const validDiffSelections: DifficultySelection[] = ['easy', 'medium', 'hard', 'random'];
    const validActualDiffs: Difficulty[] = ['easy', 'medium', 'hard'];

    const selectedDifficulty: DifficultySelection = validDiffSelections.includes(
      parsed.selectedDifficulty
    )
      ? parsed.selectedDifficulty
      : 'easy';

    const actualDifficulty: Difficulty = validActualDiffs.includes(parsed.actualDifficulty)
      ? parsed.actualDifficulty
      : analysis.difficulty;

    const hintedCells: boolean[][] = isValidBooleanGrid(parsed.hintedCells)
      ? cloneBooleanGrid(parsed.hintedCells)
      : createEmptyBooleanGrid();

    const isCompleted = isBoardCompleteAndValid(parsed.board);

    const selectedCell: CellCoord = isValidCellCoord(parsed.selectedCell)
      ? { row: parsed.selectedCell.row, col: parsed.selectedCell.col }
      : findFirstEmptyCell(parsed.board) ?? { row: 0, col: 0 };

    return {
      puzzle: cloneBoard(parsed.puzzle),
      solution: cloneBoard(parsed.solution),
      board: cloneBoard(parsed.board),
      notes: sanitizeNotesGrid(parsed.notes, parsed.board),
      hintedCells,
      selectedCell,
      notesMode: Boolean(parsed.notesMode),
      selectedDifficulty,
      actualDifficulty,
      analysis,
      elapsedSeconds:
        typeof parsed.elapsedSeconds === 'number' &&
        Number.isFinite(parsed.elapsedSeconds) &&
        parsed.elapsedSeconds >= 0
          ? Math.floor(parsed.elapsedSeconds)
          : 0,
      hintsUsed:
        typeof parsed.hintsUsed === 'number' &&
        Number.isFinite(parsed.hintsUsed) &&
        parsed.hintsUsed >= 0
          ? Math.floor(parsed.hintsUsed)
          : 0,
      isCompleted,
      history: sanitizeHistory(parsed.history, parsed.puzzle),
      lastHint: null,
    };
  } catch {
    return null;
  }
}

export function getInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY_THEME);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // Fallback to light
  }
  return 'light';
}

export function saveThemeToStorage(theme: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_THEME, theme);
  } catch {
    // Ignore storage errors
  }
}
