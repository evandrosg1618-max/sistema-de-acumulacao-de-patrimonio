// ==============================================================================
// BIBLIOTECA CENTRAL DE INSTITUIÇÕES FINANCEIRAS — SAP
//
// Conforme especificação (PDF Páginas 7–17 e Bloqueio 2 da Tarefa):
// - Instituições com: id, nome, slug, logoAsset, tipo ('banco'), ativo (true)
// - Não armazena cópias físicas por Conta/Cartão
// - Conta e Cartão persistem apenas a referência durável (id da instituição)
// - Apresentação (máscara circular para Contas, retangular para Cartões) é do componente
// ==============================================================================

import sicoobLogo from '@/assets/financial-institutions/sicoob.svg'
import bbLogo from '@/assets/financial-institutions/banco-do-brasil.svg'
import itauLogo from '@/assets/financial-institutions/itau.svg'
import bradescoLogo from '@/assets/financial-institutions/bradesco.svg'
import c6Logo from '@/assets/financial-institutions/c6.svg'
import xpLogo from '@/assets/financial-institutions/xp.svg'
import btgLogo from '@/assets/financial-institutions/btg.svg'
import caixaLogo from '@/assets/financial-institutions/caixa.svg'
import sofisaLogo from '@/assets/financial-institutions/sofisa.svg'

export interface InstituicaoFinanceira {
  id: string
  nome: string
  slug: string
  logoAsset: string
  tipo: 'banco'
  ativo: boolean
  termosBusca?: string[]
  corSugerida?: string
}

export const INSTITUICOES_FINANCEIRAS: InstituicaoFinanceira[] = [
  {
    id: 'sicoob',
    nome: 'Sicoob',
    slug: 'sicoob',
    logoAsset: sicoobLogo,
    tipo: 'banco',
    ativo: true,
    termosBusca: ['sicoob', 'cooperativa', 'banco sicoob'],
    corSugerida: '#003641',
  },
  {
    id: 'banco-do-brasil',
    nome: 'Banco do Brasil',
    slug: 'banco-do-brasil',
    logoAsset: bbLogo,
    tipo: 'banco',
    ativo: true,
    termosBusca: ['banco do brasil', 'bb', 'brasil', 'ourocard'],
    corSugerida: '#FAF500',
  },
  {
    id: 'itau',
    nome: 'Itaú',
    slug: 'itau',
    logoAsset: itauLogo,
    tipo: 'banco',
    ativo: true,
    termosBusca: ['itau', 'itaú', 'personnalite', 'itaucard'],
    corSugerida: '#EC7000',
  },
  {
    id: 'bradesco',
    nome: 'Bradesco',
    slug: 'bradesco',
    logoAsset: bradescoLogo,
    tipo: 'banco',
    ativo: true,
    termosBusca: ['bradesco', 'prime', 'bradescard', 'banco bradesco'],
    corSugerida: '#CC092F',
  },
  {
    id: 'c6',
    nome: 'C6 Bank',
    slug: 'c6',
    logoAsset: c6Logo,
    tipo: 'banco',
    ativo: true,
    termosBusca: ['c6', 'c6 bank', 'carbon', 'banco c6'],
    corSugerida: '#111111',
  },
  {
    id: 'xp',
    nome: 'XP Investimentos',
    slug: 'xp',
    logoAsset: xpLogo,
    tipo: 'banco',
    ativo: true,
    termosBusca: ['xp', 'xp investimentos', 'banco xp', 'investimentos'],
    corSugerida: '#111111',
  },
  {
    id: 'btg',
    nome: 'BTG Pactual',
    slug: 'btg',
    logoAsset: btgLogo,
    tipo: 'banco',
    ativo: true,
    termosBusca: ['btg', 'btg pactual', 'pactual'],
    corSugerida: '#0A1D37',
  },
  {
    id: 'caixa',
    nome: 'Caixa Econômica',
    slug: 'caixa',
    logoAsset: caixaLogo,
    tipo: 'banco',
    ativo: true,
    termosBusca: ['caixa', 'cef', 'caixa economica', 'caixa econômica federal'],
    corSugerida: '#005CA9',
  },
  {
    id: 'sofisa',
    nome: 'Sofisa Direto',
    slug: 'sofisa',
    logoAsset: sofisaLogo,
    tipo: 'banco',
    ativo: true,
    termosBusca: ['sofisa', 'sofisa direto', 'banco sofisa'],
    corSugerida: '#FFFFFF',
  },
]

/**
 * Mapeamento e normalização de IDs legados e novos para o ID durável oficial.
 * Exemplo: 'logo-sicoob' -> 'sicoob', 'logo-bb' -> 'banco-do-brasil'
 */
export function normalizarIdInstituicao(identificador?: string | null): string | null {
  if (!identificador) return null
  const limpo = identificador.trim().toLowerCase()

  // Se já for um id durável direto
  const direto = INSTITUICOES_FINANCEIRAS.find((i) => i.id === limpo || i.slug === limpo)
  if (direto) return direto.id

  // De-para de ids legados do build anterior
  const mapeamentoLegado: Record<string, string> = {
    'logo-sicoob': 'sicoob',
    'logo-bb': 'banco-do-brasil',
    'logo-itau': 'itau',
    'logo-bradesco': 'bradesco',
    'logo-c6': 'c6',
    'logo-c6-carbon': 'c6',
    'logo-xp': 'xp',
    'logo-btg': 'btg',
    'logo-caixa': 'caixa',
    'logo-caixa-master-black': 'caixa',
    'logo-caixa-visa-infinite': 'caixa',
    'logo-bradesco-visa-infinite': 'bradesco',
    'logo-sofisa': 'sofisa',
  }

  if (mapeamentoLegado[limpo]) {
    return mapeamentoLegado[limpo]
  }

  return limpo
}

/**
 * Localiza a instituição pelo identificador durável ou legado
 */
export function obterInstituicaoPorId(identificador?: string | null): InstituicaoFinanceira | null {
  if (!identificador) return null
  const idNormalizado = normalizarIdInstituicao(identificador)
  return INSTITUICOES_FINANCEIRAS.find((i) => i.id === idNormalizado) || null
}

/**
 * Filtra instituições por termo de busca (sem acento, case-insensitive)
 * Ex: "Bra" -> Bradesco, Banco do Brasil
 */
export function filtrarInstituicoes(termo: string): InstituicaoFinanceira[] {
  if (!termo || !termo.trim()) return INSTITUICOES_FINANCEIRAS

  const q = termo
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return INSTITUICOES_FINANCEIRAS.filter((inst) => {
    const nomeNorm = inst.nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    const slugNorm = inst.slug.toLowerCase()
    const matchNome = nomeNorm.includes(q)
    const matchSlug = slugNorm.includes(q)
    const matchTermos = (inst.termosBusca || []).some((t) =>
      t
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .includes(q),
    )
    return matchNome || matchSlug || matchTermos
  })
}
