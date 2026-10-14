// Narration through the browser's own speech engine. Settings are local; speech
// always stops before new speech starts, so two readings never overlap.

export const narrationKey = 'mfe-extension-narration-v1';
export const narrationDefaults = Object.freeze({voice: '', rate: 1});

export function readNarration(storage) {
  try {
    const value = JSON.parse(storage?.getItem(narrationKey) || 'null');
    if (value && typeof value.voice === 'string' && value.voice.length <= 200 && typeof value.rate === 'number' && value.rate >= 0.5 && value.rate <= 2) return {voice: value.voice, rate: Math.round(value.rate * 10) / 10};
  } catch {}
  return {...narrationDefaults};
}
export function saveNarration(storage, value) {
  const next = {voice: String(value.voice || '').slice(0, 200), rate: Math.min(2, Math.max(0.5, Math.round(Number(value.rate || 1) * 10) / 10))};
  try { storage?.setItem(narrationKey, JSON.stringify(next)); } catch {}
  return next;
}

/** Voices that suit the interface language: Cantonese voices for Cantonese, English otherwise; both for bilingual. */
export function voicesFor(voices, language) {
  const list = Array.isArray(voices) ? voices : [];
  const cantonese = voice => /^(yue|zh-HK)/i.test(voice.lang || ''), english = voice => /^en/i.test(voice.lang || '');
  return list.filter(language === 'yue' ? cantonese : language === 'bilingual' ? voice => cantonese(voice) || english(voice) : english);
}

/** Turns actionable page items into sentences: headings and statuses as written, controls named with their role. */
export function narrationScript(items, roleNames = {button: 'button', tab: 'tab', link: 'link', field: 'field', switch: 'switch'}) {
  return items
    .map(({kind, text, disabled}) => {
      const words = String(text || '').replace(/\s+/g, ' ').trim();
      if (!words) return '';
      if (kind === 'heading' || kind === 'text') return words;
      return `${words}, ${roleNames[kind] || kind}${disabled ? ', unavailable' : ''}`;
    })
    .filter(Boolean)
    .slice(0, 200);
}

/** Speaks each sentence in order; any speech already queued is cancelled first. Returns how many were queued. */
export function speak(synth, sentences, {voice = null, rate = 1, lang = 'en'} = {}, Utterance = globalThis.SpeechSynthesisUtterance) {
  if (!synth) return 0;
  synth.cancel();
  if (typeof Utterance !== 'function') return 0;
  for (const sentence of sentences) {
    const utterance = new Utterance(sentence);
    utterance.rate = rate; utterance.lang = lang;
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }
  return sentences.length;
}
export function stopSpeech(synth) { if (synth) synth.cancel(); }
