// Information icons for the browser extension popup and workspace. The shared controller, inventories and
// bilingual wording are bundled into one local module so the pages need no remote code.
import {createInfoIconController} from '../src/shared/surface/info-icon-controller.js';
import {EXTENSION_POPUP_INFO_ICON_INVENTORY, EXTENSION_OPTIONS_INFO_ICON_INVENTORY} from '../src/shared/local-ux/info-icon-extension.js';
import {INFO_ICON_COPY} from '../src/shared/local-ux/info-icon-inventory.js';
import {GUIDANCE_COPY} from '../src/shared/surface/control-guidance.js';

const INVENTORIES = Object.freeze({popup: EXTENSION_POPUP_INFO_ICON_INVENTORY, options: EXTENSION_OPTIONS_INFO_ICON_INVENTORY});

/** Translator for the three language modes. English is the source text; Cantonese comes from the bundled wording. */
export function infoIconTranslator(getLanguage) {
  return source => {
    const yue = INFO_ICON_COPY[source] || GUIDANCE_COPY[source] || source, language = getLanguage();
    return language === 'yue' ? yue : language === 'bilingual' && yue !== source ? `${source} / ${yue}` : source;
  };
}

/** Mounts one compact information icon immediately before each capable control of the popup or the workspace page. */
export function mountExtensionInfoIcons(kind, {root = document, getLanguage = () => 'en', registerCommands, openHelp} = {}) {
  const inventory = INVENTORIES[kind];
  if (!inventory) throw new Error('Unknown extension page.');
  return createInfoIconController(root, {inventory, t: infoIconTranslator(getLanguage), getLanguage, registerCommands, openHelp, pair: true});
}
