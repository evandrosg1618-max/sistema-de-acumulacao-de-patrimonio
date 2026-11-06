// TEMPORÁRIO (remover): gatilho da homologação — carregado pelo tailwind.config.ts.
// Roda scripts/tempHomologacaoFaturas.mjs UMA vez por processo quando SAP_HOMOLOG=1.
// SEM typecheck aqui: o tsconfig do app cobre src/ apenas; este arquivo é JS puro.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const MARCA = path.join(process.cwd(), 'scripts', '.homolog-jah-executou')
try {
  if (!fs.existsSync(MARCA)) {
    fs.writeFileSync(MARCA, '1', 'utf8')
    execFileSync(process.execPath, [path.resolve('scripts', 'tempHomologacaoFaturas.mjs')], {
      cwd: process.cwd(),
      stdio: 'inherit',
      timeout: 120000,
    })
  }
} catch (e) {
  console.log('HOMOLOG TRIGGER ERRO: ' + String(e))
}
console.log('HOMOLOG TRIGGER EXECUTADO (fim do módulo)')
