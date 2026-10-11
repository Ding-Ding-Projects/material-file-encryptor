import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const WINDOWS_QUERY="$ErrorActionPreference='Stop'; @(Get-CimInstance -ClassName Win32_VideoController | Select-Object Name,DriverVersion,DriverDate,AdapterRAM,Status,ConfigManagerErrorCode) | ConvertTo-Json -Compress";
export async function queryWindowsGraphics({executeFile=execute,systemRoot=process.env.SystemRoot}={}) {
  if(typeof systemRoot!=='string'||!/^[A-Za-z]:\\Windows$/i.test(systemRoot))throw new Error('The system executable directory is not verified.');
  const executable=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const {stdout}=await executeFile(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',WINDOWS_QUERY],{windowsHide:true,timeout:10000,maxBuffer:1024*1024,encoding:'utf8'});
  const parsed=JSON.parse(stdout.replace(/^\uFEFF/,'')),rows=Array.isArray(parsed)?parsed:parsed?[parsed]:[];
  if(rows.length>32)throw new Error('The graphics inventory exceeds its supported limit.');
  return rows.map(row=>({name:typeof row.Name==='string'?row.Name.slice(0,256):null,driverVersion:typeof row.DriverVersion==='string'?row.DriverVersion.slice(0,128):null,driverDate:typeof row.DriverDate==='string'?row.DriverDate.slice(0,128):null,reportedAdapterBytes:Number.isFinite(row.AdapterRAM)&&row.AdapterRAM>=0?row.AdapterRAM:null,status:typeof row.Status==='string'?row.Status.slice(0,64):null,deviceErrorCode:Number.isInteger(row.ConfigManagerErrorCode)?row.ConfigManagerErrorCode:null,usableVramBytes:null,backendSupported:null}));
}
// The parent resolves this path from a verified native picker/configuration,
// never from a renderer payload. CIM AdapterRAM is not usable GPU memory.
export function createNativeHardwareProbe({modelStoragePath=null,storagePathVerified=false,platform=process.platform,graphicsQuery=queryWindowsGraphics,system=os,filesystem=fs}={}) {
  if(modelStoragePath!==null&&(!storagePathVerified||!path.isAbsolute(modelStoragePath)))throw new Error('Model storage needs a verified absolute host path.');
  return async()=>{
    const at=new Date().toISOString(),cpus=system.cpus();
    const result={at,platform,architecture:system.arch(),cpu:{logicalCount:cpus.length,models:[...new Set(cpus.map(cpu=>cpu.model))].slice(0,32),reportedSpeedsMHz:[...new Set(cpus.map(cpu=>cpu.speed))].slice(0,32)},ramBytes:system.totalmem(),availableRamBytes:system.freemem(),gpus:[],gpu:null,vramBytes:null,backendSupported:null,freeDiskBytes:null,evidence:['CPU and memory from native operating-system queries.'],unknowns:[]};
    if(modelStoragePath){try{const resolved=await filesystem.realpath(modelStoragePath);if(!(await filesystem.stat(resolved)).isDirectory())throw new Error('not-directory');const volume=await filesystem.statfs(resolved);const bytes=Number(volume.bavail)*Number(volume.bsize);if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('invalid-capacity');result.freeDiskBytes=bytes;result.evidence.push('Available filesystem blocks measured at the host-verified model storage directory.');}catch{result.unknowns.push('Model storage could not be measured.');}}
    else result.unknowns.push('The actual Ollama model storage directory has not been verified.');
    if(platform==='win32'){try{result.gpus=await graphicsQuery();result.gpu=result.gpus.map(g=>g.name).filter(Boolean).join(', ')||null;result.evidence.push('Graphics models, driver versions and device status from Win32_VideoController.');}catch{result.unknowns.push('Native graphics inventory was unavailable.');}}
    else result.unknowns.push('This adapter does not implement native graphics enumeration on this operating system.');
    result.unknowns.push('Usable dedicated GPU memory and Ollama backend compatibility are not established by driver inventory.');
    return result;
  };
}
