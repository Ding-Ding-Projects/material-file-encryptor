export type ProtectedProfile = 'local-profile';
export type ProtectedOperation = 'read-profile-summary';
export type ProtectedTarget = 'profile-summary';
export interface NativeAuthenticationContext {
 origin: string;
 profileId: ProtectedProfile;
 operation: ProtectedOperation;
 target: ProtectedTarget;
 signal: AbortSignal;
}
export interface NativeProfileAuthority {
 profileId: ProtectedProfile;
 revision: string;
 expiresAt: number;
 /** Opaque native-only actor and authentication binding. Never serialize. */
 authority: object;
}
export interface NativeValidationContext {
 authority: object;
 profileId: ProtectedProfile;
 revision: string;
 signal: AbortSignal;
}
export interface SafeProtectedProfileSummary {
 schemaVersion: 1;
 profile: 'authenticated';
 protectedAccess: 'granted';
}
export interface ProtectedMediationOptions {
 allowedOrigins: string[];
 getPair(origin: string): {session: string; expires: number} | null | undefined;
 isUnlocked(): boolean;
 authenticateProfile?(context: NativeAuthenticationContext): Promise<NativeProfileAuthority>;
 validateAuthority?(context: NativeValidationContext): Promise<boolean>;
 readProfileSummary?(context: NativeValidationContext): Promise<SafeProtectedProfileSummary>;
 now?(): number;
 timeoutMs?: number;
}
export type ProtectedBrowserMessage =
 | {type: 'protected-discover' | 'protected-revoke'; session: string}
 | {type: 'protected-authenticate'; session: string; profileId: ProtectedProfile; operation: ProtectedOperation; target: ProtectedTarget}
 | {type: 'protected-execute'; session: string; profileId: ProtectedProfile; operation: ProtectedOperation; target: ProtectedTarget; grant: string};
export type ProtectedBrowserResponse =
 | {type: 'protected-capabilities'; schemaVersion: 1; authentication: 'unavailable' | 'native-explicit'; operations: Array<{profileId: ProtectedProfile; operation: ProtectedOperation; target: ProtectedTarget}>}
 | {type: 'protected-revoked'; schemaVersion: 1}
 | {type: 'protected-granted'; schemaVersion: 1; grant: string; profileId: ProtectedProfile; operation: ProtectedOperation; target: ProtectedTarget; expiresInMilliseconds: number}
 | {type: 'protected-result'; schemaVersion: 1; profileId: ProtectedProfile; operation: ProtectedOperation; target: ProtectedTarget; summary: SafeProtectedProfileSummary};
export function createBrowserProtectedMediation(options: ProtectedMediationOptions): {
 supports(type: string): boolean;
 receive(origin: string, message: ProtectedBrowserMessage): Promise<ProtectedBrowserResponse>;
 revoke(): void;
 close(): void;
 readonly pending: number;
};
