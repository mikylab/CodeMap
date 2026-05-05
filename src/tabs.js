export const TABS = [
  { id: 'overview',  label: 'Overview',  enabled: true },
  { id: 'walk',      label: 'Walk',      enabled: true },
  { id: 'functions', label: 'Functions', enabled: true },
  { id: 'trace',     label: 'Trace',     enabled: true },
  { id: 'graph',     label: 'Graph',     enabled: true },
  { id: 'smells',    label: 'Smells',    enabled: true },
  { id: 'libraries', label: 'Libraries', enabled: true },
];

const STDLIB = new Set(
  ('os sys io re json math time datetime logging typing pathlib collections itertools functools threading subprocess unittest abc copy enum dataclasses string random hashlib base64 urllib http socket')
    .split(' ')
);

export function isStdlib(lib) { return STDLIB.has(lib); }

export function cxBucket(cx) {
  if (cx < 5) return 'low';
  if (cx < 8) return 'mid';
  return 'high';
}

export function STEP_COLORS() {
  return {
    meta:       '#888780',
    archetype:  '#C76FBF',
    entry:      '#1D9E75',
    hop:        '#34B98C',
    core:       '#3B8BD4',
    boundary:   '#D88A4A',
    complexity: '#E24B4A',
    utils:      '#EF9F27',
    config:     '#7F77DD',
    orphans:    '#7A776D',
    deps:       '#5DCAA5',
  };
}
