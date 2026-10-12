/** Authorize the protected name before changing renderer preferences. */
export function createDisplayNameMutation({getSettings,apply,authorize,isAvailable=()=>true,onPending=()=>{}}){
 let pending=false,generation=0;
 return {get pending(){return pending;},invalidate(){generation++;},async update(patch,action){
  if(pending||!isAvailable())throw Error('This control is unavailable.');
  if(typeof authorize!=='function')throw Error('Protected display-name changes are unavailable. The existing name is unchanged.');
  const value=patch.displayName;if(typeof value!=='string'||!value.trim()||value.length>160||/[\u0000-\u001f\u007f]/.test(value))throw Error('Enter a non-empty display name of at most 160 characters without control characters.');
  const before=getSettings(),request=++generation,keys=Object.keys(patch);pending=true;onPending(true,value);
  try{const accepted=await authorize(value);if(accepted!==true)throw Error('The protected display-name change was not accepted.');if(!isAvailable()||request!==generation)throw Error('The protected name was saved, but this editor is unavailable. Reopen it to synchronize.');const current=getSettings();if(keys.some(key=>JSON.stringify(current[key])!==JSON.stringify(before[key])))throw Error('The protected name was saved, but local preferences changed. Reload to synchronize before retrying.');return apply(patch,action);}
  finally{pending=false;onPending(false,value);}
 }};
}

export const DISPLAY_NAME_COPY=Object.freeze({
 'Protected display-name changes are unavailable. The existing name is unchanged.':'受保護名稱修改暫時不可用，現有名稱保持不變。',
 'Enter a non-empty display name of at most 160 characters without control characters.':'請輸入非空白顯示名稱，最多 160 個字元，而且唔可以包含控制字元。',
 'The protected display-name change was not accepted.':'受保護顯示名稱修改未獲接受。',
 'The protected name was saved, but this editor is unavailable. Reopen it to synchronize.':'受保護名稱已儲存，但呢個編輯器已不可用，請重新開啟以同步。',
 'The protected name was saved, but local preferences changed. Reload to synchronize before retrying.':'受保護名稱已儲存，但本機偏好設定已變更，請重新載入同步後再試。'
});
