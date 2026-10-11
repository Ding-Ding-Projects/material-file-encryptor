import {localized} from './localization.js';

export function commandSearchText(command,language='en') {
 let value='';try{value=command.control?.get?.()??'';}catch{}
 return [localized(command.label,language),localized(command.description,language),localized(command.group,language),command.keywords?.join(' ')??'',String(value),...(command.control?.options??[]).map(option=>localized(option.label,language))].filter(Boolean).join(' ');
}
