export { parseVocabulary, replaceVocabulary } from './personal-vocabulary.js';
export function filterGuides(guides, query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return guides.filter(guide => terms.every(term => guide.text.toLocaleLowerCase().includes(term)));
}

// Groups never count as searchable entries. A matching image keeps its group and anchor visible.
export function updateGalleryGroups(groups,links) {
 const visibility=new Map();
 for(const group of groups){const visible=[...group.querySelectorAll('.guide')].some(figure=>!figure.hidden);group.hidden=!visible;visibility.set(group.id,visible);}
 for(const link of links)link.hidden=!visibility.get(link.dataset.galleryGroupLink);
}
