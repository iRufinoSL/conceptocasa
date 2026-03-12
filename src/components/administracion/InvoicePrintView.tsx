import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download, Home, ZoomIn, ZoomOut, Minus, FileDown, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/lib/format-utils';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { generateAndSaveAdminPdf } from '@/lib/generate-admin-pdf';
import { toast } from 'sonner';

type PrintScale = 'compact' | 'normal' | 'large';

const SCALE_CONFIGS: Record<PrintScale, {
  label: string;
  bodyFontSize: string;
  titleFontSize: string;
  sectionFontSize: string;
  tableFontSize: string;
  tableHeaderFontSize: string;
  partyNameFontSize: string;
  partyDetailsFontSize: string;
  totalsFontSize: string;
  finalTotalFontSize: string;
  padding: string;
  printPadding: string;
  logoMaxWidth: string;
  iconSize: string;
}> = {
  compact: {
    label: 'Compacto',
    bodyFontSize: '10px',
    titleFontSize: '18px',
    sectionFontSize: '9px',
    tableFontSize: '9px',
    tableHeaderFontSize: '8px',
    partyNameFontSize: '11px',
    partyDetailsFontSize: '9px',
    totalsFontSize: '9px',
    finalTotalFontSize: '12px',
    padding: '16px',
    printPadding: '12px',
    logoMaxWidth: '120px',
    iconSize: '32px',
  },
  normal: {
    label: 'Normal',
    bodyFontSize: '12px',
    titleFontSize: '22px',
    sectionFontSize: '10px',
    tableFontSize: '11px',
    tableHeaderFontSize: '9px',
    partyNameFontSize: '13px',
    partyDetailsFontSize: '11px',
    totalsFontSize: '11px',
    finalTotalFontSize: '14px',
    padding: '24px',
    printPadding: '20px',
    logoMaxWidth: '160px',
    iconSize: '40px',
  },
  large: {
    label: 'Ampliado',
    bodyFontSize: '14px',
    titleFontSize: '26px',
    sectionFontSize: '11px',
    tableFontSize: '12px',
    tableHeaderFontSize: '10px',
    partyNameFontSize: '15px',
    partyDetailsFontSize: '12px',
    totalsFontSize: '12px',
    finalTotalFontSize: '16px',
    padding: '32px',
    printPadding: '24px',
    logoMaxWidth: '180px',
    iconSize: '44px',
  },
};

type DocumentType = 'factura' | 'presupuesto' | 'proforma';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
}

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
  issuer_account_id?: string | null;
  receiver_account_id?: string | null;
  footer_contact_source?: string;
  presupuesto?: Presupuesto | null;
  issuer_account?: {
    id?: string;
    name: string;
    account_type?: string;
    contact_id?: string | null;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    province?: string | null;
    nif_cif?: string | null;
  } | null;
  receiver_account?: {
    id?: string;
    name: string;
    account_type?: string;
    contact_id?: string | null;
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

type ContactFiscal = {
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  nif_dni?: string | null;
};

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

export function InvoicePrintView({ invoice, onClose }: Props) {
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiverContactFiscal, setReceiverContactFiscal] = useState<ContactFiscal | null>(null);
  const [issuerContactData, setIssuerContactData] = useState<{ email?: string | null; phone?: string | null; address?: string | null; city?: string | null; province?: string | null } | null>(null);
  const [receiverContactData, setReceiverContactData] = useState<{ email?: string | null; phone?: string | null; address?: string | null; city?: string | null; province?: string | null } | null>(null);
  const [printScale, setPrintScale] = useState<PrintScale>('normal');
  const printRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useCompanySettings();

  const scaleConfig = SCALE_CONFIGS[printScale];

  useEffect(() => {
    fetchLines();
  }, [invoice.id]);

  useEffect(() => {
    const contactId = invoice.receiver_account?.contact_id;
    if (!contactId) {
      setReceiverContactFiscal(null);
      return;
    }

    supabase
      .from('crm_contacts')
      .select('address, city, postal_code, province, nif_dni')
      .eq('id', contactId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn('No se pudo cargar el contacto del receptor:', error);
          setReceiverContactFiscal(null);
          return;
        }
        setReceiverContactFiscal(data || null);
      });
  }, [invoice.receiver_account?.contact_id]);

  // Fetch contact data for footer display
  useEffect(() => {
    const fetchContactForFooter = async (contactId: string | null | undefined, setter: (d: any) => void) => {
      if (!contactId) { setter(null); return; }
      const { data } = await supabase.from('crm_contacts').select('email, phone, address, city, province').eq('id', contactId).maybeSingle();
      setter(data || null);
    };
    fetchContactForFooter(invoice.issuer_account?.contact_id, setIssuerContactData);
    fetchContactForFooter(invoice.receiver_account?.contact_id, setReceiverContactData);
  }, [invoice.issuer_account?.contact_id, invoice.receiver_account?.contact_id]);

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
              padding: ${scaleConfig.padding}; 
              color: #1a1a1a;
              line-height: 1.4;
              font-size: ${scaleConfig.bodyFontSize};
            }
            .invoice-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 20px;
              padding-bottom: 12px;
              border-bottom: 2px solid #e5e5e5;
            }
            .logo-section {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .logo-icon {
              width: ${scaleConfig.iconSize};
              height: ${scaleConfig.iconSize};
              background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .logo-icon svg {
              width: 60%;
              height: 60%;
              color: white;
            }
            .logo-image {
              max-width: ${scaleConfig.logoMaxWidth};
              max-height: 55px;
              object-fit: contain;
            }
            .company-name {
              font-size: ${scaleConfig.partyNameFontSize};
              font-weight: 700;
              color: #1a1a1a;
            }
            .invoice-title {
              text-align: right;
            }
            .invoice-title h1 {
              font-size: ${scaleConfig.titleFontSize};
              color: ${docColor};
              margin-bottom: 2px;
            }
            .invoice-number {
              font-size: ${scaleConfig.tableFontSize};
              color: #666;
            }
            .parties {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
            }
            .party {
              width: 45%;
            }
            .party-label {
              font-size: ${scaleConfig.sectionFontSize};
              text-transform: uppercase;
              color: #666;
              margin-bottom: 4px;
              letter-spacing: 0.5px;
            }
            .party-name {
              font-size: ${scaleConfig.partyNameFontSize};
              font-weight: 600;
              color: #1a1a1a;
              margin-bottom: 2px;
            }
            .party-address {
              font-size: ${scaleConfig.partyDetailsFontSize};
              color: #444;
              line-height: 1.4;
            }
            .party-nif {
              font-size: ${scaleConfig.partyDetailsFontSize};
              color: #666;
              margin-top: 2px;
            }
            .invoice-info {
              display: flex;
              gap: 24px;
              margin-bottom: 20px;
              padding: 10px;
              background: #f8fafc;
              border-radius: 6px;
            }
            .info-item label {
              font-size: ${scaleConfig.sectionFontSize};
              color: #666;
              display: block;
              margin-bottom: 2px;
            }
            .info-item span {
              font-weight: 600;
              font-size: ${scaleConfig.tableFontSize};
              color: #1a1a1a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 16px;
            }
            th {
              background: #f1f5f9;
              padding: 8px;
              text-align: left;
              font-size: ${scaleConfig.tableHeaderFontSize};
              text-transform: uppercase;
              color: #475569;
              letter-spacing: 0.5px;
            }
            td {
              padding: 8px;
              border-bottom: 1px solid #e5e5e5;
              font-size: ${scaleConfig.tableFontSize};
            }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .totals {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 20px;
            }
            .totals-box {
              width: 240px;
              background: #f8fafc;
              border-radius: 6px;
              padding: 12px;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 4px 0;
              font-size: ${scaleConfig.totalsFontSize};
            }
            .totals-row.total {
              border-top: 2px solid #e5e5e5;
              margin-top: 4px;
              padding-top: 10px;
              font-size: ${scaleConfig.finalTotalFontSize};
              font-weight: 700;
              color: #3b82f6;
            }
            .observations {
              margin-bottom: 20px;
              padding: 10px;
              background: #f8fafc;
              border-radius: 6px;
              border-left: 3px solid ${docColor};
            }
            .observations-label {
              font-size: ${scaleConfig.sectionFontSize};
              text-transform: uppercase;
              color: #666;
              margin-bottom: 4px;
              letter-spacing: 0.5px;
            }
            .observations-content {
              color: #1a1a1a;
              white-space: pre-wrap;
              font-size: ${scaleConfig.tableFontSize};
            }
            .footer {
              text-align: center;
              padding-top: 12px;
              border-top: 1px solid #e5e5e5;
              font-size: ${scaleConfig.sectionFontSize};
              color: #666;
              margin-top: 20px;
            }
            .footer a {
              color: #3b82f6;
              text-decoration: none;
            }
            @media print {
              body { padding: ${scaleConfig.printPadding}; }
              .footer { margin-top: 30px; }
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

  // Render party address block - si hay contactFiscal (de contact_id), esos datos son la fuente principal
  const renderPartyAddress = (
    account: Invoice['issuer_account'] | Invoice['receiver_account'],
    contactFiscal?: ContactFiscal | null
  ) => {
    if (!account && !contactFiscal) return null;

    // Si hay contacto vinculado, sus datos tienen prioridad sobre los de la cuenta contable
    const address = contactFiscal?.address || account?.address;
    const postalCode = contactFiscal?.postal_code || account?.postal_code;
    const city = contactFiscal?.city || account?.city;
    const province = contactFiscal?.province || account?.province;

    const addressParts: string[] = [];
    if (address) addressParts.push(address);

    const cityLineParts = [postalCode, city].filter((p): p is string => !!p);
    const cityLine = cityLineParts.join(' - ');
    if (cityLine) addressParts.push(cityLine);

    if (province) addressParts.push(province);

    if (addressParts.length === 0) return null;

    return (
      <div style={{ fontSize: '10px', color: '#444', lineHeight: '1.4' }}>
        {addressParts.map((part, idx) => (
          <span key={idx}>
            {part}
            {idx < addressParts.length - 1 && <br />}
          </span>
        ))}
      </div>
    );
  };

  // Obtiene el NIF/CIF priorizando el contacto si existe
  const getReceiverNif = () => {
    return receiverContactFiscal?.nif_dni || invoice.receiver_account?.nif_cif;
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

  // Determine logo to display
  const logoUrl = companySettings.logo_signed_url || companySettings.logo_url;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Vista Previa de {DOCUMENT_TYPE_LABELS[invoice.document_type || 'factura']}</DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Escala:</span>
              <ToggleGroup 
                type="single" 
                value={printScale} 
                onValueChange={(value) => value && setPrintScale(value as PrintScale)}
                className="border rounded-md"
              >
                <ToggleGroupItem value="compact" size="sm" className="gap-1 text-xs px-2">
                  <ZoomOut className="h-3 w-3" />
                  Compacto
                </ToggleGroupItem>
                <ToggleGroupItem value="normal" size="sm" className="gap-1 text-xs px-2">
                  <Minus className="h-3 w-3" />
                  Normal
                </ToggleGroupItem>
                <ToggleGroupItem value="large" size="sm" className="gap-1 text-xs px-2">
                  <ZoomIn className="h-3 w-3" />
                  Ampliado
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </DialogHeader>

        <div ref={printRef} className="bg-white p-4 rounded-lg" style={{ fontSize: scaleConfig.bodyFontSize }}>
          {/* Header */}
          <div className="invoice-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', paddingBottom: '10px', borderBottom: '2px solid #e5e5e5' }}>
            {/* Logo */}
            <div className="logo-section" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={companySettings.name} 
                  style={{ maxWidth: scaleConfig.logoMaxWidth, maxHeight: '55px', objectFit: 'contain' }}
                  className="logo-image"
                />
              ) : (
                <>
                  <div style={{ width: scaleConfig.iconSize, height: scaleConfig.iconSize, background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: scaleConfig.partyNameFontSize, fontWeight: '700', color: '#1a1a1a' }}>{companySettings.name}</div>
                </>
              )}
            </div>

            {/* Presupuesto vinculado (centro) */}
            {invoice.presupuesto && (
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: scaleConfig.sectionFontSize, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px', marginBottom: '2px' }}>
                  Presupuesto
                </div>
                <div style={{ fontSize: scaleConfig.tableFontSize, fontWeight: '600', color: '#1a1a1a' }}>
                  {String(invoice.presupuesto.codigo_correlativo).padStart(4, '0')} - {invoice.presupuesto.nombre}
                </div>
                <div style={{ fontSize: scaleConfig.sectionFontSize, color: '#666' }}>
                  Versión {invoice.presupuesto.version}
                </div>
              </div>
            )}

            {/* Tipo de documento y número */}
            <div style={{ textAlign: 'right' }}>
              <h1 style={{ fontSize: scaleConfig.titleFontSize, color: DOCUMENT_TYPE_COLORS[invoice.document_type || 'factura'], marginBottom: '2px' }}>
                {DOCUMENT_TYPE_LABELS[invoice.document_type || 'factura']}
              </h1>
              <div style={{ fontSize: scaleConfig.tableFontSize, color: '#666' }}>{formatInvoiceNumber(invoice.invoice_number, invoice.invoice_date)}</div>
            </div>
          </div>

          {/* Parties - Emisor y Receptor con todos los datos */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '16px' }}>
            {/* Emisor */}
            <div style={{ flex: 1, padding: '10px', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid #3b82f6' }}>
              <div style={{ fontSize: scaleConfig.sectionFontSize, textTransform: 'uppercase', color: '#3b82f6', marginBottom: '6px', letterSpacing: '0.5px', fontWeight: '600' }}>Emisor / Proveedor</div>
              <div style={{ fontSize: scaleConfig.partyNameFontSize, fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                {invoice.issuer_account?.name || 'No definido'}
              </div>
              {renderPartyAddress(invoice.issuer_account)}
              {invoice.issuer_account?.nif_cif && (
                <div style={{ fontSize: scaleConfig.partyDetailsFontSize, color: '#1a1a1a', marginTop: '4px', fontWeight: '500' }}>
                  NIF/CIF: {invoice.issuer_account.nif_cif}
                </div>
              )}
            </div>

            {/* Receptor */}
            <div style={{ flex: 1, padding: '10px', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: scaleConfig.sectionFontSize, textTransform: 'uppercase', color: '#10b981', marginBottom: '6px', letterSpacing: '0.5px', fontWeight: '600' }}>Receptor / Cliente</div>
              <div style={{ fontSize: scaleConfig.partyNameFontSize, fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                {invoice.receiver_account?.name || 'No definido'}
              </div>
              {renderPartyAddress(invoice.receiver_account, receiverContactFiscal)}
              {getReceiverNif() && (
                <div style={{ fontSize: scaleConfig.partyDetailsFontSize, color: '#1a1a1a', marginTop: '4px', fontWeight: '500' }}>
                  NIF/CIF: {getReceiverNif()}
                </div>
              )}
            </div>
          </div>

          {/* Invoice Info */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', padding: '8px 10px', background: '#f8fafc', borderRadius: '6px' }}>
            <div>
              <label style={{ fontSize: scaleConfig.sectionFontSize, color: '#666', display: 'block', marginBottom: '2px' }}>Fecha</label>
              <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: scaleConfig.tableFontSize }}>{formatDate(invoice.invoice_date)}</span>
            </div>
            {invoice.description && (
              <div>
                <label style={{ fontSize: scaleConfig.sectionFontSize, color: '#666', display: 'block', marginBottom: '2px' }}>Descripción</label>
                <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: scaleConfig.tableFontSize }}>{invoice.description}</span>
              </div>
            )}
          </div>

          {/* Lines Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
            <thead>
              <tr>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'left', fontSize: scaleConfig.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>Cód.</th>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'left', fontSize: scaleConfig.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>Descripción</th>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'right', fontSize: scaleConfig.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>Uds.</th>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'right', fontSize: scaleConfig.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>€/Ud.</th>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'right', fontSize: scaleConfig.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', fontSize: scaleConfig.tableFontSize }}>{line.code}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', fontSize: scaleConfig.tableFontSize }}>{line.description || '-'}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'right', fontSize: scaleConfig.tableFontSize }}>{line.units}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'right', fontSize: scaleConfig.tableFontSize }}>{formatCurrency(line.unit_price)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'right', fontSize: scaleConfig.tableFontSize }}>{formatCurrency(line.subtotal)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#666', fontSize: scaleConfig.tableFontSize }}>
                    No hay líneas en este documento
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <div style={{ width: '240px', background: '#f8fafc', borderRadius: '6px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: scaleConfig.totalsFontSize }}>
                <span>Subtotal:</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.vat_rate === -1 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#666', fontSize: scaleConfig.totalsFontSize }}>
                  <span>IVA no incluido</span>
                  <span>-</span>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: scaleConfig.totalsFontSize }}>
                  <span>IVA ({invoice.vat_rate}%):</span>
                  <span>{formatCurrency(invoice.vat_amount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #e5e5e5', marginTop: '4px', paddingTop: '8px', fontSize: scaleConfig.finalTotalFontSize, fontWeight: '700', color: DOCUMENT_TYPE_COLORS[invoice.document_type || 'factura'] }}>
                <span>Total:</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* Observations */}
          {invoice.observations && (
            <div style={{ marginBottom: '16px', padding: '8px 10px', background: '#f8fafc', borderRadius: '6px', borderLeft: `3px solid ${DOCUMENT_TYPE_COLORS[invoice.document_type || 'factura']}` }}>
              <div style={{ fontSize: scaleConfig.sectionFontSize, textTransform: 'uppercase', color: '#666', marginBottom: '4px', letterSpacing: '0.5px' }}>Observaciones</div>
              <div style={{ color: '#1a1a1a', whiteSpace: 'pre-wrap', fontSize: scaleConfig.tableFontSize }}>{invoice.observations}</div>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', paddingTop: '10px', borderTop: '1px solid #e5e5e5', fontSize: scaleConfig.sectionFontSize, color: '#666', marginTop: '16px' }}>
            {(() => {
              const src = invoice.footer_contact_source || 'company';
              if (src === 'issuer' && issuerContactData) {
                return <>
                  <p>{[issuerContactData.email, issuerContactData.phone ? `Tel: ${issuerContactData.phone}` : null].filter(Boolean).join(' | ')}</p>
                  {issuerContactData.address && <p>{[issuerContactData.address, issuerContactData.city, issuerContactData.province].filter(Boolean).join(', ')}</p>}
                </>;
              }
              if (src === 'receiver' && receiverContactData) {
                return <>
                  <p>{[receiverContactData.email, receiverContactData.phone ? `Tel: ${receiverContactData.phone}` : null].filter(Boolean).join(' | ')}</p>
                  {receiverContactData.address && <p>{[receiverContactData.address, receiverContactData.city, receiverContactData.province].filter(Boolean).join(', ')}</p>}
                </>;
              }
              return <>
                <p>{companySettings.email} | {companySettings.phone}</p>
                <p>{companySettings.website}</p>
              </>;
            })()}
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
