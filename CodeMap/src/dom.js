export function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.cls) node.className = opts.cls;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.title) node.title = opts.title;
  if (opts.type) node.type = opts.type;
  if (opts.disabled) node.disabled = true;
  if (opts.value != null) node.value = opts.value;
  if (opts.placeholder) node.placeholder = opts.placeholder;
  if (opts.style) Object.assign(node.style, opts.style);
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.on) for (const [evt, fn] of Object.entries(opts.on)) node.addEventListener(evt, fn);
  for (const c of children) if (c != null) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

export function clear(node) { node.replaceChildren(); }

export function alpha(hex, hexAlpha) {
  return hex.length === 7 ? hex + hexAlpha : hex;
}
