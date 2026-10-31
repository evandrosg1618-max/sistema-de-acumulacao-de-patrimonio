import React from 'react'

export interface LogoItem {
  id: string
  nome: string
  tipo: 'banco' | 'cartao'
  sigla: string
  corFundo: string
  corTexto: string
  bancoNome?: string
  bandeira?: string
}

export const LOGOS_BANCOS_OFICIAIS: LogoItem[] = [
  {
    id: 'logo-sicoob',
    nome: 'Sicoob',
    tipo: 'banco',
    sigla: 'SICOOB',
    corFundo: '#003641',
    corTexto: '#78BE20',
  },
  {
    id: 'logo-bb',
    nome: 'Banco do Brasil',
    tipo: 'banco',
    sigla: 'BB',
    corFundo: '#FAF500',
    corTexto: '#003882',
  },
  {
    id: 'logo-bradesco',
    nome: 'Bradesco',
    tipo: 'banco',
    sigla: 'BRAD',
    corFundo: '#CC092F',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-caixa',
    nome: 'Caixa Econômica',
    tipo: 'banco',
    sigla: 'CAIXA',
    corFundo: '#005CA9',
    corTexto: '#F37021',
  },
  {
    id: 'logo-itau',
    nome: 'Itaú',
    tipo: 'banco',
    sigla: 'ITAÚ',
    corFundo: '#EC7000',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-sofisa',
    nome: 'Sofisa Direto',
    tipo: 'banco',
    sigla: 'SOFISA',
    corFundo: '#ED1C24',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-btg',
    nome: 'BTG Pactual',
    tipo: 'banco',
    sigla: 'BTG',
    corFundo: '#001E3D',
    corTexto: '#C5A059',
  },
  {
    id: 'logo-daycoval',
    nome: 'Banco Daycoval',
    tipo: 'banco',
    sigla: 'DAYC',
    corFundo: '#002B49',
    corTexto: '#00A3E0',
  },
  {
    id: 'logo-c6',
    nome: 'Banco C6',
    tipo: 'banco',
    sigla: 'C6',
    corFundo: '#1C1C1C',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-santander',
    nome: 'Santander Corretora',
    tipo: 'banco',
    sigla: 'SANT',
    corFundo: '#EC0000',
    corTexto: '#FFFFFF',
  },
]

export const LOGOS_CARTOES_OFICIAIS: LogoItem[] = [
  {
    id: 'logo-c6-carbon',
    nome: 'Master C6 Carbon Black',
    tipo: 'cartao',
    sigla: 'C6·MC',
    bancoNome: 'C6 Bank',
    bandeira: 'Mastercard Black',
    corFundo: '#111111',
    corTexto: '#D4AF37',
  },
  {
    id: 'logo-caixa-master-black',
    nome: 'Caixa Mastercard Black',
    tipo: 'cartao',
    sigla: 'CX·MC',
    bancoNome: 'Caixa',
    bandeira: 'Mastercard Black',
    corFundo: '#003A66',
    corTexto: '#F37021',
  },
  {
    id: 'logo-caixa-visa-infinite',
    nome: 'Caixa Visa Infinite',
    tipo: 'cartao',
    sigla: 'CX·VI',
    bancoNome: 'Caixa',
    bandeira: 'Visa Infinite',
    corFundo: '#005CA9',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-bradesco-visa-infinite',
    nome: 'Bradesco Visa Infinite',
    tipo: 'cartao',
    sigla: 'BR·VI',
    bancoNome: 'Bradesco',
    bandeira: 'Visa Infinite',
    corFundo: '#99001A',
    corTexto: '#FFFFFF',
  },
]

export function renderMiniaturaLogo(logoId: string | null | undefined, className = 'w-7 h-7') {
  if (!logoId) return null
  const logo = [...LOGOS_BANCOS_OFICIAIS, ...LOGOS_CARTOES_OFICIAIS].find((l) => l.id === logoId)
  if (!logo) return null

  return (
    <div
      className={`rounded-md flex flex-col items-center justify-center font-bold text-[9px] tracking-tight shrink-0 shadow-xs select-none ${className}`}
      style={{
        backgroundColor: logo.corFundo,
        color: logo.corTexto,
        border: '1px solid rgba(255,255,255,0.15)',
      }}
      title={logo.nome}
    >
      <span className="leading-none px-0.5 font-extrabold">{logo.sigla}</span>
    </div>
  )
}
