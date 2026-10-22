import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import {
  countSolutions,
  generatePuzzle,
  isBoardCompleteAndValid,
} from '../engine/sudoku';
import {
  GameState,
  STORAGE_KEY_GAME,
  STORAGE_KEY_THEME,
  applyHint,
  createGameStateFromCustomPuzzle,
  eraseSelectedCell,
  getInitialTheme,
  loadGameStateFromStorage,
  moveSelection,
} from '../state/gameState';

const SAMPLE_SOLUTION: number[][] = [
  [1, 2, 3, 4, 5, 6],
  [4, 5, 6, 1, 2, 3],
  [2, 3, 1, 5, 6, 4],
  [5, 6, 4, 2, 3, 1],
  [3, 1, 2, 6, 4, 5],
  [6, 4, 5, 3, 1, 2],
];

const SAMPLE_PUZZLE: number[][] = [
  [1, 0, 3, 4, 0, 6],
  [4, 5, 6, 1, 2, 3],
  [2, 3, 1, 5, 6, 4],
  [5, 6, 4, 2, 3, 1],
  [3, 1, 2, 6, 4, 5],
  [6, 4, 5, 3, 1, 2],
];

describe('Edge Cases & Representative Difficulty Verification', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('gracefully rejects corrupted or malformed localStorage data', () => {
    window.localStorage.setItem(STORAGE_KEY_GAME, '{corrupted json');
    expect(loadGameStateFromStorage()).toBeNull();

    // Wrong grid size (5x5 instead of 6x6)
    window.localStorage.setItem(
      STORAGE_KEY_GAME,
      JSON.stringify({
        puzzle: Array.from({ length: 5 }, () => Array(5).fill(0)),
        solution: SAMPLE_SOLUTION,
        board: SAMPLE_PUZZLE,
        notes: [],
      })
    );
    expect(loadGameStateFromStorage()).toBeNull();

    // Tampered original clue in board
    const tamperedBoard = SAMPLE_PUZZLE.map((r) => [...r]);
    tamperedBoard[0][0] = 6; // Clue at (0,0) was 1
    window.localStorage.setItem(
      STORAGE_KEY_GAME,
      JSON.stringify({
        puzzle: SAMPLE_PUZZLE,
        solution: SAMPLE_SOLUTION,
        board: tamperedBoard,
        notes: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => [])),
      })
    );
    expect(loadGameStateFromStorage()).toBeNull();
  });

  it('follows device prefers-color-scheme initially and remembers explicit theme override', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });

    expect(getInitialTheme()).toBe('dark');

    window.localStorage.setItem(STORAGE_KEY_THEME, 'light');
    expect(getInitialTheme()).toBe('light');

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('renders candidate notes 1-6 in fixed miniature positions and clears notes via Erase', () => {
    const state = createGameStateFromCustomPuzzle(SAMPLE_PUZZLE, SAMPLE_SOLUTION);
    render(<App initialState={state} />);

    // Select empty cell (0,1) and turn on Notes mode
    fireEvent.click(screen.getByTestId('cell-0-1'));
    fireEvent.click(screen.getByTestId('notes-toggle-btn'));
    expect(screen.getByTestId('notes-state-badge')).toHaveTextContent('ON');

    // Add candidates 1, 4, 6
    fireEvent.click(screen.getByTestId('numpad-1'));
    fireEvent.click(screen.getByTestId('numpad-4'));
    fireEvent.click(screen.getByTestId('numpad-6'));

    expect(screen.getByTestId('note-0-1-1')).toHaveTextContent('1');
    expect(screen.getByTestId('note-0-1-2')).toHaveTextContent('');
    expect(screen.getByTestId('note-0-1-3')).toHaveTextContent('');
    expect(screen.getByTestId('note-0-1-4')).toHaveTextContent('4');
    expect(screen.getByTestId('note-0-1-5')).toHaveTextContent('');
    expect(screen.getByTestId('note-0-1-6')).toHaveTextContent('6');

    // Click Erase -> clears all notes in (0,1)
    fireEvent.click(screen.getByTestId('erase-btn'));
    expect(screen.getByTestId('note-0-1-1')).toHaveTextContent('');
    expect(screen.getByTestId('note-0-1-4')).toHaveTextContent('');
    expect(screen.getByTestId('note-0-1-6')).toHaveTextContent('');
  });

  it('handles Hint when selectedCell is null and wraps arrow navigation at board edges', () => {
    let state = createGameStateFromCustomPuzzle(SAMPLE_PUZZLE, SAMPLE_SOLUTION);
    state = { ...state, selectedCell: null };

    // Hint with no selected cell reveals the first empty cell (0,1) = 2
    const hinted = applyHint(state);
    expect(hinted.selectedCell).toEqual({ row: 0, col: 1 });
    expect(hinted.board[0][1]).toBe(2);
    expect(hinted.hintedCells[0][1]).toBe(true);

    // Arrow wrap-around from (0,0)
    let navState: GameState = { ...state, selectedCell: { row: 0, col: 0 } };
    navState = moveSelection(navState, -1, 0);
    expect(navState.selectedCell).toEqual({ row: 5, col: 0 });
    navState = moveSelection(navState, 0, -1);
    expect(navState.selectedCell).toEqual({ row: 5, col: 5 });

    // Erasing an already-empty cell does not pollute undo history
    const emptySelected = { ...state, selectedCell: { row: 0, col: 1 } };
    const afterErase = eraseSelectedCell(emptySelected);
    expect(afterErase.history.length).toBe(0);
  });

  it('verifies representative puzzles across Easy, Medium, and Hard difficulty levels', () => {
    for (const diff of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 8; i++) {
        const gen = generatePuzzle(diff, { maxAttempts: 12 });
        const solCheck = countSolutions(gen.puzzle, 2);
        expect(solCheck.count).toBe(1);
        expect(isBoardCompleteAndValid(gen.solution)).toBe(true);
        expect(gen.analysis.difficulty).toBe(diff);
      }
    }
  });

  it('rejects invalid solutions and sanitizes malformed history entries in localStorage without crashing Undo', () => {
    // All-zero solution must be rejected even though it has 6x6 integer shape
    window.localStorage.setItem(
      STORAGE_KEY_GAME,
      JSON.stringify({
        puzzle: SAMPLE_PUZZLE,
        solution: Array.from({ length: 6 }, () => Array(6).fill(0)),
        board: SAMPLE_PUZZLE,
        notes: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => [])),
      })
    );
    expect(loadGameStateFromStorage()).toBeNull();

    // Valid game with corrupted history array entries ([null, { board: 'bad' }])
    window.localStorage.setItem(
      STORAGE_KEY_GAME,
      JSON.stringify({
        puzzle: SAMPLE_PUZZLE,
        solution: SAMPLE_SOLUTION,
        board: SAMPLE_PUZZLE,
        notes: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => [])),
        history: [null, { board: 'invalid' }, { board: SAMPLE_PUZZLE }],
      })
    );
    const loaded = loadGameStateFromStorage();
    expect(loaded).not.toBeNull();
    expect(loaded!.history).toEqual([]);
  });

  it('synchronizes DOM focus on Arrow-key navigation, uses roving tabIndex, and traps focus/shortcuts inside modals', () => {
    const customState = createGameStateFromCustomPuzzle(
      SAMPLE_PUZZLE,
      SAMPLE_SOLUTION,
      'easy',
      'easy'
    );
    render(<App initialState={customState} />);

    // Initially selected cell (0,1) has tabIndex=0, while (0,0) has tabIndex=-1
    const cell00 = screen.getByTestId('cell-0-0');
    const cell01 = screen.getByTestId('cell-0-1');
    expect(cell01).toHaveAttribute('tabindex', '0');
    expect(cell00).toHaveAttribute('tabindex', '-1');

    // Navigating with ArrowRight moves both selection and DOM focus to (0,2)
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const cell02 = screen.getByTestId('cell-0-2');
    expect(cell02).toHaveAttribute('data-selected', 'true');
    expect(cell02).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(cell02);

    // Move back to (0,1), enter 2, then move to (0,4) and enter 5 to complete the puzzle
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.click(screen.getByTestId('cell-0-4'));
    fireEvent.keyDown(window, { key: '5' });

    // Completion modal opens and focuses Play Again button
    const completionModal = screen.getByTestId('completion-modal');
    expect(completionModal).toBeInTheDocument();
    const playAgainBtn = screen.getByTestId('play-again-btn');
    const closeBtn = screen.getByTestId('close-completion-btn');
    expect(document.activeElement).toBe(playAgainBtn);

    // Tab wraps focus from last button (Play Again) to first button (View Board)
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    // Pressing 'z' while Completion Modal is open must NOT undo completion behind the modal
    fireEvent.keyDown(window, { key: 'z' });
    expect(screen.getByTestId('completion-modal')).toBeInTheDocument();
    expect(screen.getByTestId('cell-0-4')).toHaveTextContent('5');

    // Pressing Escape dismisses Completion Modal and shows Summary button in banner
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('completion-modal')).toBeNull();
    const summaryBtn = screen.getByTestId('reopen-completion-btn');
    expect(summaryBtn).toBeInTheDocument();

    // Clicking Summary reopens Completion Modal
    fireEvent.click(summaryBtn);
    expect(screen.getByTestId('completion-modal')).toBeInTheDocument();
  });
});
