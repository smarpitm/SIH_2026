# PRAMANAM — Accessibility & WCAG Compliance Basics

## Core Standards Applied (WCAG 2.1 AA)

### 1. Color Contrast & Visuals
* Minimum contrast ratio of **4.5:1** for standard text and **3:1** for UI components.
* Colors are not used as the sole indicator for status; icons and text labels accompany all alerts.

### 2. Keyboard Navigation
* All interactive elements (`<button>`, `<a>`, inputs) are fully accessible via `Tab` / `Shift + Tab`.
* Visible focus indicators are active across all themes.

### 3. Screen Reader Support & ARIA
* Semantic HTML5 elements (`<main>`, `<nav>`, `<header>`) used throughout.
* Dynamic translation updates announced using `aria-live="polite"` regions.

### 4. Internationalization Accessibility
* `html lang` attribute dynamically updates based on language selection (`en` or `hi`).