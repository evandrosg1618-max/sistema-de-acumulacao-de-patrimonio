// EXECUTOR de homologação (temporário) — carrega o script real de homologação e
// executa-o UMA VEZ, gravando a saída em scripts/homologacao-saida.txt.
// Será removido junto com os artefatos após a homologação.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = process.cwd()
const SAIDA = path.join(ROOT, 'scripts', 'homologacao-saida.txt')

console.log('Executando scripts/homolog-faturas.mjs ...')
let saida = ''
let codigoSaida = -1
try {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'homolog-faturas.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
  })
  saida =
    (r.stdout || '') +
    '\n===== STDERR =====\n' +
    (r.stderr || '') +
    `\n===== exit code: ${r.status} =====\n`
  codigoSaida = r.status ?? -1
} catch (e) {
  saida = 'ERRO AO EXECUTAR O SCRIPT: ' + String(e && e.stack ? e.stack : e)
}
fs.writeFileSync(SAIDA, saida)
console.log('Concluído (exit code ' + codigoSaida + '); saída em scripts/homologacao-saida.txt')
