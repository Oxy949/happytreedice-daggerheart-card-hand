import { SmoothDnD, CardSmoothDnD } from './dnd.js';
import { MODULE_ID, getTemplate, getTemplateChoices } from './registry.js';

/**
 * Daggerheart Card Hand Manager
 * Handles UI creation, state management, and interaction logic.
 *
 * FoundryVTT 13/14 compatible: no jQuery, no Application V1 / Dialog V1.
 */
export class HandManager {
    static MODULE_NAME = MODULE_ID;

    static SETTING_ENABLED = 'handEnabled';
    static SETTING_TEMPLATE = 'cardTemplate';
    static SETTING_ARC_ANGLE = 'arcAngle';
    static SETTING_FILTER_EQUIPPED = 'filterEquipped';
    static SETTING_SCALE = 'handScale';
    static SETTING_WIDTH = 'handWidthPx';
    static SETTING_HEIGHT = 'expandedHandHeightPx';
    static SETTING_BOTTOM = 'bottom';
    static SETTING_SHOW_WEAPONS = 'showWeapons';
    static SETTING_SHOW_DOMAIN_CARDS = 'showDomainCards';
    static SETTING_SHOW_FEATURES = 'showFeatures';
    static SETTING_SHOW_CONSUMABLES = 'showConsumables';
    static SETTING_AUTOHIDE = 'autoHideSeconds';
    static SETTING_HIDE_BACKGROUND = 'hideHandBackground';

    static _currentActor = null;
    static _isCollapsed = false;
    static _dndInstance = null;
    static _activeTemplateId = null;

    // Optimization: cache DOM elements
    /** @type {HTMLElement|null} */
    static _panel = null;
    /** @type {HTMLElement|null} */
    static _container = null;
    static _refreshDebounceTimer = null;
    static _renderGeneration = 0;
    static _autoHideTimer = null;
    static _autoHideHandlers = null;
    static _activeCardDrags = 0;

    static getSetting(key) {
        try {
            return game.settings.get(this.MODULE_NAME, key);
        } catch (e) {
            // Fallback values if settings are not registered yet
            const defaults = {
                [this.SETTING_ENABLED]: true,
                [this.SETTING_TEMPLATE]: 'default',
                [this.SETTING_ARC_ANGLE]: 10,
                [this.SETTING_FILTER_EQUIPPED]: true,
                [this.SETTING_SCALE]: 1.0,
                [this.SETTING_WIDTH]: 800,
                [this.SETTING_HEIGHT]: 0,
                [this.SETTING_BOTTOM]: 15,
                [this.SETTING_HIDE_BACKGROUND]: false,
                [this.SETTING_SHOW_WEAPONS]: true,
                [this.SETTING_SHOW_DOMAIN_CARDS]: true,
                [this.SETTING_SHOW_FEATURES]: true,
                [this.SETTING_SHOW_CONSUMABLES]: true,
            };
            return defaults[key];
        }
    }

    static registerSettings() {

        game.settings.register(this.MODULE_NAME, this.SETTING_ENABLED, {
            name: this.translate("SETTINGS.ENABLED_NAME"),
            hint: this.translate("SETTINGS.ENABLED_HINT"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => this.refreshHand()
        });

        game.settings.register(this.MODULE_NAME, this.SETTING_HIDE_BACKGROUND, {
            name: this.translate("SETTINGS.HIDE_BACKGROUND_NAME"),
            hint: this.translate("SETTINGS.HIDE_BACKGROUND_HINT"),
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this.applyStyles()
        });

        game.settings.register(this.MODULE_NAME, this.SETTING_TEMPLATE, {
            name: this.translate("SETTINGS.TEMPLATE_NAME"),
            hint: this.translate("SETTINGS.TEMPLATE_HINT"),
            scope: "client",
            config: true,
            type: String,
            default: "default",
            choices: getTemplateChoices(),
            onChange: () => this.rebuildPanel()
        });

        game.settings.register(this.MODULE_NAME, this.SETTING_ARC_ANGLE, {
            name: this.translate("SETTINGS.ARC_ANGLE_NAME"),
            hint: this.translate("SETTINGS.ARC_ANGLE_HINT"),
            scope: "client",
            config: true,
            type: Number,
            default: 10,
            range: { min: 0, max: 45, step: 1 },
            onChange: () => this.applyCardFanLayout()
        });

        game.settings.register(this.MODULE_NAME, this.SETTING_FILTER_EQUIPPED, {
            name: this.translate("SETTINGS.FILTER_EQUIPPED_NAME"),
            hint: this.translate("SETTINGS.FILTER_EQUIPPED_HINT"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => this.refreshHand()
        });

        game.settings.register(this.MODULE_NAME, this.SETTING_SCALE, {
            name: this.translate("SETTINGS.SCALE_NAME"),
            hint: this.translate("SETTINGS.SCALE_HINT"),
            scope: "client",
            config: true,
            type: Number,
            default: 1.0,
            range: { min: 0.5, max: 2.0, step: 0.1 },
            onChange: () => this.applyStyles()
        });

        game.settings.register(this.MODULE_NAME, this.SETTING_BOTTOM, {
            name: this.translate("SETTINGS.BOTTOM_NAME"),
            hint: this.translate("SETTINGS.BOTTOM_HINT"),
            scope: "client",
            config: true,
            type: Number,
            default: 15,
            range: { min: 0, max: 400, step: 1 },
            onChange: () => this.applyStyles()
        });

        game.settings.register(this.MODULE_NAME, this.SETTING_AUTOHIDE, {
            name: this.translate("SETTINGS.AUTOHIDE_NAME"),
            hint: this.translate("SETTINGS.AUTOHIDE_HINT"),
            scope: "client",
            config: true,
            type: Number,
            default: 3,
            range: { min: 0, max: 120, step: 1 },
            onChange: () => this.refreshHand()
        });

        game.settings.register(this.MODULE_NAME, this.SETTING_WIDTH, {
            name: this.translate("SETTINGS.WIDTH_NAME"),
            hint: this.translate("SETTINGS.WIDTH_HINT"),
            scope: "client",
            config: true,
            type: Number,
            default: 800,
            range: { min: 600, max: 2000, step: 50 },
            onChange: () => {
                this.applyStyles();
                this.applyCardFanLayout();
            }
        });

        game.settings.register(this.MODULE_NAME, this.SETTING_HEIGHT, {
            name: this.translate('SETTINGS.HEIGHT_NAME'),
            hint: this.translate('SETTINGS.HEIGHT_HINT'),
            scope: 'client',
            config: true,
            type: Number,
            default: 0,
            range: { min: 0, max: 500, step: 1 },
            onChange: () => this.applyStyles()
        });

        const types = [
            { id: this.SETTING_SHOW_WEAPONS, name: "SETTINGS.SHOW_WEAPONS_NAME", hint: "SETTINGS.SHOW_WEAPONS_HINT" },
            { id: this.SETTING_SHOW_DOMAIN_CARDS, name: "SETTINGS.SHOW_DOMAIN_CARDS_NAME", hint: "SETTINGS.SHOW_DOMAIN_CARDS_HINT" },
            { id: this.SETTING_SHOW_FEATURES, name: "SETTINGS.SHOW_FEATURES_NAME", hint: "SETTINGS.SHOW_FEATURES_HINT" },
            { id: this.SETTING_SHOW_CONSUMABLES, name: "SETTINGS.SHOW_CONSUMABLES_NAME", hint: "SETTINGS.SHOW_CONSUMABLES_HINT" },
        ];
        types.forEach(t => {
            game.settings.register(this.MODULE_NAME, t.id, {
                name: this.translate(t.name),
                hint: this.translate(t.hint),
                scope: "client",
                config: true,
                type: Boolean,
                default: true,
                onChange: () => this.refreshHand()
            });
        });
    }

    static translate(key) {
        const fullKey = `QUICK_ITEMS.${key}`;
        if (game.i18n.has(fullKey)) return game.i18n.localize(fullKey);
        return game.i18n.localize(key);
    }

    static getHandActor() {
        const controlled = canvas.tokens?.controlled || [];
        if (controlled.length > 0) return controlled[0]?.actor || null;

        const character = game.user?.character;
        if (typeof character === 'string') return game.actors?.get(character) || null;
        return character || null;
    }

    /** Escapes a string for safe interpolation into HTML. */
    static escapeHtml(str) {
        if (str === null || str === undefined) return '';
        if (foundry?.utils?.escapeHTML) return foundry.utils.escapeHTML(String(str));
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    static itemHasActions(item) {
        // Foundryborne exposes prepared actions via system.actionsList
        const list = item.system?.actionsList;
        if (Array.isArray(list)) return list.length > 0;

        const actions = item.system?.actions;
        if (!actions) return false;
        if (typeof actions.size === 'number') return actions.size > 0;
        if (typeof actions === 'object') return Object.keys(actions).length > 0;
        return false;
    }

    // --- Helpers ---

    /** DamageField changed from parts to main/resources in Daggerheart 2.11. */
    static _getDamageParts(item) {
        const damage = item.system?.attack?.damage;
        if (!damage) return [];
        if (damage.main) return [damage.main];
        const parts = damage.parts;
        if (!parts) return [];
        return typeof parts[Symbol.iterator] === 'function' ? Array.from(parts) : Object.values(parts);
    }

    static _getDamageFormula(item) {
        const parts = this._getDamageParts(item);

        const RollCls = globalThis.foundry?.dice?.Roll ?? globalThis.Roll;
        const rollData = item.system?.getRollData?.() ?? item.actor?.getRollData?.() ?? {};
        const formulas = [];

        // parts is an IterableTypedObjectField in Foundryborne (iterable of DHDamageData)
        for (const part of parts) {
            const { value } = part;
            if (!value) continue;

            let formula = "";
            if (typeof value.getFormula === 'function') {
                // Prepared system DataModel — use the system's own logic
                formula = value.getFormula();
            } else if (value.custom?.enabled) {
                formula = value.custom.formula;
            } else {
                const multiplier = value.multiplier === 'flat' ? (value.flatMultiplier ?? 1) : (value.multiplier ? `@${value.multiplier}` : 1);
                const bonus = value.bonus ? (value.bonus < 0 ? ` - ${Math.abs(value.bonus)}` : ` + ${value.bonus}`) : '';
                formula = `${multiplier ?? 1}${value.dice}${bonus}`;
            }

            if (RollCls?.replaceFormulaData) {
                formula = RollCls.replaceFormulaData(formula, rollData);
            }
            formulas.push(formula);
        }

        return formulas.join(" + ");
    }

    static _getDamageLabels(item) {
        const parts = this._getDamageParts(item);

        const uniqueTypes = new Set();
        for (const part of parts) {
            if (!part.type) continue;
            const types = part.type instanceof Set ? part.type : (Array.isArray(part.type) ? part.type : [part.type]);
            types.forEach(t => uniqueTypes.add(t));
        }

        const labels = [];
        for (const type of uniqueTypes) {
            const config = CONFIG.DH?.GENERAL?.damageTypes?.[type];
            if (config?.label) {
                labels.push(game.i18n.localize(config.label));
            }
        }

        return labels.join(" / ");
    }

    /** Synchronous fallback for older systems and external templates. */
    static getCardDescription(item) {
        const system = item.system ?? {};
        const description = typeof system.description === 'string' ? system.description : system.description?.value ?? '';
        if (item.type !== 'weapon') return this.formatDescription(description);
        const config = CONFIG.DH?.ITEM?.allWeaponFeatures?.() ?? CONFIG.DH?.ITEM?.weaponFeatures ?? {};
        const features = system.itemFeatures ?? system.weaponFeatures ?? [];
        const entries = Object.entries(features).map(([key, value]) => {
            const feature = config[value?.value ?? value?.id ?? (typeof value === 'string' ? value : key)];
            if (!feature) return '';
            return `<p><strong>${this.escapeHtml(game.i18n.localize(feature.label))}:</strong> ${game.i18n.localize(feature.description ?? '')}</p>`;
        });
        return this.formatDescription([...entries, description].join(''));
    }

    /**
     * Форматирует описание карточки: удаляет простые директивы и заменяет
     * ссылки формата `@Something[...] {Label}` на жирную метку `<strong>Label</strong>`.
     * Возвращает HTML-строку, готовую для вставки в DOM (метки экранируются).
     * @param {string} desc
     * @returns {string}
     */
    static formatDescription(desc) {
        let descHtml = desc || '';
        // Remove simple @Template[...] directives
        descHtml = descHtml.replace(/@Template\[[^\]]*\]/g, '');
        // Replace patterns like @Something[...]{Label} -> <strong>Label</strong>
        descHtml = descHtml.replace(/@[^\[]*\[[^\]]*\]\{([^}]*)\}/g, (m, label) => {
            return `<strong>${this.escapeHtml(label)}</strong>`;
        });
        return descHtml;
    }

    /**
     * Форматирует и локализует данные по дальности атаки/оружия.
     * Поддерживает строки и объекты вида {type, value} или {range, distance}.
     * @param {any} range
     * @returns {string} "<RangeLabel>: <TranslatedType> <value>" или пустая строка.
     */
    static formatRange(range) {
        if (!range && range !== 0) return '';
        const i18n = (typeof game !== 'undefined' && game.i18n) ? game.i18n : null;
        const rangeLabel = i18n && i18n.has('DAGGERHEART.GENERAL.range') ? i18n.localize('DAGGERHEART.GENERAL.range') : this.translate('RANGE');

        let type = '';
        let value = '';

        if (typeof range === 'object') {
            type = range.type || range.rangeType || range.mode || '';
            value = range.value ?? range.distance ?? range.range ?? '';
        } else if (typeof range === 'string') {
            // If it's a single word, treat as a type; otherwise as a raw value (e.g. "10 ft")
            if (/^[a-zA-Z_]+$/.test(range)) type = range;
            else value = range;
        } else {
            value = String(range);
        }

        let translatedType = '';
        if (type) {
            const key = `DAGGERHEART.CONFIG.Range.${type}.short`;
            translatedType = i18n?.has(key) ? i18n.localize(key) : type;
        }

        const parts = [];
        if (translatedType) parts.push(translatedType);
        if (value !== null && value !== undefined && String(value) !== '') parts.push(String(value));

        if (parts.length === 0) return '';
        return `${rangeLabel}: ${parts.join(' ')}`;
    }

    /**
     * Локализует тип предмета (TYPES.Item.<type>).
     * @param {string} itemType
     * @returns {string}
     */
    static formatItemType(itemType) {
        if (!itemType && itemType !== 0) return '';
        const key = `TYPES.Item.${itemType}`;
        return game?.i18n?.has(key) ? game.i18n.localize(key) : itemType;
    }

    /**
     * Локализует тип карты домена (ability/spell/grimoire).
     * @param {string} domainCardType
     * @returns {string}
     */
    static formatDomainCardType(domainCardType) {
        if (!domainCardType && domainCardType !== 0) return '';
        const key = `DAGGERHEART.CONFIG.DomainCardTypes.${domainCardType}`;
        return game?.i18n?.has(key) ? game.i18n.localize(key) : domainCardType;
    }

    /**
     * Возвращает данные домена из конфига системы (включая homebrew-домены).
     * @param {string} domainKey
     * @returns {{id: string, label: string, src: string}|null}
     */
    static getDomainConfig(domainKey) {
        try {
            const all = CONFIG.DH?.DOMAIN?.allDomains?.() ?? CONFIG.DH?.DOMAIN?.domains ?? {};
            return all[domainKey] ?? null;
        } catch (e) {
            return CONFIG.DH?.DOMAIN?.domains?.[domainKey] ?? null;
        }
    }

    /**
     * Создаёт синтетическую карту стандартной атаки для противника (adversary).
     * Возвращает объект, совместимый с `createCardElement` и шаблоном.
     * @param {Actor} actor
     */
    static _createAdversaryStandardAttack(actor) {
        if (!actor) return null;

        // Не добавляем, если у актора уже есть явно названная стандартная атака
        const existing = actor.items?.find?.(i => i.name && i.name.toLowerCase().includes('standard attack'));
        if (existing) return null;

        const id = `adv-std-${actor.id}`;

        // В Foundryborne стандартная атака противника лежит в actor.system.attack (ActionField)
        const atk = actor.system?.attack || null;

        const atkName = atk?.name || this.translate('STANDARD_ATTACK');
        const img = atk?.img || 'icons/svg/sword.svg';

        // Damage parts: если в данных актора есть parts, используем их, иначе дефолт
        const parts = atk?.damage?.parts ? atk.damage.parts : [
            {
                value: {
                    custom: { enabled: false, formula: '' },
                    multiplier: 'flat',
                    flatMultiplier: 1,
                    dice: 'd6',
                    bonus: 0
                },
                applyTo: 'hitPoints',
                type: ['physical']
            }
        ];

        const synthetic = {
            id,
            name: atkName,
            type: 'weapon',
            img,
            actor,
            system: {
                description: ' ',
                domain: '',
                level: '',
                recallCost: 0,
                stress: 0,
                attack: {
                    roll: atk?.roll ?? {},
                    damage: atk?.damage ?? {
                        parts,
                        includeBase: atk?.damage?.includeBase ?? false,
                        direct: atk?.damage?.direct ?? false
                    },
                    type: atk?.type || 'attack',
                    range: atk?.range || ''
                }
            }
        };

        // Метод use, чтобы HandManager.useItem мог вызвать атаку как с листа противника
        synthetic.use = async function (event) {
            const sysAttack = actor.system?.attack;
            if (sysAttack && typeof sysAttack.use === 'function') {
                try {
                    return await sysAttack.use(event ?? {});
                } catch (inner) {
                    console.warn(`${HandManager.MODULE_NAME} | adversary standard attack failed`, inner);
                }
            }
        };

        return synthetic;
    }

    // --- UI ---

    static get currentTemplate() {
        const id = this.getSetting(this.SETTING_TEMPLATE);
        // Fallback to 'default' if the selected template is missing
        return getTemplate(id) || getTemplate('default');
    }

    /** Default panel markup, used when a template does not define renderPanel. */
    static renderDefaultPanel({ dragTitle, noActorText }) {
        return `
            <div id="daggerheart-hand">
                <div class="hand-wrapper">
                    <div class="hand-background-plate" id="dh-hand-drag-target">
                        <div class="drag-handle-area" title="${this.escapeHtml(dragTitle)}"></div>
                    </div>
                    <div class="dh-cards-container">
                        <div class="no-cards">${this.escapeHtml(noActorText)}</div>
                    </div>
                </div>
            </div>
        `;
    }

    /** Fully removes and re-creates the panel (used when the template changes). */
    static rebuildPanel() {
        const previous = this._activeTemplateId ? getTemplate(this._activeTemplateId) : null;
        try {
            previous?.detachStyles?.();
        } catch (e) {
            console.warn(`${this.MODULE_NAME} | detachStyles failed:`, e);
        }
        this.clearAutoHideTimer();
        this._autoHideHandlers?.abort();
        this._panel?.remove();
        this._panel = null;
        this._container = null;
        this._activeTemplateId = null;
        this.refreshHand();
    }

    static createHandPanel() {
        // Reuse an already existing panel
        const existing = document.getElementById('daggerheart-hand');
        if (this._panel || existing) {
            this._panel = existing ?? this._panel;
            this._container = this._panel.querySelector('.dh-cards-container');
            return;
        }

        const dragTitle = this.translate("TOOLTIPS.DRAG");
        const noActorText = this.translate('NO_ACTOR');

        const template = this.currentTemplate;
        if (!template) {
            console.error(`${this.MODULE_NAME} | No template found!`);
            return;
        }

        // Ensure only the active template injects its styles and any observers
        try {
            template.attachStyles?.();
        } catch (e) {
            console.warn(`${this.MODULE_NAME} | Failed to attach template styles:`, e);
        }
        this._activeTemplateId = template.id;

        const html = typeof template.renderPanel === 'function'
            ? template.renderPanel({ dragTitle, noActorText })
            : this.renderDefaultPanel({ dragTitle, noActorText });

        document.body.insertAdjacentHTML('beforeend', html);

        // Cache references immediately
        this._panel = document.getElementById('daggerheart-hand');
        this._container = this._panel?.querySelector('.dh-cards-container');
        if (!this._panel || !this._container) {
            console.error(`${this.MODULE_NAME} | Template "${template.id}" produced invalid panel markup`);
            return;
        }

        this.applyStyles();

        this._dndInstance = new SmoothDnD('#daggerheart-hand', '#dh-hand-drag-target', (newLeft) => {
            this.savePosition(newLeft);
        });
        this.restorePosition();

        // Setup auto-hide behavior (hover to show, timeout to hide)
        this.setupAutoHideHandlers();
        this.startAutoHideTimer();

        const isEnabled = this.getSetting(this.SETTING_ENABLED);

        if (!isEnabled) {
            this._panel.classList.add('hidden');
            return;
        }

        if (!this.getHandActor()) {
            this._panel.classList.add('hidden');
            this._currentActor = null; // Сбрасываем текущего актера
            return;
        }
    }

    static toggleHand() {
        if (!this._panel) return;

        this._isCollapsed = !this._isCollapsed;
        const bg = this._panel.querySelector('.hand-background-plate');

        if (this._isCollapsed) {
            this._fadeOut(this._container);
            this._fadeOut(bg);
            this._panel.classList.add('collapsed');
        } else {
            this._panel.classList.remove('collapsed');
            this._fadeIn(this._container, () => this.applyCardFanLayout());
            this._fadeIn(bg);
        }
    }

    static _fadeOut(el, duration = 200) {
        if (!el) return;
        const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' });
        anim.onfinish = () => { el.style.display = 'none'; anim.cancel(); el.style.opacity = ''; };
    }

    static _fadeIn(el, callback, duration = 200) {
        if (!el) return;
        el.style.display = '';
        const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration });
        anim.onfinish = () => { callback?.(); };
    }

    static applyStyles() {
        if (!this._panel) return;

        const hideBackground = Boolean(this.getSetting(this.SETTING_HIDE_BACKGROUND));
        const background = this._panel.querySelector('.hand-background-plate');
        if (background) {
            // Template styles are unlayered and can override Foundry's module CSS layer.
            // Hide only the decoration so the plate remains available for dragging.
            for (const property of ['background', 'border', 'box-shadow']) {
                if (hideBackground) background.style.setProperty(property, 'none', 'important');
                else background.style.removeProperty(property);
            }
        }

        const scale = Number(this.getSetting(this.SETTING_SCALE)) || 1;
        const width = Math.min(Math.max(600, this.getSetting(this.SETTING_WIDTH)), (window.innerWidth - 32) / scale);
        const height = 224;
        const bottom = Number(this.getSetting(this.SETTING_BOTTOM)) || 0;
        const lift = Math.max(0, Math.min(500, Number(this.getSetting(this.SETTING_HEIGHT)) || 0,
            window.innerHeight - scale * (height + bottom + 20)));
        this._panel.style.bottom = `${lift}px`;
        const wrapper = this._panel.querySelector('.hand-wrapper');

        // Apply configurable bottom padding for the cards container
        if (this._container) this._container.style.paddingBottom = `${bottom}px`;
        this._panel.style.setProperty('--dh-hand-card-height', `${height}px`);
        this._panel.style.setProperty('--dh-hand-card-width', `${height * 5 / 7}px`);
        this._panel.style.setProperty('--dh-hand-card-scale', height / 490);
        this._panel.style.setProperty('--dh-preview-scale', Math.max(height / 490, Math.min(1, ((window.innerHeight - lift) / scale - bottom - 40) / 490)));

        if (wrapper) {
            wrapper.style.transform = `scale(${scale})`;
            wrapper.style.transformOrigin = 'bottom center';
            wrapper.style.width = `${width}px`;
            wrapper.style.height = `${height + bottom + 12}px`;
        }

        this.applyCardFanLayout();
    }

    static async savePosition(left) {
        if (!game.modules.get(this.MODULE_NAME)?.active) return;

        try {
            await game.user.setFlag(this.MODULE_NAME, 'handPosition', { left });
        } catch (e) {
            console.warn(`${this.MODULE_NAME} | Failed to save position:`, e);
        }
    }

    static restorePosition() {
        if (!game.modules.get(this.MODULE_NAME)?.active) return;

        let pos;
        try {
            pos = game.user.getFlag(this.MODULE_NAME, 'handPosition');
        } catch (e) {
            console.warn(`${this.MODULE_NAME} | Failed to read flags:`, e);
            return;
        }

        if (pos && pos.left !== undefined) {
            if (!this._panel) this._panel = document.getElementById('daggerheart-hand');
            if (!this._panel) return;

            this._panel.style.left = `${pos.left}px`;
            this._panel.style.transform = 'translateX(-50%)';

            if (this._dndInstance) {
                this._dndInstance.updatePosition(pos.left);
            }
        }
    }

    // --- Auto-hide helpers ---

    static setupAutoHideHandlers() {
        if (!this._panel) return;

        // Replace previous listeners when reusing the panel.
        this._autoHideHandlers?.abort();
        this._autoHideHandlers = new AbortController();
        const options = { signal: this._autoHideHandlers.signal };

        // When the mouse enters the hand area, show it and cancel timer
        this._panel.addEventListener('mouseenter', () => {
            this.clearAutoHideTimer();
            this.showHandByY();
        }, options);

        // When mouse leaves the hand area, restart timer
        this._panel.addEventListener('mouseleave', () => {
            this.startAutoHideTimer();
        }, options);
        this._panel.addEventListener('focusin', () => {
            this.clearAutoHideTimer();
            this.showHandByY();
        }, options);
        this._panel.addEventListener('focusout', event => {
            if (!this._panel.contains(event.relatedTarget)) this.startAutoHideTimer();
        }, options);
    }

    static startAutoHideTimer() {
        this.clearAutoHideTimer();
        const secs = Number(this.getSetting(this.SETTING_AUTOHIDE)) || 0;
        if (!this._panel || secs <= 0 || this._activeCardDrags > 0 || this._panel.contains(document.activeElement)) return;

        this._autoHideTimer = setTimeout(() => {
            if (this._activeCardDrags > 0) return;
            this.hideHandByY();
        }, secs * 1000);
    }

    static clearAutoHideTimer() {
        if (this._autoHideTimer) {
            clearTimeout(this._autoHideTimer);
            this._autoHideTimer = null;
        }
    }

    static setPanelYOffset(yPx) {
        if (!this._panel) return;
        const el = this._panel;

        // Prefer inline transform if present, otherwise fallback to CSS default translateX(-50%)
        let base = el.style.transform && el.style.transform.length ? el.style.transform : '';
        if (!base) base = 'translateX(-50%)';

        // Remove any existing translateY(...) part
        base = base.replace(/translateY\([^)]*\)/g, '').trim();

        // Apply animated transform (preserve X translate)
        el.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = `${base} translateY(${yPx}px)`;
    }

    static showHandByY() {
        this.setPanelYOffset(0);
    }

    static hideHandByY() {
        const wrapper = this._panel?.querySelector('.hand-wrapper');
        if (!wrapper) return;
        if (this._activeCardDrags > 0) return;

        const wrapperHeight = wrapper.getBoundingClientRect().height || 250;
        // Move the panel down by (wrapperHeight + extra) so cards are off-screen vertically
        const extra = 24;
        const lift = parseFloat(this._panel.style.bottom) || 0;
        const y = wrapperHeight + lift + extra;
        this.setPanelYOffset(y);
    }

    static pauseAutoHideForCardDrag() {
        this._activeCardDrags += 1;
        this.clearAutoHideTimer();
        this.showHandByY();
    }

    static resumeAutoHideAfterCardDrag() {
        this._activeCardDrags = Math.max(0, this._activeCardDrags - 1);
        if (this._activeCardDrags === 0) this.startAutoHideTimer();
    }

    static refreshHandDebounced() {
        if (this._refreshDebounceTimer) clearTimeout(this._refreshDebounceTimer);
        this._refreshDebounceTimer = setTimeout(() => this.refreshHand(), 50);
    }

    static refreshHand() {
        const renderGeneration = ++this._renderGeneration;
        if (!this._panel) this.createHandPanel();
        if (!this._panel) return;

        const isEnabled = this.getSetting(this.SETTING_ENABLED);
        if (!isEnabled) {
            this._panel.classList.add('hidden');
            return;
        }

        const actor = this.getHandActor();
        if (!actor) {
            this._panel.classList.add('hidden');
            this._currentActor = null;
            return;
        }
        this._panel.classList.remove('hidden');

        const container = this._container;

        this._currentActor = actor;

        const allItems = actor.items ? Array.from(actor.items) : [];

        const showEquippedOnly = this.getSetting(this.SETTING_FILTER_EQUIPPED);
        const showWeapons = this.getSetting(this.SETTING_SHOW_WEAPONS);
        const showDomainCards = this.getSetting(this.SETTING_SHOW_DOMAIN_CARDS);
        const showFeatures = this.getSetting(this.SETTING_SHOW_FEATURES);
        const showConsumables = this.getSetting(this.SETTING_SHOW_CONSUMABLES);

        const cards = allItems.filter(item => {
            if (['class', 'subclass', 'race', 'ancestry', 'community'].includes(item.type)) return false;

            const hasActions = this.itemHasActions(item);
            const isWeapon = item.type === 'weapon';
            const isDomain = item.type === 'domainCard';
            const isFeature = item.type === 'feature';
            const isConsumable = item.type === 'consumable';

            if (!hasActions && !isWeapon && !isDomain) return false;

            if (isWeapon && !showWeapons) return false;
            if (isDomain && !showDomainCards) return false;
            if (isFeature && !showFeatures) return false;
            if (isConsumable && !showConsumables) return false;

            if (showEquippedOnly) {
                if (Object.prototype.hasOwnProperty.call(item.system ?? {}, 'equipped') && item.system.equipped == false) return false;
                if (isDomain && item.system.inVault == true) return false;
            }

            if (actor.system.isItemAvailable?.(item) == false) return false;

            return true;
        });

        // Detect adversary actors and prepare a synthetic standard-attack card if needed
        const isAdversary = actor.type === 'adversary';
        const adversaryStandard = isAdversary ? this._createAdversaryStandardAttack(actor) : null;

        if (cards.length === 0 && !adversaryStandard) {
            container.replaceChildren();
            container.insertAdjacentHTML('beforeend', `<div class="no-cards">${this.escapeHtml(this.translate('NO_ITEMS'))}</div>`);
            return;
        }

        cards.sort((a, b) => {
            const typeScore = (t) => {
                if (t === 'weapon') return 1;
                if (t === 'domainCard') return 2;
                return 3;
            };
            return typeScore(a.type) - typeScore(b.type) || a.name.localeCompare(b.name);
        });

        // Defer heavy DOM operations to the next animation frame to avoid layout thrashing.
        const template = this.currentTemplate;
        window.requestAnimationFrame(() => {
            // A newer refresh may have hidden or rebuilt the panel before this frame.
            if (renderGeneration !== this._renderGeneration || container !== this._container) return;

            const fragment = document.createDocumentFragment();

            if (adversaryStandard) {
                const el = this.createCardElement(adversaryStandard, template);
                fragment.appendChild(el);
            }

            cards.forEach(item => {
                const el = this.createCardElement(item, template);
                fragment.appendChild(el);
            });

            container.replaceChildren(fragment);
            this.applyCardFanLayout();
            // Reset/show hand and start auto-hide timer after rendering
            this.showHandByY();
            this.startAutoHideTimer();
        });
    }

    /**
     * @param {Item|Object} item
     * @param {Object} template
     * @returns {HTMLElement}
     */
    static createCardElement(item, template) {
        const el = document.createElement('div');
        // The system now uses .dh-card for its own responsive cards.
        el.className = 'dh-hand-card';
        el.dataset.itemId = item.id;
        el.dataset.type = item.type;
        el.tabIndex = 0;
        el.setAttribute('aria-label', item.name);
        el.innerHTML = `<div class="dh-card-scaler">${template.renderCard(item)}</div>`;
        el.addEventListener('keydown', event => {
            if (event.target !== el || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            this.useItem(item, event);
        });

        const description = el.querySelector('[data-card-description]');
        if (description) description.tabIndex = 0;
        if (description && typeof item.system?.getEnrichedDescription === 'function') {
            // Let the installed system supply weapon features and resolve its enrichers.
            Promise.resolve().then(() => item.system.getEnrichedDescription({ type: 'embed', gmNotes: false }))
                .then(html => {
                    if (el.isConnected && typeof html === 'string') description.innerHTML = html;
                })
                .catch(error => console.warn(`${this.MODULE_NAME} | Failed to enrich ${item.name}`, error));
        }

        new CardSmoothDnD(el, () => {
            this.useItem(item);
        }, () => {
            this.applyCardFanLayout();
        }, {
            onDragStarted: () => this.pauseAutoHideForCardDrag(),
            onDragEnded: () => this.resumeAutoHideAfterCardDrag()
        });

        // Открыть лист предмета по ПКМ (как "Редактировать")
        el.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            this._openItemSheet(item).catch(err =>
                console.error(`${this.MODULE_NAME} | Failed to open item sheet on context menu`, err));
        });

        return el;
    }

    static async _openItemSheet(item) {
        // Настоящий документ Item — открываем его лист
        if (item?.sheet?.render) {
            return item.sheet.render(true);
        }

        // Предмет привязан к актору — пробуем достать документ из actor.items
        const found = item?.actor?.items?.get?.(item.id);
        if (found?.sheet?.render) {
            return found.sheet.render(true);
        }

        // Синтетическая карточка (например, атака противника) — показываем описание в DialogV2
        const title = item?.name || this.translate('ITEM');
        const desc = this.formatDescription(item?.system?.description?.value || item?.system?.description || '');
        const content = `<div class="dh-item-sheet-preview">${desc}</div>`;

        const DialogV2 = foundry.applications?.api?.DialogV2;
        if (DialogV2) {
            return DialogV2.prompt({
                window: { title },
                content,
                ok: { label: this.translate('CLOSE') }
            });
        }
        // Environment without DialogV2 (should not happen on FVTT 13+)
        ui.notifications?.info(`${title}: ${desc.replace(/<[^>]*>?/gm, '')}`);
    }

    static applyCardFanLayout() {
        if (!this._container) return;

        const cards = [...this._container.children].filter(el => el.classList.contains('dh-hand-card'));
        const count = cards.length;
        if (count === 0) return;

        const maxAngle = this.getSetting(this.SETTING_ARC_ANGLE);
        const wrapper = this._panel?.querySelector('.hand-wrapper');
        const wrapperWidth = wrapper?.clientWidth || 0;
        const cardWidth = cards[0].offsetWidth || 160;
        const availableSpace = wrapperWidth - 40;

        let marginLeft = -20;
        const totalNeeded = count * cardWidth;

        if (totalNeeded > availableSpace && count > 1) {
            const spacePerCard = (availableSpace - cardWidth) / (count - 1);
            marginLeft = spacePerCard - cardWidth;
        }

        marginLeft = Math.max(marginLeft, 20 - cardWidth);
        marginLeft = Math.min(marginLeft, 5);

        const centerIndex = (count - 1) / 2;
        const angleStep = count > 1 ? maxAngle / (count / 2) : 0;

        cards.forEach((element, index) => {
            if (element.classList.contains('dragging')) return;

            const style = element.style;

            // Temporarily disable transition so the card doesn't animate from the
            // default (0deg) to the target rotation when the DOM is rebuilt.
            const prevTransition = style.transition;
            style.transition = 'none';

            style.marginLeft = index > 0 ? `${marginLeft}px` : '0px';
            style.zIndex = index + 1;
            style.bottom = '0px';

            const distFromCenter = index - centerIndex;
            if (maxAngle === 0) {
                style.transform = 'none';
            } else {
                const rotation = distFromCenter * angleStep;
                const yOffset = Math.abs(distFromCenter) * 5;
                style.transform = `rotate(${rotation}deg) translateY(${yOffset}px)`;
            }

            // Restore transition in the next frame so future transform changes animate.
            requestAnimationFrame(() => {
                style.transition = prevTransition || '';
            });
        });
    }

    static async useItem(item, event) {
        const hasActions = this.itemHasActions(item);
        const safeEvent = event || {
            preventDefault: () => { },
            stopPropagation: () => { },
            shiftKey: false,
            ctrlKey: false,
            altKey: false,
            currentTarget: null
        };

        if (!hasActions && item.type !== 'weapon') {
            this.sendToChat(item);
            return;
        }

        try {
            // Foundryborne items expose use(event); synthetic cards define their own
            if (typeof item.use === 'function') return await item.use(safeEvent);
            if (typeof item.roll === 'function') return await item.roll(safeEvent);
            this.sendToChat(item);
        } catch (e) {
            console.error(`${this.MODULE_NAME} | Roll Error:`, e);
            this.sendToChat(item);
        }
    }

    static async sendToChat(item) {
        // Foundryborne: Item#toChat(origin) expects the item uuid
        if (typeof item.toChat === 'function' && item.uuid) {
            return item.toChat(item.uuid);
        }
    }
}
