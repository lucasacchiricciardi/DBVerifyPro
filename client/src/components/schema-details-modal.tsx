import { X, ArrowRight, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { TableComparison } from "@/lib/types";

interface SchemaDetailsModalProps {
  table: TableComparison;
  onClose: () => void;
}

export default function SchemaDetailsModal({ table, onClose }: SchemaDetailsModalProps) {
  const { t } = useTranslation();
  const { tableName, sourceColumns = [], targetColumns = [], schemaMatch } = table;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="max-w-6xl w-full max-h-[90vh] overflow-auto">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-gray-900">
              Schema Details: <span className="text-primary">{tableName}</span>
            </h4>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-6 h-6" />
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Source Schema */}
            <div>
              <h5 className="font-medium text-gray-900 mb-3 flex items-center">
                <ArrowRight className="w-4 h-4 mr-2 text-blue-600" />
                Source Schema
              </h5>
              <div className="space-y-2">
                <div className="bg-gray-50 rounded p-3 text-sm">
                  <div className="grid grid-cols-3 gap-2 font-medium text-gray-600 mb-2">
                    <span>Column</span>
                    <span>Type</span>
                    <span>Nullable</span>
                  </div>
                  <div className="space-y-1">
                    {sourceColumns.map((column, index) => (
                      <div key={index} className="grid grid-cols-3 gap-2">
                        <span className="font-mono text-xs">{column.name}</span>
                        <span className="text-blue-600 text-xs">{column.type}</span>
                        <span className={`text-xs ${column.nullable ? 'text-emerald-600' : 'text-red-600'}`}>
                          {column.nullable ? t('common.yes', 'YES') : t('common.no', 'NO')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Target Schema */}
            <div>
              <h5 className="font-medium text-gray-900 mb-3 flex items-center">
                <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" />
                Target Schema
              </h5>
              <div className="space-y-2">
                <div className="bg-gray-50 rounded p-3 text-sm">
                  <div className="grid grid-cols-3 gap-2 font-medium text-gray-600 mb-2">
                    <span>Column</span>
                    <span>Type</span>
                    <span>Nullable</span>
                  </div>
                  <div className="space-y-1">
                    {targetColumns.map((column, index) => (
                      <div key={index} className="grid grid-cols-3 gap-2">
                        <span className="font-mono text-xs">{column.name}</span>
                        <span className="text-blue-600 text-xs">{column.type}</span>
                        <span className={`text-xs ${column.nullable ? 'text-emerald-600' : 'text-red-600'}`}>
                          {column.nullable ? t('common.yes', 'YES') : t('common.no', 'NO')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Schema Comparison Status */}
          <Alert className={`mt-4 ${schemaMatch ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center">
              {schemaMatch ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 mr-2" />
              ) : (
                <X className="w-5 h-5 text-red-600 mr-2" />
              )}
              <AlertDescription className={schemaMatch ? 'text-emerald-800' : 'text-red-800'}>
                <div className="font-medium">
                  {schemaMatch ? t('schema.compatible', 'Schema structures are compatible') : t('schema.differ', 'Schema structures differ')}
                </div>
                <div className="text-sm mt-1">
                  {schemaMatch 
                    ? t('schema.allMatch', 'All columns match with compatible data types')
                    : t('schema.differences', 'Differences detected in column structure, types, or constraints')
                  }
                </div>
              </AlertDescription>
            </div>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
