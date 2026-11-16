// In-memory undo/redo for one builder instance. Each builder owns its own history, so editing one
// search field never moves another field's states. Nothing here is persisted.

export function createEditHistory({ limit = 100, initial = { pattern: '', flags: '', replacement: '' } } = {}) {
  let stack = [{ ...initial }];
  let index = 0;
  const same = (a, b) => a.pattern === b.pattern && a.flags === b.flags && a.replacement === b.replacement;
  return {
    push(state) {
      if (same(stack[index], state)) return false;
      stack = stack.slice(0, index + 1);
      stack.push({ pattern: state.pattern, flags: state.flags, replacement: state.replacement ?? '' });
      if (stack.length > limit) stack.shift();
      index = stack.length - 1;
      return true;
    },
    undo() { if (index > 0) index--; return { ...stack[index] }; },
    redo() { if (index < stack.length - 1) index++; return { ...stack[index] }; },
    canUndo: () => index > 0,
    canRedo: () => index < stack.length - 1,
    current: () => ({ ...stack[index] }),
    /** Most recent distinct states first, for the recall list. */
    recent: (count = 20) => stack.slice(0, index + 1).reverse().slice(0, count).map(s => ({ ...s }))
  };
}
