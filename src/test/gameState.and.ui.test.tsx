import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import {
  createGameStateFromCustomPuzzle,
  handleNumberInput,
  toggleNotesMode,
  applyHint,
  undoLastMove,
  eraseSelectedCell,
  selectCell,
  saveGameStateToStorage,
  loadGameStateFromStorage,
  hasMeaningfulProgress,
  STORAGE_KEY_THEME,
} from '../state/gameState';

const SAMPLE_SOLUTION: number[][] = [
  [1, 2, 3, 4, 5, 6],
  [4, 5, 6, 1, 2, 3],
  [2, 3, 1, 5, 6, 4],
  [5, 6, 4, 2, 3, 1],
  [3, 1, 2, 6, 4, 5],
  [6, 4, 5, 3, 1, 2],
];

// Leave (0,1)=2 and (0,4)=5 empty
const SAMPLE_PUZZLE: number[][] = [
  [1, 0, 3, 4, 0, 6],
  [4, 5, 6, 1, 2, 3],
  [2, 3, 1, 5, 6, 4],
  [5, 6, 4, 2, 3, 1],
  [3, 1, 2, 6, 4, 5],
  [6, 4, 5, 3, 1, 2],
];

describe('Game State, Rules, Notes, Hints, Undo, Completion & Persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps original clues strictly immutable against number entry, notes, erase, and hints', () => {
    let state = createGameStateFromCustomPuzzle(SAMPLE_PUZZLE, SAMPLE_SOLUTION);
    // Select (0,0) which is an original clue with value 1
    state = selectCell(state, 0, 0);
    state = handleNumberInput(state, 6);
    expect(state.board[0][0]).toBe(1);

    // Try notes mode on original clue
    state = toggleNotesMode(state);
    state = handleNumberInput(state, 4);
    expect(state.notes[0][0]).toEqual([]);
    expect(state.board[0][0]).toBe(1);

    // Try erase on original clue
    state = eraseSelectedCell(state);
    expect(state.board[0][0]).toBe(1);

    // Hint when an original clue is selected must reveal an empty cell instead of modifying the clue
    state = applyHint(state);
    expect(state.board[0][0]).toBe(1);
    expect(state.board[0][1]).toBe(2);
    expect(state.hintedCells[0][1]).toBe(true);
    expect(state.hintsUsed).toBe(1);
  });

  it('toggles candidate notes 1-6 in empty cells, clears notes when a final value is entered, and never counts notes as completed values', () => {
    let state = createGameStateFromCustomPuzzle(SAMPLE_PUZZLE, SAMPLE_SOLUTION);
    // Select empty cell (0,1)
    state = selectCell(state, 0, 1);
    state = toggleNotesMode(state);
    expect(state.notesMode).toBe(true);

    // Add candidates 5 and 2
    state = handleNumberInput(state, 5);
    state = handleNumberInput(state, 2);
    expect(state.notes[0][1]).toEqual([2, 5]);
    expect(state.board[0][1]).toBe(0);

    // Removing candidate 5 leaves [2]
    state = handleNumberInput(state, 5);
    expect(state.notes[0][1]).toEqual([2]);

    // Add note [5] in the only other empty cell (0,4) -> both empty cells have correct candidates in notes,
    // but notes must NEVER count as completed values!
    state = selectCell(state, 0, 4);
    state = handleNumberInput(state, 5);
    expect(state.notes[0][4]).toEqual([5]);
    expect(state.isCompleted).toBe(false);

    // Switch off Notes mode and enter final value in (0,1) -> clears (0,1)'s notes
    state = toggleNotesMode(state);
    state = selectCell(state, 0, 1);
    state = handleNumberInput(state, 2);
    expect(state.board[0][1]).toBe(2);
    expect(state.notes[0][1]).toEqual([]);
    expect(state.isCompleted).toBe(false);
  });

  it('identifies and corrects an incorrect player entry first when Hint is triggered, before revealing empty cells', () => {
    let state = createGameStateFromCustomPuzzle(SAMPLE_PUZZLE, SAMPLE_SOLUTION);
    // Enter an INCORRECT value (6) into empty cell (0,1) (true value is 2)
    state = selectCell(state, 0, 1);
    state = handleNumberInput(state, 6);
    expect(state.board[0][1]).toBe(6);

    // Now select the other empty cell (0,4) and trigger Hint
    state = selectCell(state, 0, 4);
    state = applyHint(state);

    // Hint must identify (0,1) for correction first!
    expect(state.selectedCell).toEqual({ row: 0, col: 1 });
    expect(state.board[0][1]).toBe(2);
    expect(state.hintedCells[0][1]).toBe(true);
    expect(state.board[0][4]).toBe(0);
    expect(state.hintsUsed).toBe(1);
    expect(state.lastHint?.type).toBe('correction');

    // A second Hint now reveals the remaining empty cell (0,4) = 5 and completes the puzzle
    state = applyHint(state);
    expect(state.board[0][4]).toBe(5);
    expect(state.hintedCells[0][4]).toBe(true);
    expect(state.hintsUsed).toBe(2);
    expect(state.isCompleted).toBe(true);
  });

  it('supports multi-step Undo across digit entry, note toggling, erase, and hints', () => {
    let state = createGameStateFromCustomPuzzle(SAMPLE_PUZZLE, SAMPLE_SOLUTION);
    state = selectCell(state, 0, 1);
    state = toggleNotesMode(state);
    state = handleNumberInput(state, 2);
    expect(state.notes[0][1]).toEqual([2]);

    state = toggleNotesMode(state);
    state = handleNumberInput(state, 4);
    expect(state.board[0][1]).toBe(4);
    expect(state.notes[0][1]).toEqual([]);

    // Undo final digit entry -> restores note [2] and empty value
    state = undoLastMove(state);
    expect(state.board[0][1]).toBe(0);
    expect(state.notes[0][1]).toEqual([2]);

    // Undo note entry -> restores empty notes
    state = undoLastMove(state);
    expect(state.notes[0][1]).toEqual([]);
  });

  it('detects completion only when the entire board satisfies 6x6 rules without conflicts', () => {
    let state = createGameStateFromCustomPuzzle(SAMPLE_PUZZLE, SAMPLE_SOLUTION);
    state = selectCell(state, 0, 1);
    state = handleNumberInput(state, 2);
    expect(state.isCompleted).toBe(false);

    // Enter wrong value in last empty cell (0,4)
    state = selectCell(state, 0, 4);
    state = handleNumberInput(state, 2);
    expect(state.isCompleted).toBe(false);

    // Enter correct value 5 in (0,4)
    state = handleNumberInput(state, 5);
    expect(state.isCompleted).toBe(true);
  });

  it('preserves and restores puzzle, entries, notes, elapsed time, hints, and difficulty from localStorage', () => {
    let state = createGameStateFromCustomPuzzle(
      SAMPLE_PUZZLE,
      SAMPLE_SOLUTION,
      'random',
      'hard'
    );
    state = selectCell(state, 0, 1);
    state = toggleNotesMode(state);
    state = handleNumberInput(state, 2);
    state = { ...state, elapsedSeconds: 95, hintsUsed: 1 };

    saveGameStateToStorage(state);
    const restored = loadGameStateFromStorage();

    expect(restored).not.toBeNull();
    expect(restored!.puzzle).toEqual(SAMPLE_PUZZLE);
    expect(restored!.notes[0][1]).toEqual([2]);
    expect(restored!.elapsedSeconds).toBe(95);
    expect(restored!.hintsUsed).toBe(1);
    expect(restored!.selectedDifficulty).toBe('random');
    expect(restored!.actualDifficulty).toBe('hard');
  });

  it('renders full UI, handles keyboard navigation, highlights peers & matching digits, confirms before replacing unfinished games, and shows completion dialog', () => {
    const customState = createGameStateFromCustomPuzzle(
      SAMPLE_PUZZLE,
      SAMPLE_SOLUTION,
      'easy',
      'easy'
    );
    render(<App initialState={customState} />);

    // Starts with Easy selected
    expect(screen.getByTestId('difficulty-easy')).toHaveAttribute('aria-pressed', 'true');

    // Select cell (0,0) which has value 1 -> highlights matching 1s and related row/col/box
    const cell00 = screen.getByTestId('cell-0-0');
    fireEvent.click(cell00);
    expect(cell00).toHaveAttribute('data-selected', 'true');
    // (0,2) is in the same row and box -> related
    expect(screen.getByTestId('cell-0-2')).toHaveAttribute('data-related', 'true');
    // (1,3) has value 1 -> matching number
    expect(screen.getByTestId('cell-1-3')).toHaveAttribute('data-matching', 'true');

    // Use ArrowRight keyboard navigation to move from (0,0) to empty cell (0,1)
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const cell01 = screen.getByTestId('cell-0-1');
    expect(cell01).toHaveAttribute('data-selected', 'true');

    // Enter conflicting value '1' via keyboard
    fireEvent.keyDown(window, { key: '1' });
    expect(cell01).toHaveAttribute('data-conflict', 'true');
    expect(cell01).toHaveAttribute('aria-invalid', 'true');
    expect(cell01.querySelector('.conflict-badge')).not.toBeNull();

    // Since meaningful progress exists, clicking Medium difficulty opens confirmation modal
    expect(hasMeaningfulProgress(loadGameStateFromStorage()!)).toBe(true);
    fireEvent.click(screen.getByTestId('difficulty-medium'));
    expect(screen.getByTestId('confirm-new-game-modal')).toBeInTheDocument();

    // Cancel confirmation modal to keep playing
    fireEvent.click(screen.getByTestId('cancel-new-game-btn'));
    expect(screen.queryByTestId('confirm-new-game-modal')).toBeNull();

    // Fix (0,1) to '2' via on-screen number pad
    fireEvent.click(screen.getByTestId('numpad-2'));
    expect(cell01).toHaveAttribute('data-conflict', 'false');

    // Select remaining empty cell (0,4) and click Hint to complete the board
    fireEvent.click(screen.getByTestId('cell-0-4'));
    fireEvent.click(screen.getByTestId('hint-btn'));

    // Completion dialog appears with time, difficulty, hints used, and Play Again
    expect(screen.getByTestId('completion-modal')).toBeInTheDocument();
    expect(screen.getByTestId('completion-difficulty')).toHaveTextContent('Easy');
    expect(screen.getByTestId('completion-hints')).toHaveTextContent('1');
    expect(screen.getByTestId('play-again-btn')).toBeInTheDocument();

    // Theme toggle switches between light and dark and saves to localStorage
    const themeBtn = screen.getByTestId('theme-toggle');
    fireEvent.click(themeBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(STORAGE_KEY_THEME)).toBe('dark');
  });
});
