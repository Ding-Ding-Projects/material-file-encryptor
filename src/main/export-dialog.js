// Options and result handling for the native "save as" dialog used by text exports
// (notification history, documentation articles, the changelog).
//
// The dialog's own file name box decides the destination: the path and name the person
// types or picks are used exactly, and only a missing extension is completed from the
// suggested name so the file still opens with the expected program.
import path from 'node:path';

const FILTERS = {
  json: {name: 'JSON', extensions: ['json']},
  csv: {name: 'CSV', extensions: ['csv']},
  md: {name: 'Markdown', extensions: ['md']},
  txt: {name: 'Text', extensions: ['txt']},
  html: {name: 'HTML', extensions: ['html']}
};

/** A title that names what is being exported, never a generic or wrong one. */
export function exportDialogTitle(name = '') {
  const base = path.basename(String(name)).toLowerCase();
  if (base.startsWith('notifications.')) return 'Export notification history';
  if (base.startsWith('changelog.')) return 'Export changelog';
  if (/\.(md|html)$/.test(base)) return 'Export documentation article';
  return 'Export file';
}

export function exportDialogOptions({name = 'export.txt'} = {}, {lastDirectory, documentsDirectory} = {}) {
  const extension = path.extname(name).slice(1).toLowerCase();
  const filters = [...(FILTERS[extension] ? [FILTERS[extension]] : []), {name: 'All files', extensions: ['*']}];
  const directory = lastDirectory || documentsDirectory;
  return {title: exportDialogTitle(name), defaultPath: directory ? path.join(directory, name) : name, filters, properties: ['showOverwriteConfirmation', 'createDirectory']};
}

/** The exact chosen path, with the suggested extension added only when the person typed none. */
export function chosenExportPath(filePath, suggestedName = '') {
  const suggested = path.extname(suggestedName);
  if (!suggested || path.extname(filePath)) return filePath;
  return filePath + suggested;
}
