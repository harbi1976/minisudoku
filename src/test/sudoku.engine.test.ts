import { describe, it, expect } from 'vitest';
import {
  GRID_SIZE,
  BOX_ROWS,
  BOX_COLS,
  generatePuzzle,
  hasUniqueSolution,
  isBoardCompleteAndValid,
  analyzePuzzleDifficulty,
  findConflicts,
  applyRandomIsomorphism,
  resolveDifficultySelection,
  DIFFICULTY_RUBRIC,
} from '../engine/sudoku';

describe('6x6 Sudoku Engine & Difficulty Rubric', () => {
  it('defines a 6x6 board with 2x3 boxes and documented difficulty rubric', () => {
    expect(GRID_SIZE).toBe(6);
    expect(BOX_ROWS).toBe(2);
    expect(BOX_COLS).toBe(3);
    expect(DIFFICULTY_RUBRIC.easy.requiredTechniques.length).toBeGreaterThan(0);
    expect(DIFFICULTY_RUBRIC.medium.requiredTechniques).toContain('Hidden Single');
    expect(DIFFICULTY_RUBRIC.hard.requiredTechniques.join(' ')).toMatch(/Locked Candidates/i);
  });

  it('generates valid, uniquely solvable puzzles across Easy, Medium, and Hard with distinct technique profiles', () => {
    for (const diff of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 5; i++) {
        const generated = generatePuzzle(diff, { maxAttempts: 15 });
        expect(generated.difficulty).toBe(diff);
        expect(hasUniqueSolution(generated.puzzle)).toBe(true);
        expect(isBoardCompleteAndValid(generated.solution)).toBe(true);
        expect(generated.analysis.uniqueSolution).toBe(true);
        expect(generated.analysis.difficulty).toBe(diff);

        if (diff === 'easy') {
          expect(generated.analysis.hiddenSinglesUsed).toBe(0);
          expect(generated.analysis.advancedEliminationsUsed).toBe(0);
        } else if (diff === 'medium') {
          expect(generated.analysis.hiddenSinglesUsed).toBeGreaterThanOrEqual(1);
          expect(generated.analysis.advancedEliminationsUsed).toBe(0);
        } else if (diff === 'hard') {
          const isHardByElimination = generated.analysis.advancedEliminationsUsed >= 1;
          const isHardByBottleneck =
            generated.analysis.hiddenSinglesUsed >= 2 &&
            generated.analysis.initialNakedSingles === 0;
          expect(isHardByElimination || isHardByBottleneck).toBe(true);
        }
      }
    }
  });

  it('guarantees fallback puzzles are valid, unique, varied, and match target difficulty', () => {
    for (const diff of ['easy', 'medium', 'hard'] as const) {
      // Force fallback by using a minimal maxAttempts or checking isomorphic templates
      const gen1 = generatePuzzle(diff, { maxAttempts: 1, rng: () => 0.1 });
      const gen2 = generatePuzzle(diff, { maxAttempts: 1, rng: () => 0.8 });
      expect(hasUniqueSolution(gen1.puzzle)).toBe(true);
      expect(hasUniqueSolution(gen2.puzzle)).toBe(true);
      expect(gen1.analysis.difficulty).toBe(diff);
      expect(gen2.analysis.difficulty).toBe(diff);
      expect(JSON.stringify(gen1.puzzle)).not.toEqual(JSON.stringify(gen2.puzzle));
    }
  });

  it('chooses equally among Easy, Medium, and Hard for Random mode', () => {
    expect(resolveDifficultySelection('random', () => 0.05)).toBe('easy');
    expect(resolveDifficultySelection('random', () => 0.5)).toBe('medium');
    expect(resolveDifficultySelection('random', () => 0.95)).toBe('hard');
  });

  it('detects row, column, and 2x3 box conflicts accurately', () => {
    const empty = Array.from({ length: 6 }, () => Array(6).fill(0));
    empty[0][0] = 4;
    empty[1][2] = 4; // Same top-left 2x3 box
    const conflicts = findConflicts(empty);
    expect(conflicts[0][0]).toBe(true);
    expect(conflicts[1][2]).toBe(true);
    expect(conflicts[0][1]).toBe(false);
  });

  it('preserves solution uniqueness and difficulty under random isomorphism', () => {
    const base = generatePuzzle('medium');
    const iso = applyRandomIsomorphism(base.puzzle);
    expect(hasUniqueSolution(iso)).toBe(true);
    expect(analyzePuzzleDifficulty(iso).difficulty).toBe('medium');
  });
});
