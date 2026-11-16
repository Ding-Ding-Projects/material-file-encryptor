// Entry point for the editorial layer. Each part is independent: a failure in one never stops the others, and the page stays readable without any of them.
import {mountLanguage, applyLanguage} from './i18n.js';
import {mountMotion} from './motion.js';
import {mountSound} from './sound.js';
import {mountReading} from './reading.js';
import {mountSearchPanels} from './search.js';
import {mountWordingDrop} from './wording-drop.js';
import {mountDiagrams} from './diagrams.js';
import {mountSettingsPage} from './settings-page.js';
import {mountFeaturesPage} from './features-page.js';

const parts = [mountLanguage, mountMotion, mountSound, mountReading, mountDiagrams, mountSearchPanels, mountSettingsPage, mountFeaturesPage, mountWordingDrop];
function start() {
 for (const part of parts) { try { Promise.resolve(part()).catch(() => {}); } catch { /* keep going */ } }
 // Re-apply language after generated controls (search, settings) appear.
 applyLanguage();
 const current = location.pathname.split('/').pop() || 'index.html';
 for (const link of document.querySelectorAll('.publication-nav a')) if (link.getAttribute('href').split('/').pop() === current) link.setAttribute('aria-current', 'page');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
