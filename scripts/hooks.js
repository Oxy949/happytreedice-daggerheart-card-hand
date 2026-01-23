import { HandManager } from './hand-manager.js';

/**
 * Registers all Foundry VTT Hooks.
 * Separated from main logic for cleaner architecture.
 */
export function registerHooks() {
    Hooks.once('i18nInit', () => {
        HandManager.registerSettings();
    });

    Hooks.once('ready', () => {
        HandManager.createHandPanel();
        setupRuntimeHooks();
        HandManager.restorePosition();

        if (canvas.tokens?.controlled.length) {
            HandManager.refreshHand();
        }
    });
}

function setupRuntimeHooks() {
    Hooks.on("controlToken", () => {
        const controlled = canvas.tokens?.controlled || [];
        if (controlled.length === 0) {
            if (HandManager._currentActor) {
                HandManager._currentActor = null;
                HandManager.refreshHandDebounced();
            }
            return;
        }

        const actor = controlled[0].actor;
        if (actor && HandManager._currentActor && actor.id === HandManager._currentActor.id) {
            // Same actor still controlled — avoid unnecessary refresh
            return;
        }
        HandManager.refreshHandDebounced();
    });

    Hooks.on("updateActor", (actor) => {
        if (HandManager._currentActor && actor.id === HandManager._currentActor.id) {
            // Using debounced refresh for performance
            HandManager.refreshHandDebounced();
        }
    });

    const refreshIfCurrent = (item) => {
        if (item.parent?.id === HandManager._currentActor?.id) {
            HandManager.refreshHandDebounced();
        }
    };

    Hooks.on("createItem", refreshIfCurrent);
    Hooks.on("deleteItem", refreshIfCurrent);
    Hooks.on("updateItem", refreshIfCurrent);

    Hooks.on("dropCanvasData", (canvas, data) => {
        if (data.type !== "Item" || !data.uuid) return;
        fromUuid(data.uuid).then(item => {
            if (!item) return;
            if (HandManager._currentActor && item.parent?.id === HandManager._currentActor.id) {
                HandManager.useItem(item);
            }
        });
    });

    // Register keyboard shortcut for toggling the hand panel
    Hooks.on("hotbarDrop", () => {
        // Hotbar already handles default key bindings
    });

    // Listen for keyboard events to toggle hand
    document.addEventListener('keydown', (event) => {
        // Check if Alt+H is pressed (configurable via keybinds)
        if ((event.altKey || event.ctrlKey) && event.code === 'KeyH') {
            event.preventDefault();
            HandManager.toggleHand();
        }
    });
}