/**
 * CSV for Excel in Spanish (extras RF44–RF46, RN42, CL29, CL30): BOM, `;`, `\r\n`, decimal comma,
 * `dd/mm/aaaa`, and quotes around anything that could break the columns. First the format with
 * hard texts, then the two downloads over HTTP (CA47, CA48).
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { csvAmount, csvDate, toCsv } from '../src/cobrix/export/csv.ts'
import type { CustomerListItem, ErrorBody, RunListItem } from '../src/shared/api-types.ts'
import { startSandbox, type Sandbox } from './helpers/sandbox.ts'

const BOM = '\uFEFF'

describe('formato del CSV', () => {
	it('RF46: empieza con el BOM, separa con «;» y termina cada fila con \\r\\n, también la última', () => {
		assert.equal(toCsv(['Nombre', 'Deuda (USD)'], [['LUIS GOMEZ', { cents: 9500 }], ['ANA PEREZ', { cents: 0 }]]),
			`${BOM}Nombre;Deuda (USD)\r\nLUIS GOMEZ;95,00\r\nANA PEREZ;0,00\r\n`)
	})

	it('CL29: una tabla vacía tiene solo los encabezados', () => {
		assert.equal(toCsv(['Nombre', 'Documento'], []), `${BOM}Nombre;Documento\r\n`)
	})

	it('RN42, CL30: un texto con «;», coma, comillas o saltos de línea va entre comillas, con las comillas internas duplicadas', () => {
		const cells = (text: string) => toCsv(['x'], [[text]]).slice(BOM.length + 'x\r\n'.length, -2)
		assert.equal(cells('COMERCIAL EL FARO, C.A.'), '"COMERCIAL EL FARO, C.A."')
		assert.equal(cells('uno;dos'), '"uno;dos"')
		assert.equal(cells('Dijo "hola"'), '"Dijo ""hola"""')
		assert.equal(cells('línea 1\nlínea 2'), '"línea 1\nlínea 2"')
		assert.equal(cells('con\r\nretorno'), '"con\r\nretorno"')
		assert.equal(cells('PEÑA ÁVILA'), 'PEÑA ÁVILA', 'los acentos y la ñ no necesitan comillas')
	})

	it('RN42: un monto va sin comillas aunque tenga coma decimal, para que Excel lo lea como número; un texto con coma, entre comillas', () => {
		assert.equal(toCsv(['Monto (USD)', 'Motivo'], [[{ cents: 123_500 }, 'Saldo residual, menor que USD 1,00']]),
			`${BOM}Monto (USD);Motivo\r\n1235,00;"Saldo residual, menor que USD 1,00"\r\n`)
	})

	it('una celda vacía (null) queda vacía y los números se escriben tal cual', () => {
		assert.equal(toCsv(['a', 'b', 'c'], [[null, 900103, '']]), `${BOM}a;b;c\r\n;900103;\r\n`)
	})

	it('RN42, P29: montos con coma decimal y sin separador de miles', () => {
		assert.equal(csvAmount(0), '0,00')
		assert.equal(csvAmount(5), '0,05')
		assert.equal(csvAmount(9500), '95,00')
		assert.equal(csvAmount(123_500), '1235,00')
		assert.equal(csvAmount(1_234_567_89), '1234567,89')
	})

	it('RF46: fechas dd/mm/aaaa', () => {
		assert.equal(csvDate('2026-10-13'), '13/10/2026')
		assert.equal(csvDate('2026-08-01'), '01/08/2026')
	})
})

/** Splits a CSV as Excel in Spanish would: `;` between cells, quotes around a cell that has them. */
function parse(text: string): string[][] {
	assert.ok(text.startsWith(BOM), 'empieza con el BOM')
	const rows: string[][] = []
	let row: string[] = []
	let cell = ''
	let quoted = false
	for (let i = BOM.length; i < text.length; i++) {
		const char = text[i]
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (char === '"') quoted = false
			else cell += char
		} else if (char === '"') quoted = true
		else if (char === ';') { row.push(cell); cell = '' }
		else if (char === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++ }
		else cell += char
	}
	return rows
}

describe('descargas CSV por HTTP, después del ciclo de pagos', () => {
	let sandbox: Sandbox
	let importRun: number

	before(async () => {
		sandbox = await startSandbox()
		importRun = (await sandbox.run(false)).id
		await sandbox.payAsInAssignment()
		await sandbox.run(false, 'paid')
	})
	after(() => sandbox.close())

	const download = async (path: string) => {
		const response = await fetch(`${sandbox.base}${path}`)
		// `response.text()` would drop the BOM: read the bytes as they came.
		return { response, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer()) }
	}

	it('CA47: clientes-2026-10-13.csv trae 20 filas en el orden de la tabla, con encabezados en español y la deuda de LUIS como 95,00', async () => {
		const { response, text } = await download('/api/clientes.csv')
		assert.equal(response.status, 200)
		assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8')
		assert.equal(response.headers.get('content-disposition'), 'attachment; filename="clientes-2026-10-13.csv"')
		const [headers, ...rows] = parse(text)
		assert.deepEqual(headers, ['Nombre', 'Documento', 'Tipo', 'Contratos', 'Facturas abiertas', 'Facturas pagadas', 'Deuda (USD)', 'Vencimiento más antiguo'])
		assert.equal(rows.length, 20)
		const table = (await sandbox.get<CustomerListItem[]>('/api/clientes')).body
		assert.deepEqual(rows.map(row => row[0]), table.map(customer => customer.name))
		assert.deepEqual(rows.find(row => row[0] === 'LUIS GOMEZ'), ['LUIS GOMEZ', 'V-9876543', 'Natural', '2', '4', '1', '95,00', '01/08/2026'])
		assert.deepEqual(rows.find(row => row[0] === 'ANA PEREZ')?.slice(6), ['0,00', 'Sin facturas abiertas'])
	})

	it('CA47, RF44: con «gomez» trae 1 fila, y con el tramo y el orden también exporta lo que muestra la tabla', async () => {
		assert.deepEqual(parse((await download('/api/clientes.csv?q=gomez')).text).slice(1).map(row => row[0]), ['LUIS GOMEZ'])
		assert.deepEqual(parse((await download('/api/clientes.csv?tramo=90%2B')).text).slice(1).map(row => row[0]), ['MIGUEL ANGEL SOTO'])
		const byDebt = (await sandbox.get<CustomerListItem[]>('/api/clientes?orden=deuda')).body
		assert.deepEqual(parse((await download('/api/clientes.csv?orden=deuda')).text).slice(1).map(row => row[0]), byDebt.map(customer => customer.name))
	})

	it('CA48, CL30: COMERCIAL EL FARO, C.A. va entre comillas y queda en una sola celda', async () => {
		const { text } = await download('/api/clientes.csv?q=faro')
		assert.match(text, /\r\n"COMERCIAL EL FARO, C\.A\.";/)
		assert.equal(parse(text)[1]?.length, 8)
	})

	it('CL29: sin coincidencias, solo los encabezados', async () => {
		assert.equal(parse((await download('/api/clientes.csv?q=nadie')).text).length, 1)
	})

	it('CA48: la primera importación con «Excluida por estado» trae 9 filas, con el resultado en español', async () => {
		const { response, text } = await download(`/api/corridas/${importRun}.csv?resultado=excluded_status`)
		assert.equal(response.headers.get('content-disposition'), `attachment; filename="corrida-${importRun}.csv"`)
		const [headers, ...rows] = parse(text)
		assert.deepEqual(headers, ['Contrato', 'Cuota', 'Cliente', 'Resultado', 'Motivo', 'Monto (USD)'])
		assert.equal(rows.length, 9)
		for (const row of rows) assert.equal(row[3], 'Excluida por estado')
		assert.ok(parse((await download(`/api/corridas/${importRun}.csv`)).text).length > 10, 'sin filtro, todas las filas')
	})

	it('RF45: en una corrida de pagadas, el abono parcial de LUIS dice su monto en Cobrix', async () => {
		const runs = (await sandbox.get<RunListItem[]>('/api/corridas')).body
		const paid = runs.find(run => run.kind === 'paid')
		const rows = parse((await download(`/api/corridas/${paid?.id}.csv?resultado=partial`)).text).slice(1)
		assert.deepEqual(rows.map(row => [row[2], row[3], row[5]]), [['LUIS GOMEZ', 'Abono parcial', '20,00']])
	})

	it('P31: un resultado que no es de ese tipo de corrida responde 400, y una corrida que no existe, 404', async () => {
		const wrong = await fetch(`${sandbox.base}/api/corridas/${importRun}.csv?resultado=marked_paid`)
		assert.equal(wrong.status, 400)
		assert.equal((await wrong.json() as ErrorBody).error.code, 'validation')
		assert.equal((await fetch(`${sandbox.base}/api/corridas/999.csv`)).status, 404)
		assert.equal((await fetch(`${sandbox.base}/api/clientes.csv?tramo=120`)).status, 400)
	})

	it('RF51: cada exportación deja su línea export.csv con el archivo, las filas y los filtros, sin datos de clientes', async () => {
		const before = sandbox.auditLines().filter(line => line.action === 'export.csv').length
		await download('/api/clientes.csv?q=gomez')
		await download(`/api/corridas/${importRun}.csv?resultado=excluded_status`)
		const lines = sandbox.auditLines().filter(line => line.action === 'export.csv').slice(before)
		assert.deepEqual(lines.map(({ at: _at, ...rest }) => rest), [
			{ actor: 'operador', action: 'export.csv', file: 'clientes-2026-10-13.csv', rows: 1, filters: { q: 'gomez', orden: 'vencimiento', tramo: null } },
			{ actor: 'operador', action: 'export.csv', file: `corrida-${importRun}.csv`, rows: 9, filters: { resultado: 'excluded_status' } },
		])
	})
})
