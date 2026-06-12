const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Backgrounds
content = content.replace(/bg-slate-50\/80/g, 'bg-white/5');
content = content.replace(/bg-slate-50\/50/g, 'bg-white/[0.02]');
content = content.replace(/bg-slate-50/g, 'bg-[#0A0A0A]');
content = content.replace(/bg-white\/70/g, 'bg-[#0A0A0A]/70');
content = content.replace(/bg-white\/80/g, 'bg-[#0A0A0A]/80');
content = content.replace(/bg-white/g, 'bg-[#121212]');
content = content.replace(/bg-slate-950/g, 'bg-[#0A0A0A]');
content = content.replace(/bg-slate-100\/50/g, 'bg-white/5');
content = content.replace(/bg-slate-100/g, 'bg-white/5');

// Text colors
content = content.replace(/text-slate-900/g, 'text-white');
content = content.replace(/text-slate-800/g, 'text-slate-100');
content = content.replace(/text-slate-700/g, 'text-slate-300');
content = content.replace(/text-slate-600/g, 'text-slate-400');
content = content.replace(/text-slate-500/g, 'text-slate-400');
content = content.replace(/text-slate-400/g, 'text-slate-500'); // Sidebar icons

// Borders & Rings
content = content.replace(/border-slate-200\/60/g, 'border-white/10');
content = content.replace(/border-slate-200/g, 'border-white/10');
content = content.replace(/border-slate-100/g, 'border-white/5');
content = content.replace(/border-slate-800\/50/g, 'border-white/10');
content = content.replace(/ring-slate-200\/60/g, 'ring-white/10');
content = content.replace(/ring-slate-200\/50/g, 'ring-white/10');

// Shadows
content = content.replace(/shadow-\[0_2px_12px_-4px_rgba\(0,0,0,0\.05\)\]/g, 'shadow-2xl shadow-black/50');
content = content.replace(/shadow-sm/g, 'shadow-lg shadow-black/20');

// Hovers
content = content.replace(/hover:bg-slate-100/g, 'hover:bg-white/10');
content = content.replace(/hover:bg-slate-50/g, 'hover:bg-white/5');
content = content.replace(/hover:text-slate-900/g, 'hover:text-white');
content = content.replace(/hover:text-slate-600/g, 'hover:text-slate-200');

// Specific fixes for charts
content = content.replace(/stroke="#f1f5f9"/g, 'stroke="#222"');
content = content.replace(/fill: '#94a3b8'/g, 'fill: "#666"');
content = content.replace(/border: '1px solid #e2e8f0'/g, 'border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "#121212"');

// Fix inputs
content = content.replace(/focus:bg-white/g, 'focus:bg-[#1A1A1A]');

fs.writeFileSync('src/App.tsx', content);
console.log('Theme applied!');
