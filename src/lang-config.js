export const LANG_CONFIG = {
  js: {
    name: 'JavaScript', color: '#EF9F27', comment: '//', localStyle: 'path',
    fn: [
      /(?:function|async\s+function)\s+(\w+)/gm,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
      /(\w+)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>/gm,
    ],
    imports: [
      /import\s+(?:[^'"]+from\s+)?["']([^"']+)["']/gm,
      /require\(["']([^"']+)["']\)/gm,
    ],
    docBefore: /\/\*\*([\s\S]*?)\*\//g,
  },
  py: {
    name: 'Python', color: '#3B8BD4', comment: '#',
    fn: [/def\s+(\w+)/gm, /class\s+(\w+)/gm],
    imports: [
      /^\s*from\s+([\w.]+)\s+import\b/gm,
      /^\s*import\s+([\w.]+)/gm,
    ],
    docInside: /^\s*("""|''')([\s\S]*?)\1/,
  },
  go: {
    name: 'Go', color: '#5DCAA5', comment: '//', localStyle: 'path',
    fn: [/func\s+(?:\([^)]+\)\s+)?(\w+)/gm],
    imports: [/import\s+(?:[\w.]+\s+)?["']([^"']+)["']/gm],
    docBefore: /(?:^[ \t]*\/\/[^\n]*\n)+/m,
  },
  rs: {
    name: 'Rust', color: '#D85A30', comment: '//',
    fn: [/fn\s+(\w+)/gm, /struct\s+(\w+)/gm, /enum\s+(\w+)/gm],
    imports: [/use\s+(\w+)/gm],
    docBefore: /(?:^[ \t]*\/\/\/[^\n]*\n)+/m,
  },
  rb: {
    name: 'Ruby', color: '#E24B4A', comment: '#', localStyle: 'path',
    fn: [/def\s+(\w+)/gm, /class\s+(\w+)/gm, /module\s+(\w+)/gm],
    imports: [/require(?:_relative)?\s+["']([^"']+)["']/gm],
    docBefore: /(?:^[ \t]*#[^\n]*\n)+/m,
  },
  java: {
    name: 'Java', color: '#E85D24', comment: '//',
    fn: [/(?:public|private|protected|static|\s)+\s+[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)\s*(?:throws[^{]+)?\{/gm],
    imports: [/import\s+([\w.]+);/gm],
    docBefore: /\/\*\*([\s\S]*?)\*\//g,
  },
};

LANG_CONFIG.jsx = { ...LANG_CONFIG.js, name: 'JSX' };
LANG_CONFIG.ts  = { ...LANG_CONFIG.js, name: 'TypeScript', color: '#185FA5' };
LANG_CONFIG.tsx = { ...LANG_CONFIG.js, name: 'TSX',        color: '#185FA5' };

LANG_CONFIG.html = {
  name: 'HTML', color: '#E04E2A', comment: '<!--', localStyle: 'path',
  fn: [],
  imports: [
    /<script[^>]+src=["']([^"']+)["']/gim,
    /<link[^>]+href=["']([^"']+)["']/gim,
  ],
};
LANG_CONFIG.htm = { ...LANG_CONFIG.html };

LANG_CONFIG.css = {
  name: 'CSS', color: '#1F7AC2', comment: '/*', localStyle: 'path',
  fn: [],
  imports: [
    /@import\s+(?:url\()?["']([^"')]+)["']\)?/gm,
  ],
};
LANG_CONFIG.scss = { ...LANG_CONFIG.css, name: 'SCSS', color: '#C26593' };
LANG_CONFIG.sass = { ...LANG_CONFIG.css, name: 'Sass', color: '#C26593' };
LANG_CONFIG.less = { ...LANG_CONFIG.css, name: 'Less', color: '#264C82' };

LANG_CONFIG.vue = { ...LANG_CONFIG.js, name: 'Vue',     color: '#41B883' };
LANG_CONFIG.svelte = { ...LANG_CONFIG.js, name: 'Svelte', color: '#FF3E00' };
