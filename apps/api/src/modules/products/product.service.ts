import { pool } from '../../db/pool';
import { AppError } from '../../middleware/error-handler';
import * as repo from './product.repository';

export interface ProductDto {
  id: string;
  name: string;
  pricePaise: number;
  /** Units physically in the counter. */
  stock: number;
  /** stock minus units held by unpaid (and paid-but-uncollected) orders. */
  availableUnits: number;
}

function toDto(row: repo.ProductRow): ProductDto {
  return {
    id: row.id,
    name: row.name,
    pricePaise: row.price_paise,
    stock: row.stock,
    availableUnits: Math.max(0, row.available),
  };
}

export async function listProducts(): Promise<ProductDto[]> {
  return (await repo.listProducts(pool)).map(toDto);
}

export async function getProduct(id: string): Promise<ProductDto> {
  const row = await repo.findProduct(pool, id);
  if (!row) throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product ${id} not found`);
  return toDto(row);
}
