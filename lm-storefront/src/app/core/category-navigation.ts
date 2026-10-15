import type { Category } from '../features/catalog/data-access/catalog.models';

export interface CategoryBranch { category:Category; children:CategoryBranch[] }

/** Preserve real parent relations and provider order, including catalogs without a hierarchy. */
export function categoryTree(categories:readonly Category[]):CategoryBranch[] {
  const nodes=new Map(categories.map(category=>[category.id,{category,children:[]} as CategoryBranch]));
  const roots:CategoryBranch[]=[];
  for(const category of categories) {
    const node=nodes.get(category.id)!;
    const parent=category.parentId?nodes.get(category.parentId):undefined;
    // API validates cycles; keep malformed cached data from hiding a category or recursing forever.
    const seen=new Set([category.id]);let ancestor=parent;
    while(ancestor && !seen.has(ancestor.category.id)) {
      seen.add(ancestor.category.id);ancestor=nodes.get(ancestor.category.parentId??'');
    }
    if(parent && !ancestor)parent.children.push(node);else roots.push(node);
  }
  return roots;
}

export function categoryTrail(categories:readonly Category[],id:string|null):Category[] {
  const nodes=new Map(categories.map(category=>[category.id,category]));
  const trail:Category[]=[],seen=new Set<string>();let category=id?nodes.get(id):undefined;
  while(category && !seen.has(category.id)) {
    trail.unshift(category);seen.add(category.id);category=nodes.get(category.parentId??'');
  }
  return trail;
}

export function categoryLinks(branch:CategoryBranch):{category:Category;depth:number}[] {
  const links:{category:Category;depth:number}[]=[],pending=[...branch.children].reverse().map(child=>({branch:child,depth:0}));
  while(pending.length) {
    const next=pending.pop()!;links.push({category:next.branch.category,depth:next.depth});
    pending.push(...[...next.branch.children].reverse().map(child=>({branch:child,depth:next.depth+1})));
  }
  return links;
}
