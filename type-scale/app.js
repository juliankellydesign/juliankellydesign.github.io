import { cloneTypeDefaults, generateTypeScale, trackingPercent, RATIO_PRESETS } from './type-scale.js';
import { typeCSS, typeTailwind, typeTokens } from './tokens.js';
import { createCurveEditor } from './curve-editor.js';
import { sizeCurveModel, trackingCurveModel } from './curve-models.js';

// The type scale generator, ported from the Type section of Boetti's Tokens
// page. Settings live for this visit only; Copy is how values leave the page.

const $ = (id) => document.getElementById(id);
const freshState = () => ({ config: cloneTypeDefaults(), allCaps: false, sample: 'Purpose', weight: 400 });

let toastTimer;
function notify(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

async function copyText(text, message = 'Copied to clipboard') {
    try {
        await navigator.clipboard.writeText(text);
        notify(message);
    } catch {
        notify('Clipboard unavailable');
    }
}

let state = freshState();
let scale = [];

const bindings = {
    base: ['number', () => state.config.base, (value) => { state.config.base = value; }],
    ratio: ['number', () => state.config.ratio, (value) => { state.config.ratio = value; }],
    stepsBelow: ['number', () => state.config.stepsBelow, (value) => { state.config.stepsBelow = Math.max(0, Math.round(value)); }],
    stepsAbove: ['number', () => state.config.stepsAbove, (value) => { state.config.stepsAbove = Math.max(0, Math.round(value)); }],
    round: ['checkbox', () => state.config.round, (value) => { state.config.round = value; }],
    allCapsAdjustment: ['number', () => state.config.tracking.allCapsAdjustment, (value) => { state.config.tracking.allCapsAdjustment = value; }],
    allCaps: ['checkbox', () => state.allCaps, (value) => { state.allCaps = value; }],
    bodyRatio: ['number', () => state.config.lineHeight.body, (value) => { state.config.lineHeight.body = value; }],
    headingRatio: ['number', () => state.config.lineHeight.heading, (value) => { state.config.lineHeight.heading = value; }],
    headingFromStep: ['number', () => state.config.lineHeight.headingFromStep, (value) => { state.config.lineHeight.headingFromStep = Math.round(value); }],
    sample: ['text', () => state.sample, (value) => { state.sample = value; }],
    weight: ['number', () => state.weight ?? 400, (value) => { state.weight = value; }]
};

Object.entries(bindings).forEach(([id, [kind, , set]]) => {
    $(id).addEventListener('input', (event) => {
        if (kind === 'checkbox') set(event.target.checked);
        else if (kind === 'text') set(event.target.value);
        else {
            const value = Number.parseFloat(event.target.value);
            if (!Number.isFinite(value)) return;
            set(value);
        }
        update();
    });
});

const sizeEditor = createCurveEditor($('sizeCurve'), sizeCurveModel({
    getConfig: () => state.config,
    onChange: (patch) => { Object.assign(state.config, patch); update(); }
}));

const trackingEditor = createCurveEditor($('trackingCurve'), trackingCurveModel({
    getConfig: () => state.config,
    getSizes: () => scale.map((entry) => entry.size),
    onChange: (tracking) => { state.config.tracking = tracking; update(); }
}));

const presetSelect = $('ratioPreset');
presetSelect.append(new Option('Custom', ''), ...RATIO_PRESETS.map(({ name, ratio }) => new Option(`${name} · ${ratio}`, ratio)));
presetSelect.addEventListener('change', () => {
    if (!presetSelect.value) return;
    state.config.ratio = Number(presetSelect.value);
    update();
});

function syncInputs() {
    Object.entries(bindings).forEach(([id, [kind, get]]) => {
        const input = $(id);
        if (kind === 'checkbox') input.checked = get();
        else if (document.activeElement !== input) input.value = get();
    });
    const match = RATIO_PRESETS.find(({ ratio }) => ratio === state.config.ratio);
    presetSelect.value = match ? String(match.ratio) : '';
    sizeEditor.render();
    trackingEditor.render();
}

const signed = (value, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

function cssFor(entry) {
    return [
        `font-size: ${entry.size}px;`,
        `line-height: ${entry.lineHeight}px;`,
        `letter-spacing: ${Number(entry.letterSpacingEm.toFixed(5))}em;`
    ].join('\n');
}

function renderTable() {
    const header = document.createElement('div');
    header.className = 'type-row type-row-header';
    header.innerHTML = '<span>Token</span><span>Sample</span><span>Size</span><span>Line</span><span>Tracking</span>';
    const rows = [...scale].reverse().map((entry) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `type-row${entry.step === 0 ? ' is-base' : ''}`;
        const sample = document.createElement('span');
        sample.className = 'type-sample';
        sample.textContent = state.allCaps ? state.sample.toUpperCase() : state.sample;
        sample.style.fontSize = `${entry.size}px`;
        sample.style.lineHeight = `${entry.lineHeight}px`;
        sample.style.letterSpacing = `${entry.letterSpacingEm}em`;
        sample.style.fontWeight = String(state.weight ?? 400);
        const cell = (text, className = 'type-meta') => {
            const span = document.createElement('span');
            span.className = className;
            span.textContent = text;
            return span;
        };
        row.append(
            cell(`${entry.name} · ${signed(entry.step, 0).replace('+0', '0')}`, 'type-token'),
            sample,
            cell(`${entry.size}px`),
            cell(`${entry.lineHeight}px · ${entry.lineHeightRatio}`),
            cell(`${signed(entry.trackingPercent)}%`)
        );
        row.addEventListener('click', () => copyText(cssFor(entry), `Copied ${entry.name} CSS`));
        return row;
    });
    $('typeTable').replaceChildren(header, ...rows);
}

function renderTrackingGraph() {
    const graph = $('trackingGraph');
    const width = Math.max(320, graph.clientWidth);
    const height = 220;
    const pad = 40;
    graph.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const sizes = scale.map((entry) => entry.size);
    const minSize = Math.max(1, Math.min(...sizes) - 4);
    const maxSize = Math.max(...sizes) + 8;
    const limit = state.config.tracking.taperLimit + Math.abs(state.config.tracking.shift) + 1;
    const x = (size) => pad + ((size - minSize) / (maxSize - minSize)) * (width - pad * 2);
    const y = (percent) => height / 2 - (percent / limit) * (height / 2 - pad / 2);
    const points = [];
    for (let size = minSize; size <= maxSize; size += (maxSize - minSize) / 120) {
        points.push(`${points.length ? 'L' : 'M'}${x(size).toFixed(1)},${y(trackingPercent(size, state.config, { allCaps: state.allCaps })).toFixed(1)}`);
    }
    const dots = scale.map((entry) => {
        const percent = trackingPercent(entry.size, state.config, { allCaps: state.allCaps });
        return `<circle cx="${x(entry.size).toFixed(1)}" cy="${y(percent).toFixed(1)}" r="4" class="tracking-dot"><title>${entry.size}px · ${signed(percent)}%</title></circle>`
            + `<text x="${x(entry.size).toFixed(1)}" y="${height - 6}" class="tracking-label">${entry.size}</text>`;
    }).join('');
    graph.innerHTML = `
        <line x1="${pad}" x2="${width - pad}" y1="${y(0)}" y2="${y(0)}" class="tracking-axis" />
        <text x="8" y="${y(0) + 4}" class="tracking-label is-start">0%</text>
        <path d="${points.join('')}" class="tracking-path" />
        ${dots}`;
}

function update() {
    scale = generateTypeScale(state.config, { allCaps: state.allCaps });
    syncInputs();
    renderTable();
    renderTrackingGraph();
}

// Exports leave out the all-caps preview.
const EXPORTS = {
    css: ['CSS variables', (exportScale) => typeCSS(exportScale)],
    json: ['design tokens', (exportScale) => JSON.stringify(typeTokens(exportScale), null, 2)],
    tailwind: ['Tailwind config', (exportScale) => typeTailwind(exportScale)]
};

document.querySelectorAll('[data-export]').forEach((button) => {
    const [label, serialize] = EXPORTS[button.dataset.export];
    button.addEventListener('click', () => copyText(serialize(generateTypeScale(state.config)), `Copied ${label}`));
});

$('reset').addEventListener('click', () => {
    state = freshState();
    update();
    notify('Reset to defaults');
});

let resizeFrame;
window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(renderTrackingGraph);
});

update();
