import { useState } from 'react';
import jsPDF from 'jspdf';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Loader2 } from 'lucide-react';
import type { VerificationResult } from '@shared/schema';

interface PDFReportGeneratorProps {
  result: VerificationResult;
}

export default function PDFReportGenerator({ result }: PDFReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { t } = useTranslation();

  const formatDate = (dateString?: string) => {
    return dateString ? new Date(dateString).toLocaleString() : new Date().toLocaleString();
  };

  const generatePDFReport = async () => {
    setIsGenerating(true);
    
    try {
      // Create PDF using jsPDF directly for better layout control
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);
      let currentY = margin;

      // Helper function to add text with word wrapping
      const addText = (text: string, x: number, y: number, options: any = {}) => {
        const fontSize = options.fontSize || 12;
        const fontStyle = options.fontStyle || 'normal';
        const maxWidth = options.maxWidth || contentWidth;
        
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', fontStyle);
        
        if (options.color) {
          pdf.setTextColor(options.color);
        } else {
          pdf.setTextColor('#000000');
        }
        
        const lines = pdf.splitTextToSize(text, maxWidth);
        pdf.text(lines, x, y);
        return y + (lines.length * fontSize * 0.35); // Return new Y position
      };

      // Helper function to check if we need a new page
      const checkPageBreak = (requiredHeight: number) => {
        if (currentY + requiredHeight > pageHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }
      };

      // Header
      pdf.setFillColor('#f3f4f6');
      pdf.rect(margin, currentY, contentWidth, 25, 'F');
      
      currentY = addText(t('pdf.title'), margin + 5, currentY + 10, {
        fontSize: 20,
        fontStyle: 'bold'
      });
      
      currentY = addText(t('pdf.generatedOn', { date: formatDate() }), margin + 5, currentY + 2, {
        fontSize: 10,
        color: '#666666'
      });
      
      currentY = addText(t('pdf.subtitle'), margin + 5, currentY + 2, {
        fontSize: 10,
        color: '#666666'
      });
      
      currentY += 15;

      // Verification Summary Section
      checkPageBreak(60);
      
      currentY = addText(t('pdf.verificationSummary'), margin, currentY, {
        fontSize: 16,
        fontStyle: 'bold'
      });
      currentY += 10;

      // Summary boxes with table layout
      const boxHeight = 12;
      const boxWidth = contentWidth / 2 - 5;
      
      // First row
      pdf.setFillColor('#f9fafb');
      pdf.rect(margin, currentY, boxWidth, boxHeight, 'F');
      pdf.setDrawColor('#e5e7eb');
      pdf.rect(margin, currentY, boxWidth, boxHeight, 'S');
      
      pdf.rect(margin + boxWidth + 10, currentY, boxWidth, boxHeight, 'F');
      pdf.rect(margin + boxWidth + 10, currentY, boxWidth, boxHeight, 'S');
      
      addText('Overall Status:', margin + 2, currentY + 4, { fontSize: 10, fontStyle: 'bold' });
      addText(result.summary.status, margin + 2, currentY + 8, { 
        fontSize: 12, 
        color: result.summary.status === 'SUCCESS' ? '#10b981' : '#ef4444',
        fontStyle: 'bold'
      });
      
      addText('Total Tables:', margin + boxWidth + 12, currentY + 4, { fontSize: 10, fontStyle: 'bold' });
      addText(result.summary.totalTables.toString(), margin + boxWidth + 12, currentY + 8, { fontSize: 12 });
      
      currentY += boxHeight + 5;
      
      // Second row
      pdf.setFillColor('#f9fafb');
      pdf.rect(margin, currentY, boxWidth, boxHeight, 'F');
      pdf.rect(margin, currentY, boxWidth, boxHeight, 'S');
      
      pdf.rect(margin + boxWidth + 10, currentY, boxWidth, boxHeight, 'F');
      pdf.rect(margin + boxWidth + 10, currentY, boxWidth, boxHeight, 'S');
      
      addText('Matched Tables:', margin + 2, currentY + 4, { fontSize: 10, fontStyle: 'bold' });
      addText(result.summary.matchedTables.toString(), margin + 2, currentY + 8, { fontSize: 12, color: '#10b981' });
      
      addText('Mismatched Tables:', margin + boxWidth + 12, currentY + 4, { fontSize: 10, fontStyle: 'bold' });
      addText(result.summary.mismatchedTables.toString(), margin + boxWidth + 12, currentY + 8, { fontSize: 12, color: '#ef4444' });
      
      currentY += boxHeight + 5;

      // Total rows
      pdf.setFillColor('#f9fafb');
      pdf.rect(margin, currentY, contentWidth, boxHeight, 'F');
      pdf.rect(margin, currentY, contentWidth, boxHeight, 'S');
      
      addText('Total Rows Processed:', margin + 2, currentY + 4, { fontSize: 10, fontStyle: 'bold' });
      addText(result.summary.totalRows.toLocaleString(), margin + 2, currentY + 8, { fontSize: 12 });
      
      currentY += boxHeight + 20;

      // Table Verification Details
      checkPageBreak(50);
      
      currentY = addText('Table Verification Details', margin, currentY, {
        fontSize: 16,
        fontStyle: 'bold'
      });
      currentY += 10;

      // Table headers
      const colWidths = [40, 25, 25, 25, 25, 30]; // Column widths in mm
      const rowHeight = 8;
      let startX = margin;

      // Header row
      pdf.setFillColor('#f9fafb');
      pdf.rect(startX, currentY, contentWidth, rowHeight, 'F');
      
      const headers = ['Table Name', 'Source Rows', 'Target Rows', 'Schema Match', 'Data Valid', 'Status'];
      let currentX = startX;
      
      headers.forEach((header, index) => {
        pdf.setDrawColor('#e5e7eb');
        pdf.rect(currentX, currentY, colWidths[index], rowHeight, 'S');
        addText(header, currentX + 1, currentY + 5, { fontSize: 9, fontStyle: 'bold' });
        currentX += colWidths[index];
      });
      
      currentY += rowHeight;

      // Table data rows
      result.comparison.forEach((table) => {
        checkPageBreak(rowHeight + 5);
        
        currentX = startX;
        
        // Row background
        pdf.setFillColor('#ffffff');
        pdf.rect(startX, currentY, contentWidth, rowHeight, 'F');
        
        const rowData = [
          table.tableName,
          table.sourceRows.toLocaleString(),
          table.targetRows.toLocaleString(),
          table.schemaMatch ? '✓' : '✗',
          table.dataMappingValid ? '✓' : '✗',
          table.status
        ];
        
        rowData.forEach((data, index) => {
          pdf.setDrawColor('#e5e7eb');
          pdf.rect(currentX, currentY, colWidths[index], rowHeight, 'S');
          
          let textColor = '#000000';
          if (index === 3) textColor = table.schemaMatch ? '#10b981' : '#ef4444';
          if (index === 4) textColor = table.dataMappingValid ? '#10b981' : '#ef4444';
          if (index === 5) textColor = table.status === 'MATCH' ? '#10b981' : '#ef4444';
          
          addText(data, currentX + 1, currentY + 5, { 
            fontSize: 8, 
            color: textColor,
            maxWidth: colWidths[index] - 2
          });
          currentX += colWidths[index];
        });
        
        currentY += rowHeight;
      });

      // Footer
      currentY = pageHeight - margin - 10;
      pdf.setDrawColor('#e5e7eb');
      pdf.line(margin, currentY - 5, pageWidth - margin, currentY - 5);
      
      addText(t('pdf.footer'), margin, currentY, {
        fontSize: 8,
        color: '#666666'
      });

      // Save the PDF with timestamp
      const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '') + '_' + Date.now();
      const fileName = `db-verify-report-${timestamp}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      console.error('Error generating PDF report:', error);
      alert(t('pdf.errorMessage'));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('pdf.reportGeneration')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h4 className="font-medium">{t('pdf.verificationReport')}</h4>
            <p className="text-sm text-gray-600">
              {t('pdf.reportDescription')}
            </p>
          </div>
          <Badge variant={result.summary.status === 'SUCCESS' ? 'default' : 'destructive'}>
            {result.summary.status}
          </Badge>
        </div>
        
        <div className="space-y-2">
          <h5 className="font-medium text-sm">{t('pdf.reportContents')}:</h5>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• {t('pdf.executiveSummary')}</li>
            <li>• {t('pdf.tableByTable')}</li>
            <li>• {t('pdf.schemaCompatibility')}</li>
            <li>• {t('pdf.dataMappingDetails')}</li>
            <li>• {t('pdf.professionalFormatting')}</li>
          </ul>
        </div>

        <Button 
          onClick={generatePDFReport}
          disabled={isGenerating}
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('pdf.generating')}
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              {t('pdf.downloadReport')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}