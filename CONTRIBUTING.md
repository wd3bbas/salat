# Contributing to salah-cli

JazakAllah khayran for your interest in contributing! All contributions are welcome —
bug reports, feature suggestions, code, documentation, and translations.

---

## Getting Started

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/salat.git
cd salat

# 2. Install dependencies
npm install

# 3. Run the tool locally
node apps.js

# 4. Run the test suite — all 34 tests should pass
npm test
```

---

## Project Structure

```
salat/
├── apps.js              # CLI entry point — all modes and display logic
├── func.js              # Pure utility functions (date, cache, config, offsets)
├── tests/
│   └── func.test.js     # Jest unit tests for func.js
├── .github/
│   └── workflows/
│       └── test.yml     # CI — runs tests on Node 18, 20, 22
├── .env                 # Local config (not committed)
└── package.json
```

**Rule of thumb:** pure, side-effect-free logic belongs in `func.js` where it can be
unit-tested. Display, API calls, and CLI wiring belong in `apps.js`.

---

## Making Changes

1. **Create a branch** off `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Write or update tests** if you're touching `func.js`. New utility functions must
   have test coverage in `tests/func.test.js`.

3. **Run the full suite** before opening a PR:
   ```bash
   npm test
   ```

4. **Keep commits focused** — one logical change per commit.

5. **Open a Pull Request** against `main` with a clear description of what and why.

---

## Types of Contributions

### Bug Reports
Open an issue and include:
- Your OS and Node version (`node --version`)
- The exact command you ran
- The output you got vs. what you expected

### Feature Requests
Open an issue describing the feature and the problem it solves.
Check existing issues first to avoid duplicates.

### Code Contributions
Good first areas to contribute:

| Area | Idea |
|------|------|
| New calculation methods | Surface the `--method` choices more clearly in `--help` |
| Watch mode | Show a live Azan countdown with audio (`afplay` on macOS) |
| i18n | Support additional languages for labels beyond Arabic |
| Tests | Increase coverage for edge cases in `applyOffsets` and `makeProgressBar` |
| Docs | Add an animated GIF to the README showing the tool in action |

### API & Data
Prayer times are fetched from [Aladhan.com](https://aladhan.com/prayer-times-api) —
a free, open API. Geocoding uses [Nominatim](https://nominatim.openstreetmap.org/)
(OpenStreetMap). Please be mindful of their rate limits in any changes you make.

---

## Code Style

- **CommonJS** (`require` / `module.exports`) — the project does not use ESM
- **No TypeScript** for now — plain JavaScript
- **No comments** unless the *why* is genuinely non-obvious
- **No unused dependencies** — keep the install footprint small
- `chalk` must stay on **v4.x** — v5 is ESM-only and incompatible

---

## Running a Specific Test

```bash
npx jest --testNamePattern "applyOffsets"
```

---

## CI

GitHub Actions runs `npm test` on every push and pull request across Node 18, 20,
and 22. PRs must pass CI before merging.

---

## Questions?

Open an issue or start a Discussion on the GitHub repo. We're happy to help.
