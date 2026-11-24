/**
 * Parte A — Infraestrutura global de responsividade (0.0.160).
 * SOMENTE classes Tailwind/layout: nenhuma regra financeira, banco, service ou
 * tipo é tocada aqui. Padrões compartilhados por TODOS os modais do app —
 * nunca duplicar versões Desktop/Mobile de um componente.
 *
 * Radix/shadcn: nada aqui altera a estratégia de abertura/fechamento de
 * Dialog/Popover/Select/DropdownMenu, nem faz setState durante render.
 */

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Classes de apresentação "quase tela cheia" para modais GRANDES em telas
 * pequenas (< sm). Aplicar via `cn(...)` no className do DialogContent:
 *
 *   <DialogContent className={cn('sm:max-w-xl max-h-[90vh] ...', smFullDialog)}>
 *
 * Comportamento em < sm (smartphone):
 *  • ocupa quase toda a viewport (left/right/bottom com 8px de folga, top 0
 *    para escapar da topbar/notch), altura fluida em dvh;
 *  • sem cantos arredondados grandes, padding lateral menor;
 *  • o translate-y centraliza só horizontalmente (top fixo em 0), evitando
 *    que o topo do modal fique inacessível sob a topbar.
 *
 * Em ≥ sm: TODAS as propriedades voltam ao comportamento desktop atual
 * (centralizado, max-w/max-h/padding/rounded de quem chama — nada é forçado).
 */
export const smFullDialog = [
  // Mobile: quase tela cheia, header/corpo/rodapé respiram dentro da altura útil
  'left-2 right-2 top-0 translate-x-0 translate-y-0',
  'w-auto max-w-none h-[calc(100dvh-8px)] max-h-[calc(100dvh-8px)]',
  'rounded-b-xl rounded-t-none p-4 gap-3',
  // Desktop (≥ sm): comportamento atual preservado
  'sm:left-[50%] sm:right-auto sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]',
  'sm:w-full sm:h-auto sm:max-h-none sm:rounded-lg sm:p-6 sm:gap-4',
].join(' ')

/**
 * Hook ÚNICO de teclado virtual (reuso do padrão scrollIntoView do
 * refPainelEdicao em CentralSaldoBancarioView). Enquanto houver campo de
 * formulário focado dentro do container, garante que ele (e o rodapé de
 * Salvar/Cancelar) fique visível: rola o ancestral rolável e usa
 * scrollIntoView({ block: 'nearest' }) no campo ativo.
 *
 * Uso: const ref = useTecladoVirtualVisivel(open) e <div ref={ref}> no corpo
 * rolável do modal. Sem estado, sem render extra — só listeners passivos.
 */
export function useTecladoVirtualVisivel(aberto: boolean): RefObject<HTMLDivElement | null> {
  const refContainer = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!aberto || typeof document === 'undefined') return

    const containerRolavelMaisProximo = (el: HTMLElement | null): HTMLElement | null => {
      let atual: HTMLElement | null = el
      while (atual) {
        const estilo = window.getComputedStyle(atual)
        const rolavel = /(auto|scroll)/.test(estilo.overflowY)
        if (rolavel) return atual
        atual = atual.parentElement
      }
      return null
    }

    const aoFocar = (e: FocusEvent) => {
      const alvo = e.target as HTMLElement | null
      if (!alvo) return
      const tag = alvo.tagName
      const ehCampo =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || alvo.isContentEditable
      if (!ehCampo) return

      // 1) O próprio campo entra na área visível do seu container rolável
      window.setTimeout(() => {
        alvo.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 120)

      // 2) O rodapé de ações (Salvar/Cancelar) é empurrado para o fim da rolagem:
      //    se o campo focado está perto do fim do corpo, trazer o rodapé também.
      const corpo = containerRolavelMaisProximo(alvo)
      if (!corpo) return
      // Escopo: só age dentro do modal dono do hook (evita rolar modais alheios)
      if (refContainer.current && !refContainer.current.contains(alvo)) return
      window.setTimeout(() => {
        const faltando = corpo.scrollHeight - corpo.scrollTop - corpo.clientHeight
        if (faltando <= 160) {
          const rodape = corpo.querySelector<HTMLElement>('[data-rodape-acoes]')
          rodape?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }, 160)
    }

    document.addEventListener('focusin', aoFocar, { passive: true })
    return () => document.removeEventListener('focusin', aoFocar)
  }, [aberto])

  return refContainer
}

/**
 * Rodapé padrão de ações dos modais: recebe data-rodape-acoes para o hook de
 * teclado virtual conseguir trazê-lo à vista no smartphone.
 * (Marcação apenas — o componente visual continua sendo DialogFooter.)
 */
export const rodapeAcoesAttr = { 'data-rodape-acoes': true } as const

/**
 * Container raiz de página: elimina overflow horizontal acidental em telas
 * estreitas (360px) sem alterar a estrutura de navegação.
 */
export const paginaFluida = 'w-full max-w-full overflow-x-hidden'

/** Linha de título de página que quebra em vez de estourar em 360px. */
export const linhaHeaderFluida = 'flex flex-wrap items-center gap-2 min-w-0'
