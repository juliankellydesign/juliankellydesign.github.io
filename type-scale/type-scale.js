// Type scale, tracking curve, and line-height snapping, ported from Julian's
// Guide to Interfaces (guide/methods/typography/type-scale.md,
// tracking-curve.md, responsive-type.md).
//
//   size(step)    = round(base × ratio^step)
//   rawPercent    = (base − size) ÷ divisor
//   tracking      = shift + rawPercent ÷ ∛(1 + (|rawPercent| ÷ taperLimit)^3) [+ caps]
//   lineHeight    = round(size × ratio ÷ grid) × grid, grid = size > 20 ? 4 : 2

export const RATIO_PRESETS = Object.freeze([
    { name: 'Minor second', ratio: 1.067 },
    { name: 'Major second', ratio: 1.125 },
    { name: 'Minor third', ratio: 1.2 },
    { name: 'Major third', ratio: 1.25 },
    { name: 'Perfect fourth', ratio: 1.333 },
    { name: 'Augmented fourth', ratio: 1.414 },
    { name: 'Perfect fifth', ratio: 1.5 },
    { name: 'Golden ratio', ratio: 1.618 }
]);

export const TYPE_DEFAULTS = Object.freeze({
    base: 17,
    ratio: 1.125,
    stepsBelow: 3,
    stepsAbove: 11,
    round: true,
    tracking: {
        shift: 0,
        divisor: 3,
        taperLimit: 4, // the guide uses 6; Julian set 4 on 2026-10-06
        taperExponent: 3,
        allCapsAdjustment: 4
    },
    lineHeight: {
        body: 1.5,
        heading: 1.2,
        headingFromStep: 2,
        gridThreshold: 20,
        gridSmall: 2,
        gridLarge: 4
    }
});

export function cloneTypeDefaults() {
    return JSON.parse(JSON.stringify(TYPE_DEFAULTS));
}

export function sizeAtStep(step, config = TYPE_DEFAULTS) {
    const size = config.base * config.ratio ** step;
    return config.round ? Math.round(size) : Number(size.toFixed(2));
}

export function trackingPercent(size, config = TYPE_DEFAULTS, { allCaps = false, manualAdjustment = 0 } = {}) {
    const { shift, divisor, taperLimit, taperExponent, allCapsAdjustment } = config.tracking;
    const rawPercent = (config.base - size) / divisor;
    const taperRatio = Math.abs(rawPercent) / taperLimit;
    const tapered = rawPercent / Math.cbrt(1 + taperRatio ** taperExponent);
    return shift + tapered + (allCaps ? allCapsAdjustment : 0) + manualAdjustment;
}

export function snappedLineHeight(size, ratio, config = TYPE_DEFAULTS, manualAdjustment = 0) {
    const { gridThreshold, gridSmall, gridLarge } = config.lineHeight;
    const grid = size > gridThreshold ? gridLarge : gridSmall;
    const snapped = Math.round((size * ratio) / grid) * grid;
    return Math.max(grid, snapped + manualAdjustment);
}

export function stepName(step) {
    if (step === 0) return 'base';
    return step > 0 ? `up-${step}` : `down-${-step}`;
}

export function generateTypeScale(config = TYPE_DEFAULTS, { allCaps = false } = {}) {
    const steps = [];
    for (let step = -config.stepsBelow; step <= config.stepsAbove; step += 1) steps.push(step);
    return steps.map((step) => {
        const size = sizeAtStep(step, config);
        const isHeading = step >= config.lineHeight.headingFromStep;
        const lineHeightRatio = isHeading ? config.lineHeight.heading : config.lineHeight.body;
        const tracking = trackingPercent(size, config, { allCaps });
        return {
            step,
            name: stepName(step),
            size,
            trackingPercent: tracking,
            letterSpacingEm: tracking / 100,
            lineHeightRatio,
            lineHeight: snappedLineHeight(size, lineHeightRatio, config)
        };
    });
}
