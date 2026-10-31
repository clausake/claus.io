// T3.2 : extrait de src/components/Purchasing.tsx (extraction pure, byte-exact).
// generateOrderPdf ne lisait que `t` (7 clés) + jsPDF/autoTable : `t` est passé
// en paramètre, aucune dépendance au state du composant (vérifié : que des doc.set*).
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

  export const generateOrderPdf = (t: Record<string, string>, supplierName: string, supplierData: { supplier_id: string; supplier_name: string; email: string; phone: string }, items: { name?: string; quantity?: number; unit_price?: number; total?: number }[]) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(34, 197, 94);
    doc.text(`claus.io`, 14, 22);
    
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text(t.purchaseOrder || "Bon de Commande", 14, 32);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 40);
    doc.text(`Heure: ${new Date().toLocaleTimeString()}`, 14, 45);

    // Supplier Info
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`${t.attentionOf || "À l'attention de :"}`, 120, 32);
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(supplierName, 120, 38);
    if (supplierData?.email) doc.text(`${t.email || "Email"}: ${supplierData.email}`, 120, 43);
    if (supplierData?.phone) doc.text(`${t.phone || "Téléphone"}: ${supplierData.phone}`, 120, 48);

    doc.setDrawColor(220, 220, 220);
    doc.line(14, 55, 196, 55);

    let totalOrder = 0;
    const tableData = items.map((i: { name?: string; quantity?: number; unit_price?: number; total?: number }) => {
        totalOrder += (i.total || 0);
        return [
            i.name ?? '',
            i.quantity ?? 0,
            (i.unit_price || 0) > 0 ? `${(i.unit_price || 0).toFixed(2)}` : '-',
            (i.total || 0) > 0 ? `${(i.total || 0).toFixed(2)}` : '-'
        ];
    });

    autoTable(doc, {
        startY: 65,
        head: [[t.product || 'Produit', t.quantity || 'Quantité', t.unitPrice || 'Prix Unitaire', 'Total']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255] },
        styles: { fontSize: 10, cellPadding: 3 },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || 65;
    
    if (totalOrder > 0) {
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(`Total estimé : ${totalOrder.toFixed(2)}`, 14, finalY + 15);
    }
    
    return doc;
  };
