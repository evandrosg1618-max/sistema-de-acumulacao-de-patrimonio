#!/bin/sh
# TEMPORÁRIO (remover): dispara a homologação via Node com o flag SAP_HOMOLOG=1,
# fazendo o tailwind.config.ts (carregado no dev/QA) executar scripts/entry.ts.
# Precisamos de um arquivo que o Tailwind processa; usamos um stub mínimo.
export SAP_HOMOLOG=1
node --experimental-vm-modules -e "
  const { execFileSync } = require('node:child_process');
  execFileSync(process.execPath, ['--input-type=module', '-e', 'import(\"./tailwind.config.ts\")'], { stdio: 'inherit' });
"
echo "--- FIM DO GATILHO ---"
