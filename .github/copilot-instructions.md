# Copilot / AI Agent Instructions

Purpose: Help an AI coding agent be immediately productive in this Foundry VTT module.

- **Big picture**: This is a client-side Foundry VTT module (see [module.json](module.json#L1)). The module exposes a single ES module entry: `scripts/main.js`, which imports templates and registers runtime hooks. The UI/feature surface is centered on `HandManager` (`scripts/hand-manager.js`), which manages settings, DOM rendering, and interactions. Templates register themselves into a central `TemplateRegistry` (`scripts/registry.js`). Drag behaviors live in `scripts/dnd.js`.

- **Major components & boundaries**:
  - `scripts/main.js`: module entry; calls `registerHooks()`.
  - `scripts/hooks.js`: wires Foundry Hooks to `HandManager` lifecycle methods and UI events.
  - `scripts/hand-manager.js`: core state, settings, panel creation, rendering orchestration, and item play logic.
  - `scripts/registry.js`: simple Map-based template registry; templates call `registerTemplate(...)` during module import.
  - `templates/*/*-template.js`: template modules that register themselves and inject styles (example: [templates/default/default-template.js](templates/default/default-template.js#L1)).

- **Why this structure**: templates are pluggable and self-registering so changing or adding a template only requires adding an ES module that calls `registerTemplate`. `HandManager` is intentionally static to provide a single shared runtime surface accessed from hooks and templates.

- **Project-specific conventions** (do not assume generic patterns):
  - Module constant: `HandManager.MODULE_NAME` is the single settings namespace used for `game.settings` keys.
  - Settings keys are defined as static props in `HandManager` (e.g. `SETTING_TEMPLATE`, `SETTING_SCALE`). Prefer using these constants when reading/writing settings.
  - Templates must export an object with `id`, `name`, `attachStyles`, `renderPanel`, `renderCard` and must call `registerTemplate(template)` during module import.
  - Asset URLs in templates are referenced relative to the module root (examples in `templates/default/default-template.js` use `modules/happytreedice-daggerheart-card-hand/templates/...`).
  - Localization: use keys like `QUICK_ITEMS.*` and the `languages/*.json` files.

- **Important integration & runtime globals**:
  - Foundry globals used extensively: `Hooks`, `game`, `canvas`, `fromUuid`, `ChatMessage`, `Roll`, `CONFIG`.
  - Module is written for the `daggerheart` system and reads system-specific structures (e.g., `item.system.attack.damage.parts`, `CONFIG.DH`). Be conservative when changing item shape assumptions.

- **Developer workflows (how to test / iterate quickly)**:
  - No build step: code is plain ES modules. Edit files in-place under the module folder and reload the Foundry client (Browser reload / Module toggle) to pick up changes.
  - Open the Foundry client DevTools console to view logs and errors. Search for the `Quick Items Daggerheart |` log prefix used in `registry.js` and templates.
  - To add a template: create `templates/<name>/<name>-template.js` that calls `registerTemplate(...)` on import and ensure it is imported from `scripts/main.js` (main.js explicitly imports `templates/default/...` and `templates/improved/...`).
  - When you change image assets or CSS, confirm paths used in templates match `modules/happytreedice-daggerheart-card-hand/templates/...`.

- **Patterns & examples to copy**:
  - Register settings: `game.settings.register(HandManager.MODULE_NAME, HandManager.SETTING_ENABLED, { ... })` (see `scripts/hand-manager.js`).
  - Template registration: `registerTemplate(DefaultTemplate)` (see [templates/default/default-template.js](templates/default/default-template.js#L1)).
  - Hook wiring: `Hooks.once('ready', () => { HandManager.createHandPanel(); ... })` (see `scripts/hooks.js`).

- **What to avoid / be careful about**:
  - Do not assume Node APIs or bundlers—code runs in the Foundry browser environment.
  - Modifying settings names or `HandManager.MODULE_NAME` will break persisted client settings—rename cautiously and provide migration when possible.
  - Many helper routines assume the Daggerheart system data model; changing them requires validating against actor/item documents from that system.

- **Release notes & manifest**:
  - Update `module.json` version and `manifest`/`download` URLs when preparing releases.

If any part is unclear or you want the agent to expand examples (e.g., add a new template, change settings, or migrate to a build step), tell me which area to expand and I will update this file.
