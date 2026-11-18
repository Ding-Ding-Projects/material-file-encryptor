import { localized } from '../../../shared/surface/registry.js';
import { REGISTRY_COPY } from './registry-copy.js';
import { REGISTRY_LOGIN_COPY } from './registry-login-copy.js';

// The sign-in panel outside the backup page is not step 1 of anything, so its title drops the number.
const STANDALONE = Object.freeze({ loginTitle: ['Sign in to Docker Hub', '登入 Docker Hub'] });

/**
 * Wording for a sign-in panel shown outside the backup page (the Docker Hub drive and Share dialogs). The panel
 * reads keys from both the sign-in copy and the backup page copy, so both are searched; an unknown key is returned
 * unchanged rather than invented.
 */
export function registryLoginText(key, language) {
  const pair = STANDALONE[key] || REGISTRY_LOGIN_COPY[key] || REGISTRY_COPY[key];
  return Array.isArray(pair) ? localized({ en: pair[0], yue: pair[1] }, language === 'zh-HK' ? 'yue' : language) : key;
}
