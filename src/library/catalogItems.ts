import type { CatalogItem } from './catalog';
import { EXTRAS } from './catalogExtras';
import { LIVING_BEDROOM } from './catalogLiving';
import { build } from './catalogShapes';
import { KITCHEN_BATH_OFFICE } from './catalogUtility';

// The design's Library pieces first; extras follow them in each room's section.
export const CATALOG_ITEMS: CatalogItem[] = [...LIVING_BEDROOM, ...KITCHEN_BATH_OFFICE, ...EXTRAS].map(build);
