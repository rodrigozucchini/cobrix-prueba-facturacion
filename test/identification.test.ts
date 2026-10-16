/**
 * Holder identification (RN1–RN3, D18, D37): one customer per normalized ID, with the document
 * kept as it came and a reason when it is not valid.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeIdentification } from '../src/cobrix/rules/identification.ts'

function valid(raw: unknown) {
	const result = normalizeIdentification(raw)
	assert.ok(result.ok, `${String(raw)} debería ser válida`)
	return result.value
}

function invalid(raw: unknown) {
	const result = normalizeIdentification(raw)
	assert.ok(!result.ok, `${String(raw)} debería ser inválida`)
	return result.error
}

describe('identificación del titular', () => {
	it('RN1: quita separadores y ceros a la izquierda, y deja la letra en mayúscula', () => {
		assert.equal(valid('V-12345678').key, 'V12345678')
		assert.equal(valid('09000123').key, '9000123')
		assert.equal(valid('J-40123456-7').key, 'J401234567')
		assert.equal(valid('v 12.345.678').key, 'V12345678')
		assert.equal(valid('E-81234567').key, 'E81234567')
		assert.equal(valid('V-0012345678').key, 'V12345678')
	})

	it('RN1: el documento queda tal como vino, sin espacios sobrantes', () => {
		assert.equal(valid('  V-9876543 ').document, 'V-9876543')
		assert.equal(valid('09000123').document, '09000123')
	})

	it('RN3: J y G son jurídicas; V, E, P y sin letra, naturales', () => {
		assert.equal(valid('J-40123456-7').personType, 'juridica')
		assert.equal(valid('G-20000001-1').personType, 'juridica')
		assert.equal(valid('V-12345678').personType, 'natural')
		assert.equal(valid('E-81234567').personType, 'natural')
		assert.equal(valid('P-12345678').personType, 'natural')
		assert.equal(valid('09000123').personType, 'natural')
		assert.equal(valid('09000123').letter, null)
		assert.equal(valid('j-40123456-7').letter, 'J')
	})

	it('D37: los 6 a 12 dígitos se cuentan después de quitar los ceros', () => {
		assert.equal(valid('V-123456').key, 'V123456')
		assert.equal(valid('V-123456789012').key, 'V123456789012')
		assert.match(invalid('V-000123').message, /menos de 6 dígitos/)
		assert.match(invalid('V-1234567890123').message, /más de 12 dígitos/)
	})

	it('RN2: lo que no cumple RN1 dice por qué', () => {
		assert.match(invalid('V-12345').message, /menos de 6 dígitos/)
		assert.match(invalid('X-12345678').message, /no es V, E, J, G ni P/)
		assert.match(invalid('').message, /vacía/)
		assert.match(invalid('   ').message, /vacía/)
		assert.match(invalid('V-1234#5678').message, /caracteres/)
		assert.match(invalid('12345678V').message, /caracteres/)
		assert.match(invalid(null).message, /vacía/)
		assert.match(invalid(12345678).message, /no es un texto/)
	})
})
