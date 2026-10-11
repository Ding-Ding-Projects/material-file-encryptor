export function localized(value, language = 'en') {
  if (typeof value === 'string') return value;
  const en = value?.en ?? '';
  const yue = value?.yue ?? en;
  return language === 'yue' ? yue : language === 'bilingual' && yue !== en ? `${en} · ${yue}` : en;
}
