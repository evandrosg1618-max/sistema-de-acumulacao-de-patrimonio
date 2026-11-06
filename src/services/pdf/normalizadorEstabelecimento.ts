/**
 * Utilitários de normalização de estabelecimentos comerciais.
 * Preserva SEMPRE a descrição original do PDF e gera uma descrição
 * normalizada legível sem correspondências agressivas erradas.
 */

const REGRAS_NORMALIZACAO_ESTABELECIMENTO: Array<{
  regex: RegExp
  substituicao: string
}> = [
  // Redes e marketplaces frequentes
  { regex: /AMAZON\s*MKTPLC[A-Z0-9*_\s.-]*/i, substituicao: 'Amazon Marketplace' },
  { regex: /AMAZON\s*BR[A-Z0-9*_\s.-]*/i, substituicao: 'Amazon Brasil' },
  { regex: /AMAZON\s*PRIME[A-Z0-9*_\s.-]*/i, substituicao: 'Amazon Prime' },
  { regex: /MERCADOLIVRE\*[A-Z0-9*_\s.-]*/i, substituicao: 'Mercado Livre' },
  { regex: /MERCADO\*MUNDOAUDIO/i, substituicao: 'Mercado Mundo Áudio' },
  { regex: /DROGASIL\s*\d*/i, substituicao: 'Drogasil' },
  { regex: /PAGUEMENOS\s*\d*|PAGUE\s+MENOS\s*\d*/i, substituicao: 'Pague Menos' },
  { regex: /AMERICANA\s*MANIPULACAO/i, substituicao: 'Americana Manipulação' },
  { regex: /AMERICANA\s*MODAS/i, substituicao: 'Americana Modas' },
  { regex: /HAVAN\s*VILHENA/i, substituicao: 'Havan' },
  { regex: /HAVAN/i, substituicao: 'Havan' },
  { regex: /CACAU\s*SHOW/i, substituicao: 'Cacau Show' },
  { regex: /MICRO\s*MARKET\s*VILHENA/i, substituicao: 'Micro Market' },
  { regex: /IRMAOS\s*GONCALVES\s*F\d+/i, substituicao: 'Irmãos Gonçalves' },
  { regex: /IRMAOS\s*GONCALVES/i, substituicao: 'Irmãos Gonçalves' },
  { regex: /JK\s*AUTO\s*PECAS/i, substituicao: 'JK Auto Peças' },
  { regex: /MARCENALMADEIRAS/i, substituicao: 'Marcenal Madeiras' },
  { regex: /SHEIN\s*\*?[A-Z0-9*_\s.-]*/i, substituicao: 'Shein' },
  { regex: /EBN\*SPOTIFY/i, substituicao: 'Spotify' },
  { regex: /SPOTIFY/i, substituicao: 'Spotify' },
  { regex: /DL\*IHERB|DM\*IHERB/i, substituicao: 'iHerb' },
  { regex: /ELECTROLUX\s*ELECT/i, substituicao: 'Electrolux' },
  { regex: /VILHETOY/i, substituicao: 'Vilhetoy' },
  { regex: /ANBIMA/i, substituicao: 'Anbima' },
  { regex: /SHOULDER\s*S\.?A\.?/i, substituicao: 'Shoulder' },
  { regex: /COMPANHIA\s*DA\s*MODA/i, substituicao: 'Companhia da Moda' },
  { regex: /M\s*STORE/i, substituicao: 'M Store' },
  { regex: /LOJAS\s*AMERICANAS\s*\d*/i, substituicao: 'Lojas Americanas' },
  { regex: /REUSE\s*BRECHO/i, substituicao: 'Reuse Brechó' },
  { regex: /MAGO\s*CALCADOS/i, substituicao: 'Mago Calçados' },
  { regex: /RI\s*HAPPY/i, substituicao: 'Ri Happy' },
  { regex: /VILHENA\s*CALCADOS/i, substituicao: 'Vilhena Calçados' },
  { regex: /PAMONHASKING/i, substituicao: 'Pamonhas King' },
  { regex: /CATARINENSE\s*\d*/i, substituicao: 'Catarinense' },
  { regex: /DROGARIA\s*ULTRA\s*POPULAR/i, substituicao: 'Drogaria Ultra Popular' },
  { regex: /REI\s*DO\s*COCO/i, substituicao: 'Rei do Coco' },
  { regex: /AGRO\s*IND\s*CAFE\s*BOM\s*AROM/i, substituicao: 'Café Bom Aroma' },
  { regex: /BACK\s*CHURRASCO/i, substituicao: 'Back Churrasco' },
  { regex: /COMUNIDADE\s*ADORAI/i, substituicao: 'Comunidade Adorai' },
  { regex: /XIKAO\s*DISTRIBUIDORA/i, substituicao: 'Xikão Distribuidora' },
  { regex: /DEGUSTARE/i, substituicao: 'Degustare' },
  { regex: /SUPERMAIS\s*SUPERMERCADO/i, substituicao: 'Supermais Supermercado' },
  { regex: /ESKIMOATACADAO/i, substituicao: 'Eskimó Atacadão' },
  { regex: /VIDRACARIA\s*CATARINA/i, substituicao: 'Vidraçaria Catarina' },
  { regex: /PIZZARIA\s*DOMENICO/i, substituicao: 'Pizzaria Domenico' },
  { regex: /PAN\s*E\s*CONF\s*DELICIA/i, substituicao: 'Panificadora Delícia' },
  { regex: /PETCLIN/i, substituicao: 'Petclin' },
  { regex: /FRIRON\s*COMERCIO/i, substituicao: 'Friron Comércio' },
  { regex: /GIRAPE\s*CALCADOS/i, substituicao: 'Girapé Calçados' },
  { regex: /ZERO\s*GRAU\s*DECK/i, substituicao: 'Zero Grau Deck' },
  { regex: /KING\s*TENIS/i, substituicao: 'King Tênis' },
  { regex: /PORTAL\s*FERRAGENS/i, substituicao: 'Portal Ferragens' },
  { regex: /COMETA\s*\d*/i, substituicao: 'Cometa' },
  { regex: /RAQUEL\s*SOARES\s*PIMENT/i, substituicao: 'Raquel Soares Pimentel' },
  { regex: /LINK\s*BENVER/i, substituicao: 'Link Benver' },
  { regex: /VINDI\s*\*?FINCLASSSPIT/i, substituicao: 'Finclass' },
  { regex: /ADAPTAORG/i, substituicao: 'AdaptaOrg' },
  { regex: /EC\s*\*?FACILPERSIANA/i, substituicao: 'Fácil Persianas' },
  { regex: /PG\s*\*?TURIM\s*COMERCI/i, substituicao: 'Turim Comércio' },
  { regex: /PG\s*\*?SPPAY\s*SPONTE\s*PAY/i, substituicao: 'Sponte Pay' },
  { regex: /PG\s*\*?JOVIANO\s*SILVEIRA/i, substituicao: 'Joviano Silveira' },
  { regex: /PG\s*\*?ESTRATEGIACON/i, substituicao: 'Estratégia Concursos' },
  { regex: /HNA\*OBOTICARIO/i, substituicao: 'O Boticário' },
  { regex: /STB\*LILIPRESENTES/i, substituicao: 'Lili Presentes' },
  { regex: /MP\s*\*?PROSPIN/i, substituicao: 'Prospin' },
  { regex: /MP\s*\*?58477542ANGEL/i, substituicao: 'Mercado Pago (Angel)' },
  { regex: /MP\s*\*?NIOMARSOUZA/i, substituicao: 'Mercado Pago (Niomar Souza)' },
  { regex: /APP\s*\*?LOJANUVEMSHOP/i, substituicao: 'Nuvemshop' },
]

/**
 * Normaliza o nome do estabelecimento sem apagar informações originais.
 * Se nenhuma regra prévia corresponder, limpa prefixos bancários e caracteres de controle comuns.
 */
export function normalizarNomeEstabelecimento(descricaoOriginal: string): string {
  if (!descricaoOriginal) return ''

  const limpo = descricaoOriginal
    .replace(/^(\d{2}\/\d{2}\s+)/, '') // Remove data se veio junto
    .trim()

  for (const r of REGRAS_NORMALIZACAO_ESTABELECIMENTO) {
    if (r.regex.test(limpo)) {
      return r.substituicao
    }
  }

  // Limpeza genérica sem correspondência agressiva
  let normal = limpo
    .replace(/\s+/g, ' ')
    // Remove padrões de parcelas no final (ex: "01/10", "04 DE 10", "- Parcela 1/2")
    .replace(/\s*-\s*Parcela\s+\d+\/\d+/i, '')
    .replace(/\s+\d{2}\s+DE\s+\d{2}/i, '')
    .replace(/\s+\d{2}\/\d{2}$/i, '')
    .trim()

  // Remove prefixos comuns de adquirentes (PG *, MP *, DL*, DM*)
  normal = normal.replace(/^(PG\s*\*|MP\s*\*|DL\*|DM\*|EC\s*\*)/i, '')

  return normal || limpo
}

/**
 * Extrai padrão canônico para busca no aprendizado de classificação.
 * Ex: "DROGASIL 3529" -> "DROGASIL"
 * "AMAZONMKTPLC*ADEOLIVEI" -> "AMAZONMKTPLC"
 */
export function extrairPadraoBuscaAprendizado(descricao: string): string {
  const normal = normalizarNomeEstabelecimento(descricao).toUpperCase()
  // Retira dígitos finais e palavras soltas com menos de 2 caracteres
  return normal
    .replace(/[0-9*#_-]+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ')
}
