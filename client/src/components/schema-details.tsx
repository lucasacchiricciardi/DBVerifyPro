import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, ArrowRight, CheckCircle, XCircle } from "lucide-react";
import type { TableComparison, Column } from "@shared/schema";

interface SchemaDetailsProps {
  table: TableComparison;
  onClose: () => void;
}

export function SchemaDetails({ table, onClose }: SchemaDetailsProps) {
  const renderColumns = (columns: Column[], title: string, icon: React.ReactNode) => (
    <div>
      <h5 className="font-medium text-gray-900 mb-3 flex items-center">
        {icon}
        {title}
      </h5>
      <div className="space-y-2">
        <div className="bg-gray-50 rounded p-3 text-sm">
          <div className="grid grid-cols-3 gap-2 font-medium text-gray-600 mb-2">
            <span>Column</span>
            <span>Type</span>
            <span>Nullable</span>
          </div>
          <div className="space-y-1">
            {columns.map((col, index) => (
              <div key={index} className="grid grid-cols-3 gap-2">
                <span className="font-mono">{col.name}</span>
                <span className="text-blue-600">{col.type}</span>
                <span className={col.nullable ? "text-emerald-600" : "text-red-600"}>
                  {col.nullable ? "YES" : "NO"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-gray-900">
            Schema Details: <span className="text-primary">{table.tableName}</span>
          </h4>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Source Schema */}
          {renderColumns(
            table.sourceColumns || [],
            "Source Schema",
            <ArrowRight className="w-4 h-4 mr-2 text-blue-600" />
          )}

          {/* Target Schema */}
          {renderColumns(
            table.targetColumns || [],
            "Target Schema",
            <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" />
          )}
        </div>

        {/* Schema Comparison Status */}
        <div className={`mt-4 p-4 border rounded-lg ${table.schemaMatch ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
          <div className="flex items-center">
            {table.schemaMatch ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 mr-2" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600 mr-2" />
            )}
            <span className={`font-medium ${table.schemaMatch ? "text-emerald-800" : "text-red-800"}`}>
              {table.schemaMatch ? "Schema structures are compatible" : "Schema structures differ"}
            </span>
          </div>
          <p className={`text-sm mt-1 ${table.schemaMatch ? "text-emerald-700" : "text-red-700"}`}>
            {table.schemaMatch 
              ? "All columns match with compatible data types and nullable settings"
              : "Column differences detected. Please review the schema comparison above."
            }
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
