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
    globalThis.foundry = { dice: { Roll: { replaceFormulaData: (formula, data) => formula.replace('@prof', data.prof) } } };
}

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

test('auto-hide includes the configured lift and actual scaled panel height', () => {
    class Manager extends HandManager {}
    Manager._activeCardDrags = 0;
    Manager._panel = { style: { bottom: '120px' }, querySelector: () => ({ getBoundingClientRect: () => ({ height: 500 }) }) };
    Manager.setPanelYOffset = y => { Manager.y = y; };
    Manager.hideHandByY();
    assert.equal(Manager.y, 644);
});
