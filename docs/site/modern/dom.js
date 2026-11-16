// Shared helpers for generated controls, which the site foundation upgrades to Material components.
/** Marks a toggle chip pressed. The upgraded component host keeps its state in data-aria-pressed, so both forms are written. */
export function setPressed(node, on) {
 node.setAttribute('aria-pressed', String(on));
 node.setAttribute('data-aria-pressed', String(on));
}
