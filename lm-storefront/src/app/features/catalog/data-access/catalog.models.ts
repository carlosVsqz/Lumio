export interface CatalogItem {
  attributes: {name:string;value:string}[];
  type: 'PRODUCT' | 'SERVICE' | 'COMBO';
  comboGroups?: ComboGroup[];
  id: string; slug: string; name: string; description: string;
  categoryIds: string[];
  images: { url: string; alt: string }[];
  available: boolean;
  variants: CatalogVariant[];
}

export interface ComboOption {
  id: string; variantId: string; name: string;
  attributes: {name:string;value:string}[];
  extraPriceMinor: number; available: boolean; maxQuantity: number | null;
}
export interface ComboGroup { id:string; name:string; options:ComboOption[] }
export const COMBO_FIELDS = 'comboGroups { id name options { id variantId name extraPriceMinor available maxQuantity attributes { name value } } }';

export interface CatalogVariant {
  id: string; slug: string; name: string;
  attributes: { name: string; value: string }[];
  priceMinor: number; available: boolean;
}

export interface Category {
  parentId?: string | null;
  id: string; slug: string; name: string; description: string;
}

export interface CatalogMetadata {
  id: string;
  name: string; description: string; currency: string; currencyDecimals: number;
  branding: { logoUrl: string; primaryColor: string };
  whatsappNumber: string; categories: Category[];
}

export interface CatalogItemPage {
  facets: CatalogAttributeFacet[];
  items: CatalogItem[];
  totalCount: number; page: number; pageSize: number; totalPages: number;
}
export interface CatalogAttributeFacet { name:string; values:{value:string;count:number}[] }

export interface CatalogBrowseData {
  catalog: CatalogMetadata;
  itemPage: CatalogItemPage;
}

