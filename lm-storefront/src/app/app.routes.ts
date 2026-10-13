import { Routes } from '@angular/router';
import { campaignsResolver } from './features/campaigns/campaign-store';
import { catalogDetailResolver, catalogHomeResolver, orderSeoResolver, wishlistSeoResolver } from './features/catalog/data-access/catalog-resolvers';

export const routes: Routes = [
  { path: 'favoritos', resolve: {seo:wishlistSeoResolver,campaigns:campaignsResolver}, loadComponent: () => import('./features/wishlist/wishlist-page').then(module => module.WishlistPage) },
  { path: 'pedido', resolve: {seo:orderSeoResolver,campaigns:campaignsResolver}, loadComponent: () => import('./features/order/order-page').then(module => module.OrderPage) },
  { path: 'catalogo/:slug', resolve: {detail:catalogDetailResolver,campaigns:campaignsResolver}, loadComponent: () => import('./features/catalog/detail/catalog-detail').then(module => module.CatalogDetail) },
  { path: '', pathMatch: 'full', resolve: {catalog:catalogHomeResolver,campaigns:campaignsResolver}, loadComponent: () => import('./features/catalog/catalog-page').then(module => module.CatalogPage) },
  { path: '**', redirectTo: '' },
];
