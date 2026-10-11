import { execFileSync } from 'node:child_process';
import path from 'node:path';
const key='HKCU\\Software\\Classes\\*\\shell\\MaterialFileEncryptor.Copy';
export function explorerCopyPath(argumentsList){const index=argumentsList.indexOf('--copy-to-encrypted-drive');if(index<0)return null;if(index+2!==argumentsList.length||typeof argumentsList[index+1]!=='string'||!path.isAbsolute(argumentsList[index+1])||argumentsList[index+1].includes('\0'))throw Error('Invalid Explorer copy selection.');return argumentsList[index+1];}
export function registerExplorerCommand(executable,{remove=false,run=execFileSync}={}){
 if(process.platform!=='win32')return false;
 if(!path.isAbsolute(executable)||executable.includes('"'))throw Error('Invalid application executable.');
 const invoke=args=>run('reg.exe',args,{windowsHide:true,stdio:'ignore'});
 if(remove){try{invoke(['delete',key,'/f']);}catch{}return true;}
 invoke(['add',key,'/ve','/t','REG_SZ','/d','Copy to encrypted drive','/f']);
 invoke(['add',key,'/v','Icon','/t','REG_SZ','/d',executable,'/f']);
 invoke(['add',key+'\\command','/ve','/t','REG_SZ','/d',`"${executable}" --copy-to-encrypted-drive "%1"`,'/f']);return true;
}
