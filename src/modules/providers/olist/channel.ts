type OlistChannelInput = {
  ecommerce?: { canalVenda?: string | null; nome?: string | null } | null;
  intermediador?: { nome?: string | null } | null;
};

/** Resolve o canal sem expor ou depender de dados de comprador. */
export function resolveOlistChannel(input: OlistChannelInput): string {
  const channel = input.ecommerce?.canalVenda ?? input.ecommerce?.nome ?? input.intermediador?.nome ?? 'Olist ERP';
  return channel.slice(0, 32);
}
