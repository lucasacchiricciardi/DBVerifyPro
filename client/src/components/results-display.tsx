import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, X, Eye, RefreshCw, Download, FileText, Printer, BarChart3, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SchemaDetailsModal from "./schema-details-modal";
import VerificationCharts from "./verification-charts";
import PDFReportGenerator from "./pdf-report-generator";
import type { VerificationResult, TableComparison } from "@/lib/types";

interface ResultsDisplayProps {
  result: VerificationResult;
  onReset: () => void;
}

export default function ResultsDisplay({ result, onReset }: ResultsDisplayProps) {
  const { t } = useTranslation();
  const [selectedTable, setSelectedTable] = useState<TableComparison | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const { summary, comparison } = result;
  const isSuccess = summary.status === "SUCCESS";

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const generatePDFReport = () => {
    // Create a properly formatted HTML page for PDF printing
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>DB-Verify Migration Verification Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 210mm;
            margin: 0 auto;
            padding: 20mm;
            line-height: 1.6;
            color: #333;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0;
            color: #1f2937;
            font-size: 28px;
        }
        .header p {
            margin: 5px 0;
            color: #666;
        }
        .summary {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
        }
        .summary h2 {
            margin-top: 0;
            color: #1f2937;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .stat-box {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 14px;
            color: #666;
        }
        .status-success { color: #059669; }
        .status-error { color: #dc2626; }
        .table-section {
            margin-bottom: 40px;
            break-inside: avoid;
        }
        .table-header {
            background: #1f2937;
            color: white;
            padding: 15px;
            border-radius: 6px 6px 0 0;
            margin: 0;
        }
        .table-content {
            border: 1px solid #e5e7eb;
            border-top: none;
            border-radius: 0 0 6px 6px;
            padding: 20px;
        }
        .table-meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .meta-item {
            display: flex;
            justify-content: space-between;
            padding: 8px;
            background: #f9fafb;
            border-radius: 4px;
        }
        .schema-section {
            margin-top: 20px;
        }
        .schema-title {
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid #e5e7eb;
        }
        .schema-list {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            margin: 10px 0;
            padding-left: 20px;
        }
        .page-break {
            page-break-before: always;
        }
        @media print {
            body { margin: 0; padding: 15mm; }
            .header { page-break-after: avoid; }
            .table-section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>DB-Verify Migration Verification Report</h1>
        <p>Generated: ${formatDate(new Date().toISOString())}</p>
        <p>Status: <span class="${isSuccess ? 'status-success' : 'status-error'}">${summary.status}</span></p>
    </div>

    <div class="summary">
        <h2>Executive Summary</h2>
        <p><strong>Result:</strong> ${summary.message}</p>
        <p><strong>Completed:</strong> ${formatDate(summary.completedAt)}</p>
        
        <div class="stats-grid">
            <div class="stat-box">
                <div class="stat-value">${summary.totalTables}</div>
                <div class="stat-label">Total Tables</div>
            </div>
            <div class="stat-box">
                <div class="stat-value status-success">${summary.matchedTables}</div>
                <div class="stat-label">Matched Tables</div>
            </div>
            <div class="stat-box">
                <div class="stat-value status-error">${summary.mismatchedTables}</div>
                <div class="stat-label">Mismatched Tables</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${formatNumber(summary.totalRows)}</div>
                <div class="stat-label">Total Rows</div>
            </div>
        </div>
    </div>

    ${comparison.map((table, index) => `
    <div class="table-section ${index > 0 && index % 3 === 0 ? 'page-break' : ''}">
        <h3 class="table-header">${index + 1}. ${table.tableName.toUpperCase()}</h3>
        <div class="table-content">
            <div class="table-meta">
                <div class="meta-item">
                    <span>Status:</span>
                    <strong class="${table.status === 'MATCH' ? 'status-success' : 'status-error'}">${table.status}</strong>
                </div>
                <div class="meta-item">
                    <span>Source Rows:</span>
                    <strong>${formatNumber(table.sourceRows)}</strong>
                </div>
                <div class="meta-item">
                    <span>Target Rows:</span>
                    <strong>${formatNumber(table.targetRows)}</strong>
                </div>
                <div class="meta-item">
                    <span>Schema Match:</span>
                    <strong class="${table.schemaMatch ? 'status-success' : 'status-error'}">${table.schemaMatch ? t('common.yes', 'YES') : t('common.no', 'NO')}</strong>
                </div>
                <div class="meta-item">
                    <span>Data Mapping:</span>
                    <strong class="${table.dataMappingValid ? 'status-success' : 'status-error'}">${table.dataMappingValid ? t('common.valid', 'VALID') : t('common.invalid', 'INVALID')}</strong>
                </div>
            </div>
            
            ${table.dataMappingDetails ? `<p><strong>Details:</strong> ${table.dataMappingDetails}</p>` : ''}
            
            <div class="schema-section">
                <div class="schema-title">Source Schema (${table.sourceColumns?.length || 0} columns)</div>
                <div class="schema-list">
                    ${table.sourceColumns?.map(col => 
                        `• ${col.name}: ${col.type} ${col.nullable ? '(nullable)' : '(not null)'}`
                    ).join('<br>') || 'No schema data available'}
                </div>
            </div>
            
            <div class="schema-section">
                <div class="schema-title">Target Schema (${table.targetColumns?.length || 0} columns)</div>
                <div class="schema-list">
                    ${table.targetColumns?.map(col => 
                        `• ${col.name}: ${col.type} ${col.nullable ? '(nullable)' : '(not null)'}`
                    ).join('<br>') || 'No schema data available'}
                </div>
            </div>
        </div>
    </div>
    `).join('')}

</body>
</html>
    `.trim();

    // Open a new window with the formatted content
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // Wait for the content to load, then trigger print
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        // Close the window after printing (user can cancel this)
        printWindow.onafterprint = () => {
          printWindow.close();
        };
      };
    } else {
      // Fallback if popup blocked
      alert('Please allow popups to generate the PDF report. Alternatively, use the "Export Report" button to download JSON data.');
    }
  };

  const exportJSONReport = () => {
    // Export the full verification result as JSON
    const reportData = {
      generatedAt: new Date().toISOString(),
      ...result
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `db-verify-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderOverviewContent = () => (
    <>
      {/* Summary Card */}
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className={`rounded-full p-2 ${isSuccess ? 'bg-emerald-100' : 'bg-red-100'}`}>
                {isSuccess ? (
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                ) : (
                  <X className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {isSuccess 
                    ? t('results.migrationVerificationCompleted', "Migration Verification Completed Successfully")
                    : t('verification.errorTitle', "Migration Verification Failed")
                  }
                </h3>
                <p className="text-gray-600 mt-1">
                  {isSuccess 
                    ? t('results.successMessage', "All tables and schemas are properly synchronized between source and target databases.")
                    : t('results.errorMessage', "Please review the discrepancies below and address any issues.")
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant={isSuccess ? "default" : "destructive"} className="flex items-center space-x-1">
                {isSuccess ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <X className="w-3 h-3" />
                )}
                <span>{t(`results.status.${summary.status}`, summary.status)}</span>
              </Badge>
              <span className="text-sm text-gray-500">
{t('results.completedAt', 'Completed at')} {formatDate(summary.completedAt)}
              </span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{summary.totalTables}</div>
              <div className="text-sm text-gray-600">{t('results.totalTables', 'Total Tables')}</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-emerald-600">{summary.matchedTables}</div>
              <div className="text-sm text-gray-600">{t('results.matchedTables', 'Matched Tables')}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{summary.mismatchedTables}</div>
              <div className="text-sm text-gray-600">{t('results.mismatchedTables', 'Mismatched Tables')}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{formatNumber(summary.totalRows)}</div>
              <div className="text-sm text-gray-600">{t('results.totalRows', 'Total Rows')}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );

  const renderDetailsContent = () => (
    <Card className="border border-gray-200 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold">Table Name</TableHead>
                <TableHead className="text-center font-semibold">Source Rows</TableHead>
                <TableHead className="text-center font-semibold">Target Rows</TableHead>
                <TableHead className="text-center font-semibold">Schema Match</TableHead>
                <TableHead className="text-center font-semibold">Data Valid</TableHead>
                <TableHead className="text-center font-semibold">Status</TableHead>
                <TableHead className="text-center font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.map((table) => (
                <TableRow key={table.tableName} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{table.tableName}</TableCell>
                  <TableCell className="text-center">{formatNumber(table.sourceRows)}</TableCell>
                  <TableCell className="text-center">{formatNumber(table.targetRows)}</TableCell>
                  <TableCell className="text-center">
                    {table.schemaMatch ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-red-500 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {table.dataMappingValid ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-red-500 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={table.status === "MATCH" ? "default" : "destructive"}>
                      {t(`results.status.${table.status}`, table.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setSelectedTable(table)}
                      className="h-8 w-8 p-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isSuccess ? (
            <CheckCircle className="h-8 w-8 text-green-500" />
          ) : (
            <X className="h-8 w-8 text-red-500" />
          )}
          <div>
            <h2 className="text-2xl font-bold">{t('verification.completed')}</h2>
            <p className="text-gray-600">{summary.message}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReset}>
            <RefreshCw className="h-4 w-4 mr-2" />
{t('common.newVerification', 'New Verification')}
          </Button>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            {t('results.overview', 'Overview')}
          </TabsTrigger>
          <TabsTrigger value="charts" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('results.analytics', 'Analytics')}
          </TabsTrigger>
          <TabsTrigger value="details" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            {t('results.details', 'Details')}
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('common.export')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">{renderOverviewContent()}</TabsContent>
        <TabsContent value="charts" className="space-y-6"><VerificationCharts result={result} /></TabsContent>
        <TabsContent value="details" className="space-y-6">{renderDetailsContent()}</TabsContent>
        <TabsContent value="export" className="space-y-6"><PDFReportGenerator result={result} /></TabsContent>
      </Tabs>

      {/* Schema Details Modal */}
      {selectedTable && (
        <SchemaDetailsModal 
          table={selectedTable} 
          onClose={() => setSelectedTable(null)} 
        />
      )}
    </div>
  );
}
