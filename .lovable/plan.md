
# Plan: PDF Report for Estimated Budget (Presupuesto Estimado)

## Summary
Add a new PDF export option in the "Informe PDF" dialog that generates a report containing the estimated budget data: the total estimated budget from the budget settings and a breakdown by phase showing each phase's estimated percentage and amount.

## Changes Required

### 1. Update Phase Interface in BudgetReportPreview
Add the estimated budget fields to the Phase interface to include the new columns:
- `estimated_budget_percent`
- `estimated_budget_amount`

### 2. Fetch Estimated Budget Data
Modify the data fetching logic to:
- Fetch the budget's `estimated_budget` value from the `presupuestos` table
- Include `estimated_budget_percent` and `estimated_budget_amount` in the phases query

### 3. Add New Section Checkbox
Add a new checkbox option in the report configuration section labeled "Presupuesto Estimado" that allows users to include this section in the PDF export.

### 4. Update Report Type Name Logic
Include "Presupuesto Estimado" in the `getReportTypeName()` function when this section is selected.

### 5. PDF Export Implementation
Add a new section to the `exportToPDF()` function that:
- Creates a new page for the estimated budget section
- Displays the header with company data (same as other sections)
- Shows the total estimated budget prominently
- Generates a table with columns: Fase (Phase), % Presupuesto estimado, Euro Presupuesto estimado fase
- Includes a total row at the bottom summing all phase amounts

### 6. Preview Section Implementation
Add the HTML preview section for the estimated budget that shows:
- A header with the total estimated budget
- A table displaying all phases with their estimated percentages and amounts
- A footer row with totals

---

## Technical Details

### File to Modify
`src/components/presupuestos/BudgetReportPreview.tsx`

### Interface Updates
```typescript
interface Phase {
  id: string;
  name: string;
  code: string | null;
  start_date: string | null;
  duration_days: number | null;
  estimated_end_date: string | null;
  // NEW FIELDS
  estimated_budget_percent: number | null;
  estimated_budget_amount: number | null;
}
```

### State Addition
```typescript
const [estimatedBudget, setEstimatedBudget] = useState<number | null>(null);
```

### Data Fetching
Fetch the `estimated_budget` from the presupuesto record and update the phases query to include the new fields.

### Section Checkbox (in UI)
```typescript
<div className="flex items-center space-x-2">
  <Checkbox 
    id="estimated-budget" 
    checked={selectedSections.includes('estimated-budget')}
    onCheckedChange={(checked) => {
      if (checked) {
        setSelectedSections(prev => [...prev, 'estimated-budget']);
      } else {
        setSelectedSections(prev => prev.filter(s => s !== 'estimated-budget'));
      }
    }}
  />
  <Label htmlFor="estimated-budget" className="cursor-pointer text-sm">Presupuesto Estimado</Label>
</div>
```

### PDF Table Structure
The PDF section will use `jspdf-autotable` with:
- Header: Fase | % Presupuesto estimado | Euro Presupuesto estimado fase
- Body: One row per phase with code, name, percentage, and amount
- Footer: Total row with sum of all amounts

### Preview HTML Structure
```tsx
{selectedSections.includes('estimated-budget') && (
  <div className="print-section">
    <h3 className="text-lg font-bold text-primary mb-4">PRESUPUESTO ESTIMADO</h3>
    
    {/* Total header card */}
    <Card className="bg-primary/5 border-primary/20 mb-4">
      <CardContent className="py-4 flex items-center justify-between">
        <span className="font-semibold">Presupuesto Estimado Total:</span>
        <span className="text-xl font-bold text-primary">{formatCurrency(estimatedBudget || 0)}</span>
      </CardContent>
    </Card>
    
    {/* Phases table */}
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fase</TableHead>
          <TableHead className="text-right">% Presupuesto estimado</TableHead>
          <TableHead className="text-right">Euro Presupuesto estimado fase</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {phases.map(phase => (
          <TableRow key={phase.id}>
            <TableCell>{phase.code} {phase.name}</TableCell>
            <TableCell className="text-right">{phase.estimated_budget_percent ?? '-'}%</TableCell>
            <TableCell className="text-right">{formatCurrency(phase.estimated_budget_amount || 0)}</TableCell>
          </TableRow>
        ))}
        {/* Total row */}
        <TableRow className="bg-muted/50 font-semibold">
          <TableCell>Total</TableCell>
          <TableCell className="text-right">-</TableCell>
          <TableCell className="text-right">{formatCurrency(totalEstimatedPhaseAmount)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
)}
```

---

## Visual Layout of PDF Section

```text
+------------------------------------------------------------------+
|  [LOGO]  COMPANY NAME                                             |
|          email | phone | website                                  |
+------------------------------------------------------------------+

PRESUPUESTO ESTIMADO

+------------------------------------------------------------------+
|  Presupuesto Estimado Total:                    Euro 150,000.00    |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
| Fase                      | % Pres. estimado | Euro Pres. estimado |
+------------------------------------------------------------------+
| 01 Demolición             |        5.0%      |       7,500.00 Euro |
| 02 Estructura             |       25.0%      |      37,500.00 Euro |
| 03 Cerramientos           |       15.0%      |      22,500.00 Euro |
| 04 Instalaciones          |       20.0%      |      30,000.00 Euro |
| 05 Acabados               |       35.0%      |      52,500.00 Euro |
+------------------------------------------------------------------+
| TOTAL                     |         -        |     150,000.00 Euro |
+------------------------------------------------------------------+
```

---

## Index Update
Add the new section to the document index when selected:
```typescript
if (selectedSections.includes('estimated-budget')) {
  indexItems.push({ title: 'Presupuesto Estimado', page: 3 });
}
```
