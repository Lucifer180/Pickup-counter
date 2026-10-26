-- Pickup Counter schema.
-- Money is always whole paise (integer). Stock is only reduced at pickup;
-- "held" units are derived from live orders, so a hold can never leak.

CREATE TABLE products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  price_paise  integer NOT NULL CHECK (price_paise > 0),
  -- Physical units in the counter. Reduced only by a successful pickup claim.
  stock        integer NOT NULL CHECK (stock >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE order_status AS ENUM ('pending', 'paid', 'expired', 'needs_review', 'picked_up');

CREATE TABLE orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status             order_status NOT NULL DEFAULT 'pending',
  total_paise        integer NOT NULL CHECK (total_paise > 0),
  expires_at         timestamptz NOT NULL,
  paid_amount_paise  integer,
  payment_event_id   text,
  review_reason      text,
  paid_at            timestamptz,
  picked_up_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paid_orders_have_payment CHECK (
    status NOT IN ('paid', 'picked_up') OR (paid_at IS NOT NULL AND payment_event_id IS NOT NULL)
  ),
  CONSTRAINT picked_up_has_timestamp CHECK (status <> 'picked_up' OR picked_up_at IS NOT NULL),
  CONSTRAINT review_has_reason CHECK (status <> 'needs_review' OR review_reason IS NOT NULL)
);

-- Supports the "units currently held" aggregate and the expiry job.
CREATE INDEX orders_status_expires_idx ON orders (status, expires_at);

CREATE TABLE order_items (
  order_id          uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES products (id),
  quantity          integer NOT NULL CHECK (quantity > 0),
  unit_price_paise  integer NOT NULL CHECK (unit_price_paise > 0),
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX order_items_product_idx ON order_items (product_id);

-- Every webhook delivery we accepted (valid signature). The primary key on
-- event_id is what makes redelivery a no-op.
CREATE TABLE payment_events (
  event_id      text PRIMARY KEY,
  order_id      text NOT NULL,
  amount_paise  integer NOT NULL,
  status        text NOT NULL,
  payload       jsonb NOT NULL,
  outcome       text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_events_order_idx ON payment_events (order_id);

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
