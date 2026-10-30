import React, { useState } from 'react'
import {
  Utensils,
  ShoppingBag,
  ShoppingCart,
  Apple,
  Croissant,
  Pizza,
  Wine,
  CupSoda,
  Home,
  Building,
  Building2,
  Tv,
  Film,
  Music,
  Armchair,
  Wrench,
  Hammer,
  Key,
  Globe,
  Wifi,
  Smartphone,
  Cloud,
  Cpu,
  PlayCircle,
  Laptop,
  Smile,
  Scissors,
  Droplet,
  Palette,
  Sparkles,
  Heart,
  Receipt,
  Percent,
  CreditCard,
  GraduationCap,
  BookOpen,
  PenTool,
  Shirt,
  Brain,
  Pencil,
  Users,
  HeartHandshake,
  Shield,
  Activity,
  Compass,
  Gift,
  Clover,
  Zap,
  FileText,
  Dog,
  Bone,
  Stethoscope,
  Pill,
  Dumbbell,
  Briefcase,
  Headphones,
  Mic,
  Car,
  Fuel,
  Navigation,
  Ticket,
  AlertTriangle,
  Footprints,
  Gem,
  TrendingUp,
  Landmark,
  Coins,
  PieChart,
  Wallet,
  CalendarCheck,
  Sun,
  Award,
  PlusCircle,
  Tag,
  Folder,
  CircleDollarSign,
  Coffee,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

export interface IconeItem {
  id: string
  label: string
  Icon: React.ElementType
  categoria?: string
}

export const LISTA_ICONES_SAP: IconeItem[] = [
  // Alimentação
  { id: 'utensils', label: 'Alimentação', Icon: Utensils, categoria: 'Alimentação' },
  {
    id: 'shopping-cart',
    label: 'Carrinho / Mantimentos',
    Icon: ShoppingCart,
    categoria: 'Alimentação',
  },
  { id: 'apple', label: 'Frutas / Hortifruti', Icon: Apple, categoria: 'Alimentação' },
  { id: 'croissant', label: 'Padaria', Icon: Croissant, categoria: 'Alimentação' },
  { id: 'pizza', label: 'Restaurante / Delivery', Icon: Pizza, categoria: 'Alimentação' },
  { id: 'cup-soda', label: 'Bebidas / Refrigerante', Icon: CupSoda, categoria: 'Alimentação' },
  { id: 'wine', label: 'Bebidas alcoólicas', Icon: Wine, categoria: 'Alimentação' },
  { id: 'coffee', label: 'Café', Icon: Coffee, categoria: 'Alimentação' },

  // Moradia & Bens
  { id: 'home', label: 'Casa / Moradia', Icon: Home, categoria: 'Moradia' },
  { id: 'building', label: 'Prédio / Apartamento', Icon: Building, categoria: 'Moradia' },
  { id: 'building-2', label: 'Condomínio', Icon: Building2, categoria: 'Moradia' },
  { id: 'zap', label: 'Energia elétrica', Icon: Zap, categoria: 'Moradia' },
  { id: 'armchair', label: 'Móveis', Icon: Armchair, categoria: 'Moradia' },
  { id: 'hammer', label: 'Reforma', Icon: Hammer, categoria: 'Moradia' },
  { id: 'wrench', label: 'Manutenção', Icon: Wrench, categoria: 'Moradia' },
  { id: 'key', label: 'Aquisições', Icon: Key, categoria: 'Moradia' },

  // Transporte
  { id: 'car', label: 'Carro / Veículo', Icon: Car, categoria: 'Transporte' },
  { id: 'fuel', label: 'Combustível', Icon: Fuel, categoria: 'Transporte' },
  { id: 'navigation', label: 'Uber / Viagem', Icon: Navigation, categoria: 'Transporte' },
  { id: 'ticket', label: 'Pedágio', Icon: Ticket, categoria: 'Transporte' },
  { id: 'alert-triangle', label: 'Multas / Atenção', Icon: AlertTriangle, categoria: 'Transporte' },

  // Saúde & Cuidados
  { id: 'stethoscope', label: 'Saúde / Consultas', Icon: Stethoscope, categoria: 'Saúde' },
  { id: 'pill', label: 'Farmácia / Suplemento', Icon: Pill, categoria: 'Saúde' },
  { id: 'activity', label: 'Fisioterapia / Exames', Icon: Activity, categoria: 'Saúde' },
  { id: 'heart', label: 'Cuidado / Bem-estar', Icon: Heart, categoria: 'Saúde' },
  { id: 'dumbbell', label: 'Academia', Icon: Dumbbell, categoria: 'Saúde' },
  { id: 'smile', label: 'Dentista / Sorriso', Icon: Smile, categoria: 'Saúde' },
  { id: 'scissors', label: 'Cabelo', Icon: Scissors, categoria: 'Saúde' },
  { id: 'droplet', label: 'Shampoo / Higiene', Icon: Droplet, categoria: 'Saúde' },
  { id: 'palette', label: 'Maquiagem / Estética', Icon: Palette, categoria: 'Saúde' },

  // Educação & Trabalho
  {
    id: 'graduation-cap',
    label: 'Educação / Faculdade',
    Icon: GraduationCap,
    categoria: 'Educação',
  },
  { id: 'book-open', label: 'Livros / Escola', Icon: BookOpen, categoria: 'Educação' },
  { id: 'pen-tool', label: 'Material escolar', Icon: PenTool, categoria: 'Educação' },
  { id: 'brain', label: 'Estudo / Curso', Icon: Brain, categoria: 'Educação' },
  { id: 'briefcase', label: 'Trabalho', Icon: Briefcase, categoria: 'Trabalho' },
  { id: 'laptop', label: 'Equipamentos / PC', Icon: Laptop, categoria: 'Trabalho' },
  { id: 'mic', label: 'Home Studio / Áudio', Icon: Mic, categoria: 'Trabalho' },
  { id: 'headphones', label: 'Acessórios', Icon: Headphones, categoria: 'Trabalho' },

  // Comunicação & Entretenimento
  { id: 'wifi', label: 'Internet', Icon: Wifi, categoria: 'Serviços' },
  { id: 'smartphone', label: 'Telefonia', Icon: Smartphone, categoria: 'Serviços' },
  { id: 'cloud', label: 'Nuvem', Icon: Cloud, categoria: 'Serviços' },
  { id: 'tv', label: 'Streaming / TV', Icon: Tv, categoria: 'Lazer' },
  { id: 'music', label: 'Música / Spotify', Icon: Music, categoria: 'Lazer' },
  { id: 'film', label: 'Cinema', Icon: Film, categoria: 'Lazer' },
  { id: 'compass', label: 'Passeios', Icon: Compass, categoria: 'Lazer' },
  { id: 'gift', label: 'Presentes / Brinquedos', Icon: Gift, categoria: 'Lazer' },
  { id: 'clover', label: 'Loteria / Sorte', Icon: Clover, categoria: 'Lazer' },

  // Finanças & Receitas
  { id: 'wallet', label: 'Carteira / Dinheiro', Icon: Wallet, categoria: 'Finanças' },
  { id: 'banknote', label: 'Salário / Dinheiro', Icon: CircleDollarSign, categoria: 'Finanças' },
  { id: 'coins', label: 'Dividendos / Moedas', Icon: Coins, categoria: 'Finanças' },
  {
    id: 'trending-up',
    label: 'Rendimentos / Investimentos',
    Icon: TrendingUp,
    categoria: 'Finanças',
  },
  { id: 'landmark', label: 'Renda Fixa / Banco', Icon: Landmark, categoria: 'Finanças' },
  { id: 'pie-chart', label: 'Fundos / Ações', Icon: PieChart, categoria: 'Finanças' },
  { id: 'credit-card', label: 'Cartão de crédito', Icon: CreditCard, categoria: 'Finanças' },
  { id: 'receipt', label: 'Tarifas / Impostos', Icon: Receipt, categoria: 'Finanças' },
  { id: 'percent', label: 'IOF / Taxas', Icon: Percent, categoria: 'Finanças' },

  // Outros
  { id: 'dog', label: 'Pets', Icon: Dog, categoria: 'Geral' },
  { id: 'shirt', label: 'Vestuário / Roupa', Icon: Shirt, categoria: 'Geral' },
  { id: 'footprints', label: 'Calçados', Icon: Footprints, categoria: 'Geral' },
  { id: 'gem', label: 'Joias / Bijuterias', Icon: Gem, categoria: 'Geral' },
  { id: 'users', label: 'Família', Icon: Users, categoria: 'Geral' },
  { id: 'shield', label: 'Seguro / Proteção', Icon: Shield, categoria: 'Geral' },
  { id: 'file-text', label: 'Documentos / IPTU', Icon: FileText, categoria: 'Geral' },
  { id: 'sparkles', label: 'Geral / Outros', Icon: Sparkles, categoria: 'Geral' },
  { id: 'tag', label: 'Marcador / Tag', Icon: Tag, categoria: 'Geral' },
]

export const PALETA_CORES_SAP = [
  '#10B981', // Verde esmeralda
  '#059669', // Verde floresta
  '#22C55E', // Verde vivo
  '#3B82F6', // Azul royal
  '#2563EB', // Azul profundo
  '#0284C7', // Azul cerúleo
  '#06B6D4', // Ciano
  '#14B8A6', // Teal
  '#8B5CF6', // Roxo
  '#6366F1', // Índigo
  '#A855F7', // Púrpura
  '#EC4899', // Rosa
  '#F43F5E', // Rose vivo
  '#E11D48', // Carmim
  '#EF4444', // Vermelho
  '#F59E0B', // Âmbar
  '#D97706', // Âmbar escuro
  '#F97316', // Laranja
  '#64748B', // Slate
  '#475569', // Chumbo
]

export function renderIconePorId(id?: string | null, className = 'w-4 h-4') {
  if (!id) return <Tag className={className} />
  const encontrado = LISTA_ICONES_SAP.find((i) => i.id === id)
  if (!encontrado) return <Tag className={className} />
  const Componente = encontrado.Icon
  return <Componente className={className} />
}

interface SeletorVisualIconeCorProps {
  iconeSelecionado: string
  corSelecionada: string
  onSelectIcone: (iconeId: string) => void
  onSelectCor: (corHex: string) => void
}

/**
 * Seletor visual de ícones estilo Organizze:
 * Coleção de ícones simples/contornados em grid,
 * com pré-visualização no círculo colorido independente.
 */
export function SeletorVisualIconeCor({
  iconeSelecionado,
  corSelecionada,
  onSelectIcone,
  onSelectCor,
}: SeletorVisualIconeCorProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [busca, setBusca] = useState('')

  const iconesFiltrados = LISTA_ICONES_SAP.filter((i) =>
    i.label.toLowerCase().includes(busca.toLowerCase().trim()),
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {/* Preview do círculo com o ícone selecionado */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm transition-transform shrink-0"
            style={{ backgroundColor: corSelecionada || '#10B981' }}
          >
            {renderIconePorId(iconeSelecionado, 'w-6 h-6 stroke-[2]')}
          </div>
          <div>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold h-8 border-slate-300 hover:bg-slate-50"
                >
                  Alterar Ícone
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-80 p-3 bg-white text-slate-900 border-slate-200 shadow-xl"
                align="start"
              >
                <div className="space-y-2">
                  <Input
                    placeholder="Buscar ícone (ex: carro, café, salário)..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="h-8 text-xs bg-slate-50"
                    autoFocus
                  />
                  <ScrollArea className="h-56 pr-2">
                    <div className="grid grid-cols-5 gap-2 pt-1">
                      {iconesFiltrados.map((item) => {
                        const IconComp = item.Icon
                        const isSel = iconeSelecionado === item.id
                        return (
                          <button
                            key={item.id}
                            type="button"
                            title={item.label}
                            onClick={() => {
                              onSelectIcone(item.id)
                              setPopoverOpen(false)
                            }}
                            className={`p-2 rounded-lg border flex flex-col items-center justify-center transition ${
                              isSel
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs ring-1 ring-emerald-400'
                                : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <IconComp className="w-5 h-5 stroke-[1.8]" />
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Paleta de Cores Independentes */}
      <div>
        <span className="text-xs font-semibold text-slate-700 block mb-1.5">Cor do Círculo</span>
        <div className="flex flex-wrap gap-2 items-center">
          {PALETA_CORES_SAP.map((cor) => {
            const isSel = corSelecionada.toLowerCase() === cor.toLowerCase()
            return (
              <button
                key={cor}
                type="button"
                onClick={() => onSelectCor(cor)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center text-white shrink-0"
                style={{
                  backgroundColor: cor,
                  borderColor: isSel ? '#0f172a' : 'transparent',
                }}
              >
                {isSel && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
