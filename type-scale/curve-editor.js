// Draggable curve editor rendered as SVG, with numeric inputs. One editor for
// both curves on the page: the model (curve-models.js) supplies the curve,
// its handles and its fields, and maps edits onto the generator's own
// parameters.

import { CURVE_PAD, CURVE_SIZE, curveGeometry, curveScales } from './curve-models.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW = CURVE_SIZE + CURVE_PAD * 2;

function svg(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
}

const setLine = (element, { x1, y1, x2, y2 }) => {
    element.setAttribute('x1', x1);
    element.setAttribute('y1', y1);
    element.setAttribute('x2', x2);
    element.setAttribute('y2', y2);
};

export function createCurveEditor(container, model) {
    container.classList.add('curve-editor');
    const graph = svg('svg', { viewBox: `0 0 ${VIEW} ${VIEW}`, class: 'curve-graph', role: 'img' });
    const frame = svg('rect', { x: CURVE_PAD, y: CURVE_PAD, width: CURVE_SIZE, height: CURVE_SIZE, class: 'curve-frame' });
    const guideLayer = svg('g');
    const arms = model.handles.map((handle) => (handle.anchor ? svg('line', { class: 'curve-arm' }) : null));
    const path = svg('path', { class: 'curve-path' });
    const markLayer = svg('g');
    const handles = model.handles.map((handle) => svg('circle', {
        r: 7,
        class: `curve-handle${handle.lockX ? ' is-vertical' : ''}`,
        tabindex: 0
    }));
    graph.append(frame, guideLayer, ...arms.filter(Boolean), path, markLayer, ...handles);

    const inputs = document.createElement('div');
    inputs.className = 'curve-inputs';
    inputs.style.setProperty('--curve-fields', model.fields.length);
    const fields = model.fields.map((field) => {
        const label = document.createElement('label');
        label.textContent = field.label;
        const input = document.createElement('input');
        input.type = 'number';
        if (field.min !== undefined) input.min = field.min;
        if (field.max !== undefined) input.max = field.max;
        input.step = field.step;
        input.addEventListener('input', () => {
            const value = Number.parseFloat(input.value);
            if (Number.isFinite(value)) field.set(value);
        });
        label.append(input);
        inputs.append(label);
        return { field, input };
    });
    container.append(graph);
    if (fields.length) container.append(inputs);

    // While a handle is held, the frame keeps the domain it had at pointerdown
    // so the graph doesn't rescale under the pointer.
    let heldDomain = null;

    function render() {
        const domain = heldDomain ?? model.domain();
        const geometry = curveGeometry(model, domain);
        graph.setAttribute('aria-label', model.label());
        guideLayer.replaceChildren(...geometry.guides.map((guide) => {
            const line = svg('line', { class: guide.className });
            setLine(line, guide);
            return line;
        }));
        path.setAttribute('d', geometry.d);
        markLayer.replaceChildren(...geometry.marks.map(({ cx, cy, title }) => {
            const dot = svg('circle', { cx: cx.toFixed(2), cy: cy.toFixed(2), r: 3, class: 'curve-mark' });
            const tooltip = svg('title');
            tooltip.textContent = title;
            dot.append(tooltip);
            return dot;
        }));
        geometry.handles.forEach(({ cx, cy, arm }, index) => {
            if (arm) setLine(arms[index], arm);
            handles[index].setAttribute('cx', cx);
            handles[index].setAttribute('cy', cy);
        });
        fields.forEach(({ field, input }) => {
            if (document.activeElement !== input) input.value = field.get();
        });
    }

    model.handles.forEach((handle, index) => {
        const element = handles[index];
        element.addEventListener('pointerdown', (event) => {
            element.setPointerCapture(event.pointerId);
            heldDomain = model.domain();
            const { fromUnit } = curveScales(heldDomain);
            const move = (moveEvent) => {
                const box = graph.getBoundingClientRect();
                const scale = VIEW / box.width;
                const unitX = ((moveEvent.clientX - box.left) * scale - CURVE_PAD) / CURVE_SIZE;
                const unitY = 1 - ((moveEvent.clientY - box.top) * scale - CURVE_PAD) / CURVE_SIZE;
                handle.move(fromUnit(unitX, unitY), heldDomain);
            };
            const stop = () => {
                heldDomain = null;
                element.removeEventListener('pointermove', move);
                element.removeEventListener('pointerup', stop);
                element.removeEventListener('pointercancel', stop);
                render();
            };
            element.addEventListener('pointermove', move);
            element.addEventListener('pointerup', stop);
            element.addEventListener('pointercancel', stop);
        });
    });

    render();
    return { render };
}
