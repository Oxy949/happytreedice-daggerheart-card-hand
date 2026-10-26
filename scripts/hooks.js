import { HandManager } from './hand-manager.js';
import { MODULE_ID, REGISTER_HOOK } from './registry.js';

/**
 * Registers all Foundry VTT Hooks.
 * Separated from main logic for cleaner architecture.
 */
export function registerHooks() {
    Hooks.once('i18nInit', () => {
        // Let external modules register their card templates before the
        // settings dropdown is built. Listeners must be attached during "init".
        const api = game.modules.get(MODULE_ID)?.api;
        Hooks.callAll(REGISTER_HOOK, api);

        HandManager.registerSettings();
    });

    Hooks.once('ready', () => {
        HandManager.createHandPanel();
        setupRuntimeHooks();

        if (HandManager.getHandActor()) {
            HandManager.refreshHand();
        }
    });
}

function setupRuntimeHooks() {
    window.addEventListener('resize', () => HandManager.applyStyles());
    Hooks.on("controlToken", () => {
        const actor = HandManager.getHandActor();
        if (!actor) {
            if (HandManager._currentActor) {
                HandManager._currentActor = null;
                HandManager.refreshHandDebounced();
            }
            return;
        }

        if (actor && HandManager._currentActor && actor.id === HandManager._currentActor.id) {
            // Same actor still controlled — avoid unnecessary refresh
            return;
        }
        HandManager.refreshHandDebounced();
    });

    Hooks.on("updateUser", (user, changes = {}) => {
        if (user.id === game.user.id && Object.prototype.hasOwnProperty.call(changes, "character")) {
            HandManager.refreshHandDebounced();
        }
    });

    Hooks.on('updateActor', (actor) => {
        if (HandManager._currentActor && actor.id === HandManager._currentActor.id) {
            HandManager.refreshHandDebounced();
        }
    });

    const refreshIfCurrent = (item) => {
        if (item.parent?.id === HandManager._currentActor?.id) {
            HandManager.refreshHandDebounced();
        }
    };

    Hooks.on('createItem', refreshIfCurrent);
    Hooks.on('deleteItem', refreshIfCurrent);
    Hooks.on('updateItem', refreshIfCurrent);

    Hooks.on('dropCanvasData', (canvas, data) => {
        if (data.type !== 'Item' || !data.uuid) return;
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
