export const LANG_CONFIG = {
  js: {
    name: 'JavaScript', color: '#EF9F27', comment: '//',
    fn: [
      /(?:function|async\s+function)\s+(\w+)/gm,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
      /(\w+)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>/gm,
    ],
    imports: [
      /import\s+(?:[^'"]+from\s+)?["']([^"']+)["']/gm,
      /require\(["']([^"']+)["']\)/gm,
    ],
  },
  py: {
    name: 'Python', color: '#3B8BD4', comment: '#',
    fn: [/def\s+(\w+)/gm, /class\s+(\w+)/gm],
    imports: [
      /^\s*from\s+([\w.]+)\s+import\b/gm,
      /^\s*import\s+([\w.]+)/gm,
    ],
  },
  go: {
    name: 'Go', color: '#5DCAA5', comment: '//',
    fn: [/func\s+(?:\([^)]+\)\s+)?(\w+)/gm],
    imports: [/import\s+(?:[\w.]+\s+)?["']([^"']+)["']/gm],
  },
  rs: {
    name: 'Rust', color: '#D85A30', comment: '//',
    fn: [/fn\s+(\w+)/gm, /struct\s+(\w+)/gm, /enum\s+(\w+)/gm],
    imports: [/use\s+(\w+)/gm],
  },
  rb: {
    name: 'Ruby', color: '#E24B4A', comment: '#',
    fn: [/def\s+(\w+)/gm, /class\s+(\w+)/gm, /module\s+(\w+)/gm],
    imports: [/require(?:_relative)?\s+["']([^"']+)["']/gm],
  },
  java: {
    name: 'Java', color: '#E85D24', comment: '//',
    fn: [/(?:public|private|protected|static|\s)+\s+[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)\s*(?:throws[^{]+)?\{/gm],
    imports: [/import\s+([\w.]+);/gm],
  },
};

LANG_CONFIG.jsx = { ...LANG_CONFIG.js, name: 'JSX' };
LANG_CONFIG.ts  = { ...LANG_CONFIG.js, name: 'TypeScript', color: '#185FA5' };
LANG_CONFIG.tsx = { ...LANG_CONFIG.js, name: 'TSX',        color: '#185FA5' };
