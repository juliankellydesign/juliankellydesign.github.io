// Curve models for the curve editor (curve-editor.js). A model says
// what to plot and how its handles and fields map onto the generator's own
// parameters, so the editor never owns any maths:
//
//   label()            aria label for the graph
//   domain()           { x: [min, max], y: [min, max] } in the model's units
//   sample(x)          the curve's y at x
//   samples            segments drawn across the domain
//   guides(domain)     reference lines [{ from, to, className }]
//   marks()            fixed points drawn on the curve [{ x, y, title }]
//   handles            [{ position(domain), anchor?(domain), move(point, domain), lockX? }]
//   fields             [{ key, label, min?, max?, step, get(), set(value) }], may be empty
//
// curveGeometry() turns a model into SVG coordinates. It is pure, so tests
// can pin what the editor draws.

import { sizeAtStep, stepName, trackingPercent } from './type-scale.js';

export const CURVE_SIZE = 200;
export const CURVE_PAD = 12;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clamp01 = (value) => clamp(value, 0, 1);
const round2 = (value) => Number(value.toFixed(2));

export function curveScales(domain) {
    const [x0, x1] = domain.x;
    const [y0, y1] = domain.y;
    return {
        toX: (value) => CURVE_PAD + ((value - x0) / (x1 - x0)) * CURVE_SIZE,
        toY: (value) => CURVE_PAD + (1 - (value - y0) / (y1 - y0)) * CURVE_SIZE,
        // Graph units (0–1 across the frame, clamped) back to model units.
        fromUnit: (unitX, unitY) => ({ x: x0 + clamp01(unitX) * (x1 - x0), y: y0 + clamp01(unitY) * (y1 - y0) })
    };
}

export function curveGeometry(model, domain = model.domain()) {
    const { toX, toY } = curveScales(domain);
    const samples = model.samples ?? 60;
    const [x0, x1] = domain.x;
    const points = [];
    for (let index = 0; index <= samples; index += 1) {
        const x = x0 + (index / samples) * (x1 - x0);
        points.push(`${index ? 'L' : 'M'}${toX(x).toFixed(2)},${toY(model.sample(x)).toFixed(2)}`);
    }
    const line = ({ from, to }) => ({ x1: toX(from.x), y1: toY(from.y), x2: toX(to.x), y2: toY(to.y) });
    return {
        d: points.join(''),
        guides: (model.guides?.(domain) ?? []).map((guide) => ({ ...line(guide), className: guide.className })),
        handles: model.handles.map((handle) => {
            const position = handle.position(domain);
            const anchor = handle.anchor?.(domain);
            return {
                cx: toX(position.x),
                cy: toY(position.y),
                arm: anchor ? line({ from: anchor, to: position }) : null
            };
        }),
        marks: (model.marks?.() ?? []).map((mark) => ({ cx: toX(mark.x), cy: toY(mark.y), title: mark.title }))
    };
}

// The tracking curve from type-scale.js, plotted as tracking % by rendered
// size. Its three handles are the formula's own parameters, so dragging
// edits the same numbers the fields do and the maths stays as it is:
//
//   shift    the point at the base size, dragged up or down
//   divisor  the tangent at the base size (slope −1 ÷ divisor), like a
//            bezier arm
//   taper    the limit the curve tapers toward, shift ± taperLimit
export const TRACKING_LIMITS = Object.freeze({ divisor: [0.5, 50], taperLimit: [0.5, 50] });

// The tangent handle sits this far from the base point, in graph units.
const TANGENT_LENGTH = 0.28;

export function trackingDomain(config, sizes) {
    if (!sizes.length) sizes = [config.base];
    const minSize = Math.max(1, Math.min(...sizes) - 4);
    const maxSize = Math.max(...sizes) + 8;
    const limit = config.tracking.taperLimit + Math.abs(config.tracking.shift) + 1;
    return { x: [minSize, maxSize], y: [-limit, limit] };
}

export function trackingCurveModel({ getConfig, getSizes, onChange }) {
    const tracking = () => getConfig().tracking;
    const change = (patch) => onChange({ ...tracking(), ...patch });
    const span = (range) => range[1] - range[0];
    const basePoint = () => ({ x: getConfig().base, y: tracking().shift });
    const [divisorMin, divisorMax] = TRACKING_LIMITS.divisor;
    const [taperMin, taperMax] = TRACKING_LIMITS.taperLimit;

    return {
        label: () => {
            const { shift, divisor, taperLimit } = tracking();
            return `Tracking by size: shift ${shift}%, divisor ${divisor}, taper limit ${taperLimit}%`;
        },
        domain: () => trackingDomain(getConfig(), getSizes()),
        sample: (size) => trackingPercent(size, getConfig()),
        samples: 120,
        guides: (domain) => {
            const { shift, taperLimit } = tracking();
            const across = (y, className) => ({ from: { x: domain.x[0], y }, to: { x: domain.x[1], y }, className });
            return [
                across(0, 'curve-axis'),
                across(shift + taperLimit, 'curve-diagonal'),
                across(shift - taperLimit, 'curve-diagonal')
            ];
        },
        marks: () => getSizes().map((size) => {
            const percent = trackingPercent(size, getConfig());
            return { x: size, y: percent, title: `${size}px · ${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%` };
        }),
        handles: [
            {
                lockX: true,
                position: basePoint,
                move: ({ y }) => change({ shift: round2(y) })
            },
            {
                anchor: basePoint,
                position: (domain) => {
                    // A fixed length along the tangent, measured in graph units
                    // so the handle stays put on screen whatever the slope.
                    const unitX = 1 / span(domain.x);
                    const unitY = (-1 / tracking().divisor) / span(domain.y);
                    const scale = TANGENT_LENGTH / Math.hypot(unitX, unitY);
                    const base = basePoint();
                    return { x: base.x + unitX * scale * span(domain.x), y: base.y + unitY * scale * span(domain.y) };
                },
                move: ({ x, y }) => {
                    const base = basePoint();
                    const dx = x - base.x;
                    const dy = y - base.y;
                    // The tracking curve always falls as size grows, so only a
                    // falling tangent maps to a divisor.
                    if (dx <= 0 || dy >= 0) return;
                    change({ divisor: round2(clamp(-dx / dy, divisorMin, divisorMax)) });
                }
            },
            {
                lockX: true,
                position: (domain) => ({ x: domain.x[0] + span(domain.x) * 0.92, y: tracking().shift - tracking().taperLimit }),
                move: ({ y }) => change({ taperLimit: round2(clamp(Math.abs(y - tracking().shift), taperMin, taperMax)) })
            }
        ],
        fields: [
            { key: 'shift', label: 'shift %', step: 0.25, get: () => tracking().shift, set: (value) => change({ shift: value }) },
            {
                key: 'divisor',
                label: 'divisor',
                min: divisorMin,
                step: 0.5,
                get: () => tracking().divisor,
                set: (value) => { if (value > 0) change({ divisor: value }); }
            },
            {
                key: 'taperLimit',
                label: 'taper %',
                min: 1,
                step: 0.5,
                get: () => tracking().taperLimit,
                set: (value) => { if (value > 0) change({ taperLimit: value }); }
            }
        ]
    };
}

// The size curve, size = base × ratio^step, plotted as px by step. The curve
// is the unrounded formula; the dots are the scale's own sizes. Two handles
// map onto the Scale fields above it, which stay the place to type values:
//
//   base   the point at step 0, dragged up or down (whole pixels)
//   ratio  the point at the top step; its height sets the ratio
export const SIZE_LIMITS = Object.freeze({ base: [8, 32], ratio: [1, 2] });

export function sizeDomain(config) {
    const top = Math.max(1, config.stepsAbove);
    const maxSize = config.base * config.ratio ** top;
    return { x: [-config.stepsBelow - 0.5, top + 0.5], y: [0, Math.ceil(maxSize * 1.1)] };
}

export function sizeCurveModel({ getConfig, onChange }) {
    const config = () => getConfig();
    const topStep = () => Math.max(1, config().stepsAbove);
    const [baseMin, baseMax] = SIZE_LIMITS.base;
    const [ratioMin, ratioMax] = SIZE_LIMITS.ratio;
    return {
        label: () => `Size by step: base ${config().base}px, ratio ${config().ratio}`,
        domain: () => sizeDomain(config()),
        sample: (step) => config().base * config().ratio ** step,
        samples: 120,
        guides: (domain) => [{ from: { x: domain.x[0], y: config().base }, to: { x: domain.x[1], y: config().base }, className: 'curve-axis' }],
        marks: () => {
            const marks = [];
            for (let step = -config().stepsBelow; step <= config().stepsAbove; step += 1) {
                const size = sizeAtStep(step, config());
                marks.push({ x: step, y: size, title: `${stepName(step)} · ${size}px` });
            }
            return marks;
        },
        handles: [
            {
                lockX: true,
                position: () => ({ x: 0, y: config().base }),
                move: ({ y }) => onChange({ base: clamp(Math.round(y), baseMin, baseMax) })
            },
            {
                lockX: true,
                position: () => ({ x: topStep(), y: config().base * config().ratio ** topStep() }),
                move: ({ y }) => {
                    if (y <= 0) return;
                    const ratio = (y / config().base) ** (1 / topStep());
                    onChange({ ratio: Number(clamp(ratio, ratioMin, ratioMax).toFixed(3)) });
                }
            }
        ],
        fields: []
    };
}
