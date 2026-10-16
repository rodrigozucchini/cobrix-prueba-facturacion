/** Lo que reciben los controladores por inyección (DT1). Tokens explícitos: sin metadatos de tipos, nada se resuelve por tipo. */

export const DB = Symbol('cobrix.db')
export const AUDIT = Symbol('cobrix.audit')
/** Momento real (D35); reemplazable en las pruebas. */
export const NOW = Symbol('cobrix.now')
export const ENGINE = Symbol('cobrix.engine')
