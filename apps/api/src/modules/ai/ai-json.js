// JSON.parse discards duplicate object keys. Reject them before interpreting a pinned
// mapping (including escaped spellings of the same key), without another dependency.
export function parseUniqueJson(text, maxDepth = 32) {
  let pos = 0;
  const space = () => { while (/[\t\n\r ]/.test(text[pos] ?? '\0')) pos++; };
  const string = () => {
    const start = pos++;
    while (pos < text.length) {
      const ch = text[pos++];
      if (ch === '\\') pos++;
      else if (ch === '"') return JSON.parse(text.slice(start, pos));
    }
    throw new SyntaxError('Invalid JSON');
  };
  function value(depth) {
    if (depth > maxDepth) throw new SyntaxError('JSON nesting limit');
    space();
    const ch = text[pos];
    if (ch === '"') return string();
    if (ch === '{' || ch === '[') {
      const object = ch === '{';
      const out = object ? Object.create(null) : [];
      const seen = new Set();
      const end = object ? '}' : ']';
      pos++; space();
      if (text[pos] === end) { pos++; return out; }
      while (pos < text.length) {
        space();
        let key;
        if (object) {
          if (text[pos] !== '"') throw new SyntaxError('Invalid JSON');
          key = string(); space();
          if (seen.has(key) || text[pos++] !== ':') throw new SyntaxError('Duplicate/invalid JSON key');
          seen.add(key);
        }
        const item = value(depth + 1);
        if (object) out[key] = item;
        else out.push(item);
        space();
        if (text[pos] === end) { pos++; return out; }
        if (text[pos++] !== ',') throw new SyntaxError('Invalid JSON');
      }
      throw new SyntaxError('Invalid JSON');
    }
    const match = /^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(pos));
    if (!match) throw new SyntaxError('Invalid JSON');
    pos += match[0].length;
    return JSON.parse(match[0]);
  }
  const out = value(0); space();
  if (pos !== text.length) throw new SyntaxError('Invalid JSON');
  return out;
}
