import React from 'react'
import { BrandLogoDisplay } from '@/components/BrandLogoPicker'

export interface LogoItem {
  id: string
  nome: string
  tipo: 'banco' | 'cartao'
  bancoNome?: string
  bandeira?: string
  corFundo: string
  corTexto: string
}

export const LOGOS_BANCOS_OFICIAIS: LogoItem[] = [
  {
    id: 'logo-sicoob',
    nome: 'Sicoob',
    tipo: 'banco',
    corFundo: '#003641',
    corTexto: '#78BE20',
  },
  {
    id: 'logo-bb',
    nome: 'Banco do Brasil',
    tipo: 'banco',
    corFundo: '#FAF500',
    corTexto: '#003882',
  },
  {
    id: 'logo-bradesco',
    nome: 'Bradesco',
    tipo: 'banco',
    corFundo: '#CC092F',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-caixa',
    nome: 'Caixa Econômica',
    tipo: 'banco',
    corFundo: '#005CA9',
    corTexto: '#F37021',
  },
  {
    id: 'logo-itau',
    nome: 'Itaú',
    tipo: 'banco',
    corFundo: '#EC7000',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-sofisa',
    nome: 'Sofisa Direto',
    tipo: 'banco',
    corFundo: '#FFFFFF',
    corTexto: '#00875A',
  },
  {
    id: 'logo-btg',
    nome: 'BTG Pactual',
    tipo: 'banco',
    corFundo: '#001E3D',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-daycoval',
    nome: 'Banco Daycoval',
    tipo: 'banco',
    corFundo: '#0072CE',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-c6',
    nome: 'Banco C6',
    tipo: 'banco',
    corFundo: '#111111',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-santander',
    nome: 'Santander Corretora',
    tipo: 'banco',
    corFundo: '#EC0000',
    corTexto: '#FFFFFF',
  },
]

export const LOGOS_CARTOES_OFICIAIS: LogoItem[] = [
  {
    id: 'logo-c6-carbon',
    nome: 'Master C6 Carbon Black',
    tipo: 'cartao',
    bancoNome: 'C6 Bank',
    bandeira: 'Mastercard Black',
    corFundo: '#111111',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-caixa-master-black',
    nome: 'Caixa Mastercard Black',
    tipo: 'cartao',
    bancoNome: 'Caixa',
    bandeira: 'Mastercard Black',
    corFundo: '#181c20',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-caixa-visa-infinite',
    nome: 'Caixa Visa Infinite',
    tipo: 'cartao',
    bancoNome: 'Caixa',
    bandeira: 'Visa Infinite',
    corFundo: '#111827',
    corTexto: '#FFFFFF',
  },
  {
    id: 'logo-bradesco-visa-infinite',
    nome: 'Bradesco Visa Infinite',
    tipo: 'cartao',
    bancoNome: 'Bradesco Prime',
    bandeira: 'Visa Infinite',
    corFundo: '#0b0f14',
    corTexto: '#FFFFFF',
  },
]

// Componentes SVG fiéis aos logos oficiais dos bancos
function LogoSvgBanco({ id }: { id: string }) {
  switch (id) {
    case 'logo-sicoob':
      // Sicoob: fundo verde-petróleo escuro com o triângulo/pináculo de 3 tons verdes característico
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="50" fill="#003641" />
          {/* Triângulo apontado para baixo com 3 facetas (verde claro, médio, escuro) */}
          <polygon points="50,78 22,34 50,48" fill="#78BE20" />
          <polygon points="50,78 78,34 50,48" fill="#00A887" />
          <polygon points="22,34 78,34 50,48" fill="#00798C" />
        </svg>
      )

    case 'logo-bb':
      // Banco do Brasil: fundo amarelo (#FAF500 / #FED100) com o monograma entrelaçado azul em 45 graus
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="50" fill="#FCDB00" />
          <g
            stroke="#003882"
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            {/* Losango duplo / faixas diagonais entrelaçadas do BB */}
            <path d="M 32 38 L 50 20 L 68 38 L 50 56 Z" />
            <path d="M 32 62 L 50 44 L 68 62 L 50 80 Z" />
            <path d="M 23 47 L 35 35" />
            <path d="M 77 53 L 65 65" />
          </g>
        </svg>
      )

    case 'logo-bradesco':
      // Bradesco: fundo vermelho clássico com a árvore estilizada em linhas brancas curvas
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="50" fill="#CC092F" />
          {/* Arco superior */}
          <path
            d="M 24 50 C 24 33, 76 33, 76 50"
            stroke="#FFFFFF"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Arco intermediário */}
          <path
            d="M 35 58 C 35 46, 65 46, 65 58"
            stroke="#FFFFFF"
            strokeWidth="7"
            strokeLinecap="round"
          />
          {/* Tronco vertical */}
          <line
            x1="50"
            y1="52"
            x2="50"
            y2="76"
            stroke="#FFFFFF"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'logo-caixa':
      // Caixa: fundo azul (#005CA9) com o 'X' estilizado (braço laranja transpassando)
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="50" fill="#005CA9" />
          {/* Barra diagonal branca (de cima-esquerda para baixo-direita) */}
          <polygon points="26,26 40,26 74,74 60,74" fill="#FFFFFF" />
          {/* Barra diagonal com chevron laranja da Caixa cruzando */}
          <polygon points="60,26 74,26 50,56 42,46" fill="#FFFFFF" />
          <polygon points="26,74 40,74 58,52 50,42" fill="#F37021" />
        </svg>
      )

    case 'logo-itau':
      // Itaú: fundo laranja vibrante (#EC7000), cantos arredondados / circular, com texto 'itaú' azul e acento amarelo
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="50" fill="#EC7000" />
          <text
            x="50"
            y="57"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            fontSize="26"
            fontWeight="900"
            textAnchor="middle"
            fill="#003399"
            letterSpacing="-1"
          >
            itaú
          </text>
          {/* Ponto / acento amarelo ouro do Itaú */}
          <circle cx="68" cy="36" r="3.5" fill="#FED100" />
        </svg>
      )

    case 'logo-sofisa':
      // Sofisa Direto: anel verde esmeralda com ponto/anel interno laranja/verde
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="50" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
          {/* Círculo externo verde Sofisa */}
          <circle cx="50" cy="50" r="34" stroke="#00875A" strokeWidth="12" fill="none" />
          {/* Ponto central laranja */}
          <circle cx="50" cy="50" r="14" fill="#F58220" />
        </svg>
      )

    case 'logo-btg':
      // BTG Pactual: fundo azul-marinho profundo com texto 'btg' minúsculo branco
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="50" fill="#001E3D" />
          <text
            x="50"
            y="58"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            fontSize="30"
            fontWeight="800"
            textAnchor="middle"
            fill="#FFFFFF"
            letterSpacing="-0.5"
          >
            btg
          </text>
        </svg>
      )

    case 'logo-daycoval':
      // Banco Daycoval: fundo azul royal com o 'D' branco cortado estilizado
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="50" fill="#0072CE" />
          {/* Letra D geométrica com corte característico */}
          <path
            d="M 34 26 L 52 26 C 68 26, 74 36, 74 50 C 74 64, 68 74, 52 74 L 34 74 Z"
            stroke="#FFFFFF"
            strokeWidth="9"
            strokeLinejoin="round"
          />
          <line x1="38" y1="50" x2="68" y2="50" stroke="#FFFFFF" strokeWidth="7" />
        </svg>
      )

    case 'logo-c6':
      // Banco C6: fundo preto carbono / chumbo escuro com tipografia 'C6' branca arredondada
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="50" fill="#1C1C1C" />
          <text
            x="50"
            y="61"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            fontSize="38"
            fontWeight="900"
            textAnchor="middle"
            fill="#FFFFFF"
            letterSpacing="-1"
          >
            C6
          </text>
        </svg>
      )

    case 'logo-santander':
      // Santander Corretora: fundo vermelho clássico com a chama estilizada
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="50" fill="#EC0000" />
          {/* Chama clássica do Santander (três labaredas entrelaçadas) */}
          <path
            d="M 36 68 C 30 52, 44 42, 44 42 C 44 42, 40 50, 44 56 C 47 60, 52 60, 52 52 C 52 40, 50 30, 50 30 C 50 30, 58 40, 58 52 C 58 60, 62 60, 65 55 C 67 52, 66 45, 66 45 C 66 45, 76 56, 68 68 C 62 76, 42 76, 36 68 Z"
            fill="#FFFFFF"
          />
        </svg>
      )

    default:
      return null
  }
}

// Componentes SVG fiéis aos cartões de crédito oficiais (retangulares)
function LogoSvgCartao({ id }: { id: string }) {
  switch (id) {
    case 'logo-c6-carbon':
      // C6 Carbon Black: fundo carbono texturizado escuro, chip à esquerda, logo C6 Bank e círculos Mastercard
      return (
        <svg viewBox="0 0 160 100" className="w-full h-full" fill="none">
          <rect width="160" height="100" rx="8" fill="#111111" />
          {/* Textura sutil */}
          <rect
            x="4"
            y="4"
            width="152"
            height="92"
            rx="6"
            stroke="#262626"
            strokeWidth="1"
            fill="none"
          />
          {/* Chip EMV */}
          <rect x="14" y="32" width="22" height="18" rx="3" fill="#D4AF37" opacity="0.9" />
          <line x1="14" y1="41" x2="36" y2="41" stroke="#856404" strokeWidth="0.8" />
          <line x1="25" y1="32" x2="25" y2="50" stroke="#856404" strokeWidth="0.8" />
          {/* Sinal contactless */}
          <path
            d="M 20 22 A 6 6 0 0 1 26 26"
            stroke="#666666"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 18 19 A 10 10 0 0 1 28 26"
            stroke="#666666"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
          />
          {/* C6 BANK à direita */}
          <text
            x="142"
            y="32"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="12"
            fontWeight="900"
            fill="#FFFFFF"
            textAnchor="end"
            letterSpacing="-0.5"
          >
            C6 BANK
          </text>
          {/* Texto Carbon Black discreto */}
          <text
            x="14"
            y="76"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="7"
            fontWeight="600"
            fill="#737373"
            letterSpacing="0.5"
          >
            Carbon Black
          </text>
          {/* Círculos Mastercard Black (cinza / prata escovado) */}
          <circle cx="124" cy="74" r="13" fill="#666666" opacity="0.9" />
          <circle cx="138" cy="74" r="13" fill="#999999" opacity="0.8" />
        </svg>
      )

    case 'logo-caixa-master-black':
      // Caixa Mastercard Black: fundo escuro metalizado, "black", chip EMV, logo 'X' Caixa branco/laranja, círculos Mastercard
      return (
        <svg viewBox="0 0 160 100" className="w-full h-full" fill="none">
          <rect width="160" height="100" rx="8" fill="#181c20" />
          {/* Degradê de luz */}
          <rect
            x="4"
            y="4"
            width="152"
            height="92"
            rx="6"
            stroke="#2f353c"
            strokeWidth="1"
            fill="none"
          />
          {/* Palavra 'black' */}
          <text
            x="16"
            y="26"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="10"
            fontWeight="700"
            fill="#E2E8F0"
            letterSpacing="0.5"
          >
            black
          </text>
          {/* Chip EMV */}
          <rect x="16" y="38" width="22" height="18" rx="3" fill="#D4AF37" opacity="0.9" />
          <line x1="16" y1="47" x2="38" y2="47" stroke="#856404" strokeWidth="0.8" />
          <line x1="27" y1="38" x2="27" y2="56" stroke="#856404" strokeWidth="0.8" />
          {/* X da Caixa no topo direito */}
          <g transform="translate(122, 14) scale(0.35)">
            <polygon points="12,12 24,12 58,58 46,58" fill="#FFFFFF" />
            <polygon points="46,12 58,12 36,38 28,30" fill="#FFFFFF" />
            <polygon points="12,58 24,58 44,34 36,26" fill="#F37021" />
          </g>
          {/* Círculos Mastercard Black */}
          <circle cx="124" cy="74" r="13" fill="#666666" opacity="0.9" />
          <circle cx="138" cy="74" r="13" fill="#999999" opacity="0.8" />
          <text
            x="131"
            y="92"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="6"
            fontWeight="600"
            fill="#A0AEC0"
            textAnchor="middle"
          >
            mastercard
          </text>
        </svg>
      )

    case 'logo-caixa-visa-infinite':
      // Caixa Visa Infinite: fundo preto com gradiente sutil, chip EMV, logo Caixa e logo VISA Infinite
      return (
        <svg viewBox="0 0 160 100" className="w-full h-full" fill="none">
          <rect width="160" height="100" rx="8" fill="#111827" />
          <rect
            x="4"
            y="4"
            width="152"
            height="92"
            rx="6"
            stroke="#1F2937"
            strokeWidth="1"
            fill="none"
          />
          {/* Chip EMV */}
          <rect x="16" y="34" width="22" height="18" rx="3" fill="#D4AF37" opacity="0.9" />
          <line x1="16" y1="43" x2="38" y2="43" stroke="#856404" strokeWidth="0.8" />
          <line x1="27" y1="34" x2="27" y2="52" stroke="#856404" strokeWidth="0.8" />
          {/* Contactless */}
          <path
            d="M 44 40 A 5 5 0 0 1 44 46"
            stroke="#9CA3AF"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 47 37 A 9 9 0 0 1 47 49"
            stroke="#9CA3AF"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
          />
          {/* X da Caixa no topo direito */}
          <g transform="translate(122, 14) scale(0.35)">
            <polygon points="12,12 24,12 58,58 46,58" fill="#FFFFFF" />
            <polygon points="46,12 58,12 36,38 28,30" fill="#FFFFFF" />
            <polygon points="12,58 24,58 44,34 36,26" fill="#F37021" />
          </g>
          {/* VISA Infinite no canto inferior direito */}
          <text
            x="146"
            y="72"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="15"
            fontWeight="900"
            fontStyle="italic"
            fill="#FFFFFF"
            textAnchor="end"
            letterSpacing="-0.5"
          >
            VISA
          </text>
          <text
            x="146"
            y="82"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="7"
            fontWeight="700"
            fill="#9CA3AF"
            textAnchor="end"
            letterSpacing="1"
          >
            Infinite
          </text>
        </svg>
      )

    case 'logo-bradesco-visa-infinite':
      // Bradesco Visa Infinite (Prime): logo bradesco prime topo esquerdo, chip, VISA Infinite no canto
      return (
        <svg viewBox="0 0 160 100" className="w-full h-full" fill="none">
          <rect width="160" height="100" rx="8" fill="#0b0f14" />
          <rect
            x="4"
            y="4"
            width="152"
            height="92"
            rx="6"
            stroke="#1c2430"
            strokeWidth="1"
            fill="none"
          />
          {/* Logo Bradesco estilizado branco topo esquerdo */}
          <g transform="translate(14, 12) scale(0.22)">
            <path
              d="M 12 30 C 12 18, 48 18, 48 30"
              stroke="#FFFFFF"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 20 36 C 20 28, 40 28, 40 36"
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <line
              x1="30"
              y1="32"
              x2="30"
              y2="46"
              stroke="#FFFFFF"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>
          <text
            x="32"
            y="21"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="9"
            fontWeight="700"
            fill="#FFFFFF"
          >
            bradesco
          </text>
          <text
            x="32"
            y="29"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="7"
            fontWeight="500"
            fill="#CBD5E1"
          >
            prime
          </text>
          {/* Chip EMV */}
          <rect x="16" y="44" width="20" height="16" rx="3" fill="#D4AF37" opacity="0.9" />
          <line x1="16" y1="52" x2="36" y2="52" stroke="#856404" strokeWidth="0.8" />
          <line x1="26" y1="44" x2="26" y2="60" stroke="#856404" strokeWidth="0.8" />
          {/* VISA Infinite no canto inferior direito */}
          <text
            x="146"
            y="72"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="15"
            fontWeight="900"
            fontStyle="italic"
            fill="#FFFFFF"
            textAnchor="end"
            letterSpacing="-0.5"
          >
            VISA
          </text>
          <text
            x="146"
            y="82"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="7"
            fontWeight="700"
            fill="#94A3B8"
            textAnchor="end"
            letterSpacing="1"
          >
            Infinite
          </text>
        </svg>
      )

    default:
      return null
  }
}

/**
 * Renderiza a miniatura oficial conforme as especificações do SAP e prints do PDF Organizze:
 * - Contas (bancos): logo oficial do banco em formato CIRCULAR / rounded (ex: w-8 h-8 rounded-full);
 * - Cartões: miniatura RETANGULAR (ex: w-11 h-7 rounded-md), mostrando banco + bandeira oficiais.
 */
export function renderMiniaturaLogo(logoId: string | null | undefined, className = 'w-8 h-8') {
  if (!logoId) return null

  // Delegado de forma unificada para o BrandLogoDisplay do catálogo oficial
  const tipo = LOGOS_CARTOES_OFICIAIS.some((l) => l.id === logoId) ? 'cartao' : 'conta'
  return <BrandLogoDisplay id={logoId} tipo={tipo} className={className} />
}
