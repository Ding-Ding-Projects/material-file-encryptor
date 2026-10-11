export function accessGitEnvironment(){
 // Preserve the operating-system launch environment while removing every
 // inherited Git control, including routing, config injection and trace sinks.
 const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)&&!/^SSH_ASKPASS$/i.test(key)));
 const empty='/dev/null';
 return {...environment,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_SYSTEM:empty,GIT_CONFIG_GLOBAL:empty,GIT_CONFIG_COUNT:'0',GIT_ATTR_NOSYSTEM:'1'};
}
