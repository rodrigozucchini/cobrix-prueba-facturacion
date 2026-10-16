/**
 * La contraseña del proveedor se guarda cifrada (D53, AES-256-GCM). La clave sale de
 * COBRIX_SECRET_KEY o de un archivo junto a la base (`data/cobrix.sqlite.key`, que no se entrega);
 * una base en memoria (pruebas) usa una al azar. La clave nunca va dentro de la base.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'

const keys = new WeakMap<DatabaseSync, Buffer>()

export function loadKey(db: DatabaseSync, path: string): void {
	const configured = process.env.COBRIX_SECRET_KEY
	if (configured) return void keys.set(db, createHash('sha256').update(configured).digest())
	if (path === ':memory:') return void keys.set(db, randomBytes(32))
	const file = `${path}.key`
	if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 })
	const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64')
	if (key.length !== 32) throw new Error(`${file} no es una clave válida: bórralo y vuelve a cargar la contraseña.`)
	keys.set(db, key)
}

function keyOf(db: DatabaseSync): Buffer {
	const key = keys.get(db)
	if (!key) throw new Error('clave: la base no se abrió con openDatabase')
	return key
}

/** `iv.tag.data` en base64; vacía queda vacía. */
export function seal(db: DatabaseSync, plain: string): string {
	if (plain === '') return ''
	const iv = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', keyOf(db), iv)
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
	return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64')).join('.')
}

/** `''` si no se puede abrir (otra clave, o guardada antes de D53): el panel la vuelve a pedir. */
export function unseal(db: DatabaseSync, sealed: string): string {
	const [iv, tag, data] = sealed.split('.').map(part => Buffer.from(part, 'base64'))
	if (!iv || !tag || !data) return ''
	try {
		const decipher = createDecipheriv('aes-256-gcm', keyOf(db), iv)
		decipher.setAuthTag(tag)
		return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
	} catch {
		return ''
	}
}
