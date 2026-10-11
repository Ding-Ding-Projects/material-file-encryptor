// This configuration is supplied by the native owner, never a request payload.
export function localEndpoint(port=11434){
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local Ollama port.');
  return Object.freeze({port,host:`127.0.0.1:${port}`,url:`http://127.0.0.1:${port}`});
}
