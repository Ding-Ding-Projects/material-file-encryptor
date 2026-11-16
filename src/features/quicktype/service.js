/** Host side of the type generator. The engine is loaded on first use so startup never pays for it. */
let enginePromise;
const loadEngine = () => (enginePromise ??= import('./engine.js'));

const TOP_KEYS = ['sourceKind', 'sources', 'name', 'language', 'rendererOptions', 'inference', 'lenient'];

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

export function createQuicktypeService({loader = loadEngine} = {}) {
  let languages;
  return {
    async dispatch(action, payload = {}) {
      if (!plain(payload)) throw new Error('Unsupported type generator request.');
      const engine = await loader();
      if (action === 'languages') {
        if (Object.keys(payload).length) throw new Error('Unsupported type generator request.');
        languages ??= engine.listLanguages();
        return {languages, inference: engine.INFERENCE_SWITCHES, limits: {maxSourceBytes: engine.MAX_SOURCE_BYTES, maxSources: engine.MAX_SAMPLES}};
      }
      if (action === 'generate') {
        if (Object.keys(payload).some(key => !TOP_KEYS.includes(key))) throw new Error('Unsupported type generator request.');
        if (payload.rendererOptions !== undefined && !plain(payload.rendererOptions)) throw new Error('Renderer options must be an object.');
        if (payload.inference !== undefined && !plain(payload.inference)) throw new Error('Inference switches must be an object.');
        if (payload.name !== undefined && (typeof payload.name !== 'string' || payload.name.length > 80)) throw new Error('The top-level name must be short text.');
        if (payload.language !== undefined && (typeof payload.language !== 'string' || payload.language.length > 40)) throw new Error('Unsupported target language.');
        return engine.generate(payload);
      }
      throw new Error('Unsupported type generator action.');
    }
  };
}
