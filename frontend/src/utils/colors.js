// Okabe–Ito color set (ignore black)
const PALETTE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442'];

// { 'P-100': '#0072B2', ... }
const OVERRIDE = {};

export const colorKeyOf = (o) => o.productCode ?? o.product_code;

const hash = (s) => {                       // FNV-1a
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
};
export const taskColor = (key) => OVERRIDE[key] || PALETTE[hash(key) % PALETTE.length];

const luminance = (hex) => {
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};

export const textColorOn = (hex) => (luminance(hex) > 0.21 ? '#222' : '#fff');