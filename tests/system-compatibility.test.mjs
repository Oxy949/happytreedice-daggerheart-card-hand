import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HandManager } from '../scripts/hand-manager.js';
import { SmoothDnD } from '../scripts/dnd.js';

function setup() {
    globalThis.game = {
        i18n: { has: () => true, localize: key => key },
        modules: { get: () => ({ active: true }) },
        user: { getFlag: () => ({ left: 640 }) }
    };
    globalThis.CONFIG = { DH: {
        GENERAL: { damageTypes: { physical: { label: 'Physical' }, magic: { label: 'Magic' } } },
        ITEM: { allWeaponFeatures: () => ({ sharp: { label: 'Sharp', description: 'Add damage.' } }) }
    } };
    // Foundry 14 consumes @profd8 as one variable, not @prof followed by a die.
    globalThis.foundry = { dice: { Roll: { replaceFormulaData: (formula, data) => formula.replace(
        /@\{([-.\w]+)\}|@([-.\w]+)/g,
        (match, braced, plain) => String((braced ?? plain).split('.').reduce((value, key) => value?.[key], data) ?? match)
    ) } } };
}

test('expanded height keeps its saved key and registers separate collapse and hover settings', () => {
    setup();
    const registered = new Map();
    game.settings = { register: (_, key, config) => registered.set(key, config) };
    HandManager.registerSettings();
    assert.equal(registered.get('expandedHandHeightPx').default, 0);
    assert.equal(registered.get('collapsedHandHeightPx').default, 24);
    assert.equal(registered.get('cardHoverScale').default, 2.2);
    assert.equal(registered.get('cardHoverScale').range.min, 1);
    assert.equal(registered.get('collapsedHandHeightPx').scope, 'client');
    assert.equal(registered.get('bottom').config, false);
    assert.equal(registered.get('layoutSettingsVersion').config, false);
});

test('legacy padding migrates to expanded height once with the interface scale', async () => {
    setup();
    const settings = { expandedHandHeightPx: 120, bottom: 30, handScale: 1.5, layoutSettingsVersion: 0 };
    game.settings = {
        get: (_, key) => settings[key],
        set: async (_, key, value) => { settings[key] = value; }
    };
    await HandManager.migrateLayoutSettings();
    assert.equal(settings.expandedHandHeightPx, 165);
    assert.equal(settings.layoutSettingsVersion, 1);
    settings.handScale = 2;
    await HandManager.migrateLayoutSettings();
    assert.equal(settings.expandedHandHeightPx, 165);
});

test('zero legacy padding leaves expanded height unchanged', async () => {
    setup();
    const settings = { expandedHandHeightPx: 120, bottom: 0, handScale: 2, layoutSettingsVersion: 0 };
    game.settings = { get: (_, key) => settings[key], set: async (_, key, value) => { settings[key] = value; } };
    await HandManager.migrateLayoutSettings();
    assert.equal(settings.expandedHandHeightPx, 120);
});

test('damage supports 2.11 main, legacy iterable parts, and serialized parts', () => {
    setup();
    const part = { type: new Set(['physical']), value: { getFormula: () => '@prof' + 'd8 + 2' } };
    for (const damage of [{ main: part }, { parts: [part] }, { parts: { hitPoints: part } }]) {
        const item = { system: { attack: { damage } }, actor: { getRollData: () => ({ prof: 3 }) } };
        assert.equal(HandManager._getDamageFormula(item), '3d8 + 2');
        assert.equal(HandManager._getDamageLabels(item), 'Physical');
    }
});

test('raw damage supports custom formulas and negative bonuses', () => {
    setup();
    const item = value => ({ system: { attack: { damage: { main: { value } } } } });
    assert.equal(HandManager._getDamageFormula(item({ custom: { enabled: true, formula: '2d12' } })), '2d12');
    assert.equal(HandManager._getDamageFormula(item({ multiplier: 'flat', flatMultiplier: 2, dice: 'd6', bonus: -3 })), '2d6 - 3');
});

test('adjacent proficiency dice resolve with native Foundry variable parsing and actor fallback', () => {
    setup();
    assert.equal(foundry.dice.Roll.replaceFormulaData('@profd8', { prof: 3 }), '@profd8');
    const actor = { system: { proficiency: 3 }, getRollData: () => ({}) };
    const item = { actor, system: { attack: { damage: { main: { value: { getFormula: () => '@profd8 + 2' } } } } } };
    assert.equal(HandManager._getDamageFormula(item), '3d8 + 2');
    actor.system.proficiency = 4;
    assert.equal(HandManager._getDamageFormula(item), '4d8 + 2');
    item.system.attack.damage.main.value.getFormula = () => '@profd8kh2 + 2';
    assert.equal(HandManager._getDamageFormula(item), '4d8kh2 + 2');
});

test('system action formula and action roll data take precedence', () => {
    setup();
    const item = { actor: { system: { proficiency: 3 } }, getRollData: () => ({ prof: 4 }), system: { attack: {
        getDamageFormula: () => '@profd10 + 2', getRollData: () => ({ prof: 5 })
    } } };
    assert.equal(HandManager._getDamageFormula(item), '5d10 + 2');
});

test('nested custom damage resolves proficiency after looking up item data', () => {
    setup();
    const item = { actor: { system: { proficiency: 3 } }, getRollData: () => ({ item: { damage: '@profd8 + 2' } }),
        system: { attack: { damage: { main: { value: { custom: { enabled: true, formula: '@item.damage' } } } } } } };
    assert.equal(HandManager._getDamageFormula(item), '3d8 + 2');
});

test('weapon descriptions include current and legacy configured features', () => {
    setup();
    for (const features of [{ itemFeatures: { sharp: { value: 'sharp' } } }, { weaponFeatures: [{ value: 'sharp' }] }]) {
        const html = HandManager.getCardDescription({ type: 'weapon', system: { description: '<p>Blade</p>', ...features } });
        assert.match(html, /<strong>Sharp:<\/strong> Add damage/);
        assert.match(html, /<p>Blade<\/p>/);
    }
});

test('adversary standard attacks retain main damage from the installed system', () => {
    setup();
    const damage = { main: { type: ['magic'], value: { getFormula: () => '2d10' } } };
    const actor = { id: 'adversary', system: { attack: { damage } } };
    const attack = HandManager._createAdversaryStandardAttack(actor);
    assert.equal(HandManager._getDamageFormula(attack), '2d10');
    assert.equal(HandManager._getDamageLabels(attack), 'Magic');
});

test('restored center and a click without movement preserve position and vertical lift', () => {
    setup();
    class Manager extends HandManager {}
    const style = { bottom: '120px' };
    Manager._panel = { style };
    Manager.restorePosition();
    assert.equal(style.left, '640px');
    assert.equal(style.transform, 'translateX(-50%)');
    assert.equal(style.bottom, '120px');
    globalThis.window = { innerWidth: 1280, getComputedStyle: () => ({ left: style.left }) };
    globalThis.document = { body: { style: {}, classList: { add() {}, remove() {} } }, addEventListener() {}, removeEventListener() {} };
    const drag = Object.create(SmoothDnD.prototype);
    drag.el = { style, classList: { add() {}, remove() {} } };
    drag.currentX = 99; // A previous drag must not leak into the next one.
    drag._rafId = null;
    drag.onDragStart({ type: 'mousedown', button: 0, clientX: 300, preventDefault() {} });
    drag.onDragEnd({ type: 'mouseup', clientX: 300 });
    assert.equal(style.left, '640px');
    assert.equal(style.transform, 'translateX(-50%)');
    assert.equal(style.bottom, '120px');
});

test('collapsing, opening and dragging share one visibility state', () => {
    class Manager extends HandManager {}
    Manager._activeCardDrags = 0;
    Manager._collapsedYOffset = 320;
    Manager._panel = { classList: { toggle: (_, collapsed) => { Manager.collapsedClass = collapsed; } } };
    Manager.setPanelYOffset = y => { Manager.y = y; };
    Manager.hideHandByY();
    assert.equal(Manager.y, 320);
    assert.equal(Manager._isCollapsed, true);
    assert.equal(Manager.collapsedClass, true);
    Manager.showHandByY();
    assert.equal(Manager.y, 0);
    assert.equal(Manager._isCollapsed, false);
    assert.equal(Manager.collapsedClass, false);
    Manager._activeCardDrags = 1;
    Manager.hideHandByY();
    assert.equal(Manager._isCollapsed, false);
});
