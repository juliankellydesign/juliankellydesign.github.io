// Type token serializers. JSON output follows the W3C Design Tokens
// Community Group format ($type / $value).

const em = (value) => `${Number(value.toFixed(5))}em`;

export function typeTokens(scale) {
    const tokens = { font: { size: {}, tracking: {}, 'line-height': {} } };
    scale.forEach(({ name, size, letterSpacingEm, lineHeight }) => {
        tokens.font.size[name] = { $type: 'dimension', $value: `${size}px` };
        tokens.font.tracking[name] = { $type: 'dimension', $value: em(letterSpacingEm) };
        tokens.font['line-height'][name] = { $type: 'dimension', $value: `${lineHeight}px` };
    });
    return tokens;
}

export function typeCSS(scale) {
    const lines = [':root {'];
    scale.forEach(({ name, size, letterSpacingEm, lineHeight }) => {
        lines.push(`  --font-size-${name}: ${size}px;`);
        lines.push(`  --tracking-${name}: ${em(letterSpacingEm)};`);
        lines.push(`  --line-height-${name}: ${lineHeight}px;`);
    });
    lines.push('}');
    return lines.join('\n');
}

export function typeTailwindTheme(scale) {
    return Object.fromEntries(scale.map(({ name, size, letterSpacingEm, lineHeight }) => [
        name,
        [`${size}px`, { lineHeight: `${lineHeight}px`, letterSpacing: em(letterSpacingEm) }]
    ]));
}

export function typeTailwind(scale) {
    const fontSize = typeTailwindTheme(scale);
    return `module.exports = {\n  theme: {\n    extend: {\n      fontSize: ${JSON.stringify(fontSize, null, 2).replace(/\n/g, '\n      ')}\n    }\n  }\n};`;
}
