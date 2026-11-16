// Surface and product-kind scope for feature entries that apply to only some surfaces of this product. Every entry
// returned here is an exclusion with a stated scope; an entry that applies falls through to the default product scope
// in feature-delivery.mjs. Missing implementation never grants an exemption: only the catalogue scope does.

const excluded = declaredScope => Object.freeze({ kind: 'not-applicable', applies: false, directSurface: false, declaredScope });

// Applications only: the desktop application and the browser extension, never the documentation website.
const APPLICATIONS_ONLY = new Set(['action-sound-effects']);
// The desktop application alone. The website and the extension host no editor, server manager or desktop bridge.
const DESKTOP_ONLY = new Set(['extension-support', 'minecraft-world-generator', 'drawesome-drawing']);
// The desktop application and its documentation article, never the browser extension.
const DESKTOP_AND_SITE_ONLY = new Set(['base64-tools', 'quicktype-studio', 'virtual-disk-manager', 'animation-editor']);
// Delivery forms that need a product able to run inside a Linux container. This product is a Windows drive built on
// WinFsp with a native .NET engine and a desktop shell, so none of them can apply to any surface.
const CONTAINER_FORM_ONLY = new Set(['paired-hosted-forms', 'three-delivery-forms']);
// Wording for job-related workflows only.
const JOB_RELATED_ONLY = new Set(['job-experience-document-label']);

/** Returns an exclusion for the entry on the surface, or null when the default product scope applies. */
export function additionalFeatureScope(id, surface) {
  if (CONTAINER_FORM_ONLY.has(id)) return excluded('Products able to run in a Linux container only');
  if (JOB_RELATED_ONLY.has(id)) return excluded('Job-related products only');
  if (APPLICATIONS_ONLY.has(id) && surface === 'site') return excluded('Applications only');
  if (DESKTOP_ONLY.has(id) && surface !== 'desktop') return excluded('Desktop application only');
  if (DESKTOP_AND_SITE_ONLY.has(id) && surface === 'extension') return excluded('Desktop application and documentation website only');
  return null;
}
