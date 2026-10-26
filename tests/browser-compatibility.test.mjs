// Optional integration check: set PLAYWRIGHT_PACKAGE and DAGGERHEART_SYSTEM_PATH.
// Runs against the installed system stylesheet without starting or modifying a world.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const enabled = process.env.PLAYWRIGHT_PACKAGE && process.env.DAGGERHEART_SYSTEM_PATH;
test('both templates coexist with Daggerheart CSS and preserve hand interactions', { skip: !enabled }, async () => {
    const require = createRequire(import.meta.url);
    const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE);
    const root = fileURLToPath(new URL('../', import.meta.url));
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.avif': 'image/avif', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
    const server = createServer(async (req, res) => {
        const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (url === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end('<!doctype html><link rel="stylesheet" href="/systems/daggerheart/styles/daggerheart.css"><link rel="stylesheet" href="/modules/hand/styles/dnd.css"><style>body{margin:0;background:#777} *{box-sizing:border-box}</style><div class="dh-card" id="system-card">System card</div>');
            return;
        }
        const prefix = '/systems/daggerheart/';
        const base = url.startsWith(prefix) ? process.env.DAGGERHEART_SYSTEM_PATH : root;
        const relative = url.startsWith(prefix) ? url.slice(prefix.length) : url.replace(/^\/modules\/[^/]+\//, '');
        const target = path.resolve(base, relative);
        if (!target.startsWith(path.resolve(base) + path.sep)) { res.writeHead(403).end(); return; }
        try { res.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream'); res.end(await readFile(target)); }
        catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(async () => {
            const translations = {
                'TYPES.Item.weapon': 'Оружие', 'TYPES.Item.feature': 'Свойство',
                'DAGGERHEART.CONFIG.DomainCardTypes.ability': 'Способность',
                'DAGGERHEART.CONFIG.DomainCardTypes.spell': 'Заклинание',
                'DAGGERHEART.CONFIG.Range.melee.short': 'Вплотную',
                'DAGGERHEART.GENERAL.range': 'Дистанция'
            };
            window.settings = { handEnabled: true, cardTemplate: 'default', handScale: 1, handWidthPx: 800,
                bottom: 15, arcAngle: 0, expandedHandHeightPx: 0, collapsedHandHeightPx: 24, cardHoverScale: 2.2, autoHideSeconds: 0,
                showWeapons: true, showDomainCards: true, showFeatures: true, filterEquipped: true };
            window.game = {
                settings: { get: (_, key) => settings[key] },
                i18n: { has: () => true, localize: key => translations[key] ?? key },
                modules: { get: () => ({ active: true }) },
                user: { getFlag: () => ({ left: window.savedLeft ?? 640 }), setFlag: async (_, key, data) => { window.savedLeft = data.left; } }
            };
            window.foundry = { dice: { Roll: { replaceFormulaData: (formula, data) => formula.replace('@prof', data.prof) } } };
            window.CONFIG = { DH: { GENERAL: { damageTypes: { physical: { label: 'Физический' } } },
                ITEM: { allWeaponFeatures: () => ({ sharp: { label: 'Острое', description: 'Добавляет урон.' } }) } } };
            const img = '/systems/daggerheart/assets/icons/domains/domain-card/blade.png';
            const items = [
                { id: 'weapon', name: 'Катана', type: 'weapon', img, system: { equipped: true, description: '',
                    itemFeatures: { sharp: { value: 'sharp' } }, attack: { range: 'melee', damage: { main: {
                        value: { getFormula: () => '@prof' + 'd8 + 2' }, type: new Set(['physical']) } } } } },
                { id: 'domain', name: 'Отбрасывающий удар', type: 'domainCard', img, system: { level: 1, recallCost: 0, domain: 'valor', type: 'ability',
                    description: '<p>Совершите атаку вашим основным оружием по цели, находящейся вплотную. При успехе вы наносите урон и отталкиваете цель на среднюю дистанцию. При успехе с Надеждой добавьте <strong>6</strong> к броску урона.</p><p>Кроме того, вы можете <strong>потратить Надежду</strong>, чтобы в дополнение к этому временно сделать цель <em>уязвимой</em>.</p>' } },
                { id: 'long', name: 'Очень длинное название способности в несколько строк', type: 'feature', img,
                    system: { actionsList: [{}], description: '<p>Совершите атаку вашим основным оружием по цели, находящейся вплотную. При успехе вы наносите урон и отталкиваете цель на среднюю дистанцию. При успехе с Надеждой добавьте <strong>6</strong> к броску урона. Кроме того, вы можете <strong>потратить Надежду</strong>, чтобы временно сделать цель <em>уязвимой</em>.</p>'.repeat(4) } }
            ];
            items.push({ id: 'healing', name: 'Исцеляющее касание', type: 'domainCard', img,
                system: { level: 1, recallCost: 1, domain: 'splendor', type: 'spell', description:
                    '<p>Вы кладёте руки на существо и направляете целительную магию, чтобы исцелить его увечья. Когда у вас есть несколько минут на уединение и концентрацию на цели, вы можете <strong>потратить 2 Надежды</strong>, чтобы очистить Рану или Стресс у цели.</p><p>Один раз до следующего продолжительного отдыха, когда вы потратите это время на исцеление, вы можете дополнительно очистить у цели ещё одну Рану или Стресс.</p>' } });
            const actor = { id: 'actor', type: 'character', items, system: {}, getRollData: () => ({ prof: 3 }) };
            items.forEach(item => { item.actor = actor; });
            items[0].system.getEnrichedDescription = async config => {
                if (config.gmNotes !== false || config.type !== 'embed') throw Error('Incorrect enrichment options');
                return '<p><strong>Острое:</strong> Добавляет урон.</p>';
            };
            items[2].system.getEnrichedDescription = async () => {
                await new Promise(resolve => setTimeout(resolve, 25));
                return items[2].system.description + '<p><strong>Дополнительное правило:</strong> в конце хода восстановите Надежду.</p>';
            };
            window.canvas = { tokens: { controlled: [{ actor }] } };
            window.systemBefore = getComputedStyle(document.querySelector('#system-card')).width;
            const { HandManager } = await import('/modules/hand/scripts/hand-manager.js');
            await import('/modules/hand/templates/default/default-template.js');
            await import('/modules/hand/templates/improved/improved-template.js');
            window.manager = HandManager;
            manager.refreshHand();
        });
        await page.waitForSelector('.dh-hand-card');
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('.damage-formula').innerText(), '3d8 + 2');
        assert.match(await page.locator('[data-item-id="weapon"] [data-card-description]').innerText(), /Острое/);
        assert.equal(await page.locator('[data-item-id="domain"] .dhc-recall-text').innerText(), '0');
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#system-card')).width), await page.evaluate(() => window.systemBefore));
        assert.equal(await page.locator('#daggerheart-hand .dh-card').count(), 0);

        const before = await page.locator('.hand-wrapper').boundingBox();
        // Use the unobscured top strip of the background to drag the entire hand.
        const handle = await page.locator('#dh-hand-drag-target').boundingBox();
        await page.mouse.move(handle.x + 10, handle.y + 3);
        await page.mouse.down();
        await page.mouse.move(handle.x + 10, handle.y + 3);
        await page.mouse.up();
        const after = await page.locator('.hand-wrapper').boundingBox();
        assert.ok(Math.abs(before.x - after.x) < 1, 'opening/restoring and starting a drag must agree about the center');
        await page.mouse.move(handle.x + 10, handle.y + 3);
        await page.mouse.down();
        await page.mouse.move(handle.x + 90, handle.y + 3);
        await page.mouse.up();
        await page.evaluate(() => manager.rebuildPanel());
        await page.waitForSelector('.dh-hand-card');
        const restored = await page.locator('.hand-wrapper').boundingBox();
        assert.ok(Math.abs(restored.x - before.x - 80) < 1, 'saved drag center survives rebuilding the panel');

        await page.evaluate(() => { settings.expandedHandHeightPx = 120; manager.applyStyles(); });
        const lifted = await page.locator('.hand-wrapper').boundingBox();
        assert.ok(Math.abs(lifted.y - restored.y + 120) < 1, 'height setting raises the entire hand');
        await page.evaluate(() => { settings.collapsedHandHeightPx = 40; manager.applyStyles(); manager.hideHandByY(); });
        await page.waitForFunction(() => Math.abs(document.querySelector('[data-item-id="weapon"] .dh-card-scaler').getBoundingClientRect().top - innerHeight + 40) < 1);
        assert.equal(await page.evaluate(() => manager._isCollapsed), true);
        await page.evaluate(() => { settings.expandedHandHeightPx = 200; manager.applyStyles(); });
        await page.waitForFunction(() => Math.abs(document.querySelector('[data-item-id="weapon"] .dh-card-scaler').getBoundingClientRect().top - innerHeight + 40) < 1);
        await page.evaluate(() => { settings.collapsedHandHeightPx = 72; manager.applyStyles(); manager.refreshHand(); });
        await page.waitForFunction(() => manager._isCollapsed && Math.abs(document.querySelector('[data-item-id="weapon"] .dh-card-scaler').getBoundingClientRect().top - innerHeight + 72) < 1);
        await page.screenshot({ path: path.join(os.tmpdir(), 'daggerheart-hand-collapsed.png') });
        const collapsedCard = await page.locator('[data-item-id="weapon"]').boundingBox();
        await page.mouse.move(collapsedCard.x + collapsedCard.width / 2, 790);
        await page.waitForFunction(() => !manager._isCollapsed && Math.abs(document.querySelector('.hand-wrapper').getBoundingClientRect().y - 349) < 1);
        await page.mouse.move(1200, 50);
        await page.evaluate(() => { settings.collapsedHandHeightPx = 0; manager.applyStyles(); manager.toggleHand(); });
        await page.waitForFunction(() => manager._isCollapsed && Math.abs(document.querySelector('[data-item-id="weapon"] .dh-card-scaler').getBoundingClientRect().top - innerHeight) < 1);
        await page.mouse.move(collapsedCard.x + collapsedCard.width / 2, 796);
        await page.waitForFunction(() => !manager._isCollapsed);
        await page.mouse.move(1200, 50);
        await page.evaluate(() => { settings.collapsedHandHeightPx = 24; settings.autoHideSeconds = 0.05; manager.applyStyles(); manager.startAutoHideTimer(); });
        await page.waitForFunction(() => manager._isCollapsed);
        await page.evaluate(() => { settings.autoHideSeconds = 0; manager.toggleHand(); });
        assert.equal(await page.evaluate(() => manager._isCollapsed), false);
        await page.evaluate(() => { settings.expandedHandHeightPx = 0; manager.applyStyles(); manager.showHandByY(); });
        await page.locator('[data-item-id="domain"]').focus();
        await page.waitForFunction(() => document.querySelector('[data-item-id="domain"] .dh-card-scaler').getBoundingClientRect().height > 485);
        const preview = await page.locator('[data-item-id="domain"] .dh-card-scaler').boundingBox();
        assert.ok(preview.y >= 0 && preview.height >= 485);
        await page.screenshot({ path: path.join(os.tmpdir(), 'daggerheart-hand-default.png') });

        for (const template of ['default', 'improved']) {
            await page.evaluate(template => { settings.cardTemplate = template; manager.rebuildPanel(); }, template);
            await page.waitForSelector('.dh-hand-card');
            await page.locator('[data-item-id="domain"]').focus();
            await page.evaluate(() => { settings.cardHoverScale = 1; manager.applyStyles(); });
            await page.waitForFunction(() => Math.abs(document.querySelector('[data-item-id="domain"] .dh-card-scaler').getBoundingClientRect().height - 224) < 1);
            await page.evaluate(() => { settings.cardHoverScale = 1.5; manager.applyStyles(); });
            await page.waitForFunction(() => Math.abs(document.querySelector('[data-item-id="domain"] .dh-card-scaler').getBoundingClientRect().height - 336) < 1);
            await page.evaluate(() => { settings.handScale = 1.5; manager.applyStyles(); });
            await page.waitForFunction(() => Math.abs(document.querySelector('[data-item-id="domain"] .dh-card-scaler').getBoundingClientRect().height - 504) < 1);
            await page.evaluate(() => { settings.handScale = 1; settings.expandedHandHeightPx = 200; settings.cardHoverScale = 4; manager.applyStyles(); });
            await page.waitForFunction(() => { const box = document.querySelector('[data-item-id="domain"] .dh-card-scaler').getBoundingClientRect(); return box.y >= 19 && box.height > 500 && box.height < 550; });
            await page.evaluate(() => { settings.expandedHandHeightPx = 0; settings.cardHoverScale = 2.2; manager.applyStyles(); });
            const text = page.locator('[data-item-id="long"] [data-card-description]');
            await page.locator('[data-item-id="long"]').focus();
            await page.waitForFunction(() => document.querySelector('[data-item-id="long"] .dh-card-scaler').getBoundingClientRect().height > 485);
            assert.equal(await text.evaluate(el => getComputedStyle(el).overflowY), 'hidden');
            assert.ok(await text.evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth));
            assert.ok(await text.evaluate(el => parseFloat(getComputedStyle(el).fontSize) < 14));
            const healing = page.locator('[data-item-id="healing"] [data-card-description]');
            assert.ok(await healing.evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth));
            assert.ok(await healing.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 9));
            const divider = page.locator('[data-item-id="long"] .dhc-strip-wrap, [data-item-id="long"] .divider-container');
            const cardBounds = await page.locator('[data-item-id="long"] .dh-card-scaler').boundingBox();
            const dividerBounds = await divider.boundingBox();
            assert.ok(Math.abs(cardBounds.x - dividerBounds.x) < 1 && Math.abs(cardBounds.width - dividerBounds.width) < 1, 'divider spans the entire card');
            await page.screenshot({ path: path.join(os.tmpdir(), `daggerheart-hand-${template}-long.png`) });

            // Drag from rules text, including a nested <strong>, without selecting it.
            await page.evaluate(() => { manager.useItem = item => { window.playedItem = item.id; }; window.playedItem = null; });
            const textBounds = await text.locator('strong').first().boundingBox();
            const x = textBounds.x + textBounds.width / 2;
            const y = textBounds.y + textBounds.height / 2;
            await page.mouse.move(x, y);
            await page.mouse.down();
            assert.ok(await page.locator('[data-item-id="long"]').evaluate(el => el.classList.contains('dragging')));
            await page.mouse.move(x + 10, y - 125, { steps: 5 });
            assert.equal(await page.evaluate(() => getSelection().toString()), '');
            await page.mouse.up();
            assert.equal(await page.evaluate(() => window.playedItem), 'long');
            await page.mouse.move(1200, 50);
            await page.locator('[data-item-id="healing"]').focus();
            await page.waitForFunction(() => document.querySelector('[data-item-id="healing"] .dh-card-scaler').getBoundingClientRect().height > 485);
            await page.screenshot({ path: path.join(os.tmpdir(), `daggerheart-hand-${template}-healing.png`) });
        }
        await page.evaluate(() => { settings.handScale = 2; settings.expandedHandHeightPx = 500; manager.applyStyles(); });
        await page.waitForFunction(() => document.querySelector('.hand-wrapper').getBoundingClientRect().width <= innerWidth);
        const scaled = await page.locator('.hand-wrapper').boundingBox();
        assert.ok(scaled.y >= 0 && scaled.width <= 1280, 'large scale and lift keep the hand within the viewport');
        assert.deepEqual(errors, []);
        console.log(`Screenshots: ${path.join(os.tmpdir(), 'daggerheart-hand-*.png')}`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
