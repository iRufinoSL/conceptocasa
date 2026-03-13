# Memory: features/administration/multi-ledger-system
Updated: just now

The administration module supports multiple accounting ledgers (Contabilidades). Each ledger has a name, code, and operations start date, stored in the `accounting_ledgers` table. All accounting entities (entries, accounts, invoices, purchase orders) have a `ledger_id` FK column linking them to a specific ledger.

## Key Features
- **Ledger Selector**: A `LedgerSelector` component in the header of both the global Administracion page and BudgetAdministracionTab allows switching between ledgers
- **Contabilidad Total**: A special option (`__total__`) shows aggregated data across all ledgers (no filter applied)
- **Per-Ledger Filtering**: All tabs (Órdenes Pedido, Facturas, Asientos, Apuntes, Cuentas Contables, Informe Balance, Informe IVA) filter by the selected ledger
- **New Record Association**: When creating new records (entries, invoices, purchase orders, accounts), the currently selected ledger_id is automatically assigned

## Default Data
- A default ledger "Domus Construcciones" (code: DOMUS) was created and all existing records were assigned to it

## Tables Modified
- `accounting_ledgers` (new table)
- `accounting_entries` (added `ledger_id`)
- `accounting_accounts` (added `ledger_id`)
- `invoices` (added `ledger_id`)
- `purchase_orders` (added `ledger_id`)
