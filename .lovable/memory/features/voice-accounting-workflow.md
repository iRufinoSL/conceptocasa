# Memory: features/voice-accounting-workflow
Updated: just now

The voice assistant supports an accounting workflow for creating ledger entries (Asientos) through natural language commands or guided dialogs. It can parse dates, amounts, and account names (e.g., 'Pago el 22 de Enero...'). If a mentioned account is not found, the system automatically assigns a 'Cuenta Pendiente de Asignarse' (Provisional Account). These entries are visually flagged with a red border and specific badge in the 'Administración' tab, and a dedicated filter allows for quick identification of entries requiring manual account assignment.

## Wizard Flow Updates
- **Budget Required**: All accounting entries must be associated with a budget (presupuesto). The wizard now requires budget selection in step 2.
- **Simplified Pago/Cobro Flow**: Payment and collection entries now have 6 steps instead of 7:
  1. Entry Type
  2. Budget (required)
  3. Description
  4. Date/Amount
  5. Debit Account (Proveedor for Pago, Tesorería for Cobro)
  6. Credit Account (Tesorería for Pago, Cliente for Cobro)
- **Removed Duplicate Step**: Previously, Pago entries asked for "Proveedor" (contact) and then "Cuenta de Proveedor" (account) separately. Now it directly asks for the supplier account (same entity, single step).
