import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HandManager } from '../scripts/hand-manager.js';

function setup() {
    const frames = [];
    globalThis.window = { requestAnimationFrame: callback => frames.push(callback) };
    globalThis.document = {
        createDocumentFragment: () => ({
            children: [],
            appendChild(card) { this.children.push(card); }
        })
    };

    const item = {
        id: 'weapon', name: 'Sword', type: 'weapon',
        system: { equipped: true, description: 'Old description', damage: '1d6' }
    };
    const actor = { id: 'character', type: 'character', system: {}, items: [item] };
    class Manager extends HandManager {
        static actor = actor;
        static getHandActor() { return this.actor; }
        static getSetting(key) { return key === this.SETTING_ENABLED || key === this.SETTING_SHOW_WEAPONS; }
        static get currentTemplate() { return {}; }
        static translate(key) { return key; }
        static escapeHtml(value) { return value; }
        static createCardElement(item) { return structuredClone(item); }
        static applyCardFanLayout() {}
        static fitCardDescriptions() {}
        static applyHandPosition() {}
        static showHandByY() {}
        static startAutoHideTimer() {}
    }
    Manager._panel = { classList: { add() {}, remove() {} } };
    Manager._container = {
        children: [],
        replaceChildren(fragment) { this.children = fragment?.children ?? []; },
        insertAdjacentHTML(_, html) { this.message = html; }
    };
    return { Manager, item, actor, flush: () => { while (frames.length) frames.shift()(); } };
}

test('refresh displays changed item data when its id and name stay the same', () => {
    const { Manager, item, flush } = setup();
    Manager.refreshHand();
    flush();
    item.system.description = 'Updated description';
    item.system.damage = '2d6';
    Manager.refreshHand();
    flush();
    assert.equal(Manager._container.children[0].system.description, 'Updated description');
    assert.equal(Manager._container.children[0].system.damage, '2d6');
});

test('a pending render cannot restore a card deleted before the next frame', () => {
    const { Manager, actor, flush } = setup();
    Manager.refreshHand();
    actor.items = [];
    Manager.refreshHand();
    flush();
    assert.deepEqual(Manager._container.children, []);
    assert.match(Manager._container.message, /NO_ITEMS/);
});

test('a pending render cannot populate a hand after the actor is cleared', () => {
    const { Manager, flush } = setup();
    Manager.refreshHand();
    Manager.actor = null;
    Manager.refreshHand();
    flush();
    assert.deepEqual(Manager._container.children, []);
    assert.equal(Manager._currentActor, null);
});

test('only the newest queued render populates the hand', () => {
    const { Manager, actor, item, flush } = setup();
    Manager.refreshHand();
    actor.items = [{ ...item, id: 'replacement', name: 'Axe' }];
    Manager.refreshHand();
    flush();
    assert.equal(Manager._container.children.length, 1);
    assert.equal(Manager._container.children[0].id, 'replacement');
});
