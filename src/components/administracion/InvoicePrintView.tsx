import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download, Home } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/lib/format-utils';

type DocumentType = 'factura' | 'presupuesto' | 'proforma';

interface Invoice {
  id: string;
  invoice_number: number;
  invoice_date: string;
  description: string | null;
  observations: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  document_type?: DocumentType;
  issuer_account?: { 
    name: string; 
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    province?: string | null;
    nif_cif?: string | null;
  } | null;
  receiver_account?: { 
    name: string; 
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    province?: string | null;
    nif_cif?: string | null;
  } | null;
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  factura: 'FACTURA',
  presupuesto: 'PRESUPUESTO',
  proforma: 'PROFORMA'
};

const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  factura: '#3b82f6',
  presupuesto: '#f59e0b',
  proforma: '#8b5cf6'
};

// Format invoice number with year: #0010/25
const formatInvoiceNumber = (number: number, date: string): string => {
  const year = new Date(date).getFullYear().toString().slice(-2);
  const paddedNumber = String(number).padStart(4, '0');
  return `#${paddedNumber}/${year}`;
};

interface InvoiceLine {
  id: string;
  code: number;
  description: string | null;
  units: number;
  unit_price: number;
  subtotal: number;
}

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

export function InvoicePrintView({ invoice, onClose }: Props) {
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLines();
  }, [invoice.id]);

  const fetchLines = async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_lines')
        .select('*')
        .eq('invoice_id', invoice.id)
        .order('code');

      if (error) throw error;
      setLines(data || []);
    } catch (error) {
      console.error('Error fetching lines:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const docType = invoice.document_type || 'factura';
    const docColor = DOCUMENT_TYPE_COLORS[docType];
    const docLabel = DOCUMENT_TYPE_LABELS[docType];

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${docLabel} ${formatInvoiceNumber(invoice.invoice_number, invoice.invoice_date)}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              padding: 40px; 
              color: #1a1a1a;
              line-height: 1.5;
            }
            .invoice-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 40px;
              padding-bottom: 20px;
              border-bottom: 2px solid #e5e5e5;
            }
            .logo-section {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .logo-icon {
              width: 48px;
              height: 48px;
              background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
              border-radius: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .logo-icon svg {
              width: 28px;
              height: 28px;
              color: white;
            }
            .company-name {
              font-size: 24px;
              font-weight: 700;
              color: #1a1a1a;
            }
            .invoice-title {
              text-align: right;
            }
            .invoice-title h1 {
              font-size: 28px;
              color: ${docColor};
              margin-bottom: 4px;
            }
            .invoice-number {
              font-size: 18px;
              color: #666;
            }
            .parties {
              display: flex;
              justify-content: space-between;
              margin-bottom: 40px;
            }
            .party {
              width: 45%;
            }
            .party-label {
              font-size: 12px;
              text-transform: uppercase;
              color: #666;
              margin-bottom: 8px;
              letter-spacing: 0.5px;
            }
            .party-name {
              font-size: 16px;
              font-weight: 600;
              color: #1a1a1a;
              margin-bottom: 4px;
            }
            .party-address {
              font-size: 13px;
              color: #444;
              line-height: 1.4;
            }
            .party-nif {
              font-size: 13px;
              color: #666;
              margin-top: 4px;
            }
            .invoice-info {
              display: flex;
              gap: 40px;
              margin-bottom: 40px;
              padding: 16px;
              background: #f8fafc;
              border-radius: 8px;
            }
            .info-item label {
              font-size: 12px;
              color: #666;
              display: block;
              margin-bottom: 4px;
            }
            .info-item span {
              font-weight: 600;
              color: #1a1a1a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th {
              background: #f1f5f9;
              padding: 12px;
              text-align: left;
              font-size: 12px;
              text-transform: uppercase;
              color: #475569;
              letter-spacing: 0.5px;
            }
            td {
              padding: 12px;
              border-bottom: 1px solid #e5e5e5;
            }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .totals {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 40px;
            }
            .totals-box {
              width: 280px;
              background: #f8fafc;
              border-radius: 8px;
              padding: 16px;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
            }
            .totals-row.total {
              border-top: 2px solid #e5e5e5;
              margin-top: 8px;
              padding-top: 16px;
              font-size: 18px;
              font-weight: 700;
              color: #3b82f6;
            }
            .observations {
              margin-bottom: 40px;
              padding: 16px;
              background: #f8fafc;
              border-radius: 8px;
              border-left: 4px solid ${docColor};
            }
            .observations-label {
              font-size: 12px;
              text-transform: uppercase;
              color: #666;
              margin-bottom: 8px;
              letter-spacing: 0.5px;
            }
            .observations-content {
              color: #1a1a1a;
              white-space: pre-wrap;
            }
            .footer {
              position: fixed;
              bottom: 40px;
              left: 40px;
              right: 40px;
              text-align: center;
              padding-top: 20px;
              border-top: 1px solid #e5e5e5;
              font-size: 12px;
              color: #666;
            }
            .footer a {
              color: #3b82f6;
              text-decoration: none;
            }
            @media print {
              body { padding: 20px; }
              .footer { position: relative; margin-top: 60px; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "d 'de' MMMM 'de' yyyy", { locale: es });
  };

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vista Previa de {DOCUMENT_TYPE_LABELS[invoice.document_type || 'factura']}</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="bg-white p-8 rounded-lg">
          {/* Header */}
          <div className="invoice-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px', paddingBottom: '20px', borderBottom: '2px solid #e5e5e5' }}>
            <div className="logo-section" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a' }}>ConceptoCasa</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h1 style={{ fontSize: '28px', color: DOCUMENT_TYPE_COLORS[invoice.document_type || 'factura'], marginBottom: '4px' }}>
                {DOCUMENT_TYPE_LABELS[invoice.document_type || 'factura']}
              </h1>
              <div style={{ fontSize: '18px', color: '#666' }}>{formatInvoiceNumber(invoice.invoice_number, invoice.invoice_date)}</div>
            </div>
          </div>

          {/* Parties */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
            <div style={{ width: '45%' }}>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#666', marginBottom: '8px', letterSpacing: '0.5px' }}>Emisor</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                {invoice.issuer_account?.name || 'No definido'}
              </div>
              {invoice.issuer_account?.address && (
                <div style={{ fontSize: '13px', color: '#444', lineHeight: '1.4' }}>
                  {invoice.issuer_account.address}
                  {(invoice.issuer_account.postal_code || invoice.issuer_account.city) && (
                    <><br />{[invoice.issuer_account.postal_code, invoice.issuer_account.city].filter(Boolean).join(' - ')}</>
                  )}
                  {invoice.issuer_account.province && (
                    <><br />{invoice.issuer_account.province}</>
                  )}
                </div>
              )}
              {invoice.issuer_account?.nif_cif && (
                <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                  NIF/CIF: {invoice.issuer_account.nif_cif}
                </div>
              )}
            </div>
            <div style={{ width: '45%' }}>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#666', marginBottom: '8px', letterSpacing: '0.5px' }}>Receptor</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                {invoice.receiver_account?.name || 'No definido'}
              </div>
              {invoice.receiver_account?.address && (
                <div style={{ fontSize: '13px', color: '#444', lineHeight: '1.4' }}>
                  {invoice.receiver_account.address}
                  {(invoice.receiver_account.postal_code || invoice.receiver_account.city) && (
                    <><br />{[invoice.receiver_account.postal_code, invoice.receiver_account.city].filter(Boolean).join(' - ')}</>
                  )}
                  {invoice.receiver_account.province && (
                    <><br />{invoice.receiver_account.province}</>
                  )}
                </div>
              )}
              {invoice.receiver_account?.nif_cif && (
                <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                  NIF/CIF: {invoice.receiver_account.nif_cif}
                </div>
              )}
            </div>
          </div>

          {/* Invoice Info */}
          <div style={{ display: 'flex', gap: '40px', marginBottom: '40px', padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Fecha</label>
              <span style={{ fontWeight: '600', color: '#1a1a1a' }}>{formatDate(invoice.invoice_date)}</span>
            </div>
            {invoice.description && (
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Descripción</label>
                <span style={{ fontWeight: '600', color: '#1a1a1a' }}>{invoice.description}</span>
              </div>
            )}
          </div>

          {/* Lines Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
            <thead>
              <tr>
                <th style={{ background: '#f1f5f9', padding: '12px', textAlign: 'left', fontSize: '12px', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>Cód.</th>
                <th style={{ background: '#f1f5f9', padding: '12px', textAlign: 'left', fontSize: '12px', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>Descripción</th>
                <th style={{ background: '#f1f5f9', padding: '12px', textAlign: 'right', fontSize: '12px', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>Uds.</th>
                <th style={{ background: '#f1f5f9', padding: '12px', textAlign: 'right', fontSize: '12px', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>€/Ud.</th>
                <th style={{ background: '#f1f5f9', padding: '12px', textAlign: 'right', fontSize: '12px', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td style={{ padding: '12px', borderBottom: '1px solid #e5e5e5' }}>{line.code}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #e5e5e5' }}>{line.description || '-'}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #e5e5e5', textAlign: 'right' }}>{line.units}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #e5e5e5', textAlign: 'right' }}>{formatCurrency(line.unit_price)}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #e5e5e5', textAlign: 'right' }}>{formatCurrency(line.subtotal)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
                    No hay líneas en este documento
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
            <div style={{ width: '280px', background: '#f8fafc', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span>Subtotal:</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.vat_rate === -1 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: '#666' }}>
                  <span>IVA no incluido</span>
                  <span>-</span>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span>IVA ({invoice.vat_rate}%):</span>
                  <span>{formatCurrency(invoice.vat_amount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #e5e5e5', marginTop: '8px', paddingTop: '16px', fontSize: '18px', fontWeight: '700', color: DOCUMENT_TYPE_COLORS[invoice.document_type || 'factura'] }}>
                <span>Total:</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* Observations */}
          {invoice.observations && (
            <div style={{ marginBottom: '40px', padding: '16px', background: '#f8fafc', borderRadius: '8px', borderLeft: `4px solid ${DOCUMENT_TYPE_COLORS[invoice.document_type || 'factura']}` }}>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#666', marginBottom: '8px', letterSpacing: '0.5px' }}>Observaciones</div>
              <div style={{ color: '#1a1a1a', whiteSpace: 'pre-wrap' }}>{invoice.observations}</div>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', paddingTop: '20px', borderTop: '1px solid #e5e5e5', fontSize: '12px', color: '#666' }}>
            <p><strong>ConceptoCasa</strong> | <a href="https://concepto.casa" style={{ color: '#3b82f6', textDecoration: 'none' }}>https://concepto.casa</a> | organiza@concepto.casa</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
