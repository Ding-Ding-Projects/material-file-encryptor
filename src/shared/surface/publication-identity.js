export const ACCOUNT_IDENTITY_UNAVAILABLE='The host did not provide a complete account identity. Refresh accounts or update the desktop host before using this account.';
export function accountIdentity(row){
 if(!row||typeof row.id!=='string'||!row.id)throw Error(ACCOUNT_IDENTITY_UNAVAILABLE);
 if(row.sourceKind==='gh-keyring'&&row.credentialRevision===null)return{accountId:row.id,sourceKind:row.sourceKind,credentialRevision:null};
 if(row.sourceKind==='protected-product'&&typeof row.credentialRevision==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.credentialRevision))return{accountId:row.id,sourceKind:row.sourceKind,credentialRevision:row.credentialRevision};
 throw Error(ACCOUNT_IDENTITY_UNAVAILABLE);
}
export function validAccountIdentity(row){try{accountIdentity(row);return true;}catch{return false;}}
export function accountChoiceKey(row){return JSON.stringify([row.sourceKind??null,row.id]);}
