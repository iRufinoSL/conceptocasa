import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, ZoomIn, ZoomOut, Minus, Eraser, FileDown, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/lib/format-utils';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { generateAndSaveAdminPdf } from '@/lib/generate-admin-pdf';
import { toast } from 'sonner';

type PrintScale = 'compact' | 'normal' | 'large';

const SCALE_CONFIGS: Record<PrintScale, {
  bodyFontSize: string; titleFontSize: string; sectionFontSize: string; tableFontSize: string;
  tableHeaderFontSize: string; partyNameFontSize: string; partyDetailsFontSize: string;
  totalsFontSize: string; finalTotalFontSize: string; padding: string; printPadding: string;
  logoMaxWidth: string; iconSize: string;
}> = {
  compact: { bodyFontSize: '10px', titleFontSize: '18px', sectionFontSize: '9px', tableFontSize: '9px', tableHeaderFontSize: '8px', partyNameFontSize: '11px', partyDetailsFontSize: '9px', totalsFontSize: '9px', finalTotalFontSize: '12px', padding: '16px', printPadding: '12px', logoMaxWidth: '120px', iconSize: '32px' },
  normal: { bodyFontSize: '12px', titleFontSize: '22px', sectionFontSize: '10px', tableFontSize: '11px', tableHeaderFontSize: '9px', partyNameFontSize: '13px', partyDetailsFontSize: '11px', totalsFontSize: '11px', finalTotalFontSize: '14px', padding: '24px', printPadding: '20px', logoMaxWidth: '160px', iconSize: '40px' },
  large: { bodyFontSize: '14px', titleFontSize: '26px', sectionFontSize: '11px', tableFontSize: '12px', tableHeaderFontSize: '10px', partyNameFontSize: '15px', partyDetailsFontSize: '12px', totalsFontSize: '12px', finalTotalFontSize: '16px', padding: '32px', printPadding: '24px', logoMaxWidth: '180px', iconSize: '44px' },
};

interface CrmContact {
  id: string; name: string; surname: string | null; contact_type: string;
  email: string | null; phone: string | null; address: string | null; city: string | null;
  postal_code: string | null; province: string | null; nif_dni: string | null;
}

interface Presupuesto {
  id: string; nombre: string; codigo_correlativo: number; version: string;
}

interface PurchaseOrder {
  id: string; order_number: number; order_date: string; order_id: string;
  description: string | null; observations: string | null;
  subtotal: number; vat_rate: number; vat_amount: number; total: number;
  footer_contact_source?: string;
  supplier_contact?: CrmContact | null;
  client_contact?: CrmContact | null;
  presupuesto?: Presupuesto | null;
}

interface OrderLine {
  id: string; code: number; description: string | null;
  units: number; unit_price: number; subtotal: number;
}

interface Props { order: PurchaseOrder; onClose: () => void; }

const DOC_COLOR = '#f97316'; // Orange

const getContactDisplayName = (contact: CrmContact | null | undefined): string => {
  if (!contact) return 'No definido';
  return [contact.name, contact.surname].filter(Boolean).join(' ') || 'Sin nombre';
};

const renderContactBlock = (contact: CrmContact | null | undefined, scaleConfig: typeof SCALE_CONFIGS['normal']) => {
  if (!contact) return null;
  const addressParts: string[] = [];
  if (contact.address) addressParts.push(contact.address);
  const cityLine = [contact.postal_code, contact.city].filter(Boolean).join(' - ');
  if (cityLine) addressParts.push(cityLine);
  if (contact.province) addressParts.push(contact.province);
  
  return (
    <>
      {addressParts.length > 0 && (
        <div style={{ fontSize: scaleConfig.partyDetailsFontSize, color: '#444', lineHeight: '1.4' }}>
          {addressParts.map((part, i) => <span key={i}>{part}{i < addressParts.length - 1 && <br />}</span>)}
        </div>
      )}
      {contact.nif_dni && (
        <div style={{ fontSize: scaleConfig.partyDetailsFontSize, color: '#1a1a1a', marginTop: '4px', fontWeight: '500' }}>
          NIF/CIF: {contact.nif_dni}
        </div>
      )}
      {contact.email && (
        <div style={{ fontSize: scaleConfig.partyDetailsFontSize, color: '#666', marginTop: '2px' }}>
          {contact.email}
        </div>
      )}
      {contact.phone && (
        <div style={{ fontSize: scaleConfig.partyDetailsFontSize, color: '#666' }}>
          Tel: {contact.phone}
        </div>
      )}
    </>
  );
};

export function PurchaseOrderPrintView({ order, onClose }: Props) {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [printScale, setPrintScale] = useState<PrintScale>('normal');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const { settings: companySettings } = useCompanySettings();
  const sc = SCALE_CONFIGS[printScale];

  // Signature pad logic
  const getCanvasPoint = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    const point = getCanvasPoint(e);
    if (point) {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    }
  }, [getCanvasPoint]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const point = getCanvasPoint(e);
    if (point) {
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  }, [getCanvasPoint]);

  const stopDrawing = useCallback(() => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      const canvas = signatureCanvasRef.current;
      if (canvas) {
        setSignatureDataUrl(canvas.toDataURL('image/png'));
      }
    }
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl(null);
  }, []);

  useEffect(() => {
    supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', order.id).order('code')
      .then(({ data, error }) => {
        if (!error) setLines(data || []);
        setLoading(false);
      });
  }, [order.id]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const pw = window.open('', '_blank');
    if (!pw) return;
    pw.document.write(`<!DOCTYPE html><html><head><title>Orden de Pedido ${order.order_id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: ${sc.padding}; color: #1a1a1a; line-height: 1.4; font-size: ${sc.bodyFontSize}; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #f1f5f9; padding: 8px; text-align: left; font-size: ${sc.tableHeaderFontSize}; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
        td { padding: 8px; border-bottom: 1px solid #e5e5e5; font-size: ${sc.tableFontSize}; }
        .text-right { text-align: right; }
        @media print { body { padding: ${sc.printPadding}; } }
      </style></head><body>${content.innerHTML}</body></html>`);
    pw.document.close();
    pw.print();
  };

  const formatDate = (dateStr: string) => format(new Date(dateStr), "d 'de' MMMM 'de' yyyy", { locale: es });
  const logoUrl = companySettings.logo_signed_url || companySettings.logo_url;

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
          <div className="flex items-center justify-between">
            <DialogTitle>Vista Previa - Orden de Pedido</DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Escala:</span>
              <ToggleGroup type="single" value={printScale} onValueChange={(v) => v && setPrintScale(v as PrintScale)} className="border rounded-md">
                <ToggleGroupItem value="compact" size="sm" className="gap-1 text-xs px-2"><ZoomOut className="h-3 w-3" />Compacto</ToggleGroupItem>
                <ToggleGroupItem value="normal" size="sm" className="gap-1 text-xs px-2"><Minus className="h-3 w-3" />Normal</ToggleGroupItem>
                <ToggleGroupItem value="large" size="sm" className="gap-1 text-xs px-2"><ZoomIn className="h-3 w-3" />Ampliado</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </DialogHeader>

        <div ref={printRef} className="bg-white p-4 rounded-lg" style={{ fontSize: sc.bodyFontSize }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', paddingBottom: '10px', borderBottom: `2px solid ${DOC_COLOR}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {logoUrl ? (
                <img src={logoUrl} alt={companySettings.name} style={{ maxWidth: sc.logoMaxWidth, maxHeight: '55px', objectFit: 'contain' }} />
              ) : (
                <>
                  <div style={{ width: sc.iconSize, height: sc.iconSize, background: `linear-gradient(135deg, ${DOC_COLOR} 0%, #ea580c 100%)`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: sc.partyNameFontSize, fontWeight: '700', color: '#1a1a1a' }}>{companySettings.name}</div>
                </>
              )}
            </div>

            {order.presupuesto && (
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: sc.sectionFontSize, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px', marginBottom: '2px' }}>Presupuesto</div>
                <div style={{ fontSize: sc.tableFontSize, fontWeight: '600', color: '#1a1a1a' }}>
                  {String(order.presupuesto.codigo_correlativo).padStart(4, '0')} - {order.presupuesto.nombre}
                </div>
                <div style={{ fontSize: sc.sectionFontSize, color: '#666' }}>Versión {order.presupuesto.version}</div>
              </div>
            )}

            <div style={{ textAlign: 'right' }}>
              <h1 style={{ fontSize: sc.titleFontSize, color: DOC_COLOR, marginBottom: '2px' }}>ORDEN DE PEDIDO</h1>
              <div style={{ fontSize: sc.tableFontSize, color: '#666' }}>{order.order_id}</div>
            </div>
          </div>

          {/* Parties */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '16px' }}>
            <div style={{ flex: 1, padding: '10px', background: '#f8fafc', borderRadius: '6px', borderLeft: `3px solid ${DOC_COLOR}` }}>
              <div style={{ fontSize: sc.sectionFontSize, textTransform: 'uppercase', color: DOC_COLOR, marginBottom: '6px', letterSpacing: '0.5px', fontWeight: '600' }}>Proveedor / Suministrador</div>
              <div style={{ fontSize: sc.partyNameFontSize, fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                {getContactDisplayName(order.supplier_contact)}
              </div>
              {renderContactBlock(order.supplier_contact, sc)}
            </div>
            <div style={{ flex: 1, padding: '10px', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: sc.sectionFontSize, textTransform: 'uppercase', color: '#10b981', marginBottom: '6px', letterSpacing: '0.5px', fontWeight: '600' }}>Cliente</div>
              <div style={{ fontSize: sc.partyNameFontSize, fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                {getContactDisplayName(order.client_contact)}
              </div>
              {renderContactBlock(order.client_contact, sc)}
            </div>
          </div>

          {/* Order Info */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', padding: '8px 10px', background: '#f8fafc', borderRadius: '6px' }}>
            <div>
              <label style={{ fontSize: sc.sectionFontSize, color: '#666', display: 'block', marginBottom: '2px' }}>Fecha</label>
              <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: sc.tableFontSize }}>{formatDate(order.order_date)}</span>
            </div>
            {order.description && (
              <div>
                <label style={{ fontSize: sc.sectionFontSize, color: '#666', display: 'block', marginBottom: '2px' }}>Descripción</label>
                <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: sc.tableFontSize }}>{order.description}</span>
              </div>
            )}
          </div>

          {/* Lines Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
            <thead>
              <tr>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'left', fontSize: sc.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569' }}>Cód.</th>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'left', fontSize: sc.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569' }}>Descripción</th>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'right', fontSize: sc.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569' }}>Uds.</th>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'right', fontSize: sc.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569' }}>€/Ud.</th>
                <th style={{ background: '#f1f5f9', padding: '8px', textAlign: 'right', fontSize: sc.tableHeaderFontSize, textTransform: 'uppercase', color: '#475569' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', fontSize: sc.tableFontSize }}>{line.code}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', fontSize: sc.tableFontSize }}>{line.description || '-'}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'right', fontSize: sc.tableFontSize }}>{line.units}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'right', fontSize: sc.tableFontSize }}>{formatCurrency(line.unit_price)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e5e5e5', textAlign: 'right', fontSize: sc.tableFontSize }}>{formatCurrency(line.subtotal)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#666', fontSize: sc.tableFontSize }}>No hay líneas</td></tr>
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <div style={{ width: '240px', background: '#f8fafc', borderRadius: '6px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: sc.totalsFontSize }}>
                <span>Subtotal:</span><span>{formatCurrency(order.subtotal)}</span>
              </div>
              {order.vat_rate === -1 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#666', fontSize: sc.totalsFontSize }}>
                  <span>IVA no incluido</span><span>-</span>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: sc.totalsFontSize }}>
                  <span>IVA ({order.vat_rate}%):</span><span>{formatCurrency(order.vat_amount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #e5e5e5', marginTop: '4px', paddingTop: '8px', fontSize: sc.finalTotalFontSize, fontWeight: '700', color: DOC_COLOR }}>
                <span>Total:</span><span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Observations */}
          {order.observations && (
            <div style={{ marginBottom: '16px', padding: '8px 10px', background: '#f8fafc', borderRadius: '6px', borderLeft: `3px solid ${DOC_COLOR}` }}>
              <div style={{ fontSize: sc.sectionFontSize, textTransform: 'uppercase', color: '#666', marginBottom: '4px', letterSpacing: '0.5px' }}>Observaciones</div>
              <div style={{ color: '#1a1a1a', whiteSpace: 'pre-wrap', fontSize: sc.tableFontSize }}>{order.observations}</div>
            </div>
          )}

          {/* Signature Block */}
          <div style={{ marginBottom: '16px', padding: '10px', background: '#f8fafc', borderRadius: '6px' }}>
            <div style={{ fontSize: sc.sectionFontSize, textTransform: 'uppercase', color: '#666', marginBottom: '6px', letterSpacing: '0.5px' }}>
              Firmado por: <span style={{ fontWeight: '600', color: '#1a1a1a' }}>{getContactDisplayName(order.client_contact)}</span>
            </div>
            {/* In print mode, show the captured signature image; in interactive mode, show the canvas */}
            {signatureDataUrl ? (
              <img src={signatureDataUrl} alt="Firma" style={{ width: '300px', height: '100px', objectFit: 'contain', border: '1px solid #e5e5e5', borderRadius: '4px', background: 'white' }} />
            ) : (
              <div style={{ width: '300px', height: '100px', border: '1px dashed #ccc', borderRadius: '4px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: sc.sectionFontSize }}>
                Firma
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', paddingTop: '10px', borderTop: '1px solid #e5e5e5', fontSize: sc.sectionFontSize, color: '#666', marginTop: '16px' }}>
            {(() => {
              const src = order.footer_contact_source || 'company';
              if (src === 'supplier' && order.supplier_contact) {
                const c = order.supplier_contact;
                return <>
                  <p>{[c.email, c.phone ? `Tel: ${c.phone}` : null].filter(Boolean).join(' | ')}</p>
                  {c.address && <p>{[c.address, c.city, c.province].filter(Boolean).join(', ')}</p>}
                </>;
              }
              if (src === 'client' && order.client_contact) {
                const c = order.client_contact;
                return <>
                  <p>{[c.email, c.phone ? `Tel: ${c.phone}` : null].filter(Boolean).join(' | ')}</p>
                  {c.address && <p>{[c.address, c.city, c.province].filter(Boolean).join(', ')}</p>}
                </>;
              }
              return <>
                <p>{companySettings.email} | {companySettings.phone}</p>
                <p>{companySettings.website}</p>
              </>;
            })()}
          </div>
        </div>

        {/* Interactive Signature Pad (outside printRef) */}
        <div className="mt-4 p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Firma de: <span className="text-primary">{getContactDisplayName(order.client_contact)}</span>
            </span>
            {signatureDataUrl && (
              <Button variant="ghost" size="sm" onClick={clearSignature} className="gap-1 text-xs">
                <Eraser className="h-3 w-3" /> Borrar firma
              </Button>
            )}
          </div>
          <canvas
            ref={signatureCanvasRef}
            width={600}
            height={200}
            className="border border-border rounded-md bg-white cursor-crosshair touch-none w-full"
            style={{ maxWidth: '100%', height: '120px' }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          <p className="text-xs text-muted-foreground mt-1">Dibuje su firma con el ratón o el dedo (tabletas). Se incluirá en la impresión.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={handlePrint} className="gap-2"><Printer className="h-4 w-4" />Imprimir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
