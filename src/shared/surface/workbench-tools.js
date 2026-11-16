import { mountRegexBuilder } from './regex/ui/index.js';

/** Mounts the complete regex builder into `owner.builder` for this one search field. */
export function mountWorkbenchTools(owner, { enabled }) {
  return mountRegexBuilder(owner, { enabled });
}
