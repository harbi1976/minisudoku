# Mini Sudoku 6×6

A complete, responsive client-side 6×6 Mini Sudoku web application built with React, TypeScript, and Vite.

## Play Online

- **Live Game (GitHub Pages):** [https://harbi1976.github.io/minisudoku/](https://harbi1976.github.io/minisudoku/)
- **GitHub Repository:** [https://github.com/harbi1976/minisudoku](https://github.com/harbi1976/minisudoku)

## Local Preview Address

- **Development Server:** `http://localhost:5173`

## Quick Start Commands

```bash
# Install dependencies
npm install

# Start the local development server on http://localhost:5173
npm run dev

# Run the automated unit & UI test suite
npm test

# Type-check and build the production bundle
npm run build

# Preview the production build locally
npm run preview
```

## Features & Rules

- **6×6 Mini Sudoku Board:** Uses digits `1–6`. Every row, column, and 2-row × 3-column box contains each digit `1–6` exactly once, with strong 3px borders delineating the six 2×3 boxes.
- **Unique-Solution Generator & Solver:** Every generated puzzle is verified by a Minimum Remaining Values (MRV) backtracking solver to have **exactly one solution**. Live generation attempts are bounded so puzzle creation never hangs, with a validated fallback that applies structure-preserving 6×6 Sudoku isomorphisms (digit relabeling, band/row permutations, stack/column permutations) to solver-verified canonical puzzles.
- **Solving-Technique Difficulty Rubric:**
  - **Easy (16–20 clues):** Solvable strictly using **Full Houses** (last empty cell in a row, column, or 2×3 box) and **Naked Singles** (cells with only one legal candidate by direct peer elimination). Never requires Hidden Singles or candidate elimination.
  - **Medium (12–15 clues):** Requires **Hidden Singles** (at least one wave where zero Naked Singles exist on the board, requiring scanning a row, column, or 2×3 box for a digit with only one valid position).
  - **Hard (9–12 clues):** Requires **Candidate Elimination** techniques (**Locked Candidates**: Pointing Pairs/Triples & Box/Line Reduction, **Naked Pairs**, or **Hidden Pairs**) when both Naked and Hidden Singles are exhausted, or multi-wave Hidden Single bottlenecks starting with zero initial Naked Singles.
  - **Random:** Chooses with equal probability (`1/3` each) among Easy, Medium, and Hard on every new game and displays the resulting difficulty.
- **Smart Hints & Pencil Notes:**
  - **Hint (Lightbulb icon):** If any incorrect player entries exist on the board, identifies and corrects one first. Otherwise, reveals the true value in the selected empty cell (or the first empty cell if none is selected). Never modifies original clues, tracks hints used, and visually marks hinted entries (`★` badge + distinct styling).
  - **Notes (Pencil icon):** Obvious `ON`/`OFF` toggle badge. In Notes mode, selecting `1–6` adds or removes candidates in fixed miniature 2×3 positions inside the selected empty cell. Notes never count as completed values, and entering a final digit automatically clears that cell's notes.
- **Controls, Accessibility & Persistence:**
  - Supports touch, mouse, and keyboard (`1–6`, `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`, `Backspace`/`Delete`, `N` for Notes, `Z` for Undo).
  - Highlights the selected cell, related row/column/2×3 box, and matching digits.
  - Indicates conflicting entries with both color and non-color cues (`!` conflict badge, wavy underline, dashed border, and `aria-invalid="true"`).
  - Light and Dark themes with a Sun/Moon toggle, initialized from `prefers-color-scheme` and persisted in `localStorage`.
  - Preserves puzzle, player entries, notes, hints used, elapsed time, difficulty, and theme across page refreshes.

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
