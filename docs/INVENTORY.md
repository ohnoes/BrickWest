# Inventory & lot traceability

All endpoints are under `/api/inventory` and require a JWT.

Stock is never stored as a number on an item. Every change is a row in the append-only
`inventory_ledger` (a database trigger rejects UPDATE/DELETE), and on-hand is the sum of
ledger rows. That makes any past stock level reproducible and every movement auditable.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/suppliers` | List / add suppliers |
| GET | `/items?as_of=<ISO time>` | SKUs with on-hand (optionally as of a past time) and `below_reorder` |
| POST | `/items` | Add an ingredient or packaging SKU (`sku`, `name`, `category`, `unit`, `reorder_point`) |
| GET | `/items/:id/lots` | Lots for a SKU with supplier, expiry and on-hand, oldest expiry first |
| POST | `/receive` | Receive stock into a lot (`item_id`, `lot_number`, `quantity`, `supplier_id?`, `expires_on?`) |
| POST | `/movements` | `type`: `consume` (needs `batch_id`), `waste`, or `adjust` (signed, needs `reason`) |
| GET | `/ledger?item_id=&lot_id=&batch_id=` | Movement history |
| GET | `/lots/:id/trace` | Every batch a lot went into, with quantities (recall lookup) |
| GET | `/batches/:id/usage` | Recipe vs actual use for a batch, scaled to batch volume, plus lots consumed |

## Negative stock

A movement that would take a lot below zero returns `409`. Sending `override: true` with a
`reason` lets an `admin` or `head_brewer` post it anyway; the row is flagged
`negative_override` for review. Other roles get `403`.

## Recipe vs actual

Recipe `ingredients` JSON entries are matched to consumed SKUs by `sku` first, then by name
(case-insensitive). Planned amounts are scaled by `batch.volume_produced / recipe.volume_liters`
when both are set. Consumption that isn't in the recipe is listed with `planned: null`.
