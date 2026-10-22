import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  GRID_SIZE,
  DIGITS,
  Difficulty,
  DifficultySelection,
  DIFFICULTY_RUBRIC,
  arePeers,
  findConflicts,
  getBoxIndex,
} from './engine/sudoku';
import {
  GameState,
  ThemeMode,
  STORAGE_KEY_THEME,
  applyHint,
  createNewGameState,
  eraseSelectedCell,
  formatElapsedTime,
  getInitialTheme,
  handleNumberInput,
  hasMeaningfulProgress,
  loadGameStateFromStorage,
  moveSelection,
  saveGameStateToStorage,
  saveThemeToStorage,
  selectCell,
  tickTimer,
  toggleNotesMode,
  undoLastMove,
} from './state/gameState';
import './App.css';

const DIFFICULTY_OPTIONS: Array<{ value: DifficultySelection; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'random', label: 'Random' },
];

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export interface AppProps {
  initialState?: GameState;
}

export function App({ initialState }: AppProps = {}) {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [gameState, setGameState] = useState<GameState>(
    () => initialState ?? loadGameStateFromStorage() ?? createNewGameState('easy')
  );
  const [pendingNewGameDifficulty, setPendingNewGameDifficulty] =
    useState<DifficultySelection | null>(null);
  const [completionModalDismissed, setCompletionModalDismissed] = useState(false);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusSelectedCellRef = useRef(false);
  const confirmModalRef = useRef<HTMLDivElement | null>(null);
  const completionModalRef = useRef<HTMLDivElement | null>(null);
  const confirmPrimaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const playAgainBtnRef = useRef<HTMLButtonElement | null>(null);

  const showCompletionModal = gameState.isCompleted && !completionModalDismissed;

  // Sync theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Follow device color preference if user has not explicitly saved a preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      try {
        const explicitChoice = window.localStorage.getItem(STORAGE_KEY_THEME);
        if (!explicitChoice) {
          setTheme(e.matches ? 'dark' : 'light');
        }
      } catch {
        // Ignore storage errors
      }
    };
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  // Persist game state across refreshes
  useEffect(() => {
    saveGameStateToStorage(gameState);
  }, [gameState]);

  // Reset completion modal dismissal when a new incomplete game starts
  useEffect(() => {
    if (!gameState.isCompleted) {
      setCompletionModalDismissed(false);
    }
  }, [gameState.isCompleted]);

  // Move DOM focus to newly selected grid cell when navigating via Arrow keys
  useEffect(() => {
    if (!shouldFocusSelectedCellRef.current || !gameState.selectedCell || !boardRef.current) {
      return;
    }
    shouldFocusSelectedCellRef.current = false;
    const { row, col } = gameState.selectedCell;
    const cellBtn = boardRef.current.querySelector<HTMLButtonElement>(
      `[data-testid="cell-${row}-${col}"]`
    );
    cellBtn?.focus();
  }, [gameState.selectedCell]);

  // Focus primary action button when Confirmation or Completion modal opens
  useEffect(() => {
    if (pendingNewGameDifficulty !== null) {
      confirmPrimaryBtnRef.current?.focus();
    }
  }, [pendingNewGameDifficulty]);

  useEffect(() => {
    if (showCompletionModal) {
      playAgainBtnRef.current?.focus();
    }
  }, [showCompletionModal]);

  // 1-second elapsed time ticker while game is active and unfinished
  useEffect(() => {
    if (gameState.isCompleted || pendingNewGameDifficulty !== null) {
      return;
    }
    const timerId = window.setInterval(() => {
      setGameState((prev) => tickTimer(prev));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [gameState.isCompleted, pendingNewGameDifficulty]);

  const handleThemeToggle = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    saveThemeToStorage(nextTheme);
  };

  const startFreshGame = useCallback((selection: DifficultySelection) => {
    setGameState(createNewGameState(selection));
    setPendingNewGameDifficulty(null);
    setCompletionModalDismissed(false);
  }, []);

  const requestNewGame = useCallback(
    (selection: DifficultySelection) => {
      if (hasMeaningfulProgress(gameState)) {
        setPendingNewGameDifficulty(selection);
      } else {
        startFreshGame(selection);
      }
    },
    [gameState, startFreshGame]
  );

  // Keyboard navigation, modal focus trap, and shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (pendingNewGameDifficulty !== null || showCompletionModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (pendingNewGameDifficulty !== null) {
            setPendingNewGameDifficulty(null);
          } else {
            setCompletionModalDismissed(true);
          }
          return;
        }

        if (e.key === 'Tab') {
          const activeModal =
            pendingNewGameDifficulty !== null
              ? confirmModalRef.current
              : completionModalRef.current;
          if (activeModal) {
            const focusable = Array.from(
              activeModal.querySelectorAll<HTMLElement>('button:not([disabled])')
            );
            if (focusable.length > 0) {
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              const current = document.activeElement as HTMLElement | null;
              if (e.shiftKey) {
                if (!current || !activeModal.contains(current) || current === first) {
                  e.preventDefault();
                  last.focus();
                }
              } else {
                if (!current || !activeModal.contains(current) || current === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }
          }
          return;
        }

        // Prevent board shortcuts from leaking behind an open modal dialog
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key >= '1' && e.key <= '6' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const digit = Number(e.key);
        setGameState((prev) => handleNumberInput(prev, digit));
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setGameState((prev) => eraseSelectedCell(prev));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        shouldFocusSelectedCellRef.current = true;
        setGameState((prev) => moveSelection(prev, -1, 0));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        shouldFocusSelectedCellRef.current = true;
        setGameState((prev) => moveSelection(prev, 1, 0));
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        shouldFocusSelectedCellRef.current = true;
        setGameState((prev) => moveSelection(prev, 0, -1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        shouldFocusSelectedCellRef.current = true;
        setGameState((prev) => moveSelection(prev, 0, 1));
        return;
      }

      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setGameState((prev) => {
          if (prev.isCompleted) return prev;
          return toggleNotesMode(prev);
        });
        return;
      }

      if (
        (e.key === 'z' || e.key === 'Z') &&
        !e.altKey &&
        !(e.shiftKey && (e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        setGameState((prev) => undoLastMove(prev));
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingNewGameDifficulty, showCompletionModal]);

  const conflicts = useMemo(() => findConflicts(gameState.board), [gameState.board]);

  const conflictCount = useMemo(() => {
    let count = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (conflicts[r][c]) count++;
      }
    }
    return count;
  }, [conflicts]);

  const digitCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const val = gameState.board[r][c];
        if (val >= 1 && val <= 6) {
          counts[val]++;
        }
      }
    }
    return counts;
  }, [gameState.board]);

  const selectedValue = useMemo(() => {
    if (!gameState.selectedCell) return 0;
    return gameState.board[gameState.selectedCell.row]?.[gameState.selectedCell.col] ?? 0;
  }, [gameState.board, gameState.selectedCell]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-group">
          <div className="brand-logo" aria-hidden="true">
            <span>6</span>
            <span>1</span>
            <span>4</span>
            <span>2</span>
          </div>
          <div className="brand-titles">
            <h1 className="brand-title">Mini Sudoku 6×6</h1>
            <p className="brand-subtitle">
              Fill every row, column, and 2×3 box with digits 1–6
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={handleThemeToggle}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            data-testid="theme-toggle"
          >
            {theme === 'light' ? (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span>Dark</span>
              </>
            ) : (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span>Light</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="game-card">
        {/* Top Bar: Difficulty Selection & Live Game Metrics */}
        <div className="top-controls-bar">
          <div
            className="difficulty-selector"
            role="group"
            aria-label="Difficulty selection"
          >
            {DIFFICULTY_OPTIONS.map((option) => {
              const isSelected = gameState.selectedDifficulty === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`difficulty-pill ${isSelected ? 'active' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => requestNewGame(option.value)}
                  data-testid={`difficulty-${option.value}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="metrics-bar">
            <div className="metric-chip" data-testid="active-difficulty-display">
              <span>Difficulty:</span>
              <strong>
                {gameState.selectedDifficulty === 'random'
                  ? `Random (${capitalize(gameState.actualDifficulty)})`
                  : capitalize(gameState.actualDifficulty)}
              </strong>
            </div>

            <div className="metric-chip" data-testid="hints-used-display">
              <span>Hints:</span>
              <strong>{gameState.hintsUsed}</strong>
            </div>

            <div
              className="metric-chip"
              aria-label={`Elapsed time ${formatElapsedTime(gameState.elapsedSeconds)}`}
              data-testid="timer-display"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="timer-value">
                {formatElapsedTime(gameState.elapsedSeconds)}
              </span>
            </div>
          </div>
        </div>

        {/* Play Area: 6x6 Board + Controls */}
        <div className="play-area">
          <div className="board-column">
            <div
              ref={boardRef}
              className="sudoku-board"
              role="grid"
              aria-label="6 by 6 Mini Sudoku Board"
              data-testid="sudoku-board"
            >
              {Array.from({ length: GRID_SIZE }, (_, r) => (
                <div key={`row-${r}`} role="row" className="sudoku-row">
                  {Array.from({ length: GRID_SIZE }, (__, c) => {
                    const val = gameState.board[r][c];
                    const isClue = gameState.puzzle[r][c] !== 0;
                    const isHinted = gameState.hintedCells[r][c];
                    const isSelected =
                      gameState.selectedCell?.row === r &&
                      gameState.selectedCell?.col === c;
                    const isRelated =
                      gameState.selectedCell !== null &&
                      !isSelected &&
                      arePeers(r, c, gameState.selectedCell.row, gameState.selectedCell.col);
                    const isMatching =
                      selectedValue !== 0 && val === selectedValue && !isSelected;
                    const isConflict = conflicts[r][c];
                    const cellNotes = gameState.notes[r][c];
                    const boxNum = getBoxIndex(r, c) + 1;

                    const classNames = [
                      'sudoku-cell',
                      `row-${r}`,
                      `col-${c}`,
                      c === 2 ? 'box-right-border' : '',
                      r === 1 || r === 3 ? 'box-bottom-border' : '',
                      isClue ? 'cell-clue' : '',
                      isHinted ? 'cell-hinted' : '',
                      isRelated ? 'cell-related' : '',
                      isMatching ? 'cell-matching' : '',
                      isSelected ? 'cell-selected' : '',
                      isConflict ? 'cell-conflict' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    let stateDescription = 'empty';
                    if (val !== 0) {
                      if (isClue) {
                        stateDescription = `original clue ${val}`;
                      } else if (isHinted) {
                        stateDescription = `hinted entry ${val}`;
                      } else {
                        stateDescription = `player entry ${val}`;
                      }
                    } else if (cellNotes.length > 0) {
                      stateDescription = `empty, notes ${cellNotes.join(', ')}`;
                    }

                    if (isConflict) {
                      stateDescription += ', conflict';
                    }

                    const ariaLabel = `Row ${r + 1}, Column ${c + 1}, Box ${boxNum}, ${stateDescription}`;

                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        role="gridcell"
                        tabIndex={isSelected ? 0 : -1}
                        className={classNames}
                        aria-label={ariaLabel}
                        aria-selected={isSelected}
                        aria-invalid={isConflict ? 'true' : undefined}
                        data-testid={`cell-${r}-${c}`}
                        data-row={r}
                        data-col={c}
                        data-box={boxNum}
                        data-clue={isClue ? 'true' : 'false'}
                        data-hinted={isHinted ? 'true' : 'false'}
                        data-conflict={isConflict ? 'true' : 'false'}
                        data-selected={isSelected ? 'true' : 'false'}
                        data-related={isRelated ? 'true' : 'false'}
                        data-matching={isMatching ? 'true' : 'false'}
                        onClick={() => setGameState((prev) => selectCell(prev, r, c))}
                      >
                        {val !== 0 ? (
                          <>
                            <span className="cell-value">{val}</span>
                            {isHinted && !isClue && (
                              <span
                                className="hint-badge"
                                title="Revealed by Hint"
                                aria-hidden="true"
                              >
                                ★
                              </span>
                            )}
                            {isConflict && (
                              <span
                                className="conflict-badge"
                                title="Conflicting duplicate in row, column, or 2×3 box"
                                aria-hidden="true"
                              >
                                !
                              </span>
                            )}
                          </>
                        ) : (
                          <div className="cell-notes-grid" aria-hidden="true">
                            {DIGITS.map((d) => {
                              const hasCandidate = cellNotes.includes(d);
                              const isNoteMatch = selectedValue === d && hasCandidate;
                              return (
                                <span
                                  key={d}
                                  className={`note-slot ${isNoteMatch ? 'note-matching' : ''}`}
                                  data-testid={`note-${r}-${c}-${d}`}
                                >
                                  {hasCandidate ? d : ''}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Live Feedback Banner */}
            <div
              className={`status-banner ${
                gameState.isCompleted
                  ? 'status-complete'
                  : conflictCount > 0
                  ? 'status-conflict'
                  : gameState.lastHint
                  ? 'status-hint'
                  : ''
              }`}
              role="status"
              aria-live="polite"
              data-testid="status-banner"
            >
              {gameState.isCompleted ? (
                <>
                  <span>
                    🎉 Puzzle solved in {formatElapsedTime(gameState.elapsedSeconds)}!
                  </span>
                  {completionModalDismissed && (
                    <button
                      type="button"
                      className="banner-link-btn"
                      onClick={() => setCompletionModalDismissed(false)}
                      data-testid="reopen-completion-btn"
                    >
                      Summary
                    </button>
                  )}
                </>
              ) : conflictCount > 0 ? (
                <span>
                  ⚠️ Conflict detected: {conflictCount} cells share a duplicate digit in a
                  row, column, or 2×3 box.
                </span>
              ) : gameState.lastHint ? (
                <span>💡 Hint: {gameState.lastHint.message}</span>
              ) : gameState.notesMode ? (
                <span>
                  ✏️ Notes mode is ON — tap 1–6 to toggle candidates in the selected empty
                  cell.
                </span>
              ) : (
                <span>
                  Select any empty cell and enter 1–6. Original clues are locked.
                </span>
              )}
            </div>
          </div>

          {/* Right / Bottom Controls Column */}
          <div className="controls-column">
            <div>
              <p className="section-label">
                Number Pad {gameState.notesMode ? '(Notes Mode)' : '(Final Entry)'}
              </p>
              <div className="numpad-grid" role="group" aria-label="Number pad 1 to 6">
                {DIGITS.map((digit) => {
                  const placedCount = digitCounts[digit] ?? 0;
                  const isComplete = placedCount >= GRID_SIZE;
                  return (
                    <button
                      key={digit}
                      type="button"
                      disabled={gameState.isCompleted}
                      className={`numpad-btn ${
                        gameState.notesMode ? 'notes-active' : ''
                      } ${isComplete ? 'digit-complete' : ''}`}
                      onClick={() =>
                        setGameState((prev) => handleNumberInput(prev, digit))
                      }
                      aria-label={
                        gameState.notesMode
                          ? `Toggle candidate note ${digit}`
                          : `Enter number ${digit}`
                      }
                      data-testid={`numpad-${digit}`}
                    >
                      <span className="numpad-digit">{digit}</span>
                      <span className="numpad-count">{placedCount}/6</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="section-label">Puzzle Tools</p>
              <div className="tools-grid">
                {/* Notes Toggle with Pencil Icon */}
                <button
                  type="button"
                  className={`tool-btn ${gameState.notesMode ? 'tool-active' : ''}`}
                  onClick={() => setGameState((prev) => toggleNotesMode(prev))}
                  disabled={gameState.isCompleted}
                  aria-pressed={gameState.notesMode}
                  aria-label={`Notes mode ${gameState.notesMode ? 'ON' : 'OFF'}`}
                  title="Toggle pencil notes mode (Shortcut: N)"
                  data-testid="notes-toggle-btn"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                  <span>Notes</span>
                  <span className="toggle-pill" data-testid="notes-state-badge">
                    {gameState.notesMode ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Hint Button with Lightbulb Icon */}
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => setGameState((prev) => applyHint(prev))}
                  disabled={gameState.isCompleted}
                  aria-label="Hint"
                  title="Reveal the correct value in the selected empty cell, or fix an incorrect entry first"
                  data-testid="hint-btn"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 18h6" />
                    <path d="M10 22h4" />
                    <path d="M12 2a7 7 0 0 0-4 12.7c.6.6 1 1.4 1 2.3h6c0-.9.4-1.7 1-2.3A7 7 0 0 0 12 2z" />
                  </svg>
                  <span>Hint</span>
                </button>

                {/* Erase Button */}
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => setGameState((prev) => eraseSelectedCell(prev))}
                  disabled={gameState.isCompleted}
                  aria-label="Erase"
                  title="Clear the selected cell's entry or notes (Backspace / Delete)"
                  data-testid="erase-btn"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                    <path d="M22 21H7" />
                    <path d="m5 11 9 9" />
                  </svg>
                  <span>Erase</span>
                </button>

                {/* Undo Button */}
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => setGameState((prev) => undoLastMove(prev))}
                  disabled={gameState.isCompleted || gameState.history.length === 0}
                  aria-label="Undo"
                  title="Undo the last move (Shortcut: Z)"
                  data-testid="undo-btn"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                  </svg>
                  <span>Undo</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="primary-btn"
              onClick={() => requestNewGame(gameState.selectedDifficulty)}
              data-testid="new-game-btn"
            >
              New Game
            </button>

            <p className="shortcuts-line">
              <strong>Keyboard:</strong> 1–6 enter digits • Arrow keys move • Backspace/Delete
              erase • N toggles Notes • Z undoes
            </p>
          </div>
        </div>
      </main>

      {/* Documented Solving Technique Rubric */}
      <section className="info-section" aria-labelledby="rubric-heading">
        <div className="info-header">
          <h2 id="rubric-heading" className="info-title">
            Difficulty Rubric (Solving-Technique Graded)
          </h2>
          <span className="shortcuts-line" data-testid="puzzle-analysis-summary">
            Current puzzle: {gameState.analysis.summary}
          </span>
        </div>

        <div className="rubric-cards">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => {
            const info = DIFFICULTY_RUBRIC[level];
            const isCurrent = gameState.actualDifficulty === level;
            return (
              <div
                key={level}
                className={`rubric-card ${isCurrent ? 'rubric-active' : ''}`}
                data-testid={`rubric-card-${level}`}
              >
                <h3 className="rubric-card-title">
                  <span>{info.label}</span>
                  <span>{info.typicalClueRange[0]}–{info.typicalClueRange[1]} clues</span>
                </h3>
                <p className="rubric-card-desc">
                  <strong>Techniques:</strong> {info.requiredTechniques.join(', ')}
                </p>
                <p className="rubric-card-desc">{info.rubricDetails}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Confirmation Dialog before replacing an unfinished game with meaningful progress */}
      {pendingNewGameDifficulty !== null && (
        <div
          ref={confirmModalRef}
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          data-testid="confirm-new-game-modal"
        >
          <div className="modal-dialog">
            <h2 id="confirm-modal-title" className="modal-title">
              Replace Current Game?
            </h2>
            <p className="modal-body">
              You have an unfinished puzzle with progress on the board. Starting a new{' '}
              <strong>{capitalize(pendingNewGameDifficulty)}</strong> game will discard
              your current entries and timer.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setPendingNewGameDifficulty(null)}
                data-testid="cancel-new-game-btn"
              >
                Keep Playing
              </button>
              <button
                ref={confirmPrimaryBtnRef}
                type="button"
                className="primary-btn"
                onClick={() => startFreshGame(pendingNewGameDifficulty)}
                data-testid="confirm-new-game-btn"
              >
                Start New Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Dialog */}
      {showCompletionModal && (
        <div
          ref={completionModalRef}
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="completion-modal-title"
          data-testid="completion-modal"
        >
          <div className="modal-dialog">
            <h2 id="completion-modal-title" className="modal-title">
              🎉 Puzzle Solved!
            </h2>
            <p className="modal-body">
              Every row, column, and 2×3 box contains digits 1–6 with zero conflicts.
            </p>

            <div className="completion-stats-grid">
              <div className="stat-box">
                <span className="stat-label">Time</span>
                <span className="stat-value" data-testid="completion-time">
                  {formatElapsedTime(gameState.elapsedSeconds)}
                </span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Difficulty</span>
                <span className="stat-value" data-testid="completion-difficulty">
                  {capitalize(gameState.actualDifficulty)}
                </span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Hints Used</span>
                <span className="stat-value" data-testid="completion-hints">
                  {gameState.hintsUsed}
                </span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setCompletionModalDismissed(true)}
                data-testid="close-completion-btn"
              >
                View Board
              </button>
              <button
                ref={playAgainBtnRef}
                type="button"
                className="primary-btn"
                onClick={() => startFreshGame(gameState.selectedDifficulty)}
                data-testid="play-again-btn"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
